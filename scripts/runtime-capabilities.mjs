// Local-only capability check; no environment dump, credentials, registry or network calls.
const report={at:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,validatedBaseline:'v22.21.1',matchesValidatedNode:process.version==='v22.21.1',checks:[],scope:'Node/SQLite only; not Harbor access or container/application acceptance'};
let db;
try{
 const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(':memory:');
 db.exec('CREATE VIRTUAL TABLE capability USING fts5(body)');
 db.prepare('INSERT INTO capability(body) VALUES (?)').run('synthetic backup');
 const count=db.prepare('SELECT count(*) AS count FROM capability WHERE capability MATCH ?').get('backup').count;
 if(count!==1)throw Error('FTS5 query did not return expected synthetic row');
 report.checks.push({name:'in-memory FTS5 query',passed:true});report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1}
finally{db?.close();console.log(JSON.stringify(report,null,2))}
