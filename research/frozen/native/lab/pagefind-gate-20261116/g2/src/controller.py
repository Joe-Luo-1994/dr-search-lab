"""Linux/WSL-only bounded Pagefind G0/G1 supervisor; never changes other units.

python3 controller.py --mode g0 --evidence /new/g0 --artifact /new/g0-artifacts
python3 controller.py --mode g1 --evidence /new/g1 --artifact /new/build --cwd /repo -- node /frozen/runner.mjs
Evidence must be outside artifact. All paths are absolute; both directories must
not exist. G0 is a controller test, not authorization to run G1 automatically.
"""
import argparse
import base64
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import uuid

GIB = 1024 ** 3
SELF = str(Path(__file__).resolve())


def dump(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def command(args, timeout=5):
    result = subprocess.run(args, capture_output=True, text=True, errors='replace', timeout=timeout)
    if result.returncode:
        raise RuntimeError('SUBPROCESS_EXIT_'+str(result.returncode)+': '+result.stderr[-2000:])
    return result.stdout.strip()


def wsl_available():
    return int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                    if line.startswith('MemAvailable:'))) * 1024


def windows_available():
    # Avoid repeated CIM/WMI startup. This process is itself externally timed.
    script = r'''Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class GateMemory { [StructLayout(LayoutKind.Sequential)] public struct M { public uint length,load; public ulong total,available,pageTotal,pageAvailable,virtualTotal,virtualAvailable,extended; } [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GlobalMemoryStatusEx(ref M value); public static ulong Read(){ M m=new M(); m.length=(uint)Marshal.SizeOf(typeof(M)); if(!GlobalMemoryStatusEx(ref m)) throw new System.ComponentModel.Win32Exception(); return m.available; }}'; [GateMemory]::Read()'''
    encoded = base64.b64encode(script.encode('utf-16le')).decode()
    value = command(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], 4)
    return int(value.strip())


def kv(path):
    return {line.split()[0]: int(line.split()[1]) for line in path.read_text().splitlines()}


def group_sample(root):
    root = Path(root)
    pids = set()
    for folder, dirs, files in os.walk(root):
        if 'cgroup.procs' in files:
            pids.update(int(s) for s in (Path(folder) / 'cgroup.procs').read_text().split())
    rss = 0
    live = []
    for pid in sorted(pids):
        try:
            status = Path('/proc', str(pid), 'status').read_text()
            amount = next((int(x.split()[1]) * 1024 for x in status.splitlines() if x.startswith('VmRSS:')), 0)
            rss += amount
            live.append({'pid': pid, 'rssBytes': amount})
        except FileNotFoundError:
            pass  # A process can exit between membership and /proc reads.
    return {'cpu': kv(root / 'cpu.stat'), 'memoryCurrent': int((root / 'memory.current').read_text()),
            'memoryPeak': int((root / 'memory.peak').read_text()), 'memoryEvents': kv(root / 'memory.events'),
            'memoryStat': kv(root / 'memory.stat'), 'treeRssBytes': rss, 'processes': live}


def artifact_sample(root):
    logical = allocated = count = 0
    seen = set()
    for folder, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            p = Path(folder, name)
            try:
                st = p.lstat()
            except FileNotFoundError:
                continue  # atomic builder rename; next sample/final audit covers it
            if p.is_symlink():
                raise RuntimeError('ARTIFACT_SYMLINK')
            inode = (st.st_dev, st.st_ino)
            if inode in seen:
                continue
            seen.add(inode)
            allocated += st.st_blocks * 512
            if p.is_file():
                logical += st.st_size
                count += 1
    return {'logicalBytes': logical, 'allocatedBytes': allocated, 'fileCount': count,
            'diskFreeBytes': shutil.disk_usage(root).free}


def read_operation(filename):
    try:
        st = filename.lstat()
        if filename.is_symlink() or not filename.is_file() or st.st_size > 8192:
            raise RuntimeError('OPERATION_WATCH_INVALID')
        with filename.open('rb') as f:
            raw = f.read(8193)
        if len(raw) > 8192:
            raise RuntimeError('OPERATION_WATCH_TOO_LARGE')
        return json.loads(raw)
    except FileNotFoundError:
        return None  # runner completed and removed its atomic marker


