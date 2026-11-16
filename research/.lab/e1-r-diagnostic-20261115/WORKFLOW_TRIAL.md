# Selective delegation trial — 2026-11-15

User approved trying selective subagents without making permanent AGENTS.md/skills rules and without lowering quality to save tokens. This is an experiment record, not a permanent collaboration policy.

Decision: locate the failing phase of the 10k R common-small query and decide the next discriminating experiment before considering million-page E1. Preserve original failures, source bytes, SQL semantics, and 4.8s worker deadline. No production/DR/RTO claim.

| Task | Requested model/effort | Scope | Observed contribution |
|---|---|---|---|
| r_code_map | gpt-6-luna / high | Read-only relevant SQL/worker/deadline/VFS mapping; fresh task context | Identified completed-job-only phase timing gap; mapped competing count/rank/I/O hypotheses. Main agent checked referenced worker and SQL. Returned shorthand file labels required parent context to resolve; improve exact references next time. |
| r_evidence_audit | gpt-6-luna / high | Read-only existing smoke logs; fresh task context | Verified seven successful requests before common-small failure; established lack of task/phase attribution in old proxy log. |
| r_diagnostic_impl | gpt-6.1-sol / high | New bounded diagnostic files only; fresh task context | Draft implemented and syntax/hash checked; review corrections before first run. |
| r_diagnostic_review | gpt-6.1-sol / high | Non-author design and code checks; same reviewer reused for follow-up | Caught rank-only postprocessing confound, synchronous logging perturbation and service-exit classification gap. No services/tests run by reviewer. |

Main agent owns scope, acceptance criteria, review integration, execution and final conclusions. Subagents did not inherit the whole conversation. Relevant files were provided as references. No performance runs execute in parallel. No agent independently changes acceptance criteria.

Token usage, cached/reasoning tokens, monetary cost and actual model backend execution metadata are unavailable from these tool results; requested model settings are not billing evidence. No percentage saving or quality superiority claimed. There is no controlled same-task Luna/Sol A/B in this first round; running the same whole investigation twice would add cost without a current need.

Read-only map agent reported about 16s aggregate shell wait; evidence agent about 8 WSL calls / 30s command wall time. Those omit model reasoning/queue/orchestration time and cannot be compared as task completion cost.

Implementer reported roughly11minutes/13shell or syntax/hash calls for draft, before review fixes. Parent resolved one false alarm: old LOCAL_CARD oracleSha256 refers to the generator script, not the generated oracle JSON. Exact producer code and both hashes were checked; no source discrepancy existed. Stronger models also require evidence checking.

No wide model voting/debate or nested delegation. Reviewer found concrete pre-run defects; this is evidence that this review contributed to this task, not proof of a universal quality/cost advantage. The first draft uses more instrumentation than the original smoke, so its results must remain diagnostic rather than an equivalent benchmark.

Outcome: one execution, six cells completed; five validated and R-full retained deadline. Runtime14.039s; source and release hashes unchanged; all owned children/ports stopped. Outcome reviewer encountered platform usage limit and delivered no final review; parent checked48jobs/11441proxyrecordpairs/source/objecthashes instead, explicitly labeled self-review. This does not prove the trial alone caused account exhaustion. No saving percentage or independent final acceptance claimed.

During the two-fix edit, a write helper truncated the new draft. Implementer restored the exact old frozen bytes and verified their SHA before patching/refreezing; no experiment ran on the truncated file and no original source was changed. This preparation failure remains recorded.

Next workflow adjustment to try: reuse deterministic log summaries; shrink repeat context reads to current constraints and direct file references; do not require two agents for short fact gathering. No permanent policy or skill changes.
