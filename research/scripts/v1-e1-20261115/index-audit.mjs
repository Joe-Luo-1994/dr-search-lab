import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'evidence/v1-e1-20261115');
const phase=process.argv[2];assert(['before','after'].includes(phase));
const base='http://127.0.0.1:19300',index='drlab-v1-e1-20261115-r1';
async function get(url){const r=await fetch(base+url,{signal:AbortSignal.timeout(5000)});assert(r.ok);return r.json();}
const indices=await get('/_cat/indices?format=json&h=index,uuid,docs.count');
const settings=await get('/_all/_settings?flat_settings=true&filter_path=*.settings.index.blocks.write');
fs.mkdirSync(out,{recursive:true});
if(phase==='before'){
 assert(!indices.some(x=>x.index===index),'INDEX_EXISTS');
 fs.writeFileSync(path.join(out,'es-before.json'),JSON.stringify(indices,null,2),{flag:'wx'});
 fs.writeFileSync(path.join(out,'es-settings-before.json'),JSON.stringify(settings,null,2),{flag:'wx'});
}else{
 const old=JSON.parse(fs.readFileSync(path.join(out,'es-before.json'))),oldSettings=JSON.parse(fs.readFileSync(path.join(out,'es-settings-before.json')));
 const comparisons=old.map(x=>({index:x.index,unchanged:JSON.stringify(indices.find(y=>y.index===x.index))===JSON.stringify(x)&&JSON.stringify(settings[x.index])===JSON.stringify(oldSettings[x.index])}));
 const result={at:new Date().toISOString(),comparisons,passed:comparisons.every(x=>x.unchanged),newIndex:indices.find(x=>x.index===index)};
 fs.writeFileSync(path.join(out,'es-after.json'),JSON.stringify(result,null,2),{flag:'wx'});assert(result.passed,'OLD_INDEX_CHANGED');
}
console.log(JSON.stringify({phase,observedIndexCount:indices.length,passed:true}));
