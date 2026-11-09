# DR Search Lab — agent handoff

## 2026-11-09 新版快照冷啟動驗收（最新）

- **新快照啟動通過**：初始 commit `4bdef0f3e41be7de7ea47ac42a9f39fd3c9d1e34`，未 pull、改程式、手動修補 lock、重建 fixture/build/索引或重跑 ES 實驗。沙箱 start 因 `/proc/1/environ` PermissionError 按防護拒絕；依 `onboarding/start.md` 標準升級執行同一 start，首個具備所需權限的正常啟動成功，自動 materialize 7 個既有零位元組 lock。保留兩次 log。
- 4 組 verifyElasticRelease、33 tests（無 skip）、14 Linux 防護、13 browser checks 全通過；`engineCount=4`、`elasticsearchVerified=true`。133 個已保存檔案 checksum（含 fixture、build、原成功 report）未變；四個封存索引 digest 與原報告相符。build `wzRiI8-PQTbmoPXeo4ZDO`、prefix `drlab-it-mw8h0cao-`、DR cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q` 保留，primary 19200 離線。
- **有限時間服務存活通過**：全部測試後於 `2026-11-09T00:35:30.710826+00:00` 再查 DR 與 Next.js ready，從 DR ready 起觀察約 83 秒。服務保留於持續執行終端；只證明本輪有限觀察期間，不代表平台永久保存程序，也不是正式 RTO。
- **使用者 viewer 未驗收**：本輪未探索 viewer、handoff、tunnel 或新 hosting；暫採雲端研究與測試、本機操作 Demo。雲端 localhost 不是使用者裝置入口。未公開服務或新增付費資源。repository 的 UI start skill 範本僅指向版本化 start.md；平台 status 未提供 UI 設定文字，未獨立核對設定端全文。
- 證據：`evidence/cloud-coldstart-2026-11-09/`。所有歷史失敗保留；舊版手動修復紀錄不被本輪結果覆蓋。正式 RTO、長期程序存活、跨區災難、真實 ReBAC/MinIO 與 consumer 相容性仍未知。

## 2026-11-09 發布後新任務目前狀態

使用既有 checkout；初始來源 `a1bec7f546ef39e1ae1194aec2315875fa277635`，ff-only 更新至 `4a7e06b8ec027aa114c831ef1ded5e8d3107df2c`。保留 build `wzRiI8-PQTbmoPXeo4ZDO`、成功 Linux ES run `mw8h0cao`、prefix `drlab-it-mw8h0cao-`；14 個 fixture checksum 均相符。未重建 fixture、build、索引或重跑 ES 實驗。

第一輪啟動失敗，證據已保留：Lucene `AlreadyClosedException` 顯示 lock creationTime 從 epoch 在首次寫入時改變，與還原 overlay copy-up 相符。在確認 Java 未運行後，對 DR data 既有七個零位元組 `*.lock` 執行 touch 使其先實體化，再啟動成功；沒有刪除 lock 或替換索引內容。這是**修復後啟動通過**，不是原快照無介入啟動通過。相同 DR cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q` 與四組已封存索引內容 digest 均保留。再次發布／新任務的無介入啟動仍待重驗。

33 tests 通過、無 skip；四組 `verifyElasticRelease`（v1/v2 × attachments false/true）通過；13 browser checks 通過，`engineCount=4`、`elasticsearchVerified=true`。primary 19200 維持離線；DR 19300 與 Next.js 3000 保持 loopback 運行。網路為 restricted、enforced，observations_current=true；額外三網域與 package_managers preset 未變更。

共享 Chromium 已由 agent 實際操作，但**目前沒有已驗證的使用者雲端互動入口**。使用者已實際確認網站 UI 沒有「＋ → Desktop」，而「開啟 網頁預覽」只在使用者本機 Edge 開啟 localhost，會誤連 Windows baseline；先前將該 Desktop 路徑當成確切私人入口的說法撤回。雲端 `http://127.0.0.1:3000` 不能作為使用者裝置的入口。

已檢查正式瀏覽器 API：`markHandoff()` 僅保留分頁供後續工作，不保證產生接管 UI；`requestUserTakeover("user_requested")` 才是文件中的正式使用者接管動作。`cua.listTabs({browser:"cdp"})` 成功列出 Demo；`cua.getTab("1",{browser:"cdp"})` 失敗，錯誤 `Browser Use could not read requirements.`。改用正式 `agent.browsers.get("1")`、`browser.tabs.get("1")` 成功綁定且 `tab.url()` 回傳雲端 Demo URL，但實際 `tab.requestUserTakeover("user_requested")` 仍以同一 requirements 錯誤失敗，未回傳 `browserHandoff.url` 或接管入口。未使用 `markDeliverable()` 覆蓋可能的交接標記，也未把標記保留等同互動成功。

