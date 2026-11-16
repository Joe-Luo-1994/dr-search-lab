import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {releaseSources} from './fixture/release-sources.mjs';
const exec=promisify(execFile),dir='scripts/v1-e2-20261115',out='evidence/v1-e2-20261115',runtime='.lab/v1-e2-20261115';
const hash=x=>createHash('sha256').update(x).digest('hex');
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);}
const hashes=ps=>Object.fromEntries(ps.map(p=>[p,hash(fs.readFileSync(p))]));
const save=(n,v)=>fs.writeFileSync(out+'/'+n,JSON.stringify(v,null,2),{flag:'wx'});
const original=JSON.parse(fs.readFileSync('evidence/v1-e1-20261115/freeze-r2.json'));
for(const [p,h] of Object.entries(original.files))assert.equal(hash(fs.readFileSync(p)),h,p);
assert(!fs.existsSync(out),'EXISTING_PREPARATION');assert(!fs.existsSync(runtime),'EXISTING_E2_RUNTIME');
const oracle=JSON.parse(fs.readFileSync(dir+'/review/oracle.json'));
const raw=fs.readFileSync(oracle.baseSource.path);assert.equal(hash(raw),oracle.baseSource.sha256);
const base=JSON.parse(raw),v1=structuredClone(base);v1.schemaVersion=2;v1.snapshotId=oracle.snapshotIds.v1;v1.snapshotCapturedAt=oracle.capturedAt.v1;
for(const [id,text] of Object.entries(oracle.sourceRecipe.v1.appendParagraph))v1.pages.find(p=>p.pageId===id).paragraphs.push(text);
const v2=structuredClone(v1),recipe=oracle.sourceRecipe.v2;v2.snapshotId=oracle.snapshotIds.v2;v2.snapshotCapturedAt=oracle.capturedAt.v2;
for(const [id,changes] of Object.entries(recipe.replacePages))Object.assign(v2.pages.find(p=>p.pageId===id),changes);
v2.pages.push(...recipe.addPages);v2.media=v2.media.filter(m=>!recipe.removeMediaIds.includes(m.mediaId)).concat(recipe.addMedia);
const actual=releaseSources(base);
for(const version of ['v1','v2']){
 const expected=version==='v1'?v1:v2;
 // Media array ordering is not semantically part of the contract.
 const canon=x=>({...x,media:[...x.media].sort((a,b)=>a.mediaId.localeCompare(b.mediaId))});
 assert.deepEqual(canon(actual[version]),canon(expected),'ORACLE_RECIPE_'+version);
}
fs.mkdirSync(out);
const files=hashes([...walk(dir),'docs/DR_E2_CARD_20261115.md','docs/DR_E2_RUNBOOK_20261115.md']);
save('source-freeze.json',{at:new Date().toISOString(),node:process.version,files,originalFilesVerified:Object.keys(original.files).length,recipeAudit:{v1:true,v2:true}});
async function run(name,args,timeout=60000){
 let stdout='',stderr='',error;const started=performance.now();
 try{({stdout,stderr}=await exec(process.execPath,[dir+'/'+name,...args],{windowsHide:true,timeout,maxBuffer:8*1024**2}));}catch(e){stdout=e.stdout??'';stderr=e.stderr??'';error={code:e.code,message:e.message};}
 const label=name.replace('.mjs','')+(args.length?'-'+args[0]:'');save(label+'.json',{args,stdout,stderr,error,elapsedMs:performance.now()-started});
 if(error)throw Error('PREPARATION_FAILED '+label);
 return stdout.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s)).at(-1);
}
await run('prepare.mjs',[]);
const prepared={};for(const v of ['v1','v2'])prepared[v]=await run('export.mjs',[v,v==='v1'?'fz1':'fz2']);
prepared['mixed-v2']=await run('export.mjs',['mixed-v2']);save('preparation.json',prepared);
await run('build.mjs',[],330000);
for(const [p,h] of Object.entries(files))assert.equal(hash(fs.readFileSync(p)),h,'SOURCE_CHANGED_DURING_PREP '+p);
save('operator-input.json',{v2ManifestSha256:prepared.v2.manifestSha256,artifactVersion:'v2',cache:'fresh',port:3161,expectedSnapshotId:oracle.snapshotIds.v2});
const build=runtime+'/next-build';
const immutable=[...Object.keys(files),...walk(runtime+'/producer'),...walk(runtime+'/artifacts'),runtime+'/build-receipt.json',build+'/BUILD_ID',...walk(build+'/server'),...walk(build+'/static'),out+'/operator-input.json'];
save('freeze.json',{at:new Date().toISOString(),files:hashes(immutable),oracleSha256:hash(fs.readFileSync(dir+'/review/oracle.json')),sourceFreezeSha256:hash(fs.readFileSync(out+'/source-freeze.json'))});
console.log(JSON.stringify({prepared:true,sourceFiles:Object.keys(files).length,frozenFiles:immutable.length,versions:Object.keys(prepared),formalExecuted:false}));
