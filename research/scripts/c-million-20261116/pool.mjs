import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const workerPath=fileURLToPath(new URL('./worker.mjs',import.meta.url));
export const fail=(code,status=503)=>Object.assign(Error(code),{code,status});
export class Pool {
  constructor(db,version){this.db=db;this.version=version;this.workers=[];this.queue=[];this.seq=0;this.refs=0;this.retired=false;this.closed=false;this.fatal=null;this.timings=[];this.jobs=0;}
  async start(){
    let watchdog;
    try{await Promise.race([(async()=>{
    await Promise.all([0,1].map(()=>new Promise((resolve,reject)=>{
      const child=fork(workerPath,[this.db],{stdio:['ignore','inherit','inherit','ipc']});
      const slot={child,job:null};this.workers.push(slot);
      child.on('message',m=>{
        if(m.ready){if(m.snapshotId!==this.version)reject(Error('WORKER_VERSION'));else resolve();return;}
        const job=slot.job;if(!job||m.id!==job.id)return;
        clearTimeout(job.timer);slot.job=null;
        this.jobs++;this.timings.push({op:job.op,lane:job.input.lane??'internal',queueMs:job.dispatched-job.admitted,workerMs:m.workerMs,totalMs:performance.now()-job.admitted});
        if(this.timings.length>256)this.timings.shift();
        if(m.error)job.reject(fail('QUERY_FAILED'));else job.resolve(m.result);
        this.dispatch();
      });
      child.on('error',reject);
      child.on('exit',(code,signal)=>{
        if(!this.closed){this.fatal={...this.fatal,exit:{code,signal}};console.error(JSON.stringify({event:'worker-fatal',...this.fatal}));reject(Error('WORKER_EXIT'));for(const j of this.queue.splice(0))j.reject(fail('WORKER_EXIT'));}
        if(slot.job){clearTimeout(slot.job.timer);slot.job.reject(fail('WORKER_EXIT'));slot.job=null;}
      });
    })));
    const check=await this.run('check',{});if(check.some(x=>Object.values(x)[0]!=='ok'))throw Error('SQLITE_CHECK');
    })(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('WORKER_START_TIMEOUT')),30000);})]);
    return this;
    }catch(e){await this.close();throw e;}finally{clearTimeout(watchdog);}
  }
  run(op,input){
    if(this.closed||this.fatal)return Promise.reject(fail('WORKER_UNAVAILABLE'));
    if(this.queue.length>=16)return Promise.reject(fail('SEARCH_BUSY'));
    return new Promise((resolve,reject)=>{const job={id:++this.seq,op,input,resolve,reject,timer:null,admitted:performance.now(),dispatched:null};
      job.timer=setTimeout(()=>{
        const i=this.queue.indexOf(job);
        if(i>=0){this.queue.splice(i,1);reject(fail('QUEUE_TIMEOUT'));}
        else {const slot=this.workers.find(s=>s.job===job);if(slot){this.fatal={timeout:true,op:job.op,lane:job.input.lane,queueMs:job.dispatched-job.admitted,runMs:performance.now()-job.dispatched,reason:'admission deadline includes queue and execution'};slot.child.kill('SIGKILL');}reject(fail('QUERY_TIMEOUT'));}
      },op==='check'?30000:4000);this.queue.push(job);this.dispatch();});
  }
  dispatch(){for(const slot of this.workers){if(!slot.job&&this.queue.length&&!this.fatal&&!this.closed){slot.job=this.queue.shift();slot.job.dispatched=performance.now();slot.child.send({id:slot.job.id,op:slot.job.op,input:slot.job.input});}}}
  metrics(){return {jobs:this.jobs,queued:this.queue.length,busy:this.workers.filter(w=>w.job).length,timings:this.timings};}
  async close(){this.closed=true;for(const j of this.queue.splice(0)){clearTimeout(j.timer);j.reject(fail('POOL_CLOSED'));}
    await Promise.all(this.workers.map(({child})=>new Promise(resolve=>{
      if(child.exitCode!==null||child.signalCode!==null)return resolve();
      const timer=setTimeout(()=>child.kill('SIGKILL'),500);
      child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();
    })));
  }
}
