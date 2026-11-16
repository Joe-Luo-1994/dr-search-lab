import {trace} from './trace.mjs';
let assetTraceId=0,nextTraceId=0;
import http from 'node:http';
import next from 'next';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const [appDir,root,coreURL]=process.argv.slice(2);
process.env.LAB_RESEARCH_DIR=root;process.env.PF_G2_CORE_URL=coreURL;
const assets=http.createServer(async(req,res)=>{const id=++assetTraceId,started=performance.now();let responseBytes=0;trace('asset.request',{id,path:req.url});res.once('finish',()=>trace('asset.finish',{id,path:req.url,status:res.statusCode,bytes:responseBytes,elapsedMs:performance.now()-started}));res.once('close',()=>{if(!res.writableFinished)trace('asset.closed-before-finish',{id,path:req.url,elapsedMs:performance.now()-started});});try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+pathname);if(!pathname.startsWith('/pagefind/')||!file.startsWith(path.join(root,'pagefind')+path.sep)){res.writeHead(404).end();return;}trace('asset.read.start',{id,path:pathname});const readStarted=performance.now();const b=await readFile(file);responseBytes=b.length;trace('asset.read.end',{id,path:pathname,bytes:b.length,elapsedMs:performance.now()-readStarted});res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'application/octet-stream'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>assets.listen(0,'127.0.0.1',r));process.env.LAB_INDEX_ORIGIN=`http://127.0.0.1:${assets.address().port}`;
const app=next({dev:false,dir:appDir,hostname:'127.0.0.1'});trace('next.prepare.start');await app.prepare();trace('next.prepare.end');
const nextHandler=app.getRequestHandler();const server=http.createServer((req,res)=>{const id=++nextTraceId,started=performance.now();trace('next.request',{id,method:req.method,path:req.url});res.once('finish',()=>trace('next.response.finish',{id,status:res.statusCode,elapsedMs:performance.now()-started}));res.once('close',()=>{if(!res.writableFinished)trace('next.response.closed-before-finish',{id,elapsedMs:performance.now()-started});});return nextHandler(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
trace('server.ready');console.log(JSON.stringify({ready:true,pid:process.pid,url:`http://127.0.0.1:${server.address().port}`,assetOrigin:process.env.LAB_INDEX_ORIGIN}));
let ending=false;async function close(){if(ending)return;ending=true;trace('server.close.start');server.closeAllConnections();assets.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>assets.close(r))]);await app.close();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
