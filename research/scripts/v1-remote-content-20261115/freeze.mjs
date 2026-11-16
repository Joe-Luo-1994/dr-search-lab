import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';

const rt='.lab/v1-remote-content-20261115',out='evidence/v1-remote-content-20261115',src='scripts/v1-remote-content-20261115';
const hash=b=>createHash('sha256').update(b).digest('hex');
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);}
function inventory(paths){return Object.fromEntries(paths.sort().map(p=>[p,hash(fs.readFileSync(p))]));}
const old={};
for(const f of ['evidence/v1-e1-20261115/freeze-r2.json','evidence/v1-e2-20261115/freeze-r2.json']){
 const record=JSON.parse(fs.readFileSync(f));for(const [p,h] of Object.entries(record.files)){assert.equal(hash(fs.readFileSync(p)),h,p);old[p]=h;}
}
const stage=process.argv[2];
if(stage==='init'){
 fs.mkdirSync(rt,{recursive:true});fs.mkdirSync(out);
 fs.writeFileSync(rt+'/private-config.json',JSON.stringify({endpoint:'http://127.0.0.1:19440',bucket:'dr-remote-20261115',accessKey:'lab'+randomBytes(8).toString('hex'),secretKey:randomBytes(24).toString('hex')})+'\n',{flag:'wx',mode:0o600});
 fs.writeFileSync(out+'/preservation-before.json',JSON.stringify({at:new Date().toISOString(),files:old},null,2),{flag:'wx'});
 console.log(JSON.stringify({stage,oldFiles:Object.keys(old).length,configCreated:true}));
}else if(stage==='source'){
 const files=inventory([...walk(src),'docs/DR_REMOTE_CONTENT_CARD_20261115.md','docs/DR_REMOTE_CONTENT_RUNBOOK_20261115.md']);
 fs.writeFileSync(out+'/source-freeze.json',JSON.stringify({at:new Date().toISOString(),files},null,2),{flag:'wx'});
 console.log(JSON.stringify({stage,files:Object.keys(files).length}));
}else if(stage==='formal'){
 const source=JSON.parse(fs.readFileSync(out+'/source-freeze.json'));for(const [p,h]of Object.entries(source.files))assert.equal(hash(fs.readFileSync(p)),h,p);
 const receipt=JSON.parse(fs.readFileSync(rt+'/build-receipt.json'));
 for(const [p,h]of Object.entries(receipt.inputs))assert.equal(hash(fs.readFileSync(path.resolve(src,p))),h,p);
 const outputs=Object.fromEntries(Object.entries(receipt.outputs).map(([p,h])=>[path.resolve(src,p),h]));
 for(const [p,h]of Object.entries(outputs))assert.equal(hash(fs.readFileSync(p)),h,p);
 const artifactFiles=inventory([...walk(rt+'/producer'),...walk(rt+'/artifacts'),...walk(rt+'/objects'),rt+'/publication-input.json',rt+'/publication-receipt.json',rt+'/build-receipt.json']);
 const files={...old,...source.files,...outputs,...artifactFiles};
 fs.writeFileSync(out+'/freeze.json',JSON.stringify({at:new Date().toISOString(),files,sourceFreezeSha256:hash(fs.readFileSync(out+'/source-freeze.json')),newExperiments:'R1-R3 only'},null,2),{flag:'wx'});
 console.log(JSON.stringify({stage,files:Object.keys(files).length}));
}else throw Error('init|source|formal');
