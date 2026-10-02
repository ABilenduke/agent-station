---
name: research-memory
description: Durable research memory that round-trips between Obsidian and NotebookLM without losing information. Use whenever the user wants to turn research into permanent vault notes, prepare a NotebookLM notebook from vault material, pull NotebookLM artifacts (briefings, study guides, audio overviews, mindmaps, podcasts) back into Obsidian, build a topic knowledge base, capture evergreen notes, archive research into their vault, or create NotebookLM source packs from folders. Trigger even when the user does not name both tools explicitly — phrases like "save this research to my vault", "turn my notes on X into a notebook", "make a podcast from this folder", "pull the notebook back into Obsidian", "create evergreen notes from this", or "build a project knowledge base for X" all apply. Obsidian is the long-term system of record; NotebookLM is the synthesis engine. This skill defines the conventions that make the round-trip non-lossy.
---

# Research Memory

An orchestrator skill. It wires together the `notebooklm` and `obsidian-*` skills into three research workflows, and it defines the vault conventions that make research reusable across sessions rather than trapped in a one-off notebook.

**You do not reimplement NotebookLM or Obsidian mechanics here.** Call the existing skills for that:

- `notebooklm` — create notebooks, add sources, generate and download artifacts. Always already authenticated; if not, run `notebooklm login`.
- `obsidian-cli` — read/write files in the user's vault, search, manage properties. Always pass `vault="<name>"` as the first parameter.
- `obsidian-markdown` — Obsidian Flavored Markdown conventions (wikilinks, callouts, frontmatter).
- `defuddle` — extract clean markdown from web URLs before handing them to NotebookLM or saving as source notes.

This skill's job is the **conventions and orchestration** that sit on top.

## When to invoke

Invoke on any request that involves structured research capture, notebook preparation, synthesis, or archival into an Obsidian vault. Concrete triggers include:

- "Research X and save it to my Obsidian vault"
- "Turn my notes on Y into a NotebookLM notebook"
- "Create a NotebookLM source pack from this folder"
- "Make a podcast briefing from this research"
- "Pull the NotebookLM outputs back into Obsidian"
- "Save this summary, source list, and follow-up questions into my vault"
- "Create evergreen notes from this research"
- "Build a project knowledge base for this topic in Obsidian"

If the user says something that sounds research-adjacent and mentions either tool, default to invoking. Undertriggering is the bigger risk than overtriggering — the skill is cheap to consult.

## Required parameters

Always resolve these before starting:

1. **Vault name** — the user must specify. If they don't, ask once. Never assume or default. The skill is vault-agnostic; the vault belongs to the user's current project, not to the skill. Pass as `vault="<name>"` to every `obsidian` call.
2. **Topic** — the research subject in natural language. You will derive the slug from it.
3. **Scope** (infer from context, confirm if ambiguous):
   - `prepare` — Obsidian → NotebookLM
   - `capture` — NotebookLM → Obsidian
   - `round-trip` — full cycle
4. **Mode** (optional, defaults to `execute`):
   - `execute` — do the work and report what was done
   - `dry-run` — emit a structured plan (see § Plan contract) without executing any writes. Use when the user asks to "preview", "show what you'd do", "dry run", or when you're uncertain about a destructive update.

## The three workflows

### Prepare — Obsidian → NotebookLM

Gather vault material and external URLs into a new (or existing) NotebookLM notebook so it can synthesize.

1. Resolve the topic slug (see § Naming).
2. Gather vault sources:
   - If user pointed at a folder: list its notes via `obsidian search` or `obsidian vault="..." search query="path:Research/{slug}"`.
   - If user pointed at specific notes: read each via `obsidian read`.
   - If a hub note exists at `Research/{slug}/{Topic}.md`, read it and follow its wikilinks to pull referenced notes.
