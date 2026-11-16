export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){const impl=await import(/* webpackIgnore: true */ process.env.PF_G2_CORE_URL);try{return await impl.searchResponse(request);}catch(e){return impl.failure(e);}}
