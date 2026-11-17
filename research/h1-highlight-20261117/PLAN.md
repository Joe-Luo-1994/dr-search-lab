# H1 bounded highlight experiment

Frozen before execution. Tantivy 0.27.0 / Rust 1.90 / Node 22.18; existing N1 sources unchanged.

Questions: (1) does official SnippetGenerator highlight terms in original text under N1 pretokenized search semantics? (2) UTF8 offsets/HTML safe and title-only/denied cases correct? (3) what is marginal snippet scan cost for ten already-selected, authorized, resident English documents?

G1: 20 synthetic cases, manually declared expected hit/title/body terms; N1 token normalization copied exactly and hash recorded. Query AND over title OR body; space/id restriction synthetic. No phrase-query promise. Compare baseline first160 Unicode scalars vs official title/body snippets. Query membership and full original-text provenance/range/escape checks. Expected highlight mismatch remains failure, not oracle rewrite.

If G1 fails, stop candidate HTTP integration. Still allow one explicitly diagnostic native cost screen on successful English query, not end-to-end qualification. No custom Chinese highlighter, no engine/tokenizer replacement.

G2: resident English texts 1/10/100/1024 KiB approximate, batch10, baseline prefix160 vs official generator + snippets. Three blocks, 50 measured pairs each size, alternate order; 5 warm pairs per block/size; raw nanosecond timings and sampled process RSS, CPU and cgroup counters. Fixed one CPU /512MiB/no swap, <=180s. No network, metadata fetch, full search or Node/Web time in measured interval; throughput only closed-loop processing, not supported RPS. Budget reference batch P95 100ms (5% of earlier 2s research threshold), explicitly not a production SLO. Large size failure stops escalation, no retries to green.

Build <=2 CPU/2GiB/no swap/600s, cached dependencies only. Host preflight available>=8GiB, stop<6GiB; no Kubernetes/MinIO startup, no global cache changes. Disk >=10GiB. Preserve build/test failures, exact source checksums, runtime outputs and cleanup. Raw synthetic cases/code/evidence plus readable comparison published in isolated documentation/research PR; no DB/index/binary or private paths/credentials. No claims of production relevance, Chinese quality, full-stack capacity or minimum RAM.
