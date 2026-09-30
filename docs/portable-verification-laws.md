# Portable Verification Laws

**What this is.** The lessons from one production project that transfer to any other, regardless of
language, framework or host. Not stack advice — for that see `portable-playbook.md`, which covers
setup, infrastructure and CI shape (and is older; check it against this).

**Where it came from.** Roughly a year of shipping a government labour registry: 46 playbook
sections and 64 recorded patterns, distilled to the laws that earned their place by costing
something. Every one below has an incident behind it.

**Why the incidents are included.** A bare rule gets rationalised away at 2 a.m. The same rule with
the scar attached does not. *"Don't trust cached output"* loses to a deadline; *"a pre-commit guard
printed yesterday's date while today's check never ran"* does not.

---

## How to use this in another project

**Reading it is not using it.** This project already had a 1,500-line portable playbook that sat
untouched for five months while the same lessons were re-learned and written down somewhere else.
A document nobody loads drifts into fiction. So:

1. **Paste the laws into the new repo's agent instructions** (`CLAUDE.md`, `AGENTS.md`, or your
   equivalent) — not into `docs/`. That is the difference between a document and a control.
2. **Keep the group headings.** They are the retrieval index: people find a law by remembering
   *when it bit*, not by its number.
3. **Delete laws that don't apply** to the new stack. A short honest list beats a long aspirational
   one.

**Sending this outside the team?** Every law is written to be complete without its provenance line.
Strip them:

```sh
grep -v '^_Provenance:' docs/portable-verification-laws.md > laws-external.md
```

The `_Provenance:_` lines point back into a private repo (`§2ao`, story ids, commit SHAs). They exist
so an insider can audit the claim. Nothing in a law's meaning depends on them.

---

## Group 1 — Did it actually run?

The largest and most expensive class. Code that is present, tests that are green and gates that pass
all *look* like verification without being it.

### 1. A fix is not shipped until you have watched it execute on the real path
The most repeated defect class here, by a wide margin. Correct code, in the tree, reached by nothing:
a feature gated behind an `if` that never became true; a fix live on the server while the browser
was served a cached bundle; a validation rule declared in config that no code path implemented.
**Tell.** You can describe where the fix *is* but not the moment it *runs*.
**Do.** Trace to the execution point on production data. For a frontend change, grep the *served*
bundle. For a backend change, find the log line or row it produces.
_Provenance: §2b, pattern-ship-a-fix-that-never-fires, pattern-a-fix-stale-at-the-edge._

### 2. Run every guard the wrong way on purpose
Three guards written in one week could not fire at all. A guard that stays silent when abused is a
comment with a function signature.
**Tell.** You have only ever seen the guard pass.
**Do.** Point it at the thing it forbids and require a specific, named refusal. Assert the message
names the offending value — a guard whose error doesn't say *what* it refused sends the reader back
to guess.
_Provenance: §2ae. Applied when building a production-storage guard: pointed at the real production
bucket, required refusal by name._

### 3. A clean result must prove it measured something
Zero findings and zero coverage are indistinguishable in a summary line. A fraud detector reported
`0.00` for months; it was running and structurally unable to score the data it was given.
**Tell.** A zero, an empty list, or a pass with no accompanying count of what was examined.
**Do.** Make every clean result carry its denominator — *analysed 1 of 2 batteries* — or a reason
code saying why it could not measure. Then a zero says which kind of zero it is.
_Provenance: §2t, §2aa, pattern-a-clean-result-must-prove-it-measured._

### 4. When a check reports "nothing found", suspect the check first
Three separate checks lied in one week. One compared production storage against a *local development
database* and confidently listed a live record as an orphan. The query was right; the source was
wrong, which looks identical to being right.
**Tell.** A reassuring answer arriving faster or cleaner than expected.
**Do.** Confirm the check can produce a positive at all — feed it a known-bad input. Restate what
it actually compared, in nouns.
_Provenance: §2ag, §2af, §2p._

### 5. A green gate proves the cache key held, not that anything ran
Build caches replay past results. In one day: a guard printed `330 items, today the 27th` on the
28th; a docs-only push replayed an entire test suite in 3.1 seconds; and an API total identical to
the previous push meant those tests had not executed — while the database had been dead 13 hours.
**Tell.** Identical totals across two runs. A suspiciously fast gate. A date in the output that
isn't today.
**Do.** To *assert* a gate, invoke it directly, outside the cache. Quote a cached number only while
saying it is cached.
_Provenance: §2ap, §2as._

