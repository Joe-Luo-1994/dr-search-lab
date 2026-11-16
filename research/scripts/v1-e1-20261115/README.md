# E1 必要搜尋與閱讀任務

從 Windows repo root 使用現有 Node 22.21.1、Next 16.4.5、SQLite FTS5 及 loopback ES。執行卡定義正式執行、觀測與保全。這個目錄包含 provider 與共用 Web／HTTP；獨立案例裁決和正式執行由其他角色提供。

## 建置與啟用

```powershell
node scripts/v1-e1-20261115/prepare.mjs
node scripts/v1-e1-20261115/index-es.mjs http://127.0.0.1:19300
node scripts/v1-e1-20261115/build.mjs
node scripts/v1-e1-20261115/serve.mjs b
# 完全停止 B 後，再以相同 port 執行 C
node scripts/v1-e1-20261115/serve.mjs c
```

- 本機準備僅寫入 `.lab/v1-e1-20261115/prepared`（快照及 Role profile）與 `.lab/v1-e1-20261115/next-build`（Next 產物）。兩個輸出目錄原先都需不存在。產製失敗時保留部分輸出、記錄後再由 runner 依卡處理。禁止重用此路徑的其他資料。
- ES 只建 `drlab-v1-e1-20261115-r1`，名稱已存在就停。Setup 完成 refresh 和 count，再設定並讀回該索引的 write block，核對成功才產生 ES descriptor。資料使用凍結 fixture，B/C 查詢均驗同一 snapshot 和 source SHA。正式 runner 的清理只可以此精確名稱及本輪新增目錄為目標。
- 兩候選同用 `http://127.0.0.1:3157/`，啟用成功時，stdout 會記錄 `event:e1_ready`、`mode`、`pid` 和來源 SHA。Browser 依候選使用新 context。Redirect 關閉，沒有外部讀取或 CDN 資源。
- [HTTP 契約](CONTRACT.md)說明 `x-e1-identity` 和 API。Web 可從 PDF 詞執行搜尋→開頁→附件→PDF 預覽或下載。頁面是 Lexical 抽取純文字的替代 render。

## 受控診斷

- Role 模擬由 runner 修改本輪 `prepared/role-profile.txt`。預設 `baseline`；`revoked-b` 撤除 b 的 Space。API 每次重新讀取。記錄修改時間與恢復情形。
- B 搜尋故障使用 `node scripts/v1-e1-20261115/serve.mjs b --es-url http://127.0.0.1:19390`，事前驗證 19390 未監聽。這會對真 ES HTTP adapter 注入 loopback 連線錯誤。
- C 搜尋故障由 runner 暫時搬移 `prepared/snapshot/search.sqlite`，限定本輪目錄並於 `finally` 復原。取不到 DB 時，搜尋應回 503；正文及附件依固定 metadata 快照查權。
- 移頁、解除附件關聯、同步失敗用凍結快照與模擬目前政策對照，觀察仍可交付的資料與狀態。角色撤除用真正找不到授權的合成 profile。實驗卡保留未經正式 owner 批准的快照風險。

## 重用與新增責任

- `reference/extract-lexical.mjs` 逐位元來自 WSL 原 repo `scripts/s1-es-api/lexical.mjs`，SHA-256 `7e46b136e256f57ee5d9ca764165d68aa676674fbd4244a65ac5e733435857ba`。
- `reference/normalize-query.mjs` 逐位元來自 WSL 原 repo `scripts/ms1-api-lab/text.mjs`，SHA-256 `553436c3b6eda6713f45fb00e754d831f52f02f9375027c28541a00c40345e8d`。Windows 複本因舊實驗 scripts 留在 WSL，採兩個唯讀小 helper；日後若共用端升版，需核對兩份一致。
- 參照 S1 ES 的 cross-fields AND 及有界讀取、S1 Scope／MinIO release 的 SQLite FTS predicate／唯讀 child、以及 `lib/readonly-release.mjs` 的可信 page→media membership 和 bytes hash gate。B/C 對齊部分由共用 Next adapter 驗證。
- 共同需維護合成 API、Role/Space 及 Tags 授權契約、local metadata/membership/PDF 來源一致性、錯誤映射及 UI。B 另維護新 ES mapping、標準分析／查詢及索引閉包。C 另維護 SQLite 匯出、FTS 正規化、Tag SQL 和 child 生命週期。每次搜尋開 child 是 E1 功能切片的有界做法，延遲混入程序啟動，只能作本輪功能期限，不能代表常駐 pool、容量或正式維運成本。
- 本輪只驗本機小合成快照控制鏈。真 MinIO、正式 ReBAC、既有 consumer/editor 整合、E2 發布更新、實際備援測試與投入比較仍須個別驗證。
