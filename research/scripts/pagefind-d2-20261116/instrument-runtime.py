"""Instrument only a new copy of the frozen Pagefind 1.6.0 pagefind.js.

Usage: python3 instrument-runtime.py ORIGINAL_JS NEW_JS TRACE_HELPER_FILE_URL
NEW_JS may be absent or an independent, byte-identical copy of ORIGINAL_JS.
Writes NEW_JS (atomic replacement), NEW_JS.receipt.json and NEW_JS.patch.
Caller chooses a path OUTSIDE the artifact, freezes those records, then installs
only the diagnostic JS into its complete independent artifact copy.
No JavaScript, service, build, or query is executed.
"""
from pathlib import Path
import difflib
import hashlib
import json
import os
import sys
import uuid
from urllib.parse import urlsplit, unquote

SOURCE_SHA = '02746cc529f88f853275720dcb1c2b6a18b0c7a92b73fae82ca2738e64500bcd'
SOURCE_BYTES = 47228
T = '__pfD2Trace'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    if len(sys.argv) != 4:
        raise SystemExit('usage: instrument-runtime.py ORIGINAL_JS NEW_JS TRACE_HELPER_FILE_URL')
    source = Path(sys.argv[1]).resolve(strict=True)
    requested = Path(sys.argv[2])
    target = requested.resolve()
    helper_url = sys.argv[3]
    parsed = urlsplit(helper_url)
    assert parsed.scheme == 'file' and not parsed.netloc and not parsed.query and not parsed.fragment, 'LOCAL_HELPER_URL_REQUIRED'
    helper = Path(unquote(parsed.path)).resolve(strict=True)
    assert helper.is_file(), 'TRACE_HELPER_FILE_REQUIRED'
    assert source != target and source.suffix == target.suffix == '.js', 'ONLY_NEW_JS_COPY_ALLOWED'
    assert target.parent.is_dir() and not requested.is_symlink(), 'NEW_COPY_PARENT_REQUIRED'
    receipt_file = target.with_name(target.name+'.receipt.json')
    patch_file = target.with_name(target.name+'.patch')
    assert not receipt_file.exists() and not patch_file.exists(), 'USE_FRESH_RECEIPT_PATHS'
    raw = source.read_bytes()
    assert len(raw) == SOURCE_BYTES and sha(raw) == SOURCE_SHA, 'FROZEN_SOURCE_MISMATCH'
    if target.exists():
        a, b = source.stat(), target.lstat()
        assert target.is_file() and not target.is_symlink() and (a.st_dev, a.st_ino) != (b.st_dev, b.st_ino), 'TARGET_MUST_NOT_ALIAS_SOURCE'
        assert target.read_bytes() == raw, 'TARGET_NOT_FRESH_IDENTICAL_COPY'
    original = raw.decode('utf-8')
    assert all(binding not in original for binding in [T,'__pfD2Out','__pfD2Decoded']), 'TRACE_BINDING_COLLISION'
    changes = []
    text = original

    def replace(old, new, label):
        nonlocal text
        assert text.count(old) == 1, 'EXACT_REPLACE_COUNT:'+label
        text = text.replace(old, new, 1)
        changes.append({'label':label,'before':old,'after':new})

    # Actual fetch start -> response headers; body consumption remains separately
    # traced below. This preserves the queue, concurrency limit, and resolve order.
    replace('const response=await fetch(queued.input);if(!response.ok){',
        f'{T}("d2.fetch.start",{{url:String(queued.input)}});const response=await fetch(queued.input);{T}("d2.fetch.headers",{{url:String(queued.input),status:response.status}});if(!response.ok){{', 'fetch-headers')
    replace('queued.reject(error);', f'{T}("d2.fetch.error",{{url:String(queued.input),name:error?.name}});queued.reject(error);', 'fetch-error')
    replace('let entry_json=await entry_response.json();',
        f'{T}("d2.entry-json.start");let entry_json=await entry_response.json();{T}("d2.entry-json.end");', 'entry-json')
    replace('let compressed_meta=await compressed_resp.arrayBuffer();',
        f'{T}("d2.metadata-body.start");let compressed_meta=await compressed_resp.arrayBuffer();{T}("d2.metadata-body.end",{{bytes:compressed_meta.byteLength}});', 'metadata-body')
    replace('let compressed_wasm=await compressed_resp.arrayBuffer();',
        f'{T}("d2.wasm-body.start");let compressed_wasm=await compressed_resp.arrayBuffer();{T}("d2.wasm-body.end",{{bytes:compressed_wasm.byteLength}});', 'wasm-body')
    replace('let compressed_chunk=await compressed_resp.arrayBuffer();',
        f'{T}("d2.chunk-body.start",{{url,method}});let compressed_chunk=await compressed_resp.arrayBuffer();{T}("d2.chunk-body.end",{{url,method,bytes:compressed_chunk.byteLength}});', 'chunk-body')

    # All original branches, signature checks, calls, and returned bytes remain.
    old_decompress = 'decompress(data,file="unknown file"){if(this.decoder.decode(data.slice(0,12))==="pagefind_dcd"){return data.slice(12);}data=gz_default(data);if(this.decoder.decode(data.slice(0,12))!=="pagefind_dcd"){console.error(`Decompressing ${file} appears to have failed: Missing signature`);return data;}return data.slice(12);}'
    new_decompress = ('decompress(data,file="unknown file"){'+T+'("d2.decompress.start",{file,inputBytes:data.length});'
        'if(this.decoder.decode(data.slice(0,12))==="pagefind_dcd"){const __pfD2Out=data.slice(12);'+T+'("d2.decompress.end",{file,outputBytes:__pfD2Out.length,compressed:false});return __pfD2Out;}'
        'data=gz_default(data);if(this.decoder.decode(data.slice(0,12))!=="pagefind_dcd"){console.error(`Decompressing ${file} appears to have failed: Missing signature`);'
        +T+'("d2.decompress.end",{file,outputBytes:data.length,compressed:true,signature:false});return data;}'
        'const __pfD2Out=data.slice(12);'+T+'("d2.decompress.end",{file,outputBytes:__pfD2Out.length,compressed:true,signature:true});return __pfD2Out;}')
    replace(old_decompress, new_decompress, 'decompress-branches')
    replace('this.wasm=await this.backend({module_or_path:final_wasm});',
        f'{T}("d2.wasm-instantiate.start",{{bytes:final_wasm.length}});this.wasm=await this.backend({{module_or_path:final_wasm}});{T}("d2.wasm-instantiate.end");', 'wasm-instantiation')
    replace('await Promise.all(resources);this.raw_ptr=this.backend.init_pagefind(new Uint8Array(this.searchMeta));',
        f'await Promise.all(resources);{T}("d2.wasm-init.start",{{metadataBytes:this.searchMeta?.length??null}});this.raw_ptr=this.backend.init_pagefind(new Uint8Array(this.searchMeta));{T}("d2.wasm-init.end");', 'wasm-init')
    replace('this.raw_ptr=this.backend[method](ptr,chunk);',
        f'{T}("d2.wasm-load-chunk.start",{{url,method,bytes:chunk.length}});this.raw_ptr=this.backend[method](ptr,chunk);{T}("d2.wasm-load-chunk.end",{{url,method}});', 'wasm-load-chunk')

    replace('let index_resp=this.backend.request_indexes(ptr,term);',
        f'{T}("d2.chunk-plan.start");let index_resp=this.backend.request_indexes(ptr,term);', 'chunk-plan-start')
    replace('let filter_array=JSON.parse(filter_resp);let chunks=',
        f'let filter_array=JSON.parse(filter_resp);{T}("d2.chunk-plan.end",{{indexEntries:index_array.length,filterEntries:filter_array.length}});{T}("d2.chunks.start");let chunks=', 'chunk-plan-end')
    replace('await Promise.all([...chunks,...filter_chunks]);',
        f'await Promise.all([...chunks,...filter_chunks]);{T}("d2.chunks.end");', 'chunk-wait-end')

    # Outer bridge includes input-string copying. Inner boundary distinguishes
    # wasm.search itself from conversion of its returned UTF-8 JSON string.
    outer = 'let result=this.backend.search(ptr,term,originalTerm,filter_list,sort_list,exact_search,this.exactDiacritics);'
    replace(outer, T+'("d2.backend-search.start");'+outer+T+'("d2.backend-search.end",{resultChars:result.length});', 'backend-search')
    bridge = 'const ret=wasm.search(ptr,ptr0,len0,ptr1,len1,ptr2,len2,ptr3,len3,exact,exact_diacritics);deferred5_0=ret[0];deferred5_1=ret[1];return getStringFromWasm0(ret[0],ret[1]);'
    replace(bridge, T+'("d2.wasm-search.start");const ret=wasm.search(ptr,ptr0,len0,ptr1,len1,ptr2,len2,ptr3,len3,exact,exact_diacritics);deferred5_0=ret[0];deferred5_1=ret[1];'
        +T+'("d2.wasm-search.end",{returnedBytes:ret[1]});'+T+'("d2.wasm-result-decode.start",{bytes:ret[1]});const __pfD2Decoded=getStringFromWasm0(ret[0],ret[1]);'
        +T+'("d2.wasm-result-decode.end",{chars:__pfD2Decoded.length});return __pfD2Decoded;', 'wasm-search-and-decode')
    result_parse = 'let{filtered_counts,total_counts,results,unfiltered_total,search_keywords,query_term_idfs}=JSON.parse(result);'
    replace(result_parse, T+'("d2.results-json.start",{chars:result.length});'+result_parse+T+'("d2.results-json.end",{resultCount:results.length});', 'results-json')
    replace('let resultsInterface=results.map((result2)=>{',
        T+'("d2.results-js.start",{resultCount:results.length});let resultsInterface=results.map((result2)=>{', 'results-js-start')
    replace('return res;});const searchTime=Date.now()-searchStart;',
        'return res;});'+T+'("d2.results-js.end",{resultCount:resultsInterface.length});const searchTime=Date.now()-searchStart;', 'results-js-end')

    # Mechanical reversibility ensures no unlisted edit slipped into this exact
    # source transformation. It does not claim performance equivalence.
    reversed_text = text
    for change in reversed(changes):
        assert reversed_text.count(change['after']) == 1, 'REVERSE_COUNT:'+change['label']
        reversed_text = reversed_text.replace(change['after'],change['before'],1)
    assert reversed_text == original, 'UNLISTED_TRANSFORMATION'
    prefix = 'import {trace as '+T+'} from '+json.dumps(helper_url)+';\n'
    output = (prefix+text).encode('utf-8')
    diff = ''.join(difflib.unified_diff(original.splitlines(True),(prefix+text).splitlines(True),fromfile=str(source),tofile=str(target)))
    temporary = target.parent/('.pagefind-d2-'+uuid.uuid4().hex+'.tmp')
    with temporary.open('xb') as f:
        f.write(output)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary,target)
    fd=os.open(target.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
    assert source.read_bytes() == raw, 'ORIGINAL_CHANGED'
    assert target.read_bytes() == output, 'OUTPUT_READBACK_FAILED'
    receipt={'source':{'path':str(source),'sha256':SOURCE_SHA,'bytes':len(raw)},
        'instrumented':{'path':str(target),'sha256':sha(output),'bytes':len(output)},
        'traceHelper':{'url':helper_url,'sha256':sha(helper.read_bytes())},
        'replacementCount':len(changes),'reversible':True,'replacements':changes,'diff':{'path':str(patch_file),'sha256':sha(diff.encode())},
        'boundaries':['fetch headers are not body completion','arrayBuffer completion is caller receipt',
            'decompression and backend bridge/load/search are separate','WASM search return precedes UTF-8 decode and JSON.parse',
            'JS result construction remains full-result work','all timing includes observer effects; no query executed'],
        'artifactResponsibility':'Caller copies and validates the complete artifact; only this pagefind.js SHA changes. Do not reuse original inventory as the diagnostic JS pin.'}
    for filename,content in [(patch_file,diff.encode()),(receipt_file,(json.dumps(receipt,indent=2)+'\n').encode())]:
        with filename.open('xb') as f:
            f.write(content);f.flush();os.fsync(f.fileno())
    print(json.dumps({'instrumented':receipt['instrumented'],'receipt':str(receipt_file),'diff':str(patch_file),'replacementCount':len(changes)}))


if __name__=='__main__':
    main()
