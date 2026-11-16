// Reviewer-owned deterministic input and independent formula oracle, frozen for MS1-v1.
export const RELEASE='ms1-v1';
export const idOf=i=>'p'+String(i).padStart(9,'0');
export const indexOf=id=>/^p\d{9}$/.test(id)?Number(id.slice(1)):NaN;
export const spaceOf=(i,N)=>i<Math.floor(N/2)?'s0000':'s'+String(1+(i-Math.floor(N/2))%999).padStart(4,'0');
export const attachmentText='Synthetic MS1 recovery checklist\nVerify the selected recovery site.\n';
export function allowedSpaces(user){
 if(user==='huge')return ['s0000'];if(user==='small')return ['s0001'];if(user==='pair')return ['s0001','s0002'];if(user==='dup')return ['s0001','s0001','s9999'];if(user==='none')return [];
 if(user==='multi')return Array.from({length:10},(_,i)=>'s'+String(i+1).padStart(4,'0'));
 if(user==='many')return Array.from({length:100},(_,i)=>'s'+String(i+1).padStart(4,'0'));
 if(user==='all')return Array.from({length:1000},(_,i)=>'s'+String(i).padStart(4,'0'));
 return null;
}
export function effectiveSpaces(user,requested){const allow=new Set(allowedSpaces(user)||[]);return requested===undefined?allow:new Set(requested.filter(s=>allow.has(s)));}
export function matches(i,term){
 if(term==='commonterm')return true;
 if(term==='rarebeacon')return i%997===0;
 if(term==='ERR_CONN_RESET')return i%17===0;
 if(term==='備份'||term==='資料庫備份')return i%19===0;
 if(term==='absentquartz')return false;
 throw Error('Unknown oracle query '+term);
}
export function oracle(N,user,term,requested){const spaces=effectiveSpaces(user,requested);let visible=0,total=0;const sampleIds=[];for(let i=0;i<N;i++)if(spaces.has(spaceOf(i,N))){visible++;if(matches(i,term)){total++;if(sampleIds.length<20)sampleIds.push(idOf(i));}}return {N,K:spaces.size,A:visible,H:total,total,sampleIds};}
export function doc(i,N){
 if(!Number.isInteger(i)||i<0||i>=N)throw Error('Invalid generated doc index');
 const id=idOf(i);const spaceId=spaceOf(i,N);
 const markers=['commonterm',...(i%997===0?['rarebeacon']:[]),...(i%17===0?['ERR_CONN_RESET']:[]),...(i%19===0?['資料庫備份流程與還原。']:[])];
 const title=`Synthetic document ${id} topic${i%97}`;
 // Xorshift generates varying vocabulary/order; fixed seed and 1% long-tail pages.
 let state=(Math.imul(i+1,2654435761)^0x71ac3e29)>>>0;const words=[];const target=i%100===0?8192:1024;let len=Buffer.byteLength(markers.join(' ')+' ');
 while(len<target){state^=state<<13;state^=state>>>17;state^=state<<5;const word='vocab'+String((state>>>0)%65521);words.push(word);len+=word.length+1;}
 return {id,spaceId,scope:spaceId,title,content:markers.join(' ')+' '+words.join(' '),attachments:i===0?[{id:'a000000000',name:'checklist.txt',contentType:'text/plain; charset=utf-8',text:attachmentText}]:[]};
}
