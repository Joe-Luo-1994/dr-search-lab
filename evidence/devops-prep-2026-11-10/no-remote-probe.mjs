import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { searchLab,newState } from '../../lib/lab.mjs';
import { clearEngines } from '../../lib/engines.mjs';
let remoteAttempts=0;
globalThis.fetch=async()=>{remoteAttempts++;throw Error('Remote fetch forbidden for this isolated probe')};
for(const key of ['ELASTICSEARCH_URL','MEILISEARCH_URL','TYPESENSE_URL'])delete process.env[key];
const report={at:new Date().toISOString(),scope:'Separate Node process using existing lab searchLab, existing fixtures, mock auth; global fetch rejected, external engine URLs removed. Application dependency probe, not network-isolation or Next HTTP proof.',results:[]};
try{for(const engine of ['sqlite','minisearch','orama']){const r=await searchLab(newState(),engine,{keyword:'backup',spaceId:'ops',tagIds:['database','runbook']});assert(r.hits.some(x=>x.id==='p01'));report.results.push({engine,total:r.total,p01Found:true})}assert.equal(remoteAttempts,0);report.passed=true}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1}finally{clearEngines();report.remoteAttempts=remoteAttempts;await writeFile('evidence/devops-prep-2026-11-10/no-remote-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
