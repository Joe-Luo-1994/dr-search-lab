#!/usr/bin/env python3
"""Linux-only, fail-closed offline lock materialization and serialized ES launch.

The guard serializes this repository's start commands. It cannot serialize a
privileged operator launching Java directly; all lab starts must use es-control.
Lucene uses POSIX record locks (lockf), not BSD flock.
"""
import contextlib
import ctypes
import fcntl
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys


class RecordLock(ctypes.Structure):
    # Linux struct flock on the supported 64-bit x86_64/aarch64 platforms.
    _fields_ = [('type', ctypes.c_short), ('whence', ctypes.c_short),
                ('start', ctypes.c_longlong), ('length', ctypes.c_longlong),
                ('pid', ctypes.c_int)]


def reject_held_lock(fd, name):
    query = RecordLock(fcntl.F_WRLCK, os.SEEK_SET, 0, 0, 0)
    result = RecordLock.from_buffer_copy(fcntl.fcntl(fd, fcntl.F_GETLK, bytes(query)))
    if result.type != fcntl.F_UNLCK:
        raise RuntimeError(f'POSIX lock held: {name}')


def require_offline(root, port):
    pidfile = root / 'node.pid'
    try:
        fd = os.open(pidfile, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        fd = None
    if fd is not None:
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > 32:
                raise RuntimeError('PID file must be a small regular file')
            text = os.read(fd, 33).decode().strip()
        finally:
            os.close(fd)
        if not text.isdecimal() or int(text) <= 1:
            raise RuntimeError('Invalid recorded PID; investigate before start')
        # A positively observed zombie has no executable/files left to write.
        # Missing PID is stale; every other existing/unknown state refuses start.
        try:
            state = Path('/proc', text, 'stat').read_text().rsplit(')', 1)[1].split()[0]
        except FileNotFoundError:
            state = None
        if state is not None and state != 'Z':
            raise RuntimeError(f'Recorded PID {text} still exists; refusing start')
        if state == 'Z':
            print(f'Recorded PID {text} is a verified zombie; still checking processes, ports and locks', flush=True)
    config = str(root / 'config').encode()
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            state = (entry / 'stat').read_text().rsplit(')', 1)[1].split()[0]
            if state == 'Z':
                continue
            # Permission failures are deliberately not treated as an offline node.
            env = (entry / 'environ').read_bytes().split(b'\0')
            args = (entry / 'cmdline').read_bytes().split(b'\0')
            if b'ES_PATH_CONF=' + config in env or b'-Des.path.conf=' + config in args:
                raise RuntimeError(f'Workspace instance process {entry.name} exists')
        except FileNotFoundError:
            continue  # process exited during inspection
    # Refuse any bound endpoint, including an unresponsive/non-HTTP listener.
    for number in (port, port + 1):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', number))


def open_directory(path):
    """Open each component without following symlinks, including ancestors."""
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in Path(path).parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


@contextlib.contextmanager
def offline_locks(data):
    """Validate and POSIX-lock ALL candidates before touching ANY metadata."""
    with contextlib.ExitStack() as stack:
        base = open_directory(data)
        stack.callback(os.close, base)
        locks = []

        def visit(directory, relative):
            for name in sorted(os.listdir(directory)):
                info = os.stat(name, dir_fd=directory, follow_symlinks=False)
                rel = relative / name
                if stat.S_ISLNK(info.st_mode):
                    raise RuntimeError(f'Symlink in instance data: {rel}')
                if stat.S_ISDIR(info.st_mode):
                    child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                    stack.callback(os.close, child)
                    visit(child, rel)
                elif name in ('node.lock', 'write.lock'):
                    if not stat.S_ISREG(info.st_mode) or info.st_size != 0 or info.st_nlink != 1:
                        raise RuntimeError(f'Expected regular zero-byte single-link lock: {rel}')
                    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
                    stack.callback(os.close, fd)
                    current = os.fstat(fd)
                    if (current.st_dev, current.st_ino, current.st_size, current.st_nlink) != (info.st_dev, info.st_ino, 0, 1):
                        raise RuntimeError(f'Lock changed during inspection: {rel}')
                    try:
                        reject_held_lock(fd, rel)  # also detects another process's shared lock
                        fcntl.lockf(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
                    except OSError as error:
                        raise RuntimeError(f'POSIX lock held or unavailable: {rel}') from error
                    locks.append((fd, str(rel), directory, name))
        visit(base, Path('.'))
        # Only after the whole tree and held locks pass, open writable handles.
        writable = []
        for original, rel, directory, name in locks:
            fd = os.open(name, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
            stack.callback(os.close, fd)
            before, after = os.fstat(original), os.fstat(fd)
            if (before.st_dev, before.st_ino, after.st_size, after.st_nlink) != (after.st_dev, after.st_ino, 0, 1):
                raise RuntimeError(f'Lock replaced before materialization: {rel}')
            fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            writable.append((fd, rel))
        yield writable


def materialize(locks):
    for fd, name in locks:
        os.utime(fd, None)  # metadata only; never create, unlink, truncate or write payload
        os.fsync(fd)
        if os.fstat(fd).st_size != 0:
            raise RuntimeError(f'Lock changed size: {name}')
    print(f'Offline materialized {len(locks)} existing zero-byte locks', flush=True)


def start(workspace, instance):
    if instance not in ('primary', 'dr'):
        raise RuntimeError('Invalid instance')
    workspace = Path(workspace)
    root = workspace / '.lab' / 'es-native' / instance
    # Opening the directory chain also rejects .lab/instance/data ancestor symlinks.
    directory = open_directory(root)
    try:
        guard = os.open('.start.guard', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=directory)
    finally:
        os.close(directory)
    with os.fdopen(guard, 'r+') as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode) or os.fstat(handle.fileno()).st_nlink != 1:
            raise RuntimeError('Invalid startup guard')
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another start is in progress') from error
        port = 19200 if instance == 'primary' else 19300
        require_offline(root, port)
        with offline_locks(root / 'data') as locks:
            require_offline(root, port)  # recheck after acquiring every existing lock
            materialize(locks)
        # Release POSIX locks before Java acquires them; retain start guard until
        # the daemon launcher returns with a live recorded PID.
        installation = workspace / '.lab/tools/elasticsearch-8.17.0'
        env = {**os.environ, 'ES_PATH_CONF': str(root / 'config')}
        subprocess.run([str(installation / 'bin/elasticsearch'), '-d', '-p', str(root / 'node.pid')], env=env, check=True, start_new_session=True)
        pid = (root / 'node.pid').read_text().strip()
        if not pid.isdecimal() or not Path('/proc', pid).exists():
            raise RuntimeError('Launcher returned without a live recorded PID; inspect logs')


if __name__ == '__main__':
    try:
        if os.getuid() == 0:
            raise RuntimeError('Elasticsearch must run as non-root')
        start(Path(__file__).resolve().parent.parent, sys.argv[1])
    except Exception as error:
        print(f'Refusing ES start: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
