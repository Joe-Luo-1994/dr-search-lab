import { searchResponse, failure } from '../../../../core.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request){try{return await searchResponse(request);}catch(e){return failure(e);}}