### 6. A narrowed gate can select nothing — and that looks like success
Scoping a test gate to "packages this change touches" cut 40 minutes to 95 seconds. The obvious
implementation detected changes *per package directory*, so a lockfile change — the one that swaps
dependencies under everything — selected **no packages at all**.
**Tell.** `No tasks were executed` is indistinguishable from `nothing was wrong`.
**Do.** Enumerate the change shapes and dry-run each before shipping the narrowing. Force the full
run on any file everything depends on. Make "tested nothing" impossible to reach silently.
_Provenance: §2ar. Found by dry-running each shape, not by reasoning about the filter._

### 7. An unimplemented branch fails open
A validation rule was emitted by a converter and implemented by nothing — no client, no server. The
`switch` handling rule types had no `default`, so unknown rules silently passed. 22 production rows
violated a constraint the system advertised.
**Tell.** A `switch` or lookup over a type union with no exhaustive check and no default.
**Do.** Make the unknown case loud. Where a rule is declared in data, assert somewhere that every
declared kind has a handler.
_Provenance: pattern-numeric-gate-fails-open-on-undefined; the `lessThanField` finding._

---

## Group 2 — Tests that lie

### 8. For every test, ask: would this fail if I deleted the code it covers?
A mutation test passed on the first try because two synthetic clicks let the framework flush a
re-render between them, so the second click hit an already-disabled button. The test asserted
nothing.
**Tell.** You have never seen the test red.
**Do.** Delete or invert the code and require the specific test to fail. Restore and confirm the
file is byte-identical afterwards.
_Provenance: pattern-test-that-passes-over-a-hole, §2b._

### 9. Account a test-count delta from the runner, never from a grep
A source-level grep for test declarations undercounts, because table-driven helpers expand one line
into many cases. A confident "+4 unaccounted" was a counting error in the accounting.
**Tell.** A delta you cannot explain file by file.
**Do.** Diff the runner's own per-file output against a known baseline. An unexplained delta is
unrecorded work until proven otherwise.
_Provenance: §2ah, §2an._

### 10. Quote the whole suite, never a subset — and never pipe it through a pager
Piping a suite through `grep` or `tail` destroys the evidence you will need in ten minutes, and
reports a number that isn't the suite's. Once, it destroyed the only capture of a flake.
**Tell.** Your quoted figure came from a filtered stream.
**Do.** Write the full output to a file; grep the file.
_Provenance: feedback-quote-the-suite-total-never-a-subset._

### 11. Do not fix a flake you have not reproduced — and do not dismiss one either
Two tests failed in a suite run. Re-run alone: one passed (contention), one failed again and was a
real latent defect racing a 1-second budget. Same symptom, opposite causes.
**Tell.** A failure you are about to explain without having read its message.
**Do.** Capture the message, then re-run the file **alone**. Passes alone ⇒ environment. Fails
alone ⇒ real. A flake can also be a production bug wearing a costume.
_Provenance: §11c, pattern-flaky-test-hiding-a-prod-bug._

### 12. Async helpers carry their own timeouts that the global one does not govern
A test framework's global timeout was 10 seconds; its DOM-query helper defaulted to 1 second, and
the whole budget went on a cold render. It failed as a *missing element*, which reads like a selector
or logic bug, and it cost a push.
**Tell.** A "not found" failure whose reported duration sits near a round number.
**Do.** Check the helper's own default before touching the component. Pass the budget explicitly —
and verify you passed it in the right argument position by setting it to 1 and requiring red.
_Provenance: pitfall-asyncutiltimeout-not-governed-by-testtimeout._

### 13. A baseline sampled from your working tree is not a baseline
Measuring "before" against a tree that already contains your change reports the change as having no
effect.
**Do.** Take baselines from committed history (`git show <ref>:<path>`), or from a clean checkout.
_Provenance: pattern-baseline-sampled-from-the-working-tree._

### 14. Test the payload the client actually builds, not the one the schema describes
A request test constructed its body from the API contract and passed, while the real client sent a
differently-shaped object that the endpoint rejected in production.
**Do.** Derive request fixtures from the calling code, or share the builder between client and test.
_Provenance: §2ak, pattern-request-test-from-the-schema-not-the-caller._

