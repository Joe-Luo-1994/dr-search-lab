# Non-author design review

Reviewer: separate fresh-context agent r_diagnostic_review, requested gpt-6.1-sol/high. This is agent review, not an external reviewer or stakeholder acceptance. The reviewer did not run tests or services.

Verdict: six predeclared serial L/R full/count-only/rank-only cells are sufficient for a first 10k phase diagnosis, subject to code gates.

Required gates supplied to implementer before execution:

1. Preserve original combined statement preparation and full search order. Bracket prepare/count/rank/materialization/highlight. Isolated rank must return at SQL completion, without materialization/highlight. Validate raw rowids/Space/matching/hit count from corpus and compare ordered L results. Split timings cannot be added: rank-only lacks count's cache warmup.
2. Capture proxy task/phase at request start, not end. Abort/settle prior-worker requests after deadline before next cell. Mark unknown/background association and incomplete phases. Bound logging overhead; acknowledge transport/instrumentation differences.
3. Global/resource stops must cover publisher, hashing and networking, not only readers. Bind all ports to loopback. Preserve source SHA and separately record WAL-converted producer/raw SHA. Compare complete published object set including raw DB and attachment. Direct-IPC measurements, if used, are worker diagnostics rather than comparable HTTP latency.

Specific draft finding: rank-only originally included by-row fetch/highlight. That would confound the isolated rank timeout. Correct before code freeze; this is an implementation defect found before measurement, not an experimental result.

Frozen draft code review completed before execution. Rank-only isolation, source immutability, loopback binding, complete object inventory and original query semantics were confirmed. Two material corrections requested:

- Replace per-range synchronous start/end file writes with bounded batch records, preserving capture timestamps and flushing on timeout/global-stop. Otherwise the new logging can itself load the proxy/timer event loop.
- Treat MinIO's unexpected exit after ready as a run-wide failure, with a guarded exception for deliberate teardown, rather than allow it to appear as an R query deadline.

Parent will check these small changes before execution. No change to original smoke failure or permanent rules.

Both corrections were implemented, re-frozen and parent-checked before the only execution. Syntax and17frozen hashes passed. Non-author outcome review was then requested, but failed with the platform message `You've hit your usage limit`. It did not deliver an outcome review. No retry or replacement agent was launched to bypass the limit. `POSTRUN_AUDIT.json` is a separate parent raw-record audit, not independent approval.
