import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { normalizeQuery } from './text.mjs';
let statePromise;
export class RequestError extends Error { constructor(status,code){super(code);this.status=status;this.code=code;} }
export function failure(e){return Response.json({error:{code:e instanceof RequestError?e.code:'SEARCH_UNAVAILABLE',retryable:!(e instanceof RequestError)}},{status:e instanceof RequestError?e.status:503,headers:{'cache-control':'no-store'}});}
export function identity(request){const u=request.headers.get('x-lab-user');if(!u)throw new RequestError(401,'UNAUTHENTICATED');if(!['ops','restricted'].includes(u))throw new RequestError(403,'FORBIDDEN');return u;}
async function state(){return statePromise??= (async()=>{
 const root=process.env.LAB_RESEARCH_DIR;if(!root||!process.env.LAB_INDEX_ORIGIN)throw Error('Isolated runtime not configured');
 const fixture=JSON.parse(await readFile(path.join(root,'fixture.json'),'utf8'));
 const sqlite=new DatabaseSync(path.join(root,'search.sqlite'),{readOnly:true});
 const pf=await import(/* webpackIgnore: true */ pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);
 await pf.options({basePath:process.env.LAB_INDEX_ORIGIN+'/pagefind/',baseUrl:'/'});
 return {fixture,sqlite,pf,byId:new Map(fixture.pages.map(p=>[p.id,p]))};
})();}
function pageUrl(p,release){return `/api/research/pages/${encodeURIComponent(p.id)}?release=${encodeURIComponent(release)}`;}
function checkRelease(url,fixture){if(url.searchParams.get('release')!==fixture.release)throw new RequestError(409,'VERSION_UNAVAILABLE');}
export async function searchResponse(request){
 const scope=identity(request);const url=new URL(request.url);const engine=url.searchParams.get('engine');
 const q=url.searchParams.get('q')??'';const page=Number(url.searchParams.get('page')??1);const pageSize=Number(url.searchParams.get('pageSize')??10);
 if(!['sqlite','pagefind'].includes(engine)||!q.trim()||q.length>300||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>10)throw new RequestError(400,'INVALID_REQUEST');
 const {fixture,sqlite,pf,byId}=await state();const term=normalizeQuery(q);let ids;
 if(engine==='sqlite'){
  const match=term.split(/\s+/).filter(Boolean).map(w=>'"'+w.replaceAll('"','""')+'"').join(' AND ');
  ids=sqlite.prepare('SELECT id FROM search_index WHERE search_index MATCH ? AND scope=? ORDER BY bm25(search_index,0,0,2,1),id').all(match,scope).map(r=>r.id);
 }else{
  const r=await pf.search(term,{filters:{scope}});
  // All matching fragments are currently resolved for stable page IDs and exact total.
  // Explicit scaling cost, not an undocumented corpus scan fallback.
  const data=await Promise.all(r.results.map(h=>h.data()));
  ids=data.map(h=>h.meta.id).filter(id=>byId.get(id)?.scope===scope);
 }
 const total=ids.length;const chosen=ids.slice((page-1)*pageSize,page*pageSize);
 const hits=chosen.map(id=>{const p=byId.get(id);return {id:p.id,title:p.title,content:p.content,url:pageUrl(p,fixture.release),highlight:null};});
 return Response.json({schemaVersion:fixture.schemaVersion,release:fixture.release,engine,page,pageSize,total,totalRelation:'exact',capabilities:{highlight:'none'},synthetic:true,hits},{headers:{'cache-control':'no-store'}});
}
export async function pageResponse(request,id){const scope=identity(request);const {fixture,byId}=await state();checkRelease(new URL(request.url),fixture);const p=byId.get(id);if(!p)throw new RequestError(404,'NOT_FOUND');if(p.scope!==scope)throw new RequestError(403,'FORBIDDEN');return Response.json({schemaVersion:fixture.schemaVersion,release:fixture.release,id:p.id,title:p.title,content:p.content,attachments:p.attachments.map(a=>({id:a.id,url:`/api/research/attachments/${encodeURIComponent(a.id)}?release=${encodeURIComponent(fixture.release)}`})),synthetic:true},{headers:{'cache-control':'no-store'}});}
export async function attachmentResponse(request,id){const scope=identity(request);const {fixture}=await state();checkRelease(new URL(request.url),fixture);const page=fixture.pages.find(p=>p.attachments.some(a=>a.id===id));if(!page)throw new RequestError(404,'NOT_FOUND');if(page.scope!==scope)throw new RequestError(403,'FORBIDDEN');const a=page.attachments.find(a=>a.id===id);return new Response(Buffer.from(a.text,'utf8'),{headers:{'content-type':a.contentType,'cache-control':'no-store','content-disposition':`attachment; filename="${a.name}"`}});}
