import {readPage} from '../../../../api.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request, {params}) {
  return readPage(request, (await params).pageId);
}
