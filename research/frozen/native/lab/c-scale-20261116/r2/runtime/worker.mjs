import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.argv[2],{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-8192; PRAGMA mmap_size=0;');
const snapshotId=db.prepare('SELECT snapshotId FROM metadata').get().snapshotId;
const segmenter=new Intl.Segmenter('zh-Hant',{granularity:'word'});
const normalize=text=>text.replace(/\p{Script=Han}+/gu,run=>[...segmenter.segment(run)].map(x=>x.segment).join(' '));
const pageStmt=db.prepare('SELECT * FROM pages WHERE pageId=?');
const tagsStmt=db.prepare('SELECT tagId FROM page_tags WHERE pageId=? ORDER BY tagId');
const mediaStmt=db.prepare('SELECT * FROM media WHERE mediaId=?');
process.send({ready:true,snapshotId});
process.on('message',({id,op,input})=>{
  const started=performance.now();
  try {
    let result;
    if(op==='check') result=db.prepare('PRAGMA quick_check').all();
    else if(op==='page') {
      const page=pageStmt.get(input.pageId);
      result=page?{...page,tagIds:tagsStmt.all(input.pageId).map(x=>x.tagId),media:page.mediaId?mediaStmt.get(page.mediaId):null}:null;
    } else if(op==='search') {
      const terms=normalize(input.q).match(/[\p{L}\p{N}\p{M}]+/gu);
      if(!terms?.length) throw Error('INVALID_QUERY');
      const match=terms.map(x=>'"'+x+'"').join(' AND ');
      const filters=['search_index MATCH ?'];const params=[match];
      if(input.identity==='none'){result={total:0,hits:[]};}
      else {
        if(input.identity==='a'){filters.push('p.spaceId=?');params.push('space0');}
        if(input.spaceId){filters.push('p.spaceId=?');params.push(input.spaceId);}
        for(const tag of input.tags){filters.push('EXISTS (SELECT 1 FROM page_tags t WHERE t.pageId=p.pageId AND t.tagId=?)');params.push(tag);}
        const from=' FROM search_index JOIN pages p ON p.rowid=search_index.rowid WHERE '+filters.join(' AND ');
        const total=db.prepare('SELECT count(*) AS n'+from).get(...params).n;
        const hits=db.prepare('SELECT p.pageId,p.spaceId,p.title,substr(p.content,1,160) AS snippet'+from+' ORDER BY bm25(search_index,3.0,1.0),p.pageId LIMIT 10').all(...params);
        for(const hit of hits)hit.tagIds=tagsStmt.all(hit.pageId).map(x=>x.tagId);
        result={total,hits};
      }
    } else throw Error('UNKNOWN_OP');
    process.send({id,result,workerMs:performance.now()-started});
  }catch(e){process.send({id,error:e.message,workerMs:performance.now()-started});}
});
