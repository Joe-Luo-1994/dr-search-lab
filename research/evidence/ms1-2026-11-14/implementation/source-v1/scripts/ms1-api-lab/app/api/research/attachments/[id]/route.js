import { attachmentResponse, failure } from '../../../../../core.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request,context){try{return await attachmentResponse(request,(await context.params).id);}catch(e){return failure(e);}}
