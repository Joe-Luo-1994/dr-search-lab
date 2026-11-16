// D1 observation only. One shared ESM helper / FD per process.
import {openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
const directory=process.env.D1_TRACE_DIR;
if(!directory||!path.isAbsolute(directory))throw Error('D1_TRACE_DIR_REQUIRED');
const MAX_EVENTS=1000,MAX_BYTES=1024*1024;
const fd=openSync(path.join(directory,`trace-${process.pid}.ndjson`),'wx',0o600);
let events=0,bytes=0,syncIoMs=0,totalTraceMs=0,lastSyncIoMs=0,failed=false;
function failStop(code){
  failed=true;
  try{writeSync(2,JSON.stringify({event:'trace.fail-stop',pid:process.pid,code,events,bytes,syncIoMs,totalTraceMs})+'\n');}catch{}
  process.exit(70);
}
export function trace(event,details={}){
  if(failed)process.exit(70);
  const began=performance.now();
  let row;
  try{row=Buffer.from(JSON.stringify({seq:events+1,pid:process.pid,wallMs:Date.now(),monoMs:began,event,details,
    observer:{completedEvents:events,cumulativeSyncIoMs:syncIoMs,lastSyncIoMs,cumulativeTraceMs:totalTraceMs,
      accounting:'completed previous events; current/final event cost appears only in a later row'}})+'\n');}
  catch{failStop('TRACE_SERIALIZE');}
  if(events+1>MAX_EVENTS||bytes+row.length>MAX_BYTES)failStop('TRACE_BUDGET');
  const ioStart=performance.now();
  try{let offset=0;while(offset<row.length){const n=writeSync(fd,row,offset,row.length-offset);if(n<=0)failStop('TRACE_SHORT_WRITE');offset+=n;}fsyncSync(fd);}
  catch{failStop('TRACE_IO');}
  lastSyncIoMs=performance.now()-ioStart;syncIoMs+=lastSyncIoMs;events++;bytes+=row.length;totalTraceMs+=performance.now()-began;
}
trace('trace.open',{maxEvents:MAX_EVENTS,maxBytes:MAX_BYTES,scope:'D1 phase boundaries only; no payload contents'});
process.once('exit',code=>{if(!failed){trace('process.exit',{code});try{closeSync(fd);}catch{}}});
