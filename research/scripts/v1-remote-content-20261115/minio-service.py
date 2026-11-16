from pathlib import Path
import hashlib, json, os, signal, subprocess, sys, time

root = Path('/PUBLIC/WINDOWS_WORKSPACE')
runtime = root/'.lab/v1-remote-content-20261115'
binary = Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/work/minio-official-build/bin/minio')
data = runtime/'minio-data'
pidfile = runtime/'minio.pid'
action = sys.argv[1]
def own(pid):
    try:
        return str(data).encode() in Path(f'/proc/{pid}/cmdline').read_bytes() and str(binary).encode() in Path(f'/proc/{pid}/cmdline').read_bytes()
    except FileNotFoundError:
        return False
def status():
    pid = int(pidfile.read_text()) if pidfile.exists() else None
    # Recover ownership if the controller was cancelled after spawning but before recording PID.
    if pid is None or not own(pid):
        matches = [int(p.name) for p in Path('/proc').iterdir() if p.name.isdigit() and own(int(p.name))]
        assert len(matches) <= 1, 'Multiple processes for this exact experiment store'
        pid = matches[0] if matches else pid
    live = pid is not None and own(pid)
    rss = 0
    if live:
        for line in Path(f'/proc/{pid}/status').read_text().splitlines():
            if line.startswith('VmRSS:'): rss = int(line.split()[1])*1024
    return dict(pid=pid, live=live, rss=rss)
if action == 'start':
    assert not status()['live'], 'Owned MinIO already running'
    c = json.loads((runtime/'private-config.json').read_text())
    data.mkdir(exist_ok=True)
    env = dict(os.environ, MINIO_ROOT_USER=c['accessKey'], MINIO_ROOT_PASSWORD=c['secretKey'],
               MINIO_BROWSER='off', MINIO_UPDATE='off')
    with (runtime/'minio-service.log').open('ab') as log:
        child = subprocess.Popen([str(binary),'server',str(data),'--address','127.0.0.1:19440','--console-address','127.0.0.1:19441'],
                                 env=env,stdout=log,stderr=log,stdin=subprocess.DEVNULL,start_new_session=True)
    pidfile.write_text(str(child.pid))
    print(json.dumps(dict(pid=child.pid, binarySha256=hashlib.sha256(binary.read_bytes()).hexdigest(), action='started')))
elif action == 'stop':
    s = status()
    if s['live']:
        os.kill(s['pid'], signal.SIGTERM)
        for _ in range(60):
            if not own(s['pid']): break
            time.sleep(.05)
        if own(s['pid']): os.kill(s['pid'], signal.SIGKILL)
    print(json.dumps(dict(action='stopped',**status())))
elif action == 'status': print(json.dumps(status()))
else: raise ValueError('start|stop|status')
