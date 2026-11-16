// Independent read-only structural audit after timed stages finish.
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {doc,spaceOf,idOf} from './corpus.mjs';
const base=path.resolve(process.argv[2]||'.lab/ms1');const out=process.argv[3]||'evidence/ms1-2026-11-14/reviewer/artifact-audit.json';
const report={kind:'independent-read-only-rowcount-space-distribution-and-sample-audit',scope:'After timed measurement; not full artifact content hash or MinIO durability proof',stages:[]};
async function sizes(root){let logical=0,allocated=0,files=0;async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile()){const s=await stat(p);logical+=s.size;allocated+=s.blocks*512;files++;}}}await walk(root);return {logicalBytes:logical,allocatedBytes:allocated,files};}
for(const name of (await readdir(base)).filter(x=>/^(sqlite|pagefind)-\d+$/.test(x)).sort()){
 const root=path.join(base,name),[engine,n]=name.split('-'),N=Number(n);const r={stage:name,engine,N};
 try{
  let m;try{m=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));r.hasSuccessfulManifest=true;}catch{r.hasSuccessfulManifest=false;}
  const db=new DatabaseSync(path.join(root,'data.sqlite'),{readOnly:true});
  try{
   r.actualPageCount=db.prepare('SELECT count(*) n FROM pages').get().n;r.actualMappingCount=db.prepare('SELECT count(*) n FROM pf_map').get().n;
   r.actualSpaceCounts=Object.fromEntries(db.prepare('SELECT spaceId,count(*) n FROM pages GROUP BY spaceId').all().map(x=>[x.spaceId,x.n]));
   if(m){assert.equal(r.actualPageCount,N);const expected={};for(let i=0;i<N;i++){const s=spaceOf(i,N);expected[s]=(expected[s]||0)+1;}assert.deepEqual(r.actualSpaceCounts,expected);const indices=[0,1,17,19,Math.floor(N/2)-1,Math.floor(N/2),Math.floor(N/2)+1,Math.min(997,N-1),N-1].filter((v,i,a)=>v>=0&&v<N&&a.indexOf(v)===i);r.sampledIds=[];
    for(const i of indices){const p=doc(i,N),row=db.prepare('SELECT * FROM pages WHERE id=?').get(idOf(i));assert(row);assert.equal(row.spaceId,p.spaceId);assert.equal(row.title,p.title);assert.equal(row.content,p.content);assert.deepEqual(JSON.parse(row.attachments),p.attachments);r.sampledIds.push(p.id);}
    if(engine==='sqlite'){r.actualFtsCount=db.prepare('SELECT count(*) n FROM search_index').get().n;assert.equal(r.actualFtsCount,N);}else{const entry=JSON.parse(await readFile(path.join(root,'pagefind/pagefind-entry.json'),'utf8'));r.pagefindLanguageCounts=Object.fromEntries(Object.entries(entry.languages).map(([k,v])=>[k,v.page_count]));assert.equal(Object.values(r.pagefindLanguageCounts).reduce((a,b)=>a+b,0),N);assert.equal(r.actualMappingCount,N);}
    r.passed=true;
   }else{r.passed=null;r.note='Incomplete build preserved; row count is not a successful release or reader acceptance.';}
  }finally{db.close();}
  Object.assign(r,await sizes(root));
 }catch(e){r.passed=false;r.error=e.stack;}
 report.stages.push(r);
}
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.stages.map(({actualSpaceCounts,...r})=>r),null,2));
process.exitCode=report.stages.some(r=>r.passed===false)?1:0;
