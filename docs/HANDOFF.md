# DR Search Lab — agent handoff

## 2026-11-09 發布後新任務目前狀態

使用既有 checkout；初始來源 `a1bec7f546ef39e1ae1194aec2315875fa277635`，ff-only 更新至 `4a7e06b8ec027aa114c831ef1ded5e8d3107df2c`。保留 build `wzRiI8-PQTbmoPXeo4ZDO`、成功 Linux ES run `mw8h0cao`、prefix `drlab-it-mw8h0cao-`；14 個 fixture checksum 均相符。未重建 fixture、build、索引或重跑 ES 實驗。

第一輪啟動失敗，證據已保留：Lucene `AlreadyClosedException` 顯示 lock creationTime 從 epoch 在首次寫入時改變，與還原 overlay copy-up 相符。在確認 Java 未運行後，對 DR data 既有七個零位元組 `*.lock` 執行 touch 使其先實體化，再啟動成功；沒有刪除 lock 或替換索引內容。這是**修復後啟動通過**，不是原快照無介入啟動通過。相同 DR cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q` 與四組已封存索引內容 digest 均保留。再次發布／新任務的無介入啟動仍待重驗。

33 tests 通過、無 skip；四組 `verifyElasticRelease`（v1/v2 × attachments false/true）通過；13 browser checks 通過，`engineCount=4`、`elasticsearchVerified=true`。primary 19200 維持離線；DR 19300 與 Next.js 3000 保持 loopback 運行。網路為 restricted、enforced，observations_current=true；額外三網域與 package_managers preset 未變更。

共享 Chromium 已實際開啟 Demo，勾選 Elasticsearch 執行 backup 搜尋，觀察 ES 34 筆結果，再停回首頁。私人入口：本對話右側面板「New tab (+) → Desktop → Take over」，使用共享瀏覽器內的 `http://127.0.0.1:3000`；此網址不能當作使用者電腦直連網址。`open_in_codex`、private-preview／port-forward 工具未提供，不能代為展開面板或產生私人轉發 URL；remote_desktop 宣告 enabled=true、state=unknown，原生桌面操作已成功。**使用者端 viewer 操作仍待驗收**。

完整證據：`evidence/cloud-published-acceptance-2026-11-09/`。正式 RTO、真實 ReBAC／MinIO、consumer 相容性與獨立區域災難演練均未驗證；不能由這次合成資料測試推論通過。


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
