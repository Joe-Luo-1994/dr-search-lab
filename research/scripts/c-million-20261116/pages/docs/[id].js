import {useState} from 'react';
export async function getServerSideProps({req,res,params,query}){
  res.setHeader('Cache-Control','no-store');
  try{const service=await import(/* webpackIgnore: true */ process.env.CAP_SERVICE_URL);
    const model=await service.webModel(req.headers['x-cap-identity'],params.id,query.version);
    return {props:{...model,error:null}};
  }catch(error){res.statusCode=error.status??503;res.setHeader('x-cap-error',error.code??error.message);return {props:{error:error.code??error.message}};}
}
export default function Document(props){
  const [hits,setHits]=useState(null);const [error,setError]=useState('');
  if(props.error)return <main data-error={props.error}><h1>文件暫時無法載入</h1><p>{props.error}</p></main>;
  async function search(e){e.preventDefault();setError('');const q=new FormData(e.currentTarget).get('q');
    try{const r=await fetch('/api/capi/search?q='+encodeURIComponent(q),{headers:{'x-cap-identity':'all','x-cap-lane':'web'}});const data=await r.json();if(!r.ok)throw Error(data.error.code);setHits(data.hits);}catch(err){setError(err.message);}}
  return <main data-pageid={props.pageId} data-version={props.snapshotId} style={{maxWidth:780,margin:'24px auto',padding:20,fontFamily:'system-ui',lineHeight:1.7}}>
    <p>合成唯讀文件 · {props.snapshotId}</p><h1>{props.title}</h1>
    <form onSubmit={search}><label htmlFor="q">搜尋文件</label><input id="q" name="q" defaultValue="uniquep000003" style={{margin:12,padding:10}}/><button type="submit">搜尋</button></form>
    <p role="status">{error}</p>{hits&&<ul aria-label="搜尋結果">{hits.map(hit=><li key={hit.pageId}><a href={'/docs/'+hit.pageId+'?version='+new URL(hit.url,'http://local').searchParams.get('version')}>{hit.title}</a></li>)}</ul>}
    <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{props.body}</pre>
    <a href={'/api/capi/page?pageId='+props.pageId+'&version='+props.snapshotId}>正文 API（需合成身份 header）</a>
  </main>;
}
