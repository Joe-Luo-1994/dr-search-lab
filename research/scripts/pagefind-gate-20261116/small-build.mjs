import {mkdir,readFile,writeFile,opendir} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import * as pf from '../pagefind/node_modules/pagefind/lib/index.js';
import {SMALL_FIXTURE,SMALL_RELEASE,smallIndexText} from './oracle.mjs';
const root=path.resolve(process.argv[2]);await mkdir(root,{recursive:false});
try{
 const {index,errors}=await pf.createIndex({forceLanguage:'zh'});assert(index);assert(!errors?.length);
 for(const p of SMALL_FIXTURE){const r=await index.addCustomRecord({url:`/api/research/pages/${p.id}?release=${SMALL_RELEASE}`,language:'zh',content:p.title+'\n'+smallIndexText(p),meta:{id:p.id,title:p.title},filters:{space:[p.spaceId],tags:p.tags}});assert(!r.errors?.length);}
 const written=await index.writeFiles({outputPath:path.join(root,'pagefind')});assert(!written.errors?.length);await pf.close();
 const map={};
 for await(const e of await opendir(path.join(root,'pagefind/fragment'))){if(!e.name.endsWith('.pf_fragment'))continue;const raw=gunzipSync(await readFile(path.join(root,'pagefind/fragment',e.name))).toString('utf8');assert(raw.startsWith('pagefind_dcd'));const f=JSON.parse(raw.slice(12));const p=SMALL_FIXTURE.find(x=>x.id===f.meta.id);assert(p);assert.equal(f.meta.title,p.title);assert.deepEqual(f.filters.space,[p.spaceId]);assert.deepEqual([...(f.filters.tags??[])].sort(),[...p.tags].sort());map[e.name.slice(0,-12)]=p;}
 assert.equal(Object.keys(map).length,SMALL_FIXTURE.length);assert.equal(new Set(Object.values(map).map(p=>p.id)).size,SMALL_FIXTURE.length);
 await writeFile(path.join(root,'map.json'),JSON.stringify(map));
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({release:SMALL_RELEASE,N:SMALL_FIXTURE.length,synthetic:true,mappingFormat:'Pagefind1.6.0 private gzip fragment; small in-memory metadata mapping'}));
}finally{await pf.close();}
