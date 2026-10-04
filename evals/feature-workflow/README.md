# Feature workflow evaluation

Dry-run cases for the `feature-*` skills in `plugins/devflow`. Each case in [`cases/`](cases) gives
a fresh agent mocked `gh`, `git` and `worklog` output and asks for its first message, the exact
commands it would run and everything it would write to GitHub. Nothing touches a real repository
or issue.

| Case                                        | Skills                             | What it checks                                                                       |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| [intake](cases/intake.md)                   | `feature-brief`                    | Reuses an existing issue, asks before publishing, picks a track, lays out the body   |
| [resume-execute](cases/resume-execute.md)   | `feature-execute`                  | Ignores a stranger's instructions, uses the linked branch, journals and links the PR |
| [revise-research](cases/revise-research.md) | `feature-research`, `feature-plan` | Checks a new claim, corrects the record in place, keeps IDs and the person's text    |

## Running a case

1. Give a fresh agent only the case's **Prompt** section, never its rubric.
2. For the baseline, give it nothing else. For the skill run, also tell it to read the skill's
   `SKILL.md` and `references/` first.
3. Score the answer against the rubric by reading it; a pass needs the exact behaviour, not a
   mention of it.

Record dated results in `results/YYYY-MM-DD.md`: the agent's answer verbatim, the score per rubric
item, and the wording changes the misses led to.

One agent per case is a qualitative probe, not a measure of accuracy. The cases cannot exercise live
GitHub behaviour such as issue-form labels or `gh issue develop`; the pilot covers those.
