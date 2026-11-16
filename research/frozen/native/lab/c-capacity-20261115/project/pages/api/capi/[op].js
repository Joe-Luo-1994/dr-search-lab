export const config={api:{bodyParser:{sizeLimit:'4kb'},responseLimit:false}};
let service;
export default async function route(req,res){service??=await import(/* webpackIgnore: true */ process.env.CAP_SERVICE_URL);return service.handler(req,res);}
