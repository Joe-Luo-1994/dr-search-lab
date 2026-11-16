import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizeQuery } from './text.mjs';
let dataPromise,sqlitePromise,pagefindPromise;
export class RequestError extends Error { constructor(status,code){super(code);this.status=status;this.code=code;} }
export function failure(e){return Response.json({error:{code:e instanceof RequestError?e.code:'SEARCH_UNAVAILABLE',retryable:!(e instanceof RequestError)}},{status:e instanceof RequestError?e.status:503,headers:{'cache-control':'no-store'}});}
export function identity(request){const u=request.headers.get('x-lab-user');if(!u)throw new RequestError(401,'UNAUTHENTICATED');if(!['ops','restricted'].includes(u))throw new RequestError(403,'FORBIDDEN');return u;}
const digest=b=>createHash('sha256').update(b).digest('hex');
async function data(){return dataPromise??= (async()=>{
 const root=process.env.LAB_RESEARCH_DIR;if(!root)throw Error('Isolated runtime not configured');
 const bytes=await readFile(path.join(root,'fixture.json'));const fixture=JSON.parse(bytes);
 return {root,fixture,fixtureSha256:digest(bytes),byId:new Map(fixture.pages.map(p=>[p.id,p]))};
})().catch(e=>{dataPromise=undefined;throw e;});}
async function sqlite(){return sqlitePromise??= (async()=>{const {root}=await data();return new DatabaseSync(path.join(root,'search.sqlite'),{readOnly:true});})().catch(e=>{sqlitePromise=undefined;throw e;});}
async function pagefind(){return pagefindPromise??= (async()=>{
 const {root,fixture,fixtureSha256,byId}=await data();if(!process.env.LAB_INDEX_ORIGIN)throw Error('Missing private index origin');
 const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 const bytes=await readFile(path.join(root,'pagefind-map.json'));
 const expected=manifest.files.find(f=>f.path==='pagefind-map.json');
 if(!expected||expected.bytes!==bytes.length||expected.sha256!==digest(bytes))throw Error('Mapping artifact checksum mismatch');
 const map=JSON.parse(bytes);
 if(map.schemaVersion!=='pagefind-map-v1'||map.release!==fixture.release||map.fixtureSha256!==fixtureSha256||manifest.fixtureSha256!==fixtureSha256)throw Error('Mapping release mismatch');
 const ids=new Set();
 for(const value of Object.values(map.entries)){if(!byId.has(value.pageId)||byId.get(value.pageId).scope!==value.scope||ids.has(value.pageId))throw Error('Invalid mapping scope/ID');ids.add(value.pageId);}
 if(ids.size!==fixture.pages.length)throw Error('Incomplete mapping');
 const pf=await import(/* webpackIgnore: true */ pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);
 await pf.options({basePath:process.env.LAB_INDEX_ORIGIN+'/pagefind/',baseUrl:'/'});
 return {pf,map};
})().catch(e=>{pagefindPromise=undefined;throw e;});}
function pageUrl(p,release){return `/api/research/pages/${encodeURIComponent(p.id)}?release=${encodeURIComponent(release)}`;}
function checkRelease(url,fixture){if(url.searchParams.get('release')!==fixture.release)throw new RequestError(409,'VERSION_UNAVAILABLE');}
export async function searchResponse(request){
 const scope=identity(request);const url=new URL(request.url);const engine=url.searchParams.get('engine');
 const q=url.searchParams.get('q')??'';const page=Number(url.searchParams.get('page')??1);const pageSize=Number(url.searchParams.get('pageSize')??10);
 if(!['sqlite','pagefind'].includes(engine)||!q.trim()||q.length>300||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>10)throw new RequestError(400,'INVALID_REQUEST');
 const {fixture,byId}=await data();const term=normalizeQuery(q);let ids;
 if(engine==='sqlite'){
  const db=await sqlite();const match=term.split(/\s+/).filter(Boolean).map(w=>'"'+w.replaceAll('"','""')+'"').join(' AND ');
  ids=db.prepare('SELECT id FROM search_index WHERE search_index MATCH ? AND scope=? ORDER BY bm25(search_index,0,0,2,1),id').all(match,scope).map(r=>r.id);
 }else{
  const {pf,map}=await pagefind();const r=await pf.search(term,{filters:{scope}});
  // Engine computes filtered rank. Mapping validates every returned ID/scope;
  // malformed mapping rejects the entire request rather than altering total.
  ids=r.results.map(hit=>{const m=map.entries[hit.id];if(!m||m.scope!==scope||byId.get(m.pageId)?.scope!==scope)throw Error('Unknown or out-of-scope result mapping');return m.pageId;});
  if(new Set(ids).size!==ids.length)throw Error('Duplicate result mapping');
 }
 const total=ids.length;const chosen=ids.slice((page-1)*pageSize,page*pageSize);
 const hits=chosen.map(id=>{const p=byId.get(id);return {id:p.id,title:p.title,content:p.content,url:pageUrl(p,fixture.release),highlight:null};});
 return Response.json({schemaVersion:fixture.schemaVersion,release:fixture.release,engine,page,pageSize,total,totalRelation:'exact',capabilities:{highlight:'none'},synthetic:true,hits},{headers:{'cache-control':'no-store'}});
}
export async function pageResponse(request,id){const scope=identity(request);const {fixture,byId}=await data();checkRelease(new URL(request.url),fixture);const p=byId.get(id);if(!p)throw new RequestError(404,'NOT_FOUND');if(p.scope!==scope)throw new RequestError(403,'FORBIDDEN');return Response.json({schemaVersion:fixture.schemaVersion,release:fixture.release,id:p.id,title:p.title,content:p.content,attachments:p.attachments.map(a=>({id:a.id,url:`/api/research/attachments/${encodeURIComponent(a.id)}?release=${encodeURIComponent(fixture.release)}`})),synthetic:true},{headers:{'cache-control':'no-store'}});}
export async function attachmentResponse(request,id){const scope=identity(request);const {fixture}=await data();checkRelease(new URL(request.url),fixture);const page=fixture.pages.find(p=>p.attachments.some(a=>a.id===id));if(!page)throw new RequestError(404,'NOT_FOUND');if(page.scope!==scope)throw new RequestError(403,'FORBIDDEN');const a=page.attachments.find(a=>a.id===id);return new Response(Buffer.from(a.text,'utf8'),{headers:{'content-type':a.contentType,'cache-control':'no-store','content-disposition':`attachment; filename="${a.name}"`}});}
