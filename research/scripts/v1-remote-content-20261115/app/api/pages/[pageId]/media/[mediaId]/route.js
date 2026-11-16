import {downloadMedia} from '../../../../../../api.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request, {params}) {
  const {pageId, mediaId} = await params;
  return downloadMedia(request, pageId, mediaId);
}
