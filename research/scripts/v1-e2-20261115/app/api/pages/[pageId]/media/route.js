import {listMedia} from '../../../../../api.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request, {params}) {
  return listMedia(request, (await params).pageId);
}