3. Gather external URLs the user mentioned. For each, run `defuddle` to produce clean markdown.
4. Create the notebook: `notebooklm create "Research: {Topic}" --json` → capture `id`.
5. For each vault note, write a temp `.md` file with the note's content plus a front-matter header identifying its vault path. Add via `notebooklm source add ./tempfile.md --notebook <id>`.
6. For each URL, add directly: `notebooklm source add "<url>" --notebook <id>`. (NotebookLM fetches URL content itself; the defuddle extraction is for *Obsidian* archival, not for NotebookLM.)
7. Wait for sources to be ready — spawn a subagent with `notebooklm source wait` calls (see the `notebooklm` skill's "Bulk Import with Source Waiting" pattern). Don't block the main conversation.
8. Record the notebook ID in the hub note's frontmatter (`notebook_id: <id>`) so future runs find it.

Do **not** generate artifacts in this workflow unless the user asked for them. Prepare ends when sources are loaded and indexed.

### Capture — NotebookLM → Obsidian

Pull NotebookLM outputs (new or existing) into the vault as durable notes.

1. Resolve the target topic + slug. If a hub note already exists at `Research/{slug}/{Topic}.md`, you will update it in place, not duplicate it.
2. Resolve the source notebook: either the user named it, or read `notebook_id` from an existing hub note's frontmatter, or use `notebooklm list` to find it.
3. For each artifact to capture (audio overview, briefing doc, study guide, mindmap, quiz, etc.):
   - Download to a temp path via `notebooklm download <type>`.
   - Convert to an Obsidian note per § Note templates.
   - Write into the correct subfolder per § Vault structure.
4. Extract source list from the notebook (`notebooklm source list --json`). For each source:
   - If it was a URL: create `Research/{slug}/Sources/{source-slug}.md` using the source note template. Preserve URL, access date, title.
   - If it was a vault note originally: do not duplicate — the hub note already links to it. Note the back-reference in the source's own frontmatter if practical (`referenced_in: [[{Topic}]]`).
5. If the user asked for atomic evergreen notes: read the briefing or study guide, identify distinct concepts, write one `Research/{slug}/Insights/{Concept}.md` per concept. Each insight links back to `[[{Topic}]]` and cites its source. Default to evergreen mode — only use bundled `Insights.md` if the user explicitly asks for the simpler single-file form.
6. Update the hub note:
   - Frontmatter: refresh `updated`, `notebook_id`, `artifacts` list.
   - Body: ensure the "Insights," "Sources," "Artifacts," and "Next actions / Open questions" sections are present with wikilinks to everything created.

Idempotency matters. If a hub note exists, update it. If a note with the same target path exists, append or merge — do not create `{Topic} (2).md`.

### Round-trip — full cycle

Combines prepare + capture for when the user starts from raw curiosity:

1. Create the topic folder and a stub hub note (if none exists yet).
2. Run **Prepare** (pulling in any existing vault material + user-supplied URLs).
3. Generate the artifacts the user asked for (briefing, study guide, audio, etc.) — defer the long-running ones to a subagent per the `notebooklm` skill's patterns.
4. Run **Capture** once artifacts are ready.
5. Finish by reading back the hub note path so the user can jump in.

## Vault structure

Folder-per-topic. One root research directory. Never flatten multiple topics into one folder.

```
Research/
└── {topic-slug}/
    ├── {Topic}.md              ← Hub / MOC. Canonical note named after the topic.
    ├── Summary.md              ← NotebookLM briefing doc, converted.
    ├── Study Guide.md          ← Optional. NotebookLM study guide, converted.
    ├── Mindmap.md              ← Optional. Mind map rendered as nested list + link to source JSON.
    ├── Insights/               ← Evergreen atomic notes (one concept per file). Default mode.
    │   ├── {Concept A}.md
    │   └── {Concept B}.md
    ├── Sources/                ← One note per external source.
    │   ├── {Source Title}.md
    │   └── {Source Title}.md
    ├── Artifacts/              ← Binary or large files: audio.mp3, slides.pdf, mindmap.json.
    │   └── audio-overview.mp3
    └── Questions.md            ← Open questions + next actions. (Lives alongside the hub.)
```

### Mode variants

- **Evergreen (default):** `Insights/` folder with atomic notes.
- **Bundled (only on request):** replace `Insights/` with a single `Insights.md` containing all distilled ideas as H2 sections. Still generate source notes normally.

See `references/vault-structure.md` for the full layout with edge cases (multi-notebook topics, nested sub-topics, archival).

## Naming and idempotency

- **Topic slug**: lowercase kebab-case of the topic title. `"Quantum Error Correction"` → `quantum-error-correction`. Used for the folder name only.
- **Hub note**: titled with the natural-language topic ("Quantum Error Correction.md"), not the slug. The file lives at `Research/{slug}/{Topic}.md`. This gives Obsidian a clean wikilink target (`[[Quantum Error Correction]]`) while the folder stays URL-safe.
- **Insight notes**: title is the concept itself ("Surface Codes.md"), not prefixed with the topic. Evergreen notes should be reusable across topics; a prefix defeats that.
- **Source notes**: title derived from the source's own title, sanitized for filesystem (`:` → ` —`, trim to 80 chars). If the same URL appears in two topics, reuse the same source note — link it from both hub notes.

Repeated runs on the same topic **update in place**. Before creating any note, check:

```bash
obsidian vault="..." read file="{Topic}"           # hub exists?
obsidian vault="..." search query="path:Research/{slug}"   # folder populated?
```

If the hub exists, merge. If an individual note exists, append a new dated section or reconcile frontmatter — do not create a numbered duplicate.

See `references/naming.md` for sanitization rules and conflict resolution.

## Frontmatter schema

Every generated note carries frontmatter. This is what makes the vault queryable.

```yaml
---
topic: "Quantum Error Correction"              # Natural-language topic
slug: quantum-error-correction                  # Folder slug
type: hub | summary | insight | source | questions | study-guide
created: 2026-04-17
updated: 2026-04-17
source_url: https://arxiv.org/abs/...           # For source notes only
author: "Author Name"                           # For source notes only
access_date: 2026-04-17                         # For source notes only
source_type: paper | article | video | book | vault-note
notebook_id: abc123de-...                        # NotebookLM UUID. On hub + any note that came from the notebook.
artifacts:                                       # Hub note only. Lists generated artifacts.
  - type: audio-overview
    id: xyz789...
    path: Artifacts/audio-overview.mp3
tags: [research, {topic-slug}, {domain-tags}]
---
```

Full field reference and per-note-type variants: `references/frontmatter.md`.

## Note templates

Each note type has a standard body structure. Deviating from the templates breaks the round-trip — `capture` looks for specific sections to update. Keep them stable.

Templates with full examples: `references/note-templates.md`.

Summary of the hub note structure (this is the most important one):

```markdown
---
{frontmatter}
---

# {Topic}

> {One-paragraph orientation — what this research is about and why it exists.}

## Insights

- [[{Concept A}]] — one-line gloss
- [[{Concept B}]] — one-line gloss

## Sources

- [[{Source 1}]] — {type}, {author}, {year}
- [[{Source 2}]] — {type}, {author}, {year}

## Artifacts

- Audio overview: [[Artifacts/audio-overview.mp3]]
- Briefing: [[Summary]]
- Study guide: [[Study Guide]]

## Next actions

- [ ] {actionable follow-up}

## Open questions

- {open question that drives further research}

## NotebookLM

- Notebook ID: `{uuid}`
- Last synced: {date}
```

The "Next actions" and "Open questions" sections live in the hub note, not in a separate `Questions.md`, unless the list grows long (>~20 items) — at which point split them out and link.

## Plan contract (dry-run output)

Whenever you're about to execute writes — and always when `mode=dry-run` — emit a **structured plan** first. The plan is the canonical description of what the workflow will do. Real execution is just "run the plan." Evals assert against this plan.

The plan is a single JSON object with this shape:

```json
{
  "workflow": "prepare | capture | round-trip",
  "mode": "dry-run | execute",
  "vault": "<vault-name>",
  "topic": "<natural-language topic>",
  "slug": "<kebab-case slug>",
  "insight_mode": "evergreen | bundled",
  "notebook": {
    "action": "create | reuse | none",
    "id": "<uuid or null>",
    "title": "Research: <topic>"
  },
  "reads": [
    { "kind": "vault-note", "path": "Research/...", "reason": "..." },
    { "kind": "url", "url": "...", "reason": "..." },
    { "kind": "notebooklm-artifact", "artifact_id": "...", "artifact_type": "briefing-doc", "reason": "..." }
  ],
  "writes": [
    {
      "action": "create | update | skip",
      "path": "Research/<slug>/<...>.md",
      "type": "hub | summary | study-guide | mindmap | insight | source | questions | artifact-binary",
      "reason": "new topic | hub exists, refreshing Insights + frontmatter | ...",
      "frontmatter": { "...": "..." },
      "body_sections": {
        "Insights": "<rendered markdown>",
        "Sources": "<rendered markdown>",
        "...": "..."
      },
      "preserves": ["Next actions", "Open questions", "<other H2 sections kept verbatim from existing file>"]
    }
  ],
  "commands": [
    { "tool": "notebooklm", "args": "create 'Research: Surface Codes' --json", "purpose": "create notebook" },
    { "tool": "obsidian",  "args": "vault=\"MovieTheater\" create name=\"Surface Codes\" path=\"Research/surface-codes/Surface Codes.md\" silent", "purpose": "create hub note" }
  ],
  "warnings": [
    { "type": "citation-dropped | ambiguous-title | missing-source | unsupported-construct | lossy-conversion", "detail": "..." }
  ],
  "links": [
    { "from": "Research/surface-codes/Surface Codes.md", "to": "Research/surface-codes/Insights/Stabilizer Formalism.md", "wikilink": "[[Stabilizer Formalism]]" }
  ]
}
```

Rules that make the plan assertable — and the round-trip non-lossy:

- **Traceability.** Every write's frontmatter includes `created`, `updated`, and — when it derives from a notebook — `notebook_id` and either `source_artifact` (for artifact-derived notes) or `notebook_source_id` (for source notes). Never emit a research note without provenance.
- **Loss prevention.** If any NotebookLM citation `[N]` in the input has no corresponding source in the references list, emit a `citation-dropped` warning. If any content can't be cleanly converted (tables, equations, unusual structures), emit an `unsupported-construct` or `lossy-conversion` warning rather than silently flattening. Never drop citations silently.
- **Link integrity.** Every wikilink in `body_sections` must appear in `links[]`. Every `link.to` must be either (a) a path in `writes[]`, (b) a path the skill has verified exists in the vault, or (c) recorded as a broken-link warning. No dangling links.
- **Merge safety.** When `action=update`, list explicitly in `preserves[]` which H2 sections are kept verbatim from the existing file. Default preserved sections on a hub: `Next actions`, `Open questions`, and anything outside the canonical set (`Insights`, `Sources`, `Artifacts`, `NotebookLM`). For insight notes with a non-empty body, default to `skip` unless the user explicitly asked to regenerate — user edits to insight bodies are sacred. Filenames, once created, never change (rename is a separate explicit operation — see `references/naming.md`).
- **No filename drift.** A repeated run on the same topic must produce the same `path` values. If slug derivation would produce a different slug than an existing folder, emit an `ambiguous-title` warning and stop — do not silently create a new folder.

Full plan schema with field-by-field semantics and worked examples: `references/plan-contract.md`.

## Operational rules

1. **Ask for the vault name once, at the top.** Never assume or default. The vault belongs to the user's project; this skill is shared across projects.
2. **Every `obsidian` call starts with `vault="<name>"`** per the `obsidian-cli` convention.
3. **Emit the plan before executing.** Always. In `execute` mode, render a brief summary for the user ("I will create 5 files and update the hub. Proceed?") — execute only after implicit or explicit confirmation. In `dry-run`, output the full JSON plan and stop.
4. **Prefer explicit notebook IDs over `notebooklm use`** — the `notebooklm` skill warns that `use` is not safe across parallel subagents.
5. **Long-running NotebookLM generations go to a subagent.** Don't block the main conversation on `artifact wait`. See the `notebooklm` skill's subagent patterns.
6. **Stop after each write batch with a short summary** showing the user which files you created/updated, pathed from the vault root. They need to be able to find the work without hunting.
7. **Don't overwrite user edits.** When updating an existing note, read it first, preserve any sections the agent didn't originally write, and only modify the canonical sections (`Insights` / `Sources` / `Artifacts` / `NotebookLM` on the hub; equivalent canonical sections per template). For insight notes with non-empty bodies, default to `skip`.

## Failure modes to watch for

- **Duplicate hub notes** — created when the slug derivation drifts between runs. Fix: always compute the slug the same way (lowercase, kebab-case, strip punctuation).
- **Broken wikilinks** — created when source note titles get truncated differently across runs. Fix: sanitize once, store the resolved title in the source note's frontmatter, and always link to that exact title.
- **Stale `notebook_id`** — the hub says notebook X but X was deleted. On capture, verify with `notebooklm list --json` before pulling.
- **Information loss on capture** — the briefing contains cited passages; dropping citations strips traceability. When converting, preserve citation markers `[1]`, `[2]` and append a "References" section at the bottom of the note mapping them to source notes.
- **Vault not running** — `obsidian-cli` requires Obsidian to be open. If a command errors with connection refused, tell the user to open Obsidian and retry — do not silently fail.

## Reference files

- `references/plan-contract.md` — full plan schema with field-by-field semantics, worked examples, and dry-run output rules
- `references/vault-structure.md` — full folder/file layout, edge cases, archival rules
- `references/note-templates.md` — full body templates for each note type, with worked examples
- `references/frontmatter.md` — complete frontmatter field reference per note type
- `references/naming.md` — slug derivation, title sanitization, conflict resolution
- `references/workflows.md` — detailed step-by-step for prepare, capture, round-trip, including the exact shell invocations
