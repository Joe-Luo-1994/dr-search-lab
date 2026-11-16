import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(root,'evidence/v1-e1-20261115'),sha=b=>createHash('sha256').update(b).digest('hex');
const round=process.env.E1_ROUND??'r1';assert(['r1','r2'].includes(round));
const freezeFile=path.join(out,round==='r1'?'freeze.json':'freeze-r2.json');if(fs.existsSync(freezeFile))throw Error('FREEZE_EXISTS');
const oracle=JSON.parse(fs.readFileSync(path.join(here,'review/oracle.json')));
assert.equal(oracle.sourceSha256,sha(fs.readFileSync(path.join(here,'fixture/source.json'))));
assert.equal(oracle.contractSha256,sha(fs.readFileSync(path.join(here,'CONTRACT.md'))));
assert.equal(oracle.scope.total,oracle.cases.length+oracle.driftCases.length);
const base='http://127.0.0.1:19300';
async function get(s){const r=await fetch(base+s,{signal:AbortSignal.timeout(5000)});assert(r.ok,'ES_HTTP');return r.json();}
const info=await get('/'),nodes=await get('/_nodes/process');assert.equal(info.version.number,'8.17.0');
const node=Object.values(nodes.nodes);assert.equal(node.length,1);assert.equal(node[0].name,'drlab-dr');
const prior=JSON.parse(fs.readFileSync(path.join(out,'es-before.json')));
const current=await get('/_cat/indices?format=json&h=index,uuid,docs.count');
for(const old of prior){assert.deepEqual(current.find(x=>x.index===old.index),old,'OLD_INDEX_CHANGED');}
const target=current.find(x=>x.index==='drlab-v1-e1-20261115-r1');assert.equal(target?.['docs.count'],'37');
const settings=await get('/drlab-v1-e1-20261115-r1/_settings?flat_settings=true');assert.equal(settings[target.index].settings['index.blocks.write'],'true');
const files={};function add(p){files[path.relative(root,p).replaceAll('\\','/')]=sha(fs.readFileSync(p));}
function walk(dir,filter=()=>true){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('FREEZE_SYMLINK');if(e.isDirectory())walk(p,filter);else if(filter(p))add(p);}}
walk(here,p=>!p.includes(path.sep+'archive'+path.sep));
add(path.join(root,'docs/DR_E1_CARD_20261115.md'));add(path.join(out,'browser-preflight.json'));
walk(path.join(root,'.lab/v1-e1-20261115/prepared/snapshot'));add(path.join(root,'.lab/v1-e1-20261115/prepared/es.json'));
const build=path.join(root,'.lab/v1-e1-20261115/next-build');add(path.join(build,'BUILD_ID'));
const receiptPath=path.join(root,'.lab/v1-e1-20261115/build-receipt.json');
const receipt=JSON.parse(fs.readFileSync(receiptPath));
for(const [rel,hash] of Object.entries({...receipt.inputs,...receipt.outputs}))assert.equal(sha(fs.readFileSync(path.resolve(here,rel))),hash,'BUILD_RECEIPT_MISMATCH '+rel);
add(receiptPath);
walk(path.join(build,'server'),p=>/\.(?:js|json|html|rsc|meta)$/.test(p));walk(path.join(build,'static'));
const document={version:'E1-'+round,frozenAt:new Date().toISOString(),buildReceiptSha256:sha(fs.readFileSync(receiptPath)),esPid:node[0].process.id,esVersion:info.version.number,node:process.version,oracle:oracle.scope,files,oldIndices:prior,newIndex:target,resourceGuard:'sampled, no hard CPU or memory quotas',review:'See docs/DR_E1_PREFLIGHT_REVIEW_20261115.md'};
fs.writeFileSync(freezeFile,JSON.stringify(document,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({frozen:true,fileCount:Object.keys(files).length,esPid:document.esPid,oracle:oracle.scope}));