---

## Group 3 — Records that disagree with the work

### 15. A record about the work is not the work
A story's account of itself, a runbook's description of a procedure, a comment's claim about the
code: all drift, and all get believed. One briefing promised field staff that the app captured
location automatically, months after that had stopped being true.
**Tell.** You are about to report what a document says rather than what the system does.
**Do.** Read the artifact back after writing it. Render the document that gets distributed and look
at it. In scripted edits, assert the match before replacing.
_Provenance: §2w, pattern-a-record-about-the-work-is-not-the-work._

### 16. A decorative tick can close a tracking row
A status table's closure detection matched a ✓ anywhere in the state cell. A row reading *"still
OPEN — awaiting retest"* counted as closed because a tick decorated a sub-point. Four rows did this;
the fourth was written **inside the edit that added the warning about it**.
**Tell.** Your tracker infers state from free text.
**Do.** Know your tracker's closure vocabulary and keep it out of open rows — use bold `MET` /
`NOT MET` for sub-points, never a tick. **Read every row back after editing.** And never trust a
guard's summary line: it may only check rows already marked done.
_Provenance: §2ao, pitfall-tick-in-state-cell-disarms-a-residual._

### 17. A review may propose a closure; only the principal signs one
Three artifacts once asserted a decision the owner had not made — one of them in a document that was
normative. The defect is the *signature*, not the decision.
**Do.** Give every ruling a two-part attribution: who produced the evidence, who decided. Write
proposals as `OPEN — closure proposed, awaiting ruling`. Apply the format to *every* row, so its
presence isn't itself a signal.
_Provenance: §2al, pattern-a-review-cannot-sign-a-closure._

### 18. An inherited hand-off is a gate item, not a note
Work passed from one unit to another gets dropped silently, because neither side's checklist owns it.
**Do.** When scope moves, the receiving item gains an explicit acceptance criterion, and the sending
one keeps a pointer until it is verified shipped.
_Provenance: §2ad._

### 19. A change can make an existing procedure unsafe
Adding a child table broke a teardown runbook that deleted parents — discovered in production. The
code change was correct; the *procedure* silently wasn't.
**Tell.** You added a dependency, constraint or step that an existing document doesn't know about.
**Do.** Grep the runbooks for operations on what you changed. A deploy can invalidate a document
nobody edited.
_Provenance: pattern-a-deploy-can-make-a-runbook-unsafe._

### 20. A gate that misreports what it is about to do is already broken
A hook printed "running full suite" three lines before correctly announcing it was running a subset.
Harmless in effect; the same defect class as a lying record.
**Do.** Announce a decision where it is made, not where you assumed it earlier.
_Provenance: the banner fix, §2ar._

---

## Group 4 — Measurement and inference

### 21. Measure before agreeing that a fix is small
Two findings looked like one-line patches. One read-only query changed the verdict on both: one
turned out to involve 12 real citizens and belonged to leadership, not engineering; the other had a
semantics trap that would have rejected 43 legitimate records.
**Tell.** You are estimating effort before counting what is already through the hole.
**Do.** Ask "how many rows are already affected?" It is one query, it is free, and it reassigns
both severity and owner.
_Provenance: §2aq._

### 22. Predict the number, then compare
Writing the expected result down before running the check is what converts a query into evidence.
Without it, any output looks like confirmation.
_Provenance: pattern-predict-then-compare._

### 23. A threshold is only valid for the data it was measured on
A quality threshold set from sample data flagged the first real measurement that arrived. Two
readings are not a distribution either.
**Do.** Record which dataset a threshold was calibrated on, and re-base it when the data source
changes.
_Provenance: §2r._

### 24. A number consistent with both outcomes proves neither
"The request succeeded" is equally consistent with a working counter and a no-op one.
**Do.** Assert the mechanism, not the outcome — read the counter's *value*, not the response code.
_Provenance: §2aa._

### 25. Classify before you escalate — and before you dismiss
The same discipline stops both panic and complacency. An alarming symptom can be benign; a boring
one can be an incident.
**Do.** Name the class first, cheaply, then act. A 13-hour-dead container and a broken dependency
upgrade produce identical test output.
_Provenance: §2k._

### 26. A diagnostic is a claim — gate it on evidence
"It's probably the cache" spends someone's afternoon. Four hypotheses died in one measurement each
before the real cause surfaced, and the symptom had named it from the start.
**Do.** State diagnoses with the evidence attached, or mark them explicitly as guesses.
_Provenance: §2l._

