import {trace} from '../gate/trace.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeQuery} from './text.mjs';
import {allowedSpaces} from '../ms1-review/corpus.mjs';
let statePromise,pfPromise;
export class RequestError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export function failure(e){trace('search.failure',{name:e?.name,code:e?.code});const expected=e instanceof RequestError;return Response.json({error:{code:expected?e.code:'SEARCH_UNAVAILABLE',retryable:!expected||e.status>=500}},{status:expected?e.status:503,headers:{'cache-control':'no-store'}});}
function auth(request){const user=request.headers.get('x-lab-user');if(!user)throw new RequestError(401,'UNAUTHENTICATED');if(user==='unknown')throw new RequestError(503,'AUTH_UNAVAILABLE');const a=allowedSpaces(user);if(a===null)throw new RequestError(403,'FORBIDDEN');return new Set(a);}
async function state(){return statePromise??=(async()=>{trace('state.start');const root=process.env.LAB_RESEARCH_DIR;if(!root)throw Error('No isolated root');trace('state.manifest.start');const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));trace('state.manifest.end');trace('db.open.start');const db=new DatabaseSync(path.join(root,'data.sqlite'),{readOnly:true});trace('db.open.end');trace('db.configure.start');db.exec('PRAGMA cache_size=-16384; PRAGMA temp_store=FILE');trace('db.configure.end');trace('state.ready');return {root,manifest,db};})().catch(e=>{statePromise=undefined;throw e;});}
async function pagefind(){return pfPromise??=(async()=>{const {root}=await state();trace('pf.import.start');const pf=await import(/* webpackIgnore: true */ pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);trace('pf.import.end');trace('pf.options.start');await pf.options({basePath:process.env.LAB_INDEX_ORIGIN+'/pagefind/',baseUrl:'/'});trace('pf.options.end');return pf;})().catch(e=>{pfPromise=undefined;throw e;});}
function pageJson(row,release){return {id:row.id,title:row.title,content:row.content,url:`/api/research/pages/${row.id}?release=${release}`,highlight:null};}
function checkRelease(url,m){if(url.searchParams.get('release')!==m.release)throw new RequestError(409,'VERSION_UNAVAILABLE');}
export async function searchResponse(request){trace('search.arrive');const allAllowed=auth(request);const u=new URL(request.url);const engine=u.searchParams.get('engine');const q=u.searchParams.get('q')??'';const page=Number(u.searchParams.get('page')??1),pageSize=Number(u.searchParams.get('pageSize')??10);
 if(!['sqlite','pagefind'].includes(engine)||!q.trim()||q.length>300||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>10)throw new RequestError(400,'INVALID_REQUEST');
 const allowed=u.searchParams.has('spaces')?new Set(u.searchParams.get('spaces').split(',').filter(x=>allAllowed.has(x))):allAllowed;
 trace('search.scope',{allowedSpaceCount:allowed.size,page,pageSize});const {manifest,db}=await state();let total=0,hits=[];const timing={};
 if(allowed.size){const term=normalizeQuery(q);const offset=(page-1)*pageSize;
  if(engine==='sqlite'){
   const quoted=term.split(/\s+/).filter(Boolean).map(w=>'"'+w.replaceAll('"','""')+'"').join(' AND ');
   const universe=Array.from({length:1000},(_,i)=>'s'+String(i).padStart(4,'0'));
   const scope=universe.every(s=>allowed.has(s))?'':' AND space:('+[...allowed].map(s=>'"'+s.replaceAll('"','""')+'"').join(' OR ')+')';
   const match='{title content}:('+quoted+')'+scope;
   let t=performance.now();total=db.prepare('SELECT count(*) n FROM search_index WHERE search_index MATCH ?').get(match).n;timing.countMs=performance.now()-t;
   t=performance.now();const rows=db.prepare('SELECT p.id,p.spaceId,p.title,p.content FROM search_index JOIN pages p ON p.rowid=search_index.rowid WHERE search_index MATCH ? ORDER BY bm25(search_index,0,2,1),p.id LIMIT ? OFFSET ?').all(match,pageSize,offset);timing.pageMs=performance.now()-t;
   if(rows.some(p=>!allowed.has(p.spaceId)))throw Error('Scope invariant failed');hits=rows.map(p=>pageJson(p,manifest.release));
  }else{
   const pf=await pagefind();trace('pf.search.start');let t=performance.now();const result=await pf.search(term,{filters:{space:{any:[...allowed]}}});timing.engineMs=performance.now()-t;trace('pf.search.end',{resultCount:result.results.length,engineMs:timing.engineMs});
   trace('mapping.start',{resultCount:result.results.length});t=performance.now();const lookup=db.prepare('SELECT p.id,p.spaceId FROM pf_map m JOIN pages p ON p.id=m.pageId WHERE m.resultId=?');const seen=new Set();const chosen=[];
   for(let i=0;i<result.results.length;i++){const p=lookup.get(result.results[i].id);if(!p||!allowed.has(p.spaceId)||seen.has(p.id))throw Error('Missing/invalid Pagefind mapping');seen.add(p.id);if(i>=offset&&i<offset+pageSize)chosen.push(p.id);if((i+1)%10000===0)trace('mapping.progress',{processed:i+1,resultCount:result.results.length});}
   total=result.results.length;timing.mappingMs=performance.now()-t;trace('mapping.end',{processed:result.results.length,chosenCount:chosen.length,mappingMs:timing.mappingMs});
   trace('hydration.start',{chosenCount:chosen.length});const get=db.prepare('SELECT * FROM pages WHERE id=?');hits=chosen.map(id=>pageJson(get.get(id),manifest.release));trace('hydration.end',{hitCount:hits.length});
  }
 }
 trace('response.start',{total,hitCount:hits.length});const response=Response.json({schemaVersion:'ms1-v1',release:manifest.release,engine,page,pageSize,total,totalRelation:'exact',capabilities:{highlight:'none'},synthetic:true,hits,metrics:timing},{headers:{'cache-control':'no-store'}});trace('response.ready',{status:response.status});return response;
}
export async function pageResponse(request,id){const allow=auth(request);const {db,manifest}=await state();checkRelease(new URL(request.url),manifest);const p=db.prepare('SELECT * FROM pages WHERE id=?').get(id);if(!p)throw new RequestError(404,'NOT_FOUND');if(!allow.has(p.spaceId))throw new RequestError(403,'FORBIDDEN');return Response.json({schemaVersion:'ms1-v1',release:manifest.release,id:p.id,title:p.title,content:p.content,attachments:JSON.parse(p.attachments).map(a=>({id:a.id,url:`/api/research/attachments/${a.id}?release=${manifest.release}`})),synthetic:true},{headers:{'cache-control':'no-store'}});}
export async function attachmentResponse(request,id){const allow=auth(request);const {db,manifest}=await state();checkRelease(new URL(request.url),manifest);const a=db.prepare('SELECT * FROM attachments WHERE id=?').get(id);if(!a)throw new RequestError(404,'NOT_FOUND');if(!allow.has(a.spaceId))throw new RequestError(403,'FORBIDDEN');return new Response(a.text,{headers:{'content-type':a.contentType,'cache-control':'no-store'}});}
