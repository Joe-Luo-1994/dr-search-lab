# PF02 — Pagefind bundle in real MinIO, no persistent web index

2026-11-13 Asia/Taipei; JSON timestamps are UTC. Base cf170076fd12f7420fcfb5193f03fb074a8ec1e2. All content synthetic; no credentials, live data or binary artifacts committed.

Result: 28 checks and 12 searches per complete run passed. 115 generated bundle objects (610,648 bytes) uploaded to a real native MinIO process and individually read back with matching SHA-256. Original local bundle serving directory renamed out of service. Fresh web processes have empty working directories, use no index filesystem API, and browser traces show the actual remote object paths. This is not an OS syscall trace or Kubernetes validation.

Three phases: direct cross-origin MinIO bundle; new web PID plus fresh browser context using retained MinIO objects; private bucket streamed through web using server credentials. Chinese returns p07/p02/p01, tags AND 17, technical code p05, pre-extracted attachment p06 in all three phases. Private anonymous GET returns 403; proxy succeeds. basePath points to the bundle; baseUrl keeps result links on the web origin. No real ReBAC or website/user authentication is implemented in this isolated test.

Both Docker Hub and Quay image pulls were refused; raw failure logs are preserved. A verified Go1.24.2 toolchain and official MinIO tagged source were downloaded, hashed, and compiled within a 300-second budget. See build-sources.json and minio-source-build.json. Runtime version is DEVELOPMENT.GOGET, not an official release binary label. Source tag peeled commit is 0d7408fc9969caf07de6a8c3a84f9fbb10a6739e. Do not use this research build as a company-approved image or a claim about current support. Company MinIO version is unknown.

attempt-1 passed. It included two fixed-zero filesystem counters that were declarations rather than measured IO. They were removed to avoid misleading instrumentation; attempt-2 repeated the checks successfully. Preserve both runs, do not sum them to claim 56 distinct checks. No search settings were altered to improve the results. The build, dependency cache, MinIO data, generated index and executable remain in ignored work/ and .lab/ directories.

The temporary MinIO and web processes were stopped on completion. Original 127 retained Lab fixture/build/report files have unchanged hashes; original .env.local, ES and services were not modified. No public service, tunnel, paid resource or internal Harbor access. No main-Lab test suite rerun: this adds a standalone probe and documentation, not changes to main runtime behavior.

Not validated: actual Next.js module integration, Kubernetes/PVC configuration, company TLS/CSP/network or MinIO version; real authorization and client corpus disclosure; consumer API; load/size/latency; incomplete release publication, MinIO outage/restart, rollback/GC and cross-request content/media consistency.

Reproduction: docs/PAGEFIND_OBJECT_STORAGE.md and scripts/pagefind-objectstore/probe.mjs. Supply a verified local executable through MINIO_BINARY; the probe creates an isolated instance and never uses existing MinIO credentials/data. Local ephemeral secrets are generated and omitted/redacted from reports.

Public documentation checked:
- https://pagefind.app/docs/search-config/
- https://pagefind.app/docs/components/config/
- https://pagefind.app/docs/multisite/
- https://github.com/minio/minio/tree/RELEASE.2025-04-22T22-12-26Z

Important architecture correction: one durable source in MinIO can support a stateless web tier. Browser or web memory/emptyDir copies are not automatically a second durable storage system. Embedded server engines could also use disposable local copies; compare reload/resource/authentication costs instead of assuming a second backup domain.
