export const spaces = [
  { id: 'ops', name: '維運 Operations' },
  { id: 'eng', name: '工程 Engineering' },
  { id: 'restricted', name: '受限 Restricted' },
];
export const users = {
  alice: { name: 'Alice · 維運', spaces: ['ops'] },
  bob: { name: 'Bob · 跨部門', spaces: ['ops', 'eng'] },
  admin: { name: 'Admin · 全部 Space', spaces: ['ops', 'eng', 'restricted'] },
  guest: { name: 'Guest · 無權限', spaces: [] },
};
export const tagIds = ['database', 'runbook', 'security', 'network', 'pdf'];
export const scenarios = [
  { id: 'english', title: '英文與排名', keyword: 'disaster recovery', tagIds: [] },
  { id: 'chinese', title: '中文連續字詞', keyword: '資料庫備份', tagIds: [] },
  { id: 'tags', title: 'Space ＋ Tags AND', keyword: 'backup', spaceId: 'ops', tagIds: ['database', 'runbook'] },
  { id: 'typo', title: '錯字容忍', keyword: 'bakcup', tagIds: [] },
  { id: 'code', title: '技術代碼', keyword: 'ERR_CONN_RESET', tagIds: [] },
  { id: 'attachment', title: '附件文字', keyword: 'quartzfalcon', tagIds: [], includeAttachments: true },
  { id: 'auth', title: '受限結果與分頁', keyword: 'backup', tagIds: [], pageSize: 3 },
  { id: 'moved', title: '舊資料歸屬', keyword: 'transfermarker', tagIds: [] },
];

export function generateDataset(count = 100, version = 'v1') {
  const rows = [
    ['p01', 'ops', ['database', 'runbook'], 'Database backup runbook', 'Daily backup and disaster recovery. 資料庫備份流程與還原。', ''],
    ['p02', 'ops', ['database'], 'Database maintenance', 'Perform backup before maintenance. 資料庫每日執行備份。', ''],
    ['p03', 'ops', ['runbook'], 'Disaster recovery checklist', 'Restore the backup and validate the recovery endpoint.', ''],
    ['p04', 'eng', ['database', 'runbook'], 'Engineering backup', 'Disaster recovery for engineering. Database backup procedures.', ''],
    ['p05', 'ops', ['network'], 'ERR_CONN_RESET troubleshooting', 'Network error ERR_CONN_RESET. Retry after checking the proxy.', ''],
    ['p06', 'ops', ['pdf'], 'PDF attachment handbook', '附件解析展示，正文沒有附件的測試暗號。', 'quartzfalcon PDF extracted content disaster recovery'],
    ['p07', 'ops', ['database'], '資料庫備份', '異地還原與每日備份驗證。', ''],
    ['p08', 'ops', ['runbook'], 'Recovery and disaster planning', 'Disaster testing followed by recovery. Compare word order.', ''],
    ['p09', version === 'v2' ? 'restricted' : 'ops', ['security'], 'Moved document transfermarker', 'This page moves from ops to restricted in v2. Historical disclosure demonstration.', ''],
    ['p10', 'ops', ['database', 'runbook'], 'Backup compatibility notes', 'backup backups backed up. API compatibility.', ''],
    ['p11', 'restricted', ['security'], 'Confidential backup plan', 'backup disaster recovery restricted sensitive synthetic data', ''],
    ['p12', 'ops', ['database', 'runbook'], 'Database restore guide', 'backup validation after disaster recovery', ''],
  ];
  const pages = rows.map(([id, spaceId, tags, title, bodyText, attachmentText]) => ({
    id, spaceId, tagIds: tags, title, bodyText, attachmentText,
    mediaIds: [`m-${id}`], version,
  }));
  for (let i = pages.length; i < count; i++) {
    const spaceId = i % 3 === 0 ? 'restricted' : i % 3 === 1 ? 'eng' : 'ops';
    pages.push({ id: `p${i + 1}`, spaceId, tagIds: i % 2 ? ['database', 'runbook'] : ['network'],
      title: `${spaceId} backup reference ${i + 1}`,
      bodyText: `Synthetic document ${i + 1}. Database backup disaster recovery. 系統備份與復原。 ${'Read-only operations. '.repeat(i % 9)}`,
      attachmentText: '', mediaIds: [`m-p${i + 1}`], version });
  }
  if (version === 'v2') pages.push({ id: 'p-new', spaceId: 'ops', tagIds: ['runbook'], title: 'New publication freshmarker', bodyText: 'Published only in version two.', attachmentText: '', mediaIds: ['m-p-new'], version });
  return { version, synthetic: true, pages };
}

export function searchable(page, includeAttachments) {
  return { ...page, body: page.bodyText + (includeAttachments ? `\n${page.attachmentText}` : '') };
}
