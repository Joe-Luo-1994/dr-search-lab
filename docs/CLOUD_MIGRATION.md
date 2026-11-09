# Cloud migration — reproducible environment, not a running-machine copy

## 2026-11-09 啟動防護固化（設定草稿）

正常 Linux `node scripts/es-control.mjs start dr` 現在呼叫 `scripts/es-start.py`。Python 3 標準庫 helper 在啟動 guard 下檢查 recorded PID、同使用者同 instance 的 ES_PATH_CONF／Java config argument、HTTP 與 transport port，並對所有候選先取得 POSIX record locks；任一權限不足、程序／port 活躍、held lock、symlink、非零或 hardlink 均拒絕。先驗完整 data tree，再僅對既有 regular zero-byte node.lock/write.lock 以 fd 更新 metadata 並 fsync，無刪除、建立或寫入索引 payload。guard 保持到 daemon launcher 回傳 live PID；重複／並行 start 拒絕。直接啟動 Java 或特權檔案競爭不在此合作式入口的保證內。

這將先前手動離線處理納入程式，不是平台 overlay 行為的正式保證。`tests/es-start-linux.py` 驗證真實 Linux fixture／程序／held locks 與內容保留；本草稿的既有 DR、四組封存 release 及 browser 驗收另有實測。**重新發布後，新一般對話免臨時人工修復啟動仍待驗證。** 不重建 fixture、不重跑 ES 實驗掩蓋問題。細節與新證據見 `evidence/cloud-startup-hardening-2026-11-09/`。

版本化啟動說明以 `onboarding/start.md` 為準；環境 UI 的 start skill 只保存以下一行，避免複製過期修復全文：

```text
請讀取並遵循 /workspace/dr-search-lab/onboarding/start.md；使用現有 checkout，不建立 worktree，不手動修補 lock，不重建資料或重跑 ES 實驗掩蓋啟動問題。
```

若沙箱因 `/proc` 不可讀而拒絕，使用平台正常權限升級執行相同指令，不降級檢查。私人 viewer 未打通的限制保持不變，本輪不再探索入口或 tunnel。

## 2026-11-09 發布後新任務目前狀態

使用既有 checkout；初始來源 `a1bec7f546ef39e1ae1194aec2315875fa277635`，ff-only 更新至 `4a7e06b8ec027aa114c831ef1ded5e8d3107df2c`。保留 build `wzRiI8-PQTbmoPXeo4ZDO`、成功 Linux ES run `mw8h0cao`、prefix `drlab-it-mw8h0cao-`；14 個 fixture checksum 均相符。未重建 fixture、build、索引或重跑 ES 實驗。

第一輪啟動失敗，證據已保留：Lucene `AlreadyClosedException` 顯示 lock creationTime 從 epoch 在首次寫入時改變，與還原 overlay copy-up 相符。在確認 Java 未運行後，對 DR data 既有七個零位元組 `*.lock` 執行 touch 使其先實體化，再啟動成功；沒有刪除 lock 或替換索引內容。這是**修復後啟動通過**，不是原快照無介入啟動通過。相同 DR cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q` 與四組已封存索引內容 digest 均保留。再次發布／新任務的無介入啟動仍待重驗。

33 tests 通過、無 skip；四組 `verifyElasticRelease`（v1/v2 × attachments false/true）通過；13 browser checks 通過，`engineCount=4`、`elasticsearchVerified=true`。primary 19200 維持離線；DR 19300 與 Next.js 3000 保持 loopback 運行。網路為 restricted、enforced，observations_current=true；額外三網域與 package_managers preset 未變更。

共享 Chromium 已由 agent 實際操作，但**目前沒有已驗證的使用者雲端互動入口**。使用者已實際確認網站 UI 沒有「＋ → Desktop」，而「開啟 網頁預覽」只在使用者本機 Edge 開啟 localhost，會誤連 Windows baseline；先前將該 Desktop 路徑當成確切私人入口的說法撤回。雲端 `http://127.0.0.1:3000` 不能作為使用者裝置的入口。

已檢查正式瀏覽器 API：`markHandoff()` 僅保留分頁供後續工作，不保證產生接管 UI；`requestUserTakeover("user_requested")` 才是文件中的正式使用者接管動作。`cua.listTabs({browser:"cdp"})` 成功列出 Demo；`cua.getTab("1",{browser:"cdp"})` 失敗，錯誤 `Browser Use could not read requirements.`。改用正式 `agent.browsers.get("1")`、`browser.tabs.get("1")` 成功綁定且 `tab.url()` 回傳雲端 Demo URL，但實際 `tab.requestUserTakeover("user_requested")` 仍以同一 requirements 錯誤失敗，未回傳 `browserHandoff.url` 或接管入口。未使用 `markDeliverable()` 覆蓋可能的交接標記，也未把標記保留等同互動成功。

