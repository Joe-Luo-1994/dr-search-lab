# E1 independent source oracle

2026-11-15. Reviewer-authored from fixture/source.json and CONTRACT.md only. No engine output, search execution, API response, or provider implementation was consulted. Main agent confirmed the request/expect/chain schema and the technical-code decision before this artifact was written.

## Frozen inputs

- source SHA-256: `0c70c490dd2798054063f56685f83c1783a030ea312cae4656894b977484cada`
- contract SHA-256: `a096971b78a33ae1c69f7e9536ce69729053e257ea340378cc3f908ba2de55f2`
- 37 source pages, two media records, 23 task cards: 12 required + 7 negative + 4 diagnostic.
- Cases contain multiple HTTP steps where a complete task or an authorization boundary requires them. Do not report these steps as additional independent tasks.
- PDF expectations are the fixed source media bytes/hash declarations. The fixture directory contained no original PDF files at oracle preparation time. Inspect produced source PDF format/bytes and independently hash delivered bytes before claiming PDF delivery passed.

The oracle is not an execution authorization or a completed execution card. Source or contract changes require an explicit new oracle version and review; do not silently refresh hashes.

## Runner schema agreed with main agent

`cases` contains 19 ordinary cards. `driftCases` contains four diagnostic cards; include these in the count of 23. Each card has `id`, `kind`, `request: {path, identity}`, `expect`, and a source-based `rationale`. Query strings are already URI-encoded. Send identity in x-e1-identity; never pass the oracle's expected identities or page sets into the server.

- `expect.status` always applies.
- `requiredPageIds` must appear in the returned first page, maximum 10 hits.
- `forbiddenPageIds` must not appear. Global identity/Space/metadata-tag checks additionally apply to every returned hit.
- Assert `total` only when explicitly supplied. Integer/nonnegative shape, authorization and filter obligations always apply. Chinese and technical-code cards do not force identical engine hit sets or ranks.
- `errorCode` means exact error-only JSON shape; reject extra content/metadata that discloses denied resources.
- `pageId` identifies the expected exact page projection from `expectedPages`, or the canonical page for a media-list response. Body is the source paragraphs joined with LF.
- `mediaIds` checks exact membership, without imposing array order. Media metadata comes from `expectedMedia`; URL must be page-scoped.
- `mediaSha256` and `mediaBytes` apply to independently hashed/measured downloaded bytes. Require PDF Content-Type and inline filename.
- `chain` is an ordered array of subsequent request/expect steps within the same task. A chain failure fails the task; an initial search success alone does not pass it.
- `observations` records semantic differences, not extra pass gates.

Run common `responseInvariants` for every applicable successful response, including chain steps and diagnostics: snapshot markers, actual authorization timestamp, no-store, source title/Space/tags/body/metadata, snippet rule, all returned hit permissions and duplicate prevention. Tag order is immaterial. Do not validate only the designated target hit.

The snippet reference rule is contractual and source-based: consider source body paragraphs, then PDF lines in the page's source media order; select the first line containing any whitespace-split original q word case-insensitively, otherwise the first paragraph; take at most 160 Unicode code points. This is not an engine ranking/tokenization oracle.

`authorizationCheckedAt` must be an ISO time within observed actual request bounds. Synthetic drift timestamps are separate scenario labels, never an expected replacement for this actual field.

## Source reasoning and explicit limits

R01/R02/R05 require the directly relevant Chinese or mixed-language page without claiming universal token equivalence. R03/R04/R07/R08/R09/R10/R11/R12 use unambiguous literal English-word source membership where total can be independently enumerated.

R09 is the required synthetic consumer chain: silverline certificate -> a-pdf -> original page body -> page-scoped media list -> PDF bytes/hash. Both words occur only in the linked PDF for a-pdf itself, whose title/body have neither query word. a-pdf-near also contains both words in a negative sentence, so it is a valid lexical AND match; total is 2 and near is not forbidden. Record its rank/presence as an experience difference, not a keyword-engine failure.

### Revision 2: pre-execution oracle correction

The initial oracle SHA-256 was b2e1da0ff08b666223833749a54552e01f996f8d93e33e936da017bd2b6d81c4 (initial ORACLE.md SHA-256 6af54c8c3ba1e5b687f40231eb194f8918abfac41ac05a99c836351b03d964c9). Main-agent independent source review correctly found that the sentence `does not contain the certificate` still contains the token certificate. The reviewer had incorrectly imposed total=1 and forbidden a-pdf-near. Revision 2 changes total to 2, removes that prohibition, and retains a-pdf as the required result and full PDF chain. Source is unchanged; no engine query or result informed the correction. The previous wrong expectation and its reason are preserved here rather than described as an engine failure.