def internal():
    if sys.argv[1] == '_sample':
        kind, target = sys.argv[2:4]
        if kind == 'group':
            result = group_sample(target)
        elif kind == 'host':
            result = {'windowsAvailableBytes': windows_available(), 'wslAvailableBytes': wsl_available()}
        else:
            result = artifact_sample(target)
        print(json.dumps(result))
    elif sys.argv[1] == '_fixture':
        # Parent -> child -> allocating/sleeping grandchild, all same cgroup.
        kind = sys.argv[2]
        if len(sys.argv) == 3:
            subprocess.run([sys.executable, SELF, '_fixture', kind, 'child'])
        elif len(sys.argv) == 4:
            subprocess.run([sys.executable, SELF, '_fixture', kind, 'grandchild', 'leaf'])
        elif kind == 'memory':
            time.sleep(1)  # let supervisor observe all three workload generations
            chunks = []
            for _ in range(512):
                chunks.append(bytearray(1024 * 1024))
                time.sleep(.002)
        else:
            time.sleep(60)
        time.sleep(60)
    elif sys.argv[1] == '_unit':
        directory = Path(sys.argv[2])
        deadline = time.monotonic() + 30
        while not (directory / 'go').exists():
            if time.monotonic() > deadline:
                raise RuntimeError('GO_GATE_TIMEOUT')
            time.sleep(.05)
        spec = json.loads((directory / 'command.json').read_text())
        with (directory / 'stdout.log').open('ab') as out, (directory / 'stderr.log').open('ab') as err:
            child = subprocess.Popen(spec['argv'], cwd=spec['cwd'], stdout=out, stderr=err)
            dump(directory / 'child.json', {'pid': child.pid, 'startedAt': time.time()})
            code = child.wait()
        dump(directory / 'exit.tmp', {'exitCode': code, 'finishedAt': time.time()})
        os.replace(directory / 'exit.tmp', directory / 'exit.json')
        # Preserve cgroup counters until supervisor takes final sample and kills.
        while True:
            time.sleep(1)
    else:
        raise RuntimeError('INTERNAL_MODE')


