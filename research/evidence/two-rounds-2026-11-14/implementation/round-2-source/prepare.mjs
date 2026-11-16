import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeQuery } from './text.mjs';
import * as pagefind from '../pagefind/node_modules/pagefind/lib/index.js';
const target=path.resolve(process.argv[2]);
await mkdir(target,{recursive:false});
const fixtureBytes=await readFile(new URL('../product-review/fixture.json',import.meta.url));
const fixture=JSON.parse(fixtureBytes);
await writeFile(path.join(target,'fixture.json'),fixtureBytes);
const build={schemaVersion:fixture.schemaVersion,release:fixture.release,synthetic:true,node:process.version,icu:process.versions.icu,pagefind:'1.6.0',fixtureSha256:createHash('sha256').update(fixtureBytes).digest('hex'),normalization:'Intl.Segmenter zh-Hant Han runs; SQLite index+query, Pagefind query',engines:{}};
let start=performance.now();
const db=new DatabaseSync(path.join(target,'search.sqlite'));
db.exec("CREATE VIRTUAL TABLE search_index USING fts5(id UNINDEXED, scope UNINDEXED, title, content, tokenize='unicode61'); BEGIN");
const add=db.prepare('INSERT INTO search_index VALUES(?,?,?,?)');
for(const p of fixture.pages)add.run(p.id,p.scope,normalizeQuery(p.title),normalizeQuery(p.content));
db.exec('COMMIT');build.sqlite=db.prepare('select sqlite_version() v').get().v;db.close();
build.engines.sqlite={buildMs:performance.now()-start};
start=performance.now();
try{
 const {index,errors}=await pagefind.createIndex({forceLanguage:'zh'});if(!index||errors?.length)throw Error(JSON.stringify(errors));
 for(const p of fixture.pages){const r=await index.addCustomRecord({url:`/api/research/pages/${p.id}?release=${fixture.release}`,language:'zh',content:p.title+'\n'+p.content,meta:{id:p.id,title:p.title},filters:{scope:[p.scope]}});if(r.errors?.length)throw Error(JSON.stringify(r.errors));}
 const r=await index.writeFiles({outputPath:path.join(target,'pagefind')});if(r.errors?.length)throw Error(JSON.stringify(r.errors));
}finally{await pagefind.close();}
build.engines.pagefind={buildMs:performance.now()-start};
// Build-time companion mapping replaces query-time fragment hydration. This is an
// added immutable artifact, verified against the same release/fixture at runtime.
start=performance.now();const assetReads=[];
const assets=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(target,'.'+pathname);
 if(!file.startsWith(path.join(target,'pagefind')+path.sep))throw Error('bad path');
 const bytes=await readFile(file);assetReads.push({path:pathname,status:200,bytes:bytes.length});
 res.writeHead(200,{'content-type':'application/octet-stream'}).end(bytes);
}catch{assetReads.push({path:req.url,status:404,bytes:0});res.writeHead(404).end();}});
await new Promise(r=>assets.listen(0,'127.0.0.1',r));
const mapping={schemaVersion:'pagefind-map-v1',release:fixture.release,fixtureSha256:build.fixtureSha256,entries:{}};
let queryModule;
try{
 queryModule=await import(pathToFileURL(path.join(target,'pagefind/pagefind.js')));
 await queryModule.options({basePath:`http://127.0.0.1:${assets.address().port}/pagefind/`,baseUrl:'/'});
 const byId=new Map(fixture.pages.map(p=>[p.id,p]));
 for(const scope of [...new Set(fixture.pages.map(p=>p.scope))]){
  const result=await queryModule.search(null,{filters:{scope}});
  for(const hit of result.results){const data=await hit.data();const original=byId.get(data.meta.id);
   if(!original||original.scope!==scope||mapping.entries[hit.id])throw Error('Invalid or duplicate Pagefind mapping');
   mapping.entries[hit.id]={pageId:original.id,scope:original.scope};
  }
 }
 if(Object.keys(mapping.entries).length!==fixture.pages.length||new Set(Object.values(mapping.entries).map(e=>e.pageId)).size!==fixture.pages.length)throw Error('Incomplete mapping');
}finally{await queryModule?.destroy();assets.closeAllConnections();await new Promise(r=>assets.close(r));}
const mapBytes=Buffer.from(JSON.stringify(mapping,null,2)+'\n');await writeFile(path.join(target,'pagefind-map.json'),mapBytes);
build.engines.pagefind.mappingBuildMs=performance.now()-start;
build.engines.pagefind.mappingEntries=Object.keys(mapping.entries).length;
build.engines.pagefind.mappingBytes=mapBytes.length;
build.engines.pagefind.mappingAssetReads=assetReads;

async function inventory(dir){let entries=[];for(const f of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())entries.push(...await inventory(p));else{const b=await readFile(p);entries.push({path:path.relative(target,p),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}}return entries;}
build.files=await inventory(target);await writeFile(path.join(target,'manifest.json'),JSON.stringify(build,null,2)+'\n');console.log(JSON.stringify(build,null,2));
