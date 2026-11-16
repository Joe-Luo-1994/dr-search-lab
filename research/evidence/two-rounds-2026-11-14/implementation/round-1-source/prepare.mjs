import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
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
async function inventory(dir){let entries=[];for(const f of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())entries.push(...await inventory(p));else{const b=await readFile(p);entries.push({path:path.relative(target,p),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}}return entries;}
build.files=await inventory(target);await writeFile(path.join(target,'manifest.json'),JSON.stringify(build,null,2)+'\n');console.log(JSON.stringify(build,null,2));