### 27. When blocked on a measurement, try taking it first
"I cannot know until X" is often false: read-only access usually exists, and the answer is minutes
away.
_Provenance: pattern-blocked-on-a-measurement-means-try-first, feedback_verify_against_reality._

### 28. A monitor can be measuring something else
A dashboard that tracks a proxy for the thing you care about will be green through the failure it
was built for.
**Do.** Verify the monitor moves when the real condition occurs.
_Provenance: pattern-monitor-measuring-something-else._

---

## Group 5 — Scope and blast radius

### 29. Fix the class, not the cohort in front of you
Repeatedly the most expensive habit: repairing the instance and leaving the pattern. When you fix a
shared derivation, grep for its siblings — and report the count even when it is one.
**Tell.** Your fix names a specific record, batch or user.
**Do.** Ask what else reaches this code path, and sweep. Count *sites*, not callers — one file can
hold several.
_Provenance: §2o, §2ac, pattern-census-counts-sites-not-callers._

### 30. A wrong filter fails permissively
An incorrect exclusion lets rows through, and the result looks like a healthy population. Inferring
impact from code structure rather than from data is how that gets missed.
**Do.** Validate filters against counts from the other direction — how many did it exclude, and are
those the right ones?
_Provenance: §2x._

### 31. Committed is not shipped; and read a destructive command's blast radius before running it
Separate facts, same root: assuming a state you haven't verified. Committed, pushed, built, deployed
and *served* are five different things.
**Do.** Verify the last one. Before any delete, look at exactly what matches.
_Provenance: §2y._

### 32. A batch job runs against a system with people in it
A backfill races live users, and the rows move under it.
**Do.** Bound batches, make them resumable and idempotent, and re-measure the target population at
run time rather than inheriting a count from the plan.
_Provenance: §2n, pattern-batch-job-races-live-users._

### 33. A proxy is not the thing
A shared IP is not a person. A phone number is not an identity when a household shares a handset. A
predicate that stands in for what you mean fails in *both* directions — false matches and false
misses.
**Do.** Name what you actually need to distinguish, and refuse to guess when the data cannot.
_Provenance: §2z, pattern-a-shared-ip-is-not-a-person._

---

## Group 6 — Environment and dependencies

### 34. Check the environment is alive before believing a failure
98 test failures looked exactly like a dependency upgrade breaking uploads. The database and cache
had exited 13 hours earlier.
**Tell.** Widespread failures with connection errors, and every integration test dying in setup.
**Do.** Put a liveness check in the start-of-session ritual. Infrastructure absence is invisible
until a suite blames your code for it.
_Provenance: §2as._

### 35. Read a dependency's implementation before trusting its documentation
A library's own comment described behaviour its code did not have; a configuration option was
consulted only when a *second*, undocumented option was also set. A correct-looking fix was dead
code until someone read the dependency's source.
**Do.** For anything load-bearing, read the implementation. Version-pin what you read.
_Provenance: §2v; the rate-limiter option that needed a companion flag to take effect._

### 36. An `await` outlives every exit you wrote
Code after an `await` resumes even when the user has navigated away, cancelled, or discarded the
work. One such resumption queued an interview the respondent had explicitly withdrawn.
**Do.** After every `await` in a user-cancellable flow, re-check that the thing you are about to
write still exists and is still wanted. Set the cancellation flag *before* the first `await`.
_Provenance: pattern-an-await-outlives-every-exit; the discard-during-capture finding._

### 37. A newly published advisory can block a deploy on code nobody touched
A deploy failed on four CVEs in dependencies that had not changed. This will happen on a quiet
Tuesday, and it will look like your change broke the build.
**Do.** Read the *gate's own* output carefully before acting — one advisory affecting two packages
was counted once and printed twice, and suppressing the phantom would have hidden a reporting bug in
a security gate instead of a risk. Prefer bounded same-major bumps; reserve accepted-risk entries
for things with no fix, and make them say why.
_Provenance: audit-gate-osv-scanner, feedback_prod_audit_root_cause_and_bounded_overrides._

---

## The one-line version

If you remember nothing else: **a pass is a claim, and most claims here failed because nobody asked
what would have made them fail.** Every law above is a specific way of asking that question.
