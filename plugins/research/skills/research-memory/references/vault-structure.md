# Vault Structure

Detailed layout for research-memory. Folder-per-topic is the default; variants below handle edge cases.

## Standard layout

```
Research/
└── quantum-error-correction/
    ├── Quantum Error Correction.md           ← Hub
    ├── Summary.md                            ← NotebookLM briefing
    ├── Study Guide.md                        ← (optional) NotebookLM study guide
    ├── Mindmap.md                            ← (optional) Rendered mindmap + link to JSON
    ├── Insights/
    │   ├── Surface Codes.md
    │   ├── Stabilizer Formalism.md
    │   └── Threshold Theorem.md
    ├── Sources/
    │   ├── Fowler 2012 — Surface codes.md
    │   ├── Nielsen & Chuang — Chapter 10.md
    │   └── Quantum Computing Since Democritus — Lecture.md
    ├── Artifacts/
    │   ├── audio-overview.mp3
    │   ├── slides.pdf
    │   └── mindmap.json
    └── Questions.md                          ← Only if open questions >20 items; usually lives in hub
```

## Variants

### Multi-notebook topic

Some topics accumulate multiple NotebookLM notebooks over time (e.g., you research the same subject months apart with fresh sources). Keep one topic folder; track notebooks in hub frontmatter:

```yaml
notebooks:
  - id: abc123...
    created: 2026-01-15
    label: "Initial survey"
  - id: def456...
    created: 2026-04-17
    label: "Follow-up after paper X"
```

The current/active notebook goes in `notebook_id` at the top level for convenience. Artifacts are tagged by notebook in the hub's Artifacts section:

```markdown
## Artifacts

### From initial survey (abc123...)
- Audio overview: [[Artifacts/audio-overview-2026-01.mp3]]

### From follow-up (def456...)
- Audio overview: [[Artifacts/audio-overview-2026-04.mp3]]
- Briefing: [[Summary]]
```

### Nested sub-topics

When a topic grows large enough to have genuine sub-areas, promote each sub-area to its own top-level topic folder and link it from the parent hub. Do not nest `Research/parent/child/` — nesting breaks wikilinks and Obsidian's graph view gets messy.

```
Research/
├── quantum-error-correction/      ← parent
│   └── Quantum Error Correction.md   (links to [[Surface Codes Deep Dive]])
└── surface-codes-deep-dive/       ← child, top-level
    └── Surface Codes Deep Dive.md    (has [[Quantum Error Correction]] in frontmatter)
```

Use the hub note's `parent_topic:` frontmatter field to record the relationship.

### Archival

When a topic is done and you want it out of active space, move the whole folder to `Archive/Research/{slug}/`. Update the hub's frontmatter: `status: archived`, `archived: 2026-04-17`. Do not delete — future research may cite it.

## Root directory location

- Default: `Research/` at vault root.
- Override: accept `research_root=<path>` as a parameter if the user has an existing system (e.g., `Notes/Research/` or `02-Areas/Research/`).
- Always pass the resolved root through to every `obsidian` call; do not assume.

## What does NOT go in a topic folder

- **Daily notes** — stay in the user's daily-notes folder. If a research finding is mentioned there, link to the hub from the daily note, not the other way around.
- **Personal reflections** — belong in the user's existing note system, not inside research folders. The topic folder is for *external-facing* knowledge artifacts.
- **Scratch / drafts** — use a temp location. The topic folder is the durable record.

## Idempotency check

Before starting any workflow on a topic, run:

```bash
obsidian vault="<vault>" search query="path:Research/{slug}" total
```

If the count is non-zero, the folder exists — you are updating, not creating. Always read the hub note first to learn what's already there.
