// Arithmetic model only. Values supplied by users/scenarios are not measured company costs.
export function number(value, {integer=false,min=0,max=1e12}={}) {
  if(value===null || value===undefined || String(value).trim()==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error('INVALID_INPUT');
  return n;
}
export function footprint(raw) {
  const p={};
  for(const key of ['N','P','K'])p[key]=number(raw[key],{integer:true,min:1,max:10000});
  for(const key of ['S','R','W','D'])p[key]=number(raw[key],{integer:true,min:0,max:1e9});
  for(const key of ['I','F','B','M'])p[key]=number(raw[key],{min:0,max:1e9});
  const {N,P,K,S,R,W,D,I,F,B,M}=p;
  const known=(keys,calculate)=>keys.some(v=>v===null)?null:calculate();
  return {
    localPeakMiB:known([N,P,K,S,I],()=>N*P*(K+S)*I),
    firstInstallMiB:known([N,P,I],()=>N*P*I),
    crossRegionIndexMiBPerDay:known([N,F,I],()=>N*F*I),
    inRegionIndexMiBPerDay:known([N,P,F,R,I],()=>N*(P*F+R)*I),
    contentGetsPerDay:known([N,W,D],()=>N*(W+D)),
    inRegionContentMiBPerDay:known([N,W,B,D,M],()=>N*(W*B/1024+D*M)),
  };
}
export function economics(raw) {
  const N=number(raw.N,{integer:true,min:1,max:10000});
  const T=number(raw.T,{min:1,max:1200});
  const setup=number(raw.setup,{min:-1e12}),common=number(raw.common,{min:-1e12}),saving=number(raw.saving,{min:-1e12});
  if([N,T,setup,common].some(v=>v===null))return null;
  const threshold=(setup/T+common)/N;
  return {threshold,delta:saving===null?null:setup+T*common-N*T*saving,
    monthlyAdvantage:saving===null?null:N*saving-common};
}
