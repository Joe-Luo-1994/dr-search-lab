import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Provider implementation owns its auth fixture separately from the oracle.
const ROLES={a:['space-a'],b:['space-b'],all:['space-a','space-b'],none:[]};
const segmenter=new Intl.Segmenter('zh-Hant',{granularity:'word'});
const normalize=text=>text.replace(/\p{Script=Han}+/gu,r=>[...segmenter.segment(r)].map(x=>x.segment).join(' ')).replace(/\s+/g,' ').trim();
export class RequestError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export function failure(e){const expected=e instanceof RequestError;return Response.json({error:{code:expected?e.code:'SEARCH_UNAVAILABLE',retryable:!expected||e.status>=500}},{status:expected?e.status:503,headers:{'cache-control':'no-store'}});}
let state;
async function load(){return state??=(async()=>{const root=process.env.LAB_RESEARCH_DIR;const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));const map=JSON.parse(await readFile(path.join(root,'map.json'),'utf8'));const pf=await import(/* webpackIgnore: true */ pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);await pf.options({basePath:process.env.LAB_INDEX_ORIGIN+'/pagefind/',baseUrl:'/'});return {manifest,map,pf};})().catch(e=>{state=undefined;throw e;});}
export async function searchResponse(req){
 const user=req.headers.get('x-lab-user');if(!user)throw new RequestError(401,'UNAUTHENTICATED');if(user==='unknown')throw new RequestError(503,'AUTH_UNAVAILABLE');if(!Object.hasOwn(ROLES,user))throw new RequestError(403,'FORBIDDEN');
 const url=new URL(req.url),q=url.searchParams.get('q')??'',page=Number(url.searchParams.get('page')??1),pageSize=Number(url.searchParams.get('pageSize')??10);
 if(url.searchParams.get('engine')!=='pagefind'||!q.trim()||q.length>300||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>10)throw new RequestError(400,'INVALID_REQUEST');
 const allowed=new Set(ROLES[user]);const scope=url.searchParams.has('spaces')?url.searchParams.get('spaces').split(',').filter(s=>allowed.has(s)):[...allowed];const tags=url.searchParams.get('tags')?.split(',').filter(Boolean)??[];
 const {manifest,map,pf}=await load();let hits=[],total=0,metrics={};
 if(scope.length){const filters={space:{any:scope}};if(tags.length)filters.tags=tags;
  const start=performance.now(),result=await pf.search(normalize(q),{filters});metrics.engineMs=performance.now()-start;const mappedAt=performance.now(),seen=new Set(),rows=[];
  for(const r of result.results){const p=Object.hasOwn(map,r.id)?map[r.id]:null;if(!p||!scope.includes(p.spaceId)||!tags.every(t=>p.tags.includes(t))||seen.has(p.id))throw Error('MAPPING_SCOPE_INVARIANT');seen.add(p.id);rows.push(p);}
  total=rows.length;hits=rows.slice((page-1)*pageSize,page*pageSize).map(p=>({id:p.id,spaceId:p.spaceId,tags:p.tags,title:p.title,url:`/api/research/pages/${p.id}?release=${manifest.release}`,highlight:null}));metrics.mappingMs=performance.now()-mappedAt;
 }
 return Response.json({schemaVersion:manifest.release,release:manifest.release,engine:'pagefind',page,pageSize,total,totalRelation:'exact',capabilities:{highlight:'none'},synthetic:true,hits,metrics},{headers:{'cache-control':'no-store'}});
}
