import { session, status, searchLab, control, readPage } from '../../../../lib/lab.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handler(request, context) {
  const { parts } = await context.params;
  const s = session(request.headers.get('cookie'));
  const headers = { 'Cache-Control': 'no-store', 'Set-Cookie': `dr-lab=${s.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` };
  try {
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      // Next's internal request URL may use localhost even when the browser used 127.0.0.1.
      // Match the browser-facing Host, not the rewritten internal URL.
      if (origin && new URL(origin).host !== request.headers.get('host')) return Response.json({ error: 'Cross-origin mutation denied' }, { status: 403, headers });
    }
    let result;
    if (request.method === 'GET' && parts[0] === 'status') result = await status(s.state);
    else if (request.method === 'POST' && parts[0] === 'search') result = await searchLab(s.state, parts[1], await request.json());
    else if (request.method === 'POST' && parts[0] === 'control') result = await control(s.state, await request.json());
    else if (request.method === 'GET' && parts[0] === 'pages' && parts[1]) {
      const mediaId = new URL(request.url).searchParams.get('mediaId');
      result = await readPage(s.state, parts[1], mediaId);
      if (mediaId) return new Response(result.content, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.filename}"` } });
    } else return Response.json({ error: 'Not found' }, { status: 404, headers });
    return Response.json(result, { headers });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 503, headers }); }
}
export const GET = handler;
export const POST = handler;
