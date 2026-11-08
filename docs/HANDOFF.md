# DR Search Lab — agent handoff

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