目前工具清單沒有 `open_in_codex`、私人 preview 或 inbound port-forward 控制。runtime networking 文件明確區分 outbound proxy 與平台獨立的 inbound preview／port-forward，不能用出口網路設定建立入口。沒有猜測平台 URL、修改綁定、公開服務、新增 third-party tunnel、付費資源或讀出憑證。此環境 remote_desktop 回報 enabled=true、state=unknown，表示能力宣告，不能證明網站客戶端存在 viewer。**使用者互動驗收受平台交接工具／網站 UI 限制阻擋**；雲端服務仍運行。

完整證據：`evidence/cloud-published-acceptance-2026-11-09/`；入口更正與正式交接失敗紀錄以其 `handoff-followup/` 為準（取代前輪入口說明）。正式 RTO、真實 ReBAC／MinIO、consumer 相容性與獨立區域災難演練均未驗證；不能由這次合成資料測試推論通過。


## Scope and current evidence

Target: continue this synthetic research project in Dot/Codex Cloud without depending on the Windows workstation. Default repository is private. No public deployment, production credentials, company datasets, DNS changes or paid infrastructure are required for the initial trial.

Windows baseline evidence is preserved under `evidence/windows-baseline-2026-11-09/`, including a failed ES run. It is historical Windows evidence, **not cloud verification**. Linux lifecycle code must pass the steps below in the actual target before claiming migration complete. Bash syntax checking is not a Linux execution test.

Read `docs/HANDOFF.md`, `docs/VERIFICATION_PLAN.md` and `docs/ES_EXPERIMENT.md` before extending the research.

Local preparation was regression-tested on Windows after the portability changes: 33 tests, 13 browser smoke checks with four engines, and full ES experiment `mw8frj44` passed. Evidence is in `evidence/portability-windows-2026-11-09/`. The private repository is `Joe-Luo-1994/dr-search-lab`, branch `codex/cloud-migration`.

Actual Codex Cloud Linux onboarding subsequently passed 33 tests, production build, the full ES experiment `mw8h0cao` (144 contract combinations, snapshot restore with primary offline, equal IDs/order and DR restart), and 13 browser checks with four engines. Evidence is in `evidence/cloud-2026-11-09/`, committed as `a1bec7f546ef39e1ae1194aec2315875fa277635`; all 16 evidence checksums were verified after local read-back. Text log LF attributes preserve those hashes across platforms.

On 2026-11-09 Asia/Taipei, the owner-only `dr-search-lab` environment was published after clean service shutdown. The platform environment listing reported `status=ready`, `runnable=true`. A new cloud acceptance chat was requested; at this checkpoint the creation call had not returned a thread ID. **Published-snapshot startup and human-accessible private preview remain unverified.** Onboarding success and publication alone do not complete these gates. Executable setup/start instructions are preserved in `onboarding/`; environment UI settings were saved before publication.

## Environment configuration

Create a private Codex Cloud environment from the GitHub repository. Keep its network allowlist sufficient for GitHub checkout, npm, the official Elastic artifact host (`artifacts.elastic.co`), and Playwright's browser download endpoints. Allow only the extra destinations actually requested by installation; no blanket internet expansion is necessary. No API keys are needed by the synthetic demo.

Reference Node: **22.21.1** (`.nvmrc`); minimum 22.13 with `node:sqlite` FTS5. ES stays **8.17.0** so results can be compared with the historical baseline. This pinned experimental ES version is not a production version recommendation.

Native ES on Linux requires a **non-root runtime user** with write access to this checkout and enough memory/disk for two processes, archives and snapshots. Each Java heap is 512 MiB; total process memory is larger. If the target runs everything as root, configure a non-root workspace before the ES step, or mark the full-stack migration blocked. Do not bypass Elasticsearch's root check or silently drop ES from acceptance.

Docker is optional for the broader lab, not required by the Linux native runner. This package does not assume nested Docker is available. MinIO and real ReBAC remain out of scope until explicitly integrated.

## Install and first verification (Linux)

Run from repository root. The first fixture generation must run before starting Next.js. Do not run it against an active demo; it overwrites fixture/index files.

```bash
node --version
npm ci
npm run cloud:preflight
npx playwright install --with-deps chromium
npm run prepare:data
npm test
node scripts/es-control.mjs setup
npm run experiment:es
```

The preflight records host-reported CPU/memory/disk, Node, FTS5, tools and loopback port availability. `pending` items require follow-up; `passed` means no blocking preflight failure, not migration acceptance. Check actual cgroup/provider quotas separately. Installing browser OS dependencies may need environment setup privileges; no privileges are silently escalated by the project scripts.

