import {snapshotId} from '../settings.mjs';

const revisedPdf = {
  mediaId: 'pdf-checklist-v2',
  fileName: 'deployment-checklist-v2.pdf',
  mimeType: 'application/pdf',
  extractedText: 'saffron attestation verify the remote cabinet\nMatch seal number 9652 before approval.',
  bytes: 678,
  sha256: '22b32411322dc3cfaed1e2ee15b4eb173c1708d2771c536f9a4a15478b366dae',
};
const v2OnlyPage = {
  pageId: 'a-v2-only',
  spaceId: 'space-a',
  title: 'Harbor Ledger Update',
  tagIds: ['contact'],
  paragraphs: ['harborledger confirms the newly published checklist.'],
  mediaIds: [],
};
const v2Pages = new Map([
  ['a-tag-both', {tagIds: ['runbook', 'contact']}],
  ['a-move', {spaceId: 'space-b'}],
  ['a-pdf', {
    paragraphs: ['部署前請依新版檢查表完成校驗程序。', 'e2packet identifies the revised deployment attachment.'],
    mediaIds: [revisedPdf.mediaId],
  }],
]);

export function releaseSources(base) {
  const v1 = {
    ...base,
    schemaVersion: 2,
    snapshotId: snapshotId('v1'),
    snapshotCapturedAt: '2026-11-15T08:00:00.000Z',
    pages: base.pages.map(page => page.pageId === 'a-pdf'
      ? {...page, paragraphs: [...page.paragraphs, 'e2packet identifies this deployment attachment.']}
      : page),
  };
  const v2 = {
    ...v1,
    snapshotId: snapshotId('v2'),
    snapshotCapturedAt: '2026-11-15T12:00:00.000Z',
    pages: [...v1.pages.map(page => ({...page, ...v2Pages.get(page.pageId)})), v2OnlyPage],
    media: v1.media.map(file => file.mediaId === 'pdf-checklist' ? revisedPdf : file),
  };
  return {v1, v2};
}
