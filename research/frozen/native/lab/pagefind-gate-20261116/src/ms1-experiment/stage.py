"""Execute one frozen build+Next+independent-review stage, stop and retain every result."""
import sys,os,json,time,subprocess,signal
from pathlib import Path
engine=sys.argv[1];N=int(sys.argv[2]);node='/workspace/toolchains/node-v22.21.1-linux-x64/bin/node'
base=Path('evidence/ms1-2026-11-14/implementation');artifact=Path(f'.lab/ms1/{engine}-{N}');name=f'{engine}-{N}'
if artifact.exists():raise SystemExit('Artifact already exists; do not overwrite')
report={'engine':engine,'N':N,'startedAt':time.time(),'stages':{},'completed':False};path=base/(name+'-stage.json')
def save():path.write_text(json.dumps(report,indent=2)+'\n')
def monitor(out,command):return ['python3','scripts/ms1-experiment/monitor.py','--out',str(out),'--artifact',str(artifact),'--seconds','600','--',*command]
build=monitor(base/(name+'-build.json'),[node,'--max-old-space-size=4096','scripts/ms1-experiment/prepare.mjs',str(artifact),engine,str(N)])
r=subprocess.run(build,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(base/(name+'-driver-build.log')).write_text(r.stdout);report['stages']['buildExitCode']=r.returncode;save()
if r.returncode:report['stop']='BUILD_FAILED_OR_LIMIT';save();raise SystemExit(1)
server_out=base/(name+'-runtime.json');cmd=monitor(server_out,[node,'--max-old-space-size=4096','scripts/ms1-api-lab/serve.mjs',str(artifact)])
server_monitor=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);ready=None;t=time.monotonic()
try:
 while time.monotonic()-t<120 and server_monitor.poll() is None:
  p=Path(str(server_out)+'.stdout.log')
  if p.exists():
   for line in p.read_text().splitlines():
    if line.startswith('{'):
     try:
      obj=json.loads(line)
      if obj.get('ready'):ready=obj;break
     except json.JSONDecodeError:pass
  if ready:break
  time.sleep(.25)
 report['readyElapsedSeconds']=time.monotonic()-t;report['ready']=ready;save()
 if not ready:report['stop']='NOT_READY';raise RuntimeError('Next did not become ready')
 review_out=base/(name+'-capacity');r=subprocess.run([node,'scripts/ms1-review/review.mjs','capacity',ready['url'],engine,str(N),str(review_out)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=600)
 (base/(name+'-review-driver.log')).write_text(r.stdout);report['stages']['independentHarnessExitCode']=r.returncode
 if r.returncode:report['stop']='CAPACITY_CORRECTNESS_OR_TIMEOUT_BOUNDARY'
 else:report['completed']=True
except Exception as e:report['error']=str(e)
finally:
 control=Path(str(server_out)+'.control.json')
 if ready or control.exists():
  pid=ready['pid'] if ready else json.loads(control.read_text())['pid'];p=Path(f'/proc/{pid}/cmdline')
  if p.exists():
   cmdline=p.read_bytes().replace(b'\0',b' ')
   if b'scripts/ms1-api-lab/serve.mjs' not in cmdline or str(artifact).encode() not in cmdline:raise RuntimeError('Refuse unrelated process cleanup')
   os.killpg(pid,signal.SIGTERM)
   deadline=time.monotonic()+4
   while p.exists() and time.monotonic()<deadline:time.sleep(.1)
   if p.exists():
    try:os.killpg(pid,signal.SIGKILL)
    except ProcessLookupError:pass
 elif server_monitor.poll() is None:
  # monitor guard retains bounded lifetime if no PID became readable.
  report['cleanupWarning']='No ready PID; monitor will stop at its 600s bound'
 try:output=server_monitor.communicate(timeout=10)[0];(base/(name+'-runtime-driver.log')).write_text(output)
 except subprocess.TimeoutExpired:report['monitorStillRunning']=True
 if server_out.exists():
  resource_report=json.loads(server_out.read_text())
  if resource_report.get('stopReason'):report['completed']=False;report['stop']=resource_report['stopReason']
 report['finishedAt']=time.time();save()
print(json.dumps(report,indent=2));sys.exit(0 if report['completed'] else 1)
