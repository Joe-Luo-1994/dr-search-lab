import {readFile,mkdir,appendFile,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {Pool,fail} from './pool.mjs';
import {config,object,download} from './storage.mjs';
let active,initializing,updating=false,contentInFlight=0;const retired=[];
const events=[];
const emitter=new EventEmitter();
async function event(type,data={}){const e={type,at:Date.now(),...data};events.push(e);const c=await config();await appendFile(c.eventLog,JSON.stringify(e)+'\n');emitter.emit(type,e);}
async function install(version,{initial=false,badHash=false,signal}={}){
  const c=await config();const descriptor=c.releases[version];if(!descriptor)throw fail('UNKNOWN_VERSION',400);
  const dir=path.join(c.cacheDir,version+(badHash?'-bad':''));await mkdir(dir,{recursive:true});
  const target=path.join(dir,'search.sqlite');
  await event('download-start',{version,badHash});
  const receipt=await download({...descriptor,...(badHash?{sha256:'0'.repeat(64)}:{})},target,initial?0:16*1024**2,signal);
  await event('download-end',{version,...receipt});
  const pool=new Pool(target,version);
  try{await pool.start();signal?.throwIfAborted();}catch(e){await pool.close();throw e;}
  return {pool,receipt};
}
async function init(){if(active)return;if(!initializing)initializing=(async()=>{const x=await install('v1',{initial:true});active=x.pool;await event('ready',{snapshotId:'v1',...x.receipt});})();return initializing;}
function retire(pool){pool.retired=true;retired.push(pool);release(pool);}
function release(pool){if(pool.retired&&pool.refs===0&&!pool.closed){void pool.close().then(()=>event('retired-drained',{version:pool.version}));}}
function json(res,status,value){res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));}
function waitFor(res,event){return new Promise(resolve=>{const done=()=>{res.off(event,done);res.off('close',done);resolve();};res.once(event,done);res.once('close',done);});}
function allow(identity,page){return page&&(identity==='all'||identity==='a'&&page.spaceId==='space0');}
export async function handler(req,res){
  let pinned,contentSlot=false;
  try{
    await init();const c=await config();const url=new URL(req.url,'http://localhost');
    const op=url.pathname.split('/').at(-1);
    if(op==='status'){return json(res,200,{snapshotId:active.version,pid:process.pid,workers:active.workers.map(x=>x.child.pid),queue:active.queue.length,contentInFlight,updating,testHooks:c.testHooks===true,fatal:active.fatal,events:events.slice(-20)});}
    if(op==='update'){
      if(req.method!=='POST'||req.headers['x-cap-admin']!==c.adminToken)throw fail('NOT_FOUND',404);
      if(updating)throw fail('UPDATE_BUSY');updating=true;const abort=new AbortController();const cancel=()=>{if(!res.writableFinished)abort.abort();};res.on('close',cancel);
      try{
        const body=req.body??{};if(body.version!=='v2')throw fail('INVALID_VERSION',400);
        const previousVersion=active.version;if(previousVersion==='v2')throw fail('ALREADY_ACTIVE',409);
        const x=await install('v2',{badHash:body.badHash===true,signal:abort.signal});
        const old=active;active=x.pool;const activatedMs=Date.now();await event('activated',{previousVersion,snapshotId:'v2',activatedMs});retire(old);
        return json(res,200,{previousVersion,snapshotId:'v2',...x.receipt,activatedMs});
      }finally{res.off('close',cancel);updating=false;}
    }
    const identity=req.headers['x-cap-identity'];if(!['all','a','none'].includes(identity))throw fail('AUTHORIZATION_UNKNOWN');
    pinned=active;pinned.refs++;
    if(req.headers['x-cap-hold-until-activation']==='1'){
      if(!c.testHooks||req.headers['x-cap-admin']!==c.adminToken||op!=='page')throw fail('TEST_HOOK_DISABLED',404);
      const held=new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);emitter.off('activated',done);resolve();};
        const timer=setTimeout(()=>{emitter.off('activated',done);reject(fail('HOLD_TIMEOUT'));},45000);emitter.once('activated',done);});
      await event('held-pin',{version:pinned.version});await held;
    }
    if(op==='search'){
      const q=url.searchParams.get('q')??'',spaceId=url.searchParams.get('spaceId'),tags=url.searchParams.getAll('tagId');
      if(!q||q.length>120||tags.length>10)throw fail('INVALID_REQUEST',400);
      const result=await pinned.run('search',{q,spaceId,tags,identity});
      result.hits.forEach(h=>h.url='/api/capi/page?pageId='+h.pageId+'&version='+pinned.version);
      return json(res,200,{snapshotId:pinned.version,...result});
    }
    if(!['page','media'].includes(op))throw fail('NOT_FOUND',404);
    if(url.searchParams.get('version')!==pinned.version)throw fail('VERSION_MISMATCH',409);
    const page=await pinned.run('page',{pageId:url.searchParams.get('pageId')});
    if(!allow(identity,page))throw fail('NOT_FOUND',404);
    let descriptor;
    if(op==='page'){
      if(!page.bodyKey)throw fail('BODY_NOT_PUBLISHED',503);
      descriptor={key:page.bodyKey,bytes:page.bodyBytes,sha256:page.bodySha};
    }else{
      if(!page.media||page.mediaId!==url.searchParams.get('mediaId'))throw fail('NOT_FOUND',404);
      descriptor=page.media;
    }
    if(contentInFlight>=4)throw fail('CONTENT_BUSY');contentInFlight++;contentSlot=true;
    const bytes=await object(descriptor);
    if(op==='page'){const body=JSON.parse(bytes);if(body.pageId!==page.pageId||body.snapshotId!==pinned.version)throw fail('CONTENT_INTEGRITY');}
    res.statusCode=200;res.setHeader('cache-control','no-store');res.setHeader('content-type',op==='page'?'application/json':descriptor.mimeType);res.setHeader('content-length',bytes.length);
    // Hold admission and version pin through actual socket completion; chunked writes honor backpressure.
    for(let offset=0;offset<bytes.length;offset+=64*1024){if(res.destroyed)break;if(!res.write(bytes.subarray(offset,offset+64*1024)))await waitFor(res,'drain');}
    if(!res.destroyed){const finished=waitFor(res,'finish');res.end();await finished;}
  }catch(e){if(!res.headersSent&&!res.destroyed)json(res,e.status??503,{error:{code:e.code??e.message??'UNAVAILABLE'}});else if(!res.destroyed)res.destroy();}
  finally{if(contentSlot)contentInFlight--;if(pinned){pinned.refs--;release(pinned);}}
}
