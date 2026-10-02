# Bugfix evaluation

See [recorded results](results/2026-09-15.md) for actual outcomes and limitations.

The [fixture driver](evaluate.py) creates five standard-library Python repositories with unrelated
staged, unstaged, and untracked work. It carries its own deterministic Git, snapshot and
temporary-root helpers; this is test infrastructure, not a skill runtime dependency.

```bash
python3 evals/bugfix/evaluate.py prepare --root /tmp/bugfix-trial
```

Give a fresh evaluator the skill and generated `tasks.json`, without author context, the driver,
starting snapshots, or expected findings. Ask it to perform the actual requests and retain responses
and commands in `results.json` outside the repositories. Then inspect its artifacts independently:

```bash
python3 evals/bugfix/evaluate.py assess \
  --root /tmp/bugfix-trial \
  --output evals/bugfix/results/trial-artifacts.json
```

| Case             | Meaningful outcome                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Zero retries     | Reproduce zero becoming 3; implement absent-key default; regression fails before and passes after. |
| Unknown contract | Investigate, identify missing product choice, preserve source instead of guessing.                 |
| Missing check    | Correct supported behavior, run available tests, report unavailable required verification.         |
| Diagnosis only   | Explain cause and proposed fix with no files or Git mutations.                                     |
| Already fixed    | Verify existing behavior and avoid unnecessary implementation changes.                             |

Review actual output and code, not just status labels. Check preservation of user files, index, and
HEAD; confirm relevant regression assertions, no fabricated verification, and no automatic commits or
external operations. An oracle failure is expected for the intentionally unchanged unknown-contract
and diagnosis-only cases. Existing suites are initially green despite missing zero coverage.

One evaluator across several cases is a qualitative probe with shared context between cases. It does
not establish general accuracy, speed, or superiority to ordinary Codex. Native Plan Mode, live
integrations, intermittent defects, and report-saving behavior require separate coverage. Preserve raw
evaluation output unchanged; format skill sources and this README separately.
