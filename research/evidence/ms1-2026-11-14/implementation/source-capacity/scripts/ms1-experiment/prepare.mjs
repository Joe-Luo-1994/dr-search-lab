import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,readFile,readdir,stat,opendir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {doc,RELEASE} from '../ms1-review/corpus.mjs';
import {normalizeQuery} from '../ms1-api-lab/text.mjs';
const [rootArg,engine,countArg]=process.argv.slice(2);const root=path.resolve(rootArg),N=Number(countArg);
if(!['sqlite','pagefind'].includes(engine)||!Number.isInteger(N)||N<1)throw Error('Invalid build parameters');
await mkdir(root,{recursive:false});
const result={release:RELEASE,engine,N,synthetic:true,node:process.version,icu:process.versions.icu,startedAt:new Date().toISOString(),sourceJsonlBytes:0,contentBytes:0,spaceCounts:{},costs:{},mappingFormat:'Pagefind1.6.0 gzip pagefind_dcd pf_fragment opaque filename; version-bound owned parser'};
const began=performance.now(),hash=createHash('sha256');let pf,index;
const db=new DatabaseSync(path.join(root,'data.sqlite'));
db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-32768; PRAGMA temp_store=FILE; CREATE TABLE pages(id TEXT PRIMARY KEY,spaceId TEXT,title TEXT,content TEXT,attachments TEXT); CREATE INDEX pages_space ON pages(spaceId); CREATE TABLE attachments(id TEXT PRIMARY KEY,spaceId TEXT,contentType TEXT,text TEXT); CREATE TABLE pf_map(resultId TEXT PRIMARY KEY,pageId TEXT UNIQUE);');
if(engine==='sqlite')db.exec("CREATE VIRTUAL TABLE search_index USING fts5(space,title,content,content='');");
try{
 if(engine==='pagefind'){pf=await import('../pagefind/node_modules/pagefind/lib/index.js');const r=await pf.createIndex({forceLanguage:'zh'});if(!r.index||r.errors?.length)throw Error(JSON.stringify(r));index=r.index;}
 db.exec('BEGIN');const add=db.prepare('INSERT INTO pages VALUES(?,?,?,?,?)');const attachment=db.prepare('INSERT INTO attachments VALUES(?,?,?,?)');const fts=engine==='sqlite'?db.prepare('INSERT INTO search_index(rowid,space,title,content) VALUES(?,?,?,?)'):null;
 for(let i=0;i<N;i++){
  const p=doc(i,N);const line=JSON.stringify(p)+'\n';hash.update(line);result.sourceJsonlBytes+=Buffer.byteLength(line);result.contentBytes+=Buffer.byteLength(p.content);result.spaceCounts[p.spaceId]=(result.spaceCounts[p.spaceId]||0)+1;
  const added=add.run(p.id,p.spaceId,p.title,p.content,JSON.stringify(p.attachments));for(const a of p.attachments)attachment.run(a.id,p.spaceId,a.contentType,a.text);
  if(fts)fts.run(added.lastInsertRowid,p.spaceId,normalizeQuery(p.title),normalizeQuery(p.content));
  else{const r=await index.addCustomRecord({url:`/api/research/pages/${p.id}?release=${RELEASE}`,language:'zh',content:p.title+'\n'+p.content,meta:{id:p.id,title:p.title},filters:{space:[p.spaceId]}});if(r.errors?.length)throw Error(JSON.stringify(r.errors));}
  if(i%1000===999){db.exec('COMMIT;BEGIN');}
  if(i%10000===9999)console.error(JSON.stringify({event:'progress',engine,documents:i+1,elapsedMs:performance.now()-began}));
 }
 db.exec('COMMIT');result.costs.ingestMs=performance.now()-began;result.sourceSha256=hash.digest('hex');
 if(index){let t=performance.now();const r=await index.writeFiles({outputPath:path.join(root,'pagefind')});if(r.errors?.length)throw Error(JSON.stringify(r.errors));result.costs.pagefindWriteMs=performance.now()-t;await pf.close();pf=null;
  t=performance.now();db.exec('BEGIN');const insert=db.prepare('INSERT INTO pf_map VALUES(?,?)');let mapped=0,fragmentBytes=0;
  const directory=await opendir(path.join(root,'pagefind/fragment'));
  for await(const entry of directory){if(!entry.isFile()||!entry.name.endsWith('.pf_fragment'))continue;const bytes=await readFile(path.join(root,'pagefind/fragment',entry.name));fragmentBytes+=bytes.length;const raw=gunzipSync(bytes).toString('utf8');if(!raw.startsWith('pagefind_dcd'))throw Error('Unknown fragment format');const data=JSON.parse(raw.slice(12));const p=db.prepare('SELECT spaceId FROM pages WHERE id=?').get(data.meta.id);if(!p||data.filters.space.length!==1||data.filters.space[0]!==p.spaceId)throw Error('Invalid fragment mapping');insert.run(entry.name.slice(0,-12),data.meta.id);mapped++;if(mapped%1000===0)db.exec('COMMIT;BEGIN');}
  db.exec('COMMIT');if(mapped!==N)throw Error('Mapping count mismatch');result.costs.mappingMs=performance.now()-t;result.costs.mappingEntries=mapped;result.costs.mappingCompressedBytesRead=fragmentBytes;
 }
 result.sqlite=db.prepare('SELECT sqlite_version() v').get().v;db.close();result.costs.buildBeforeManifestMs=performance.now()-began;
 // Stream hash artifact files; no complete artifact held in JS memory.
 let artifactBytes=0,fileCount=0;const inventoryHash=createHash('sha256');
 async function walk(dir){const dh=await opendir(dir);for await(const e of dh){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile()){const s=await stat(p);artifactBytes+=s.size;fileCount++;inventoryHash.update(path.relative(root,p)+' '+s.size+'\n');}}}
 await walk(root);result.artifactBytes=artifactBytes;result.fileCount=fileCount;result.inventoryPathSizeSha256=inventoryHash.digest('hex');result.inventoryWarning='Path+size inventory, not full byte integrity proof; immutable local synthetic experiment only';result.finishedAt=new Date().toISOString();result.costs.totalMs=performance.now()-began;
 await writeFile(path.join(root,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(e){try{db.close();}catch{}await pf?.close();result.error=e.stack;result.finishedAt=new Date().toISOString();await writeFile(path.join(root,'failed-build.json'),JSON.stringify(result,null,2)+'\n');throw e;}
