import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const rt='.lab/v1-remote-content-20261115',out='evidence/v1-remote-content-20261115';
const o=JSON.parse(fs.readFileSync('scripts/v1-remote-content-20261115/review/oracle.json'));
const hash=b=>createHash('sha256').update(b).digest('hex'),result={versions:[],scope:'Offline fixture/descriptor/source audit before HTTP; not functional pass'};
for(const v of ['v1','v2']){
 const source=fs.readFileSync(rt+'/producer/'+v+'.json');assert.equal(hash(source),o.referenceContent[v].sourceSha256);
 const dir=rt+'/artifacts/'+v,m=JSON.parse(fs.readFileSync(dir+'/manifest.json'));
 assert.equal(m.pages.length,o.referenceContent[v].pageCount);assert.equal(m.snapshotId,o.snapshotIds[v]);
 assert(m.pages.every(p=>!('body'in p)&&!('paragraphs'in p)));assert(m.media.every(p=>!('extractedText'in p)));
 assert.deepEqual(fs.readdirSync(dir).sort(),['manifest.json','search-text.json','search.sqlite']);
 for(const p of o.referenceContent[v].pages){const a=m.pages.find(x=>x.pageId===p.pageId);for(const k of ['spaceId','title','tagIds','mediaIds'])assert.deepEqual(a[k],p[k]);assert.equal(a.bodyObject.sha256,p.objectSha256);assert.equal(a.bodyObject.bytes,p.objectBytes);assert.equal(hash(fs.readFileSync(rt+'/objects/'+a.bodyObject.key)),p.objectSha256);}
 for(const f of o.referenceContent[v].media){const a=m.media.find(x=>x.mediaId===f.mediaId);assert.equal(a.sha256,f.sha256);assert.equal(a.bytes,f.bytes);assert.equal(hash(fs.readFileSync(rt+'/objects/'+a.key)),f.sha256);}
 result.versions.push({version:v,sourceSha256:hash(source),pageCount:m.pages.length,local:Object.fromEntries(fs.readdirSync(dir).map(p=>[p,fs.statSync(dir+'/'+p).size])),remoteBodyBytes:m.pages.reduce((n,p)=>n+p.bodyObject.bytes,0),remotePdfBytes:m.media.reduce((n,f)=>n+f.bytes,0)});
}
const wrong=JSON.parse(fs.readFileSync(rt+'/artifacts/wrong-v2/manifest.json'));
const a=wrong.pages.find(p=>p.pageId==='a-pdf').bodyObject,n=wrong.pages.find(p=>p.pageId==='a-pdf-near').bodyObject;
assert.equal(a.key,n.key);assert.equal(a.bytes,n.bytes);assert.notEqual(a.sha256,n.sha256);
fs.writeFileSync(out+'/prepared-audit.json',JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(result));
