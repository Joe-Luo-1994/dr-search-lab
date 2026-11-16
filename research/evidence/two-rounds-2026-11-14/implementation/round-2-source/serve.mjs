import http from 'node:http';
import next from 'next';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]);process.env.LAB_RESEARCH_DIR=root;
const appDir=fileURLToPath(new URL('.',import.meta.url));
const assets=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+pathname);if(!pathname.startsWith('/pagefind/')||!file.startsWith(path.join(root,'pagefind')+path.sep)){res.writeHead(404).end();return;}const b=await readFile(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'application/octet-stream'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>assets.listen(0,'127.0.0.1',r));process.env.LAB_INDEX_ORIGIN=`http://127.0.0.1:${assets.address().port}`;
const app=next({dev:false,dir:appDir,hostname:'127.0.0.1'});await app.prepare();
const server=http.createServer(app.getRequestHandler());await new Promise(r=>server.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({ready:true,pid:process.pid,next:'16.4.5',node:process.version,mode:'production custom Next server',url:`http://127.0.0.1:${server.address().port}`,assetOrigin:process.env.LAB_INDEX_ORIGIN,dataRoot:root}));
let ending=false;async function close(){if(ending)return;ending=true;server.closeAllConnections();assets.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>assets.close(r))]);await app.close();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