目前工具清單沒有 `open_in_codex`、私人 preview 或 inbound port-forward 控制。runtime networking 文件明確區分 outbound proxy 與平台獨立的 inbound preview／port-forward，不能用出口網路設定建立入口。沒有猜測平台 URL、修改綁定、公開服務、新增 third-party tunnel、付費資源或讀出憑證。此環境 remote_desktop 回報 enabled=true、state=unknown，表示能力宣告，不能證明網站客戶端存在 viewer。**使用者互動驗收受平台交接工具／網站 UI 限制阻擋**；雲端服務仍運行。

完整證據：`evidence/cloud-published-acceptance-2026-11-09/`；入口更正與正式交接失敗紀錄以其 `handoff-followup/` 為準（取代前輪入口說明）。正式 RTO、真實 ReBAC／MinIO、consumer 相容性與獨立區域災難演練均未驗證；不能由這次合成資料測試推論通過。


## Purpose

Help the user learn and propose an evidence-backed DR design for an internal knowledge system. Optimize total operational burden, including consumer integration and recovery responsibilities. Do not optimize only service count or add engines without decision value. Bring concrete proposals and measured differences to stakeholders.

## Agreed scope and unknowns

- Current product: Next.js + Backend + MariaDB + Elasticsearch + MinIO. This repo is synthetic, not the production codebase.
- Single Taiwan cluster unavailable; another reachable cluster remains usable. Read-only search/read/download. Recovery target around one hour is tentative; DR duration is not limited to one hour. Daily synchronization is a starting assumption, not a proven RPO guarantee.
- ReBAC is assumed separately redundant, supports Space roles, cannot afford per-media tuples. Media authorization still needs trusted Page -> Media membership plus Space authorization.
- Basic search: title/body; optional Space; all selected Tags must match. Attachment extraction, production analyzer/query DSL, ranking, consumer pagination and exact API compatibility remain unknown.
- Endpoint continuity not required yet, but user/consumer switching needs a concrete plan. Real identity, DNS/infra failover, company ReBAC, MinIO and data exports are unverified.

## Existing evidence and its boundary

- Three real embedded engines: SQLite FTS5, MiniSearch, Orama. ES real reference implementation also tested on Windows.
- Windows baseline: 33 unit/contract/coverage tests; ES snapshot/restore with 144 role/space/tag combinations and equal ID/order for four reference queries; 13 browser smoke checks with four engines.
- Preserve successful ES run `mw8ey9hm` and failed `mw8ewyc5`. The ~31.24 second local recovery measurement excludes detection, transfer, authentication, DNS, people and real data scale. It is not a production RTO.
- Windows primary/DR run on the same host. Snapshot repository is a local filesystem. ReBAC and media are synthetic. No real MinIO, independent-region exercise or production compatibility claim.
- Meilisearch/Typesense have adapters but are not service-verified. Pagefind is not implemented. Never silently present either as tested.
- Historical reports are in `evidence/windows-baseline-2026-11-09/`; new reports go to `.lab/reports/`. Platform and scope must remain explicit.

## Current task

Move the research environment to Dot/Codex Cloud and verify it works without the Windows workstation. Source portability preparation is not migration success. See `docs/CLOUD_MIGRATION.md` for install/start/acceptance instructions and pending cloud checks.

The user authorizes routine setup and wants minimal interruptions. Ask only for actual missing login/access choices or consequential actions. Keep repositories and previews private. Do not create a public website, grant broad account access, purchase infrastructure or send messages to others as a side effect.

## Working method

1. Read `docs/VERIFICATION_PLAN.md`: claims, gates and stopping rules.
2. State what each experiment can change in the decision. Label evidence/inference/hypothesis/unknown separately.
3. Preserve failures and explain scope; never replace real ES with a mock to make tests pass.
4. Report changes, observed tests and limitations. Share short Traditional Chinese progress updates.
5. Keep original ES as a serious baseline: retaining ES need not imply duplicating MariaDB and the entire Backend. Export consistency, authorization freshness, media linkage and switching costs exist on both engine routes.

After cloud acceptance, the next useful research is real API/data dependency mapping, MinIO publication/version consistency, ReBAC interface/limits and realistic load/duration. Obtain real analyzer/query examples before promising identical search semantics.

## 2026-11-09 啟動防護更新

Linux start 已內建離線檢查與既有 zero-byte node.lock/write.lock 實體化；依 `onboarding/start.md` 操作，不再由 agent 手動 touch。狀態不明／權限不足拒絕，必要時標準權限升級後執行同一入口。本草稿驗證不能代替重新發布後新一般對話的免臨場修復驗收；私人 viewer 限制未解決。