def run_case(evidence, artifact, argv, cwd, memory, seconds, expected=None, operation_watch=None):
    evidence.mkdir()
    unit = 'pf-gate-' + uuid.uuid4().hex + '.service'
    result = {'unit': unit, 'expectedStop': expected, 'startedAt': time.time(), 'command': argv,
              'limitsRequested': {'cpuCount': 4, 'memoryBytes': memory, 'swapBytes': 0, 'seconds': seconds},
              'status': 'blocked', 'reason': None, 'released': False, 'maxObservedTreeProcesses': 0}
    group = None
    tasks = {}
    samples = {'group': 0, 'host': 0, 'artifact': 0}
    unit_started = False
    metrics = (evidence / 'metrics.ndjson').open('x', buffering=1)
    begin = time.monotonic()

    def log(kind, data):
        metrics.write(json.dumps({'at': time.time(), 'elapsedMs': (time.monotonic()-begin)*1000,
                                  'kind': kind, **data}) + '\n')

    def sample_sync(kind, target, timeout):
        return json.loads(command([sys.executable, SELF, '_sample', kind, str(target)], timeout))

    def kill_group():
        if group and group.exists():
            (group / 'cgroup.kill').write_text('1')

    try:
        pre = sample_sync('host', artifact, 6)
        pre['diskFreeBytes'] = shutil.disk_usage(artifact).free
        result['preflight'] = pre
        log('preflight', pre)
        if pre['windowsAvailableBytes'] < 8*GIB or pre['wslAvailableBytes'] < 16*GIB or pre['diskFreeBytes'] < 40*GIB:
            raise RuntimeError('PREFLIGHT_HEADROOM')
        dump(evidence / 'command.json', {'argv': argv, 'cwd': cwd})
        # RuntimeMaxSec is a second independent whole-unit deadline, including go.
        command(['systemd-run', '--user', '--unit='+unit, '-p', 'CPUQuota=400%', '-p', 'MemoryMax='+str(memory),
                 '-p', 'MemorySwapMax=0', '-p', 'TasksMax=256', '-p', 'OOMPolicy=continue',
                 '-p', 'KillMode=control-group', '-p', 'TimeoutStopSec=2', '-p', 'RuntimeMaxSec='+str(seconds),
                 '--setenv=PATH='+os.environ['PATH'], '--working-directory='+cwd,
                 sys.executable, SELF, '_unit', str(evidence)], 5)
        unit_started = True
        relative = command(['systemctl', '--user', 'show', unit, '--property=ControlGroup', '--value'], 3)
        if not relative.startswith('/') or '..' in relative:
            raise RuntimeError('CGROUP_LOCATION')
        group = Path('/sys/fs/cgroup' + relative)
        limits = {k: (group / k).read_text().strip() for k in ['cpu.max', 'memory.max', 'memory.swap.max', 'cgroup.procs']}
        result['cgroup'] = str(group)
        result['limitsActual'] = limits
        cpu = limits['cpu.max'].split()
        if cpu[0] == 'max' or int(cpu[0]) != 4*int(cpu[1]) or int(limits['memory.max']) != memory or limits['memory.swap.max'] != '0':
            raise RuntimeError('LIMIT_READBACK')
        if not (group/'cgroup.kill').exists() or not os.access(group/'cgroup.kill', os.W_OK):
            raise RuntimeError('CGROUP_KILL_UNAVAILABLE')
        initial = sample_sync('group', group, 2)
        log('group', initial)
        result['initialGroup'] = initial
        (evidence/'go').write_text('go\n')
        result['released'] = True
        result['status'] = 'running'
        next_at = {'group': 0, 'host': 0, 'artifact': 0}
        intervals = {'group': 1, 'host': 5, 'artifact': 10}
        deadlines = {'group': 2, 'host': 6, 'artifact': 8}
        operations = {}
        while True:
            elapsed = time.monotonic()-begin
            if elapsed >= seconds:
                result['reason'] = 'TIMEOUT'
                break
            if operation_watch:
                op = read_operation(operation_watch)
                if op is not None:
                    if not isinstance(op, dict) or not isinstance(op.get('id'), str) or not op['id'] or op.get('kind') not in ['query', 'navigation'] or not isinstance(op.get('startedAtMs'), (float, int)) or isinstance(op['startedAtMs'], bool) or not math.isfinite(op['startedAtMs']):
                        raise RuntimeError('OPERATION_WATCH_SCHEMA')
                    signature = (op['kind'], op['startedAtMs'])
                    if op['id'] in operations and operations[op['id']] != signature:
                        raise RuntimeError('OPERATION_DEADLINE_CHANGED')
                    if op['id'] not in operations:
                        operations[op['id']] = signature
                        log('operation-start', op)
                    age = time.time()*1000-op['startedAtMs']
                    if age < -250:
                        raise RuntimeError('OPERATION_CLOCK_INVALID')
                    if age >= (5000 if op['kind'] == 'query' else 30000):
                        result['reason'] = op['kind'].upper()+'_TIMEOUT'
                        result['timedOutOperation'] = op
                        break
            for kind in list(tasks):
                proc, started = tasks[kind]
                if proc.poll() is None:
                    if time.monotonic()-started > deadlines[kind]:
                        raise RuntimeError('MONITOR_TIMEOUT_'+kind)
                    continue
                out, err = proc.communicate()
                del tasks[kind]
                if proc.returncode:
                    raise RuntimeError('MONITOR_ERROR_'+kind+':'+err[-1000:])
                data = json.loads(out)
                samples[kind] += 1
                log(kind, data)
                if kind == 'group':
                    result['lastGroup'] = data
                    result['maxObservedTreeProcesses'] = max(result['maxObservedTreeProcesses'], len(data['processes']))
                    if data['memoryEvents'].get('oom', 0) > initial['memoryEvents'].get('oom', 0) or data['memoryEvents'].get('oom_kill', 0) > initial['memoryEvents'].get('oom_kill', 0):
                        result['reason'] = 'OOM'
                elif kind == 'host' and min(data.values()) < 4*GIB:
                    result['reason'] = 'HOST_HEADROOM'
                elif kind == 'artifact' and max(data['logicalBytes'], data['allocatedBytes']) > 20*GIB:
                    result['reason'] = 'ARTIFACT_LIMIT'
                if result['reason']:
                    break
            if result['reason']:
                break
            if (evidence/'exit.json').exists():
                result['exit'] = json.loads((evidence/'exit.json').read_text())
                final = sample_sync('group', group, 2)
                result['lastGroup'] = final
                log('group-final', final)
                if final['memoryEvents'].get('oom', 0) > initial['memoryEvents'].get('oom', 0):
                    result['reason'] = 'OOM'
                else:
                    result['reason'] = 'COMMAND_EXIT' if result['exit']['exitCode'] else 'COMPLETED'
                break
            for kind in next_at:
                if elapsed >= next_at[kind] and kind not in tasks:
                    target = group if kind == 'group' else artifact
                    proc = subprocess.Popen([sys.executable, SELF, '_sample', kind, str(target)],
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
                    tasks[kind] = (proc, time.monotonic())
                    next_at[kind] = elapsed + intervals[kind]
            time.sleep(.05)
        kill_group()
        result['status'] = 'passed' if result['reason'] == (expected or 'COMPLETED') else 'stopped'
        if expected and result['status'] == 'passed' and result['maxObservedTreeProcesses'] < 4:
            result['status'] = 'insufficient-tree-evidence'
    except BaseException as ex:
        result['reason'] = result['reason'] or (str(ex) or type(ex).__name__)
        result['status'] = 'stopped' if result['released'] else 'blocked'
    finally:
        cleanup_errors = []
        try:
            kill_group()
        except Exception as ex:
            cleanup_errors.append('cgroup.kill: '+str(ex))
        for proc, _ in tasks.values():
            try:
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate(timeout=2)
            except Exception as ex:
                cleanup_errors.append('monitor cleanup: '+str(ex))
        if unit_started:
            try:
                command(['systemctl', '--user', 'stop', unit], 5)
                result['unitFinal'] = command(['systemctl', '--user', 'show', unit,
                    '--property=ActiveState,SubState,Result,ExecMainStatus,MainPID'], 3)
                if 'ActiveState=inactive' not in result['unitFinal'] and 'ActiveState=failed' not in result['unitFinal']:
                    cleanup_errors.append('UNIT_NOT_STOPPED')
            except Exception as ex:
                cleanup_errors.append('unit cleanup: '+str(ex))
        try:
            remaining = []
            if group and group.exists():
                for folder, dirs, files in os.walk(group):
                    if 'cgroup.procs' in files:
                        remaining += (Path(folder)/'cgroup.procs').read_text().split()
            result['remainingPids'] = remaining
            if remaining:
                cleanup_errors.append('CGROUP_NOT_EMPTY')
        except Exception as ex:
            cleanup_errors.append('membership cleanup: '+str(ex))
        try:
            result['finalArtifact'] = sample_sync('artifact', artifact, 8)
            log('artifact-final', result['finalArtifact'])
            if max(result['finalArtifact']['logicalBytes'], result['finalArtifact']['allocatedBytes']) > 20*GIB:
                cleanup_errors.append('FINAL_ARTIFACT_LIMIT')
        except Exception as ex:
            cleanup_errors.append('final artifact: '+str(ex))
        try:
            result['finalHost'] = sample_sync('host', artifact, 6)
            log('host-final', result['finalHost'])
            if min(result['finalHost'].values()) < 4*GIB:
                cleanup_errors.append('FINAL_HOST_HEADROOM')
        except Exception as ex:
            cleanup_errors.append('final host: '+str(ex))
        result['cleanupErrors'] = cleanup_errors
        if cleanup_errors:
            result['status'] = 'failed-cleanup'
        result['sampleCounts'] = samples
        result['elapsedSeconds'] = time.monotonic()-begin
        metrics.close()
        dump(evidence/'result.json', result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['g0', 'g1', 'g2'], required=True)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--artifact', required=True)
    parser.add_argument('--cwd', default=os.getcwd())
    parser.add_argument('--operation-watch', help='G2 atomic marker: {id,kind:query|navigation,startedAtMs}; remove on completion')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('Run within WSL/Linux with a user systemd manager; Windows memory is sampled through interop.')
    evidence, artifact, cwd = [Path(p).resolve() for p in [args.evidence, args.artifact, args.cwd]]
    if evidence == artifact or evidence in artifact.parents or artifact in evidence.parents:
        parser.error('Evidence and artifact must be separate non-nested directories.')
    if evidence.exists() or artifact.exists() or not cwd.is_dir():
        parser.error('Use fresh evidence/artifact paths and an existing cwd.')
    argv = args.command[1:] if args.command[:1] == ['--'] else args.command
    if args.mode in ['g1', 'g2'] and not argv:
        parser.error('G1/G2 require command argv after --')
    operation_watch = Path(args.operation_watch).resolve() if args.operation_watch else None
    if args.mode == 'g2' and (not operation_watch or operation_watch.exists()):
        parser.error('G2 requires a fresh --operation-watch path')
    artifact.mkdir(parents=True)
    evidence.parent.mkdir(parents=True, exist_ok=True)
    if args.mode == 'g0':
        evidence.mkdir()
        results = []
        for kind, seconds, expected in [('memory', 30, 'OOM'), ('timeout', 8, 'TIMEOUT')]:
            result = run_case(evidence/kind, artifact, [sys.executable, SELF, '_fixture', kind], str(cwd), 128*1024**2, seconds, expected)
            results.append(result)
            if result['status'] != 'passed':
                break
        result = {'status': 'passed' if len(results) == 2 and all(x['status'] == 'passed' for x in results) else 'failed',
                  'cases': results, 'scope': 'small cgroup OOM and whole-tree deadline; no Pagefind build executed'}
        dump(evidence/'result.json', result)
    else:
        result = run_case(evidence, artifact, argv, str(cwd), (12 if args.mode == 'g1' else 4)*GIB,
                          1800 if args.mode == 'g1' else 900, operation_watch=operation_watch)
    print(json.dumps({'status': result['status'], 'evidence': str(evidence)}))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    if len(sys.argv)>1 and sys.argv[1].startswith('_'):
        internal()
    else:
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(InterruptedError('SIGTERM')))
        sys.exit(main())
