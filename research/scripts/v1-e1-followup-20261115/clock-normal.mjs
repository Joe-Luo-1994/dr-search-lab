import {fork} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const stamp=()=>({now:Date.now(),iso:new Date().toISOString(),performance:performance.now(),hrtime:process.hrtime.bigint().toString()});
const sample=()=>{const before=stamp();const iso=new Date().toISOString();const after=stamp();return {before,iso,after,contained:Date.parse(iso)>=before.now&&Date.parse(iso)<=after.now};};
if(process.argv[2]==='child'){
  process.on('message',id=>process.send({id,node:process.version,sample:sample()}));
}else{
  const out='evidence/v1-e1-followup-20261115/normal-clock';
  await fs.mkdir(out,{recursive:true});
  const same=Array.from({length:100},sample),ipc=[];
  const child=fork(fileURLToPath(import.meta.url),['child'],{stdio:['ignore','ignore','pipe','ipc']});
  const watchdog=setTimeout(()=>child.kill(),10000);
  try{
    for(let id=0;id<100;id++){
      const reply=once(child,'message',{signal:AbortSignal.timeout(1000)});
      const before=stamp();child.send(id);const [response]=await reply;const after=stamp();
      ipc.push({id,before,response,after,contained:Date.parse(response.sample.iso)>=before.now&&Date.parse(response.sample.iso)<=after.now});
    }
  }finally{clearTimeout(watchdog);child.kill();await once(child,'exit');}
  const result={node:process.version,platform:process.platform,createdAt:new Date().toISOString(),same,ipc,summary:{sameFailed:same.filter(x=>!x.contained).length,ipcFailed:ipc.filter(x=>!x.contained).length,childSameFailed:ipc.filter(x=>!x.response.sample.contained).length,maxSameAheadMs:Math.max(...same.map(x=>Date.parse(x.iso)-x.after.now)),maxIpcAheadMs:Math.max(...ipc.map(x=>Date.parse(x.response.sample.iso)-x.after.now))}};
  await fs.writeFile(out+'/clock.json',JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result.summary));
}

