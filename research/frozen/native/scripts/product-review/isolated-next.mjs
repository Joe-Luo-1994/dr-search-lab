// Reviewer-controlled process/asset observer. Uses candidate's actual production Next build.
import next from 'next';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const root=path.resolve(process.argv[2]);
const requests=[];
const assets=http.createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/__review_stats'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({requests}));return;}
 const item={path:name};requests.push(item);
 try{const file=path.resolve(root,'.'+name);if(!name.startsWith('/pagefind/')||!file.startsWith(path.join(root,'pagefind')+path.sep)){item.status=404;res.writeHead(404).end();return;}const b=await readFile(file);item.status=200;item.bytes=b.length;res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'application/octet-stream'}).end(b);}
 catch{item.status=404;res.writeHead(404).end();}
});
await new Promise(r=>assets.listen(0,'127.0.0.1',r));
process.env.LAB_RESEARCH_DIR=root;process.env.LAB_INDEX_ORIGIN=`http://127.0.0.1:${assets.address().port}`;
const app=next({dev:false,dir:path.resolve('scripts/product-api-lab'),hostname:'127.0.0.1'});await app.prepare();
const server=http.createServer(app.getRequestHandler());await new Promise(r=>server.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({ready:true,mode:'reviewer-launched actual Next production app',pid:process.pid,url:`http://127.0.0.1:${server.address().port}`,metrics:process.env.LAB_INDEX_ORIGIN+'/__review_stats',root}));
let done=false;async function close(){if(done)return;done=true;server.closeAllConnections();assets.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>assets.close(r))]);await app.close();console.log(JSON.stringify({closed:true,requests}));process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
