// E2 local traffic fixture. It models a manual routing step, not company DNS/HA.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.join(root,'.lab/v1-e2-20261115');
const routePath=path.join(directory,'traffic.json');
const ports=[3158,3159,3161];
const [command,value,...extra]=process.argv.slice(2);
if(extra.length)throw Error('E2_TRAFFIC_ARGUMENTS');
if(command==='set'){
 const port=Number(value);if(!ports.includes(port))throw Error('E2_TRAFFIC_PORT');
 const record={port,at:new Date().toISOString(),policy:'local-test-single-writer'};
 const temp=path.join(directory,`traffic-${process.pid}.tmp`);
 await fs.writeFile(temp,JSON.stringify(record),{flag:'wx'});await fs.rename(temp,routePath);
 console.log(JSON.stringify({event:'traffic-set',...record}));
}else if(command==='serve'&&!value){
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'cache-control':'no-store'}).end();return;}
   const route=JSON.parse(await fs.readFile(routePath,'utf8'));
   if(!ports.includes(route.port))throw Error('INVALID_ROUTE');
   // req.url is retained only as path/query; origin is fixed to this test's ports.
   if(!req.url.startsWith('/')||req.url.startsWith('//'))throw Error('INVALID_PATH');
   const abort=new AbortController();req.once('aborted',()=>abort.abort());
   const headers={};for(const [k,v] of Object.entries(req.headers))if(v&& !['host','connection','accept-encoding'].includes(k))headers[k]=v;
   const response=await fetch(`http://127.0.0.1:${route.port}${req.url}`,{method:req.method,headers,redirect:'manual',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});
   const bytes=Buffer.from(await response.arrayBuffer());
   res.statusCode=response.status;
   for(const [k,v] of response.headers)if(!['content-length','transfer-encoding','content-encoding','connection','keep-alive'].includes(k))res.setHeader(k,v);
   res.setHeader('x-e2-test-reader-port',String(route.port));res.end(bytes);
  }catch(error){if(!res.headersSent)res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:{code:'TRAFFIC_UNAVAILABLE'}}));console.error(JSON.stringify({event:'traffic-error',detail:error.message}));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3160,'127.0.0.1',resolve);});
 console.log(JSON.stringify({event:'e2-traffic-ready',pid:process.pid,port:3160}));
 const stop=()=>{server.closeAllConnections();server.close();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}else throw Error('Usage: traffic.mjs serve | set 3158|3159|3161');
