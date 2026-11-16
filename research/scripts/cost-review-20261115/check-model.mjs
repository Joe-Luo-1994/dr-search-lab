import assert from 'node:assert/strict';
import {footprint,economics} from './model.mjs';

// Independent hand-calculated cases: 512MiB artifact, two sites, three readers per site.
const base={N:2,P:3,K:2,S:1,R:2,W:100,D:10,I:512,F:6,B:256,M:8};
assert.deepEqual(footprint(base),{
 localPeakMiB:9216,firstInstallMiB:3072,crossRegionIndexMiBPerDay:6144,
 inRegionIndexMiBPerDay:20480,contentGetsPerDay:220,inRegionContentMiBPerDay:210,
});
assert.equal(footprint({...base,P:6}).crossRegionIndexMiBPerDay,6144);
assert.equal(footprint({...base,F:0,R:0}).inRegionIndexMiBPerDay,0);
assert.equal(footprint({...base,W:0,D:0}).contentGetsPerDay,0);
assert.equal(footprint({...base,I:''}).localPeakMiB,null);
assert.equal(footprint({...base,I:''}).inRegionContentMiBPerDay,210);
assert.equal(footprint({...base,W:''}).crossRegionIndexMiBPerDay,6144);
assert.throws(()=>footprint({...base,N:0}),/INVALID_INPUT/);
assert.throws(()=>footprint({...base,P:1.5}),/INVALID_INPUT/);
assert.deepEqual(economics({N:1,T:24,setup:360000,common:10000,saving:10000}),{threshold:25000,delta:360000,monthlyAdvantage:0});
assert.deepEqual(economics({N:4,T:24,setup:360000,common:10000,saving:10000}),{threshold:6250,delta:-360000,monthlyAdvantage:30000});
assert.equal(economics({N:4,T:24,setup:'',common:10000,saving:10000}),null);
assert.deepEqual(economics({N:4,T:24,setup:0,common:0,saving:''}),{threshold:0,delta:null,monthlyAdvantage:null});
assert.equal(economics({N:1,T:12,setup:-1200,common:-100,saving:-200}).delta,0);
assert.throws(()=>economics({N:1,T:0,setup:0,common:0,saving:0}),/INVALID_INPUT/);
console.log(JSON.stringify({passed:true,checks:15,scope:'Arithmetic assumptions only; no DR load or production-cost measurement'}));