The contract hash also changes because the implementer disclosed C's per-query bounded child process and excluded capacity/cost inference. This is a runtime limitation disclosure, not a search-semantic change. Other explicit positive/diagnostic English total assertions were independently re-enumerated from frozen source words/Space/tags; no additional mismatch was found. This source audit does not execute either search provider.

R04's identity changes from a to all, with b-relay explicitly forbidden and total remaining 1. This makes the existing zephyr-only b-relay visible and therefore a real partial-term counterexample to the query zephyr primary; previously authorization alone excluded it. This avoids losing AND discrimination after correcting R09, without adding a case, changing source, or consulting results. The main agent must check this oracle amendment before freeze.

R11 reuses one case to exclude single-tag pages, tags appearing only in body text, and an unauthorized Space. This avoids three duplicate tasks while keeping all exclusion obligations explicit.

R12 has 15 visible literal relay matches: a-relay plus a-noise-01 through a-noise-14. a-relay's title and body directly address relay fault work; the other matches are incidental historical mentions in unrelated jobs. Require the relevant page within the first 10, not rank one. This is a deliberately constructed discriminating fixture, including repeated title text, not representative production ranking evidence.

**GTX-412 decision:** the main agent explicitly declined to add a complete-code exact-match promise. R06 requires a-code to be findable and records a-code-near's presence/rank as a semantic difference. a-code-near contains GTX-413 and a separate 412, so analyzer token AND may include it. It is not forbidden by this oracle. Formal technical-code strictness remains unknown and must be stated in the result card; no owner acceptance is implied. This decision preceded any engine result inspection. CONTRACT now states engine token AND rather than the briefly proposed adjacent-token rule.

## Fault and drift sequencing

N07 uses setup.fault=provider-unavailable and requires a real isolated search-provider dependency failure. The main agent selected B: restart only this experiment Next on 3157 with ES_URL pointing to verified unlistened loopback 19390; C: temporarily rename only the new isolated runtime search.sqlite, then restore in finally. The execution card must freeze and the runner must verify injection, restoration and isolation. Returning a synthetic error from the adapter does not establish this case. While search fails, the chain still requires local a-relay body to succeed. Restore before any later card.

Each diagnostic resets to the stated role profile. For D02, run its `baseline` request before applying `setup.roleProfile=revoked-b`, then run request/chain and restore baseline afterwards. all's permissions are independently unchanged; revocation only changes b.

Drift uses fixed labels:
- snapshot cut: 2026-11-15T08:00:00.000Z;
- simulated source/role change: 2026-11-15T09:00:00.000Z;
- simulated now: 2026-11-16T12:00:00.000Z;
- calculated snapshot age: 100800 seconds (28 hours);
- calculated time since change: 97200 seconds (27 hours).

These labels do not advance the real machine clock and do not represent 27/28 hours of actual testing. Record real request timing separately. For D01 and D03, the fixed snapshot policy permits output that the simulated current relationship would forbid: record that exposure explicitly, not as current-permission safety success. D02 expects immediate denial after the runtime profile changes, but proves no company ReBAC revocation latency. D04 has no known current-source content, so only retained capture time/age is known, not actual content divergence. No real sync failure or installer is executed by these labels.

## Review and execution gates

Before execution, the main agent must independently check this reviewer's oracle against source/contract, including schema coverage in the runner, top-10 discriminating count, membership exclusions, expected PDF bytes/hash, and drift arithmetic. Reviewer authorship is independent of provider implementation, not an independent review of this oracle itself.

The draft execution card sets every request through full body, including PDF, to 5 seconds; API chains to 15 seconds; browser tasks to 30 seconds; full-run watchdog to 900 seconds. Freeze these deadlines, resource safeguards, N07 injection/restoration, output locations and timestamp validation before execution. The new Windows Node/Next/ES runtime is a separate environment from historical WSL; do not compare its times or costs as an engine ranking against old results.

No service or search was started to produce these files. Source semantics can support this oracle; formal consumer compatibility, real user usability, ReBAC behavior, network recovery and relative total cost remain outside this evidence.

