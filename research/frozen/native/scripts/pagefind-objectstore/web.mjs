// Minimal test web process: serves HTML and optionally streams a fixed MinIO prefix.
// No index filesystem reads/writes, disk cache, real identity, or production authorization.
import http from 'node:http';
import { Client } from 'minio';
import { pipeline } from 'node:stream/promises';
const endpoint = new URL(process.env.PROBE_MINIO_URL);
const bucket = process.env.PROBE_BUCKET;
const prefix = 'releases/r1/pagefind/';
const client = new Client({endPoint:endpoint.hostname,port:Number(endpoint.port),useSSL:false,accessKey:process.env.MINIO_ROOT_USER,secretKey:process.env.MINIO_ROOT_PASSWORD});
const mode=process.env.PROBE_MODE;
const metrics={assetRequests:0,objectsRead:0};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/metrics'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(metrics));return;}
 if(url.pathname.startsWith('/assets/')&&mode==='proxy'){
  const file=url.pathname.slice('/assets/'.length);
  if(!/^[a-zA-Z0-9_./-]+$/.test(file)||file.split('/').includes('..')){res.writeHead(400).end();return;}
  metrics.assetRequests++;
  try{
   const stream=await client.getObject(bucket,prefix+file);metrics.objectsRead++;
   const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream';
   res.writeHead(200,{'content-type':type,'cache-control':'no-store'});await pipeline(stream,res);
  }catch(e){if(!res.headersSent)res.writeHead(e.code==='NoSuchKey'?404:502).end('Object unavailable');else res.destroy();}
  return;
 }
 if(url.pathname!=='/'){res.writeHead(404).end();return;}
 const bundle=mode==='proxy'?'/assets/':`${endpoint.origin}/${bucket}/${prefix}`;
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Remote Pagefind storage probe</title><h1>Synthetic remote index probe</h1><p>No index files in the web process working directory.</p><script type="module">
 const bundle=${JSON.stringify(bundle)};
 const ready=(async()=>{const pf=await import(bundle+'pagefind.js');await pf.options({basePath:bundle,baseUrl:location.origin+'/'});return pf;})();
 window.searchBundle=async(term,filters={space:'ops'})=>{try{const pf=await ready;const r=await pf.search(term,{filters});const docs=await Promise.all(r.results.map(h=>h.data()));return {ok:true,total:r.results.length,ids:docs.map(d=>d.meta.id),urls:docs.map(d=>d.url)};}catch(e){return {ok:false,error:String(e)}}};
 ready.catch(e=>{window.bootstrapError=String(e)});
 </script></html>`);
});
server.listen(Number(process.env.PROBE_WEB_PORT||0),'127.0.0.1',()=>process.send?.({port:server.address().port,pid:process.pid,mode}));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
