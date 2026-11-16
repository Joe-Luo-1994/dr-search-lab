"""Prepare new PF D1 trace copies, never run an adapter or modify G1/G2.

python3 prepare-instrumentation.py FROZEN_G1_RUN NEW_D1
Main creates NEW_D1 and D1_TRACE_DIR; every output file is exclusive-create.
"""
from pathlib import Path
import difflib
import hashlib
import json
import sys
import time


TRACE = r'''// D1 observation only. One shared ESM helper / FD per process.
import {openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
const directory=process.env.D1_TRACE_DIR;
if(!directory||!path.isAbsolute(directory))throw Error('D1_TRACE_DIR_REQUIRED');
const MAX_EVENTS=1000,MAX_BYTES=1024*1024;
const fd=openSync(path.join(directory,`trace-${process.pid}.ndjson`),'wx',0o600);
let events=0,bytes=0,syncIoMs=0,totalTraceMs=0,lastSyncIoMs=0,failed=false;
function failStop(code){
  failed=true;
  try{writeSync(2,JSON.stringify({event:'trace.fail-stop',pid:process.pid,code,events,bytes,syncIoMs,totalTraceMs})+'\n');}catch{}
  process.exit(70);
}
export function trace(event,details={}){
  if(failed)process.exit(70);
  const began=performance.now();
  let row;
  try{row=Buffer.from(JSON.stringify({seq:events+1,pid:process.pid,wallMs:Date.now(),monoMs:began,event,details,
    observer:{completedEvents:events,cumulativeSyncIoMs:syncIoMs,lastSyncIoMs,cumulativeTraceMs:totalTraceMs,
      accounting:'completed previous events; current/final event cost appears only in a later row'}})+'\n');}
  catch{failStop('TRACE_SERIALIZE');}
  if(events+1>MAX_EVENTS||bytes+row.length>MAX_BYTES)failStop('TRACE_BUDGET');
  const ioStart=performance.now();
  try{let offset=0;while(offset<row.length){const n=writeSync(fd,row,offset,row.length-offset);if(n<=0)failStop('TRACE_SHORT_WRITE');offset+=n;}fsyncSync(fd);}
  catch{failStop('TRACE_IO');}
  lastSyncIoMs=performance.now()-ioStart;syncIoMs+=lastSyncIoMs;events++;bytes+=row.length;totalTraceMs+=performance.now()-began;
}
trace('trace.open',{maxEvents:MAX_EVENTS,maxBytes:MAX_BYTES,scope:'D1 phase boundaries only; no payload contents'});
process.once('exit',code=>{if(!failed){trace('process.exit',{code});try{closeSync(fd);}catch{}}});
'''


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def write_new(filename, raw):
    filename.parent.mkdir(parents=True, exist_ok=True)
    with filename.open('xb') as f:
        f.write(raw)


