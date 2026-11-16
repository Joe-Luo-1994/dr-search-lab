// One observation on the retained historical bundle. No browser-parity claim.
import http from 'node:http';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [root,out,watch]=process.argv.slice(2);
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=path.resolve(root,'.'+pathname);if(!pathname.startsWith('/pagefind/')||!p.startsWith(path.join(root,'pagefind')+path.sep)){res.writeHead(404).end();return;}res.writeHead(200).end(await readFile(p));}catch{res.writeHead(404).end();}});
const result={synthetic:true,searchRequests:0,scope:'retained historical bundle; native Node only',term:'資料庫備份',browser:'not run: no existing browser runtime found in inspected locations',historicalHashContinuity:'unknown; current retained bytes frozen, no historical full inventory matched',completed:false};
let operationStarted;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 operationStarted=Date.now();await writeFile(watch+'.tmp',JSON.stringify({id:'legacy-node',kind:'query',startedAtMs:operationStarted}));await rename(watch+'.tmp',watch);
 const pf=await import(pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);
 await pf.options({basePath:`http://127.0.0.1:${server.address().port}/pagefind/`,baseUrl:'https://synthetic.invalid/',language:'zh'});
 result.searchRequests=1;const start=performance.now(),r=await pf.search(result.term,{filters:{space:'ops'}});const hits=await Promise.all(r.results.slice(0,5).map(h=>h.data()));
 if(Date.now()-operationStarted>5000)throw Error('LEGACY_QUERY_TIMEOUT');
 Object.assign(result,{completed:true,total:r.results.length,elapsedMs:performance.now()-start,hits:hits.map(h=>({id:h.meta.id,excerpt:h.excerpt,url:h.url}))});
}catch(e){result.error=e.stack;process.exitCode=1;}
finally{if(!operationStarted||Date.now()-operationStarted<5000)await unlink(watch).catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));await writeFile(out,JSON.stringify(result,null,2)+'\n');}
