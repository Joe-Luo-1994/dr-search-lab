"""Bounded process-group runner. Sample summed descendant RSS, CPU and artifact bytes.
RSS sampling is a stop guard, not a kernel reservation/cgroup memory limit.
"""
import os,sys,time,json,subprocess,signal,argparse,threading,resource
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--artifact',required=True);p.add_argument('--seconds',type=float,default=600);p.add_argument('--rss-mib',type=int,default=6144);p.add_argument('--disk-gib',type=int,default=10);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True)
cmd=a.command[1:] if a.command[:1]==['--'] else a.command
start=time.monotonic();samples=[];reason=None;peak=0;peakdisk=0;peakcpu=0;last_sample_time=0;max_sample_gap=0
base_usage=resource.getrusage(resource.RUSAGE_CHILDREN)
clock=os.sysconf('SC_CLK_TCK');pagesize=os.sysconf('SC_PAGE_SIZE')
with open(str(out)+'.stdout.log','w') as stdout,open(str(out)+'.stderr.log','w') as stderr:
 proc=subprocess.Popen(cmd,stdout=stdout,stderr=stderr,start_new_session=True)
 def tree():
  entries={}
  for d in Path('/proc').iterdir():
   if not d.name.isdigit():continue
   try:
    text=(d/'stat').read_text();rest=text[text.rfind(')')+2:].split();entries[int(d.name)]={'ppid':int(rest[1]),'rss':int(rest[21])*pagesize,'cpu':(int(rest[11])+int(rest[12]))/clock}
   except (OSError,ValueError,IndexError):continue
  wanted={proc.pid};before=-1
  while len(wanted)!=before:
   before=len(wanted);wanted.update(pid for pid,v in entries.items() if v['ppid'] in wanted)
  return {pid:entries[pid] for pid in wanted if pid in entries}
 def size(directory=a.artifact):
  total=0
  for root,dirs,files in os.walk(directory):
   for f in files:
    try:total+=os.stat(os.path.join(root,f)).st_size
    except OSError:pass
  return total
 disk_state={'current':0,'total':0,'scanSeconds':0};done=threading.Event()
 def disk_worker():
  while not done.is_set():
   t=time.monotonic();disk_state['current']=size();disk_state['total']=size('.lab/ms1');disk_state['scanSeconds']=time.monotonic()-t;done.wait(5)
 thread=threading.Thread(target=disk_worker,daemon=True);thread.start();disk=0
 while proc.poll() is None:
  elapsed=time.monotonic()-start;nodes=tree();max_sample_gap=max(max_sample_gap,elapsed-last_sample_time);last_sample_time=elapsed
  if proc.pid not in nodes and proc.poll() is None:reason='MONITOR_PROC_UNREADABLE'
  rss=sum(v['rss'] for v in nodes.values());cpu=sum(v['cpu'] for v in nodes.values());peak=max(peak,rss);peakcpu=max(peakcpu,cpu)
  disk=disk_state['current'];peakdisk=max(peakdisk,disk)
  free=os.statvfs(a.artifact).f_bavail*os.statvfs(a.artifact).f_frsize if os.path.exists(a.artifact) else os.statvfs('.').f_bavail*os.statvfs('.').f_frsize
  try:cgroup_memory=int(Path('/sys/fs/cgroup/memory.current').read_text())
  except OSError:cgroup_memory=None
  samples.append({'elapsedSeconds':round(elapsed,3),'rssBytes':rss,'cpuSeconds':round(cpu,3),'artifactBytesLastSample':disk,'allMs1ArtifactBytesLastSample':disk_state['total'],'diskScanSeconds':disk_state['scanSeconds'],'freeBytes':free,'cgroupMemoryCurrent':cgroup_memory,'processes':nodes})
  if reason:pass
  elif rss>a.rss_mib*1048576:reason='TREE_RSS_LIMIT'
  elif disk>a.disk_gib*1073741824:reason='ARTIFACT_SIZE_LIMIT'
  elif disk_state['total']>18*1073741824:reason='TOTAL_ARTIFACT_LIMIT'
  elif free<4*1073741824:reason='FREE_DISK_LIMIT'
  elif elapsed>a.seconds:reason='TIME_LIMIT'
  if reason:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
   break
  time.sleep(.25)
 code=proc.wait();done.set();thread.join(timeout=1);disk=size();peakdisk=max(peakdisk,disk)
report={'command':cmd,'pid':proc.pid,'exitCode':code,'stopReason':reason,'elapsedSeconds':time.monotonic()-start,'peakSampledTreeRssBytes':peak,'peakSampledTreeCpuSeconds':peakcpu,'artifactBytes':disk,'peakArtifactBytes':peakdisk,'maxRssSampleGapSeconds':max_sample_gap,'kernelReapedMaxRssKiB':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,'limits':{'seconds':a.seconds,'treeRssMiB':a.rss_mib,'artifactGiB':a.disk_gib},'cpuAccountedSeconds':resource.getrusage(resource.RUSAGE_CHILDREN).ru_utime+resource.getrusage(resource.RUSAGE_CHILDREN).ru_stime-base_usage.ru_utime-base_usage.ru_stime,'sampling':'RSS/process tree every250ms; directory scan background every5s plus scan duration; sampled soft-stop may overshoot; OS cache excluded RSS, full cgroup memory.current separately; directory walk monitoring overhead not in target RSS','samples':samples}
out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='samples'}));sys.exit(0 if code==0 and reason is None else 1)
