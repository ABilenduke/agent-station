---
name: feature-research
description: Use when a briefed GitHub issue is ready for research, when asked for a research spike, feasibility study, option analysis or business case, when a technical decision needs evidence from the codebase and authoritative sources before planning, or when earlier research turns out to be wrong. Not for writing the plan or implementing it.
---

# Feature Research

Answer the brief's research questions with evidence a later reader can check, and record the report
as the issue's `research` comment. Research happens here, against the code and opened sources; it is
never handed to an external tool to do. Read `references/feature-workflow.md` first; it is the
contract for the issue, and the repository's `AGENTS.md` wins over it.

## 1. Frame

- **From a brief:** `worklog issue section N brief` gives the research questions (RQs) and their
  tracks; they are the scope. Read the linked issues and notes the brief cites.
- **A question without a brief:** restate the decision it serves and write one to three RQs. Offer
  a `type:spike` issue for the record (`feature-brief` opens it); if the user declines, keep the
  report in chat.
- **Correcting earlier research:** read the current report (`worklog issue comment N research`),
  check the new claim against its source before changing anything, and go to step 4.
- `worklog start issue-N research --estimate <estimate>`, and record the evidence base once:
  `git rev-parse --short HEAD` and whether the tree is dirty.

## 2. Gather evidence, code first

1. **code (always):** open the files, read the lines, cite them.
2. **technical:** official documentation, standards and release notes, through Context7 or the web.
   Open each source; a search snippet is not evidence. Note the version it applies to.
3. **market and business:** vendor and product pages, public pricing, reports. Cite each claim;
   anything unsourced is inference and labelled so.
4. **Experiments** only when a result would change a recommendation: scratch directories, no
   production code, data or paid services. See `references/experiments.md`.

**Fan out when the brief has more than one track or a large code area.** Give each read-only
subagent one track or one cluster of RQs, the citation and tagging rules below, and the commit to
cite. Open every source a subagent reports before you cite it; a subagent's summary is a lead, not
a finding.

Stop when every RQ is answered, answered on conditions, or shown to need a decision or experiment
you cannot run. Never widen the scope to fill space.

## 3. Write the research comment

`worklog issue comment N research --file -` with exactly this shape. The top half must work for a
reader who skips the evidence.

```markdown
## Research: <work>

**Status:** Answered | Conditional | Unresolved · **Evidence base:** `<sha>` (dirty?) · <date>

### Summary

<Three to six sentences a non-engineer can act on: the answer, the recommendation, the confidence.>

### Answers

| RQ  | Answer | Confidence |
| --- | ------ | ---------- |

### Recommendation

<Options with trade-offs, including "no change" when viable, and why this one.>

### Risks and unknowns

### What this means for the plan

<Candidate requirements, constraints and decisions the plan must take.>

<details><summary>Evidence</summary>

#### RQ-1: <question>

- **F1** [verified-code] <claim> (`path/to/file.ts:40-52` @ `<sha>`)
- **F2** [sourced] <claim> ([title](url), accessed YYYY-MM-DD, applies to vX.Y)
- **F3** [experiment] <observation> (command and output under Sources)
- **F4** [inference] <reasoning from F1 and F2>

#### Current state

<A short map of the relevant code, every element cited `path:line`.>

#### Sources

</details>
```

- Each finding carries exactly one tag and its citation. A claim about code without a `path:line`
  you opened is not a finding; verify it or move it to Risks and unknowns.
- When the report passes the size limit, move Current state and Sources into a second comment,
  `research:evidence`, rather than dropping citations.

## 4. Correcting research

Edit the same comment in place: change the affected answers and findings, mark each revised finding
`(revised YYYY-MM-DD)`, and add a dated line under a closing `### Revisions` heading saying what the
old text said and why it changed.

When the correction reopens a confirmed decision, add it to Decisions as `Open`, with the options and
your recommendation; choosing is the user's. When a plan exists, revise it as `feature-plan`
describes: a dated Revisions line naming the correction, and each affected step marked as waiting on
the open decision. Requirement IDs stay as they are until the user decides.

## 5. Decide, then close the stage

1. **Decide.** For a feature, put the recommendation to the user (go/no-go): plan it, change the
   scope, or stop. Stopping closes the issue as not planned, with the reason in Decisions. A
   `type:spike` ends here: record the answer, and the decision it serves, in Decisions.
2. **Reusable knowledge:** offer to store findings that hold beyond this repository in the vault
   with `research-memory`; link the note under Links.
3. Links section: the research comment. Status section: next action.
4. `worklog finish issue-N research` and `worklog post issue-N`. A feature moves from
   `stage:research` to `stage:plan`. A spike moves to `stage:done` and, once the user agrees, closes
   with `gh issue close N --reason completed`.
5. Report the status, the recommendation in one line, and the next skill: `feature-plan` for a
   feature, none for a spike (a feature it leads to gets its own issue through `feature-brief`).
