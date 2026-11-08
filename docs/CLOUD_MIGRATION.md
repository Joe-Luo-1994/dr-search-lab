# Cloud migration — reproducible environment, not a running-machine copy

## Scope and current evidence

Target: continue this synthetic research project in Dot/Codex Cloud without depending on the Windows workstation. Default repository is private. No public deployment, production credentials, company datasets, DNS changes or paid infrastructure are required for the initial trial.

Windows baseline evidence is preserved under `evidence/windows-baseline-2026-11-09/`, including a failed ES run. It is historical Windows evidence, **not cloud verification**. Linux lifecycle code must pass the steps below in the actual target before claiming migration complete. Bash syntax checking is not a Linux execution test.

Read `docs/HANDOFF.md`, `docs/VERIFICATION_PLAN.md` and `docs/ES_EXPERIMENT.md` before extending the research.

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
4. If data is missing, rerun the first-verification procedure; do not silently change the prefix or treat an empty index as ready.

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