The Linux ES setup downloads the official archive for x86_64/aarch64, verifies SHA512, and configures isolated loopback instances. It does not install a service or alter sysctl/firewall settings. Lifecycle stop checks live node name, PID file, bundled Java executable and workspace configuration before sending TERM.

The experiment creates four immutable reference indices with a unique prefix, snapshots, stops primary, restores DR, verifies results and restarts DR. It leaves DR on port 19300 for the demo. Read `.lab/reports/es-experiment-latest.json`; require `passed: true`. Failed runs remain evidence. Repeated runs accumulate indices/snapshots.

For a **new cloud checkout with no `.env.local`**, use the successful report to configure Next.js:

```bash
node --input-type=module -e 'import fs from "node:fs"; const r=JSON.parse(fs.readFileSync(".lab/reports/es-experiment-latest.json")); if(!r.passed) throw Error("ES experiment did not pass"); fs.writeFileSync(".env.local", `ELASTICSEARCH_URL=http://127.0.0.1:19300\nLAB_INDEX_PREFIX=${r.prefix}\n`, {flag:"wx"});'
npm run build
npm run start
```

The exclusive write refuses to replace an existing environment file. If one already exists, inspect and update only the ES URL/prefix after a successful run. Never copy the Windows `.env.local` as if its live indices existed in the cloud.

In a second shell:

```bash
npm run test:browser
npm run observe
npm run benchmark
```

Default browser is Edge on Windows and bundled Chromium elsewhere. `LAB_BROWSER_CHANNEL=chromium` forces bundled Chromium; `LAB_BASE_URL` overrides the default `http://127.0.0.1:3000` for browser tests. Require `elasticsearchVerified: true` and four engines in the browser report for full migration acceptance.

The server remains bound to loopback. Use the provider's private preview/forwarding; if the preview requires a different binding, first verify its access boundary. The demo has switchable mock identities and is not suitable for a public URL. It does not implement production authentication.

## Restart and saved environment

Saving a cloud filesystem does not prove that processes, ports or sessions survive. Configure the environment's start instructions to:

1. Check the saved `.env.local`, fixture manifest and successful experiment report.
2. Start DR with `node scripts/es-control.mjs start dr` only if not already ready; then `node scripts/es-control.mjs status dr`.
3. Run `npm run start` and verify `/api/lab/status` and browser smoke.
4. If retained data is missing, stop and report it; do not regenerate fixtures, rerun the experiment or change prefix to hide a published-startup failure. Follow `onboarding/start.md`.

New tasks should start from the published prepared filesystem. Preserve reports/source commits separately; saved environment state is not version control. Verify one actual close/resume or new-task start after publishing before declaring the workflow repeatable.

## Acceptance and fallback

| Gate | Required evidence |
|---|---|
| Source transfer | Remote commit/tree read-back matches prepared files; or tar.gz SHA256 plus extracted file hash verification |
| Embedded contract | All existing tests pass on cloud; no skipped authorization or artifact cases |
| ES restore | Successful cloud report, 144 combinations, equal IDs/order, primary offline, DR restart |
| Browser | 13 smoke checks; four real engines; download and fail-closed behavior |
| Human preview | Private UI can actually be opened from the user's device |
| Persistence | Published/resumed environment restarts services and reproduces results |

If ES is blocked by target privileges/resources, embedded engines may still run for a partial demonstration, but mark ES/restore and whole-environment migration **incomplete**. Keep the local baseline usable. Compare behavior, not absolute Windows-vs-cloud latency; new hardware invalidates direct capacity conclusions.

## Transfer package

`npm run transfer:export` creates `.lab/transfers/<timestamp>/dr-search-lab.tar.gz` plus SHA256. It uses an explicit source/evidence allowlist, rejects symlinks/sensitive filenames, excludes `.env.local`, `.git`, dependencies, native binaries and live data, extracts the archive and verifies every payload hash. This is an accidental-inclusion guard, not a comprehensive secret scanner; review source/evidence before sharing.

Use the repository for ongoing work; the archive is a fallback handoff/backup. Do not upload it as a single opaque file in place of a usable Git repository.

## Official references

- [Dot computers and cloud coding environments](https://learn.chatgpt.com/docs/dots/computers-and-apps)
- [Codex Cloud setup, install/start instructions, publication and saved state](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [Elastic archive installation, checksum and daemon options](https://www.elastic.co/guide/en/elasticsearch/reference/8.17/targz.html)
- [Playwright browser and Linux dependency installation](https://playwright.dev/docs/browsers)