def main():
    if len(sys.argv) != 3:
        raise SystemExit('usage: prepare-instrumentation.py FROZEN_G1_RUN NEW_D1')
    run, d1 = [Path(p).resolve() for p in sys.argv[1:]]
    assert run != d1 and d1.parent == run, 'D1 must be a new child directory of RUN'
    g1freeze = json.loads((run/'freeze.json').read_text())['files']
    g2freeze = json.loads((run/'g2/freeze.json').read_text())['files']
    g2pins = {f['absolutePath']: f['sha256'] for f in g2freeze}
    source_paths = {
        'core': run/'src/ms1-api-lab/core.mjs',
        'text': run/'src/ms1-api-lab/text.mjs',
        'corpus': run/'src/ms1-review/corpus.mjs',
        'serve': run/'g2/src/serve.mjs',
    }
    inputs = {}
    originals = {}
    for name, filename in source_paths.items():
        raw = filename.read_bytes()
        pin = g2pins[str(filename)] if name == 'serve' else g1freeze[str(filename.relative_to(run))]['sha256']
        assert sha(raw) == pin, 'FROZEN_INPUT_CHANGED:'+name
        inputs[name] = {'absolutePath': str(filename), 'bytes': len(raw), 'sha256': pin}
        originals[name] = raw.decode('utf-8')
    replacements = []

    def replace(text, old, new, name):
        assert text.count(old) == 1, 'EXACT_REPLACEMENT_COUNT:'+name
        replacements.append(name)
        return text.replace(old, new, 1)

    core = "import {trace} from '../gate/trace.mjs';\n" + originals['core']
    core = replace(core, "const root=process.env.LAB_RESEARCH_DIR;if(!root)throw Error('No isolated root');",
        "trace('state.start');const root=process.env.LAB_RESEARCH_DIR;if(!root)throw Error('No isolated root');trace('state.manifest.start');", 'state-start')
    core = replace(core, "const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));",
        "const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));trace('state.manifest.end');trace('db.open.start');", 'manifest-read')
    core = replace(core, "const db=new DatabaseSync(path.join(root,'data.sqlite'),{readOnly:true});db.exec('PRAGMA cache_size=-16384; PRAGMA temp_store=FILE');",
        "const db=new DatabaseSync(path.join(root,'data.sqlite'),{readOnly:true});trace('db.open.end');trace('db.configure.start');db.exec('PRAGMA cache_size=-16384; PRAGMA temp_store=FILE');trace('db.configure.end');trace('state.ready');", 'db-boundaries')
    core = replace(core, "const {root}=await state();const pf=await import(",
        "const {root}=await state();trace('pf.import.start');const pf=await import(", 'pf-import-start')
    core = replace(core, "pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);await pf.options({basePath:process.env.LAB_INDEX_ORIGIN+'/pagefind/',baseUrl:'/'});return pf;",
        "pathToFileURL(path.join(root,'pagefind/pagefind.js')).href);trace('pf.import.end');trace('pf.options.start');await pf.options({basePath:process.env.LAB_INDEX_ORIGIN+'/pagefind/',baseUrl:'/'});trace('pf.options.end');return pf;", 'pf-options')
    core = replace(core, "export async function searchResponse(request){const allAllowed=auth(request);",
        "export async function searchResponse(request){trace('search.arrive');const allAllowed=auth(request);", 'search-arrive')
    core = replace(core, "const {manifest,db}=await state();let total=0,hits=[];const timing={};",
        "trace('search.scope',{allowedSpaceCount:allowed.size,page,pageSize});const {manifest,db}=await state();let total=0,hits=[];const timing={};", 'scope')
    core = replace(core, "const pf=await pagefind();let t=performance.now();const result=await pf.search(term,{filters:{space:{any:[...allowed]}}});timing.engineMs=performance.now()-t;",
        "const pf=await pagefind();trace('pf.search.start');let t=performance.now();const result=await pf.search(term,{filters:{space:{any:[...allowed]}}});timing.engineMs=performance.now()-t;trace('pf.search.end',{resultCount:result.results.length,engineMs:timing.engineMs});", 'pf-search')
    core = replace(core, "t=performance.now();const lookup=db.prepare('SELECT p.id,p.spaceId FROM pf_map m JOIN pages p ON p.id=m.pageId WHERE m.resultId=?');",
        "trace('mapping.start',{resultCount:result.results.length});t=performance.now();const lookup=db.prepare('SELECT p.id,p.spaceId FROM pf_map m JOIN pages p ON p.id=m.pageId WHERE m.resultId=?');", 'mapping-start')
    core = replace(core, "seen.add(p.id);if(i>=offset&&i<offset+pageSize)chosen.push(p.id);}",
        "seen.add(p.id);if(i>=offset&&i<offset+pageSize)chosen.push(p.id);if((i+1)%10000===0)trace('mapping.progress',{processed:i+1,resultCount:result.results.length});}", 'mapping-coarse-progress')
    core = replace(core, "total=result.results.length;timing.mappingMs=performance.now()-t;",
        "total=result.results.length;timing.mappingMs=performance.now()-t;trace('mapping.end',{processed:result.results.length,chosenCount:chosen.length,mappingMs:timing.mappingMs});", 'mapping-end')
    core = replace(core, "const get=db.prepare('SELECT * FROM pages WHERE id=?');hits=chosen.map(id=>pageJson(get.get(id),manifest.release));",
        "trace('hydration.start',{chosenCount:chosen.length});const get=db.prepare('SELECT * FROM pages WHERE id=?');hits=chosen.map(id=>pageJson(get.get(id),manifest.release));trace('hydration.end',{hitCount:hits.length});", 'hydration')
    response = " return Response.json({schemaVersion:'ms1-v1',release:manifest.release,engine,page,pageSize,total,totalRelation:'exact',capabilities:{highlight:'none'},synthetic:true,hits,metrics:timing},{headers:{'cache-control':'no-store'}});"
    core = replace(core, response,
        " trace('response.start',{total,hitCount:hits.length});const response="+response.strip()[len('return '):]+"trace('response.ready',{status:response.status});return response;", 'response')
    core = replace(core, "export function failure(e){const expected=e instanceof RequestError;",
        "export function failure(e){trace('search.failure',{name:e?.name,code:e?.code});const expected=e instanceof RequestError;", 'failure')

    serve = "import {trace} from './trace.mjs';\nlet assetTraceId=0,nextTraceId=0;\n" + originals['serve']
    serve = replace(serve, "const assets=http.createServer(async(req,res)=>{try{",
        "const assets=http.createServer(async(req,res)=>{const id=++assetTraceId,started=performance.now();let responseBytes=0;trace('asset.request',{id,path:req.url});res.once('finish',()=>trace('asset.finish',{id,path:req.url,status:res.statusCode,bytes:responseBytes,elapsedMs:performance.now()-started}));res.once('close',()=>{if(!res.writableFinished)trace('asset.closed-before-finish',{id,path:req.url,elapsedMs:performance.now()-started});});try{", 'asset-request-finish')
    serve = replace(serve, "const b=await readFile(file);res.writeHead(200,",
        "trace('asset.read.start',{id,path:pathname});const readStarted=performance.now();const b=await readFile(file);responseBytes=b.length;trace('asset.read.end',{id,path:pathname,bytes:b.length,elapsedMs:performance.now()-readStarted});res.writeHead(200,", 'asset-read')
    serve = replace(serve, "await app.prepare();", "trace('next.prepare.start');await app.prepare();trace('next.prepare.end');", 'next-prepare')
    serve = replace(serve, "const server=http.createServer(app.getRequestHandler());",
        "const nextHandler=app.getRequestHandler();const server=http.createServer((req,res)=>{const id=++nextTraceId,started=performance.now();trace('next.request',{id,method:req.method,path:req.url});res.once('finish',()=>trace('next.response.finish',{id,status:res.statusCode,elapsedMs:performance.now()-started}));res.once('close',()=>{if(!res.writableFinished)trace('next.response.closed-before-finish',{id,elapsedMs:performance.now()-started});});return nextHandler(req,res);});", 'next-request-response')
    serve = replace(serve, "console.log(JSON.stringify({ready:true,", "trace('server.ready');console.log(JSON.stringify({ready:true,", 'server-ready')
    serve = replace(serve, "async function close(){if(ending)return;ending=true;",
        "async function close(){if(ending)return;ending=true;trace('server.close.start');", 'shutdown')

    outputs = {
        'src/ms1-api-lab/core.mjs': core.encode(),
        'src/ms1-api-lab/text.mjs': originals['text'].encode(),
        'src/ms1-review/corpus.mjs': originals['corpus'].encode(),
        'src/gate/serve.mjs': serve.encode(),
        'src/gate/trace.mjs': TRACE.encode(),
    }
    diff = ''.join(difflib.unified_diff(originals['core'].splitlines(True),core.splitlines(True),fromfile='frozen/core.mjs',tofile='diagnostic/core.mjs'))
    diff += ''.join(difflib.unified_diff(originals['serve'].splitlines(True),serve.splitlines(True),fromfile='frozen/serve.mjs',tofile='diagnostic/serve.mjs'))
    outputs['instrumentation.patch'] = diff.encode()
    for relative, raw in outputs.items():
        write_new(d1/relative, raw)
    receipt = {'at':time.time(), 'inputs':inputs, 'replacements':replacements,
        'outputs':{k:{'sha256':sha(v),'bytes':len(v)} for k,v in outputs.items()},
        'traceContract':{'environment':'D1_TRACE_DIR','filename':'trace-<pid>.ndjson','maxEventsPerProcess':1000,'maxBytesPerProcess':1048576,
            'failure':'exit 70 on trace budget or I/O failure; not a search semantic result',
            'observerCost':'each row contains completed previous trace costs; last own cost may be unobserved on hard kill'},
        'scope':'Source-only preparation; no service, Pagefind query, SQL, or build executed.'}
    write_new(d1/'instrumentation.json',(json.dumps(receipt,indent=2)+'\n').encode())
    print(json.dumps({'prepared':str(d1),'outputs':receipt['outputs'],'replacementCount':len(replacements)}))


if __name__ == '__main__':
    main()
