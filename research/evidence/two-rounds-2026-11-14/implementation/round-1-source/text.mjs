// Explicit application normalization shared by SQLite index/query and Pagefind query.
// ICU word segmentation is additional owned logic; no corpus scan fallback.
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
export function normalizeQuery(text) {
  return text.replace(/\p{Script=Han}+/gu, run => [...segmenter.segment(run)].map(x=>x.segment).join(' ')).replace(/\s+/g,' ').trim();
}
