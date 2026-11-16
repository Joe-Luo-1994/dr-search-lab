import {spawn} from 'node:child_process';
import {readFile,writeFile,stat,opendir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {doc,RELEASE} from '../ms1-review/corpus.mjs';
const run=path.resolve(process.argv[2]),root=path.join(run,'artifacts/artifact-100000'),N=100000;
const began=performance.now(),evidence=path.join(run,'evidence');
const script=fileURLToPath(new URL('../ms1-experiment/prepare.mjs',import.meta.url));
async function hash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
const outcome={stage:'G1',N,release:RELEASE,synthetic:true,verified:false,startedAt:new Date().toISOString()};
try{
 const frozen=JSON.parse(await readFile(path.join(run,'freeze.json'),'utf8'));
 for(const [rel,v] of Object.entries(frozen.files))assert.equal(await hash(path.join(run,rel)),v.sha256,`freeze mismatch ${rel}`);
 await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--max-old-space-size=4096',script,root,'pagefind',String(N)],{stdio:'inherit'});p.once('error',reject);p.once('exit',(c,s)=>c===0?resolve():reject(Error(`builder exit ${c} ${s}`)));});
 outcome.builderElapsedMs=performance.now()-began;const auditStart=performance.now();
 const m=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));assert.equal(m.N,N);assert.equal(m.engine,'pagefind');assert.equal(m.release,RELEASE);
 const entry=JSON.parse(await readFile(path.join(root,'pagefind/pagefind-entry.json'),'utf8'));assert.equal(entry.version,'1.6.0');assert.equal(entry.languages.zh.page_count,N);outcome.entry=entry;
 const db=new DatabaseSync(path.join(root,'data.sqlite'),{readOnly:true});
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare('SELECT count(*) n FROM pages').get().n,N);assert.equal(db.prepare('SELECT count(*) n FROM pf_map').get().n,N);
 assert.equal(db.prepare('SELECT count(*) n FROM pages p LEFT JOIN pf_map m ON m.pageId=p.id WHERE m.pageId IS NULL').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM pf_map m LEFT JOIN pages p ON p.id=m.pageId WHERE p.id IS NULL').get().n,0);
 const sourceHash=createHash('sha256'),row=db.prepare('SELECT * FROM pages WHERE id=?');
 for(let i=0;i<N;i++){const p=doc(i,N);sourceHash.update(JSON.stringify(p)+'\n');const r=row.get(p.id);assert.equal(r.spaceId,p.spaceId);assert.equal(r.title,p.title);assert.equal(r.content,p.content);assert.deepEqual(JSON.parse(r.attachments),p.attachments);}
 assert.equal(sourceHash.digest('hex'),m.sourceSha256);
 const lookup=db.prepare('SELECT p.* FROM pf_map m JOIN pages p ON p.id=m.pageId WHERE m.resultId=?');let fragments=0;
 for await(const entry of await opendir(path.join(root,'pagefind/fragment'))){if(!entry.name.endsWith('.pf_fragment'))continue;assert(entry.isFile());const raw=gunzipSync(await readFile(path.join(root,'pagefind/fragment',entry.name))).toString('utf8');assert(raw.startsWith('pagefind_dcd'));const f=JSON.parse(raw.slice(12));const p=lookup.get(entry.name.slice(0,-12));assert(p);assert.equal(f.meta.id,p.id);assert.equal(f.meta.title,p.title);assert.deepEqual(f.filters.space,[p.spaceId]);fragments++;}
 assert.equal(fragments,N);db.close();outcome.sourceAndMappingAuditMs=performance.now()-auditStart;
 const files=[];let logical=0,allocated=0;const hashStart=performance.now();
 async function walk(dir){for await(const e of await opendir(dir)){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else {assert(e.isFile(),'no symlinks/special artifacts');const s=await stat(p);files.push({path:path.relative(root,p),bytes:s.size,sha256:await hash(p)});logical+=s.size;allocated+=s.blocks*512;}}}
 await walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
 const inventory=JSON.stringify({release:RELEASE,N,files},null,2)+'\n';
 await writeFile(path.join(evidence,'artifact-inventory.json'),inventory,{flag:'wx'});
 for(const [rel,v] of Object.entries(frozen.files))assert.equal(await hash(path.join(run,rel)),v.sha256,`post-build freeze mismatch ${rel}`);
 Object.assign(outcome,{verified:true,fragments,fileCount:files.length,logicalBytes:logical,allocatedBytes:allocated,hashMs:performance.now()-hashStart,inventorySha256:createHash('sha256').update(inventory).digest('hex'),builderManifest:m});
}catch(e){outcome.error=e.stack;process.exitCode=1;}
outcome.elapsedMs=performance.now()-began;outcome.finishedAt=new Date().toISOString();
await writeFile(path.join(evidence,'g1-verification.json'),JSON.stringify(outcome,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:outcome.verified,elapsedMs:outcome.elapsedMs,error:outcome.error,fileCount:outcome.fileCount,logicalBytes:outcome.logicalBytes}));
