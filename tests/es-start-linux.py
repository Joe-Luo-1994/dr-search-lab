"""Real Linux filesystem/process checks, separate from existing Node contracts."""
import fcntl
import hashlib
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('es_start', Path(__file__).resolve().parents[1] / 'scripts/es-start.py')
es = importlib.util.module_from_spec(spec)
spec.loader.exec_module(es)


class OfflineStart(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workspace = Path(self.temp.name)
        self.root = self.workspace / '.lab/es-native/dr'
        self.data = self.root / 'data'
        (self.data / 'indices/x/0/index').mkdir(parents=True)
        self.node = self.data / 'node.lock'
        self.write = self.data / 'indices/x/0/index/write.lock'
        self.node.touch(); self.write.touch()
        self.payload = self.write.parent / 'segments_1'
        self.payload.write_bytes(b'immutable-index-payload\x00\xff')

    def materialize(self):
        with es.offline_locks(self.data) as locks:
            es.materialize(locks)

    def test_offline_repeat_preserves_index_and_lock_identity(self):
        before = hashlib.sha256(self.payload.read_bytes()).hexdigest()
        ids = [p.stat().st_ino for p in [self.node, self.write]]
        for _ in range(2):
            self.materialize()
        self.assertEqual(before, hashlib.sha256(self.payload.read_bytes()).hexdigest())
        self.assertEqual(ids, [p.stat().st_ino for p in [self.node, self.write]])
        self.assertEqual([0, 0], [p.stat().st_size for p in [self.node, self.write]])
        self.assertEqual(sorted(['node.lock', 'indices/x/0/index/write.lock', 'indices/x/0/index/segments_1']), sorted(str(p.relative_to(self.data)) for p in self.data.rglob('*') if p.is_file()))

    def test_nonzero_refused_before_any_touch(self):
        self.write.write_bytes(b'not-a-lock')
        before = self.node.stat().st_mtime_ns
        with self.assertRaisesRegex(RuntimeError, 'zero-byte'):
            self.materialize()
        self.assertEqual(before, self.node.stat().st_mtime_ns)
        self.assertEqual(b'not-a-lock', self.write.read_bytes())

    def test_symlink_file_and_directory_refused(self):
        outside = self.workspace / 'outside'; outside.touch()
        self.write.unlink(); self.write.symlink_to(outside)
        with self.assertRaisesRegex(RuntimeError, 'Symlink'):
            self.materialize()
        self.write.unlink()
        (self.data / 'escape').symlink_to(self.workspace, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'Symlink'):
            self.materialize()

    def test_symlink_ancestor_refused(self):
        alias = self.workspace / 'alias'; alias.symlink_to(self.data, target_is_directory=True)
        with self.assertRaises(OSError):
            with es.offline_locks(alias):
                self.fail('followed symlink')

    def test_posix_held_lock_without_endpoint_refused(self):
        for mode in ('LOCK_EX', 'LOCK_SH'):
            with self.subTest(mode=mode):
                code = 'import fcntl,sys; f=open(sys.argv[1],"r+"); fcntl.lockf(f,getattr(fcntl,sys.argv[2])); print("held",flush=True); sys.stdin.read()'
                before = self.write.stat().st_mtime_ns
                with subprocess.Popen([sys.executable, '-c', code, str(self.write), mode], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as child:
                    self.assertEqual('held', child.stdout.readline().strip())
                    try:
                        with self.assertRaisesRegex(RuntimeError, 'POSIX lock held'):
                            self.materialize()
                        self.assertEqual(before, self.write.stat().st_mtime_ns)
                    finally:
                        child.stdin.close(); child.wait(timeout=5)

    def test_recorded_active_pid_refused(self):
        (self.root / 'node.pid').write_text(str(os.getpid()))
        with self.assertRaisesRegex(RuntimeError, 'Recorded PID'):
            es.require_offline(self.root, 0)

    def test_invalid_pid_file_refused(self):
        pid = self.root / 'node.pid'
        pid.write_text('unknown')
        with self.assertRaisesRegex(RuntimeError, 'Invalid recorded PID'):
            es.require_offline(self.root, 0)
        pid.unlink(); os.mkfifo(pid)
        with self.assertRaisesRegex(RuntimeError, 'regular file'):
            es.require_offline(self.root, 0)
        pid.unlink(); pid.symlink_to(self.node)
        with self.assertRaises(OSError):
            es.require_offline(self.root, 0)

    def test_confirmed_zombie_pid_requires_other_offline_checks(self):
        with subprocess.Popen([sys.executable, '-c', 'pass']) as child:
            try:
                import time
                deadline = time.monotonic() + 5
                while Path(f'/proc/{child.pid}/stat').read_text().rsplit(')', 1)[1].split()[0] != 'Z':
                    if time.monotonic() > deadline:
                        self.fail('child did not exit')
                    time.sleep(0.01)
                (self.root / 'node.pid').write_text(str(child.pid))
                with patch.object(es.Path, 'iterdir', return_value=iter([])):
                    with socket.socket() as listener:
                        listener.bind(('127.0.0.1', 0)); listener.listen()
                        with self.assertRaises(OSError):
                            es.require_offline(self.root, listener.getsockname()[1])
            finally:
                child.wait(timeout=5)

    def test_same_instance_process_without_pid_or_endpoint_refused(self):
        with subprocess.Popen([sys.executable, '-c', 'import sys; print("ready",flush=True);sys.stdin.read()'], env={**os.environ, 'ES_PATH_CONF': str(self.root / 'config')}, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as child:
            self.assertEqual('ready', child.stdout.readline().strip())
            try:
                with self.assertRaisesRegex(RuntimeError, 'Workspace instance process'):
                    es.require_offline(self.root, 0)
            finally:
                child.stdin.close(); child.wait(timeout=5)

    def test_unresponsive_bound_endpoint_refused(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0)); listener.listen()
            with patch.object(es.Path, 'iterdir', return_value=iter([])):
                with self.assertRaises(OSError):
                    es.require_offline(self.root, listener.getsockname()[1])

    def test_unknown_process_permissions_refused(self):
        with patch.object(es.Path, 'iterdir', side_effect=PermissionError('proc inaccessible')):
            with self.assertRaises(PermissionError):
                es.require_offline(self.root, 0)

    def test_concurrent_start_guard_refused(self):
        with open(self.root / '.start.guard', 'w') as guard:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, 'Another start'):
                es.start(self.workspace, 'dr')

    def test_guard_spans_launcher_and_repeat_start_refused(self):
        def fake_launcher(*args, **kwargs):
            with self.assertRaisesRegex(RuntimeError, 'Another start'):
                es.start(self.workspace, 'dr')
            (self.root / 'node.pid').write_text(str(os.getpid()))
        with patch.object(es, 'require_offline'), patch.object(es.subprocess, 'run', side_effect=fake_launcher):
            es.start(self.workspace, 'dr')
        with self.assertRaisesRegex(RuntimeError, 'Recorded PID'):
            es.start(self.workspace, 'dr')

    def test_hardlink_refused(self):
        os.link(self.node, self.workspace / 'outside-hardlink')
        with self.assertRaisesRegex(RuntimeError, 'single-link'):
            self.materialize()


if __name__ == '__main__':
    unittest.main(verbosity=2)
