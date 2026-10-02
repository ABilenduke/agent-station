# Plan Contract

The plan is the canonical description of what a workflow will do. It's emitted before any writes — always in `dry-run` mode, and as a preview in `execute` mode. Evals assert against the plan, not against side effects.

## Top-level shape

```json
{
  "workflow":      "prepare | capture | round-trip",
  "mode":          "dry-run | execute",
  "vault":         "<vault-name>",
  "topic":         "<natural-language topic>",
  "slug":          "<kebab-case slug>",
  "insight_mode":  "evergreen | bundled",
  "research_root": "Research",
  "notebook":      { ... },
  "reads":         [ ... ],
  "writes":        [ ... ],
  "commands":      [ ... ],
  "warnings":      [ ... ],
  "links":         [ ... ]
}
```

All fields are required. Empty arrays are valid; missing fields are not.

## `notebook`

The target NotebookLM notebook (if any).

```json
{
  "action": "create | reuse | none",
  "id":     "<uuid or null>",
  "title":  "Research: <topic>"
}
```

- `action: create` → a new notebook will be created with `title`; `id` is `null` in the plan (filled at execute time).
- `action: reuse` → `id` references an existing notebook.
- `action: none` → this workflow doesn't touch a notebook (rare; typically a capture-only rewrite that just re-renders existing vault notes from already-downloaded artifacts).

## `reads`

Every input the workflow needs to consume. One entry per distinct input.

```json
{ "kind": "vault-note",         "path": "Research/.../Note.md",    "reason": "source material for notebook" }
{ "kind": "url",                "url": "https://...",              "reason": "external source" }
{ "kind": "notebooklm-artifact","artifact_id": "art_...",
  "artifact_type": "briefing-doc | study-guide | mindmap | audio-overview | quiz | flashcards | slide-deck | video | infographic",
  "reason": "synthesis input for capture" }
{ "kind": "notebooklm-sources", "notebook_id": "...",              "reason": "enumerate notebook sources" }
{ "kind": "vault-hub",          "path": "Research/.../Topic.md",   "reason": "check for existing hub before updating" }
```

Reasons are human-readable but stable phrasing makes them assertable. Keep them short.

## `writes`

One entry per file the workflow will create, update, or skip. Order is the intended write order.

```json
{
  "action":     "create | update | skip",
  "path":       "Research/<slug>/<...>.md",
  "type":       "hub | summary | study-guide | mindmap | insight | source | questions | artifact-binary",
  "reason":     "short human-readable reason",
  "frontmatter": { "topic": "...", "slug": "...", "type": "hub", "created": "2026-04-17", "updated": "2026-04-17", "notebook_id": "..." },
  "body_sections": {
    "Insights":     "<rendered markdown>",
    "Sources":      "<rendered markdown>",
    "Artifacts":    "<rendered markdown>"
  },
  "preserves":  ["Next actions", "Open questions"]
}
```

### `action` semantics

| Value | When to use |
|---|---|
| `create` | The target path does not exist. Producer writes the full file. |
| `update` | The target path exists. Producer rewrites only sections in `body_sections`; everything else (including H2s listed in `preserves`) is kept verbatim. Frontmatter fields in the `frontmatter` object are merged into existing frontmatter (set/replace those keys, leave others). |
| `skip`   | The target exists and should not be modified. Use for insight notes with non-empty user-edited bodies when capturing. Include a reason explaining why. |

### `frontmatter`

Only fields the plan wants to set/replace. Do not emit the *entire* existing frontmatter on an update — only the deltas. On `create`, emit the full initial frontmatter.

### `body_sections`

Maps canonical H2 header text → rendered markdown body (without the `## Header` line — just the content under it).

### `preserves`

The H2 section titles (without `## `) that exist in the target file and must NOT be overwritten. Producer fills this by reading the existing file. On `create`, this is `[]`.

### `type: artifact-binary`

For downloaded MP3s, PDFs, JSON mindmaps, etc. `frontmatter` and `body_sections` are `null`; include a `size_bytes_estimate` and `source_artifact_id` field instead.

## `commands`

The shell invocations the plan will execute, in order. Each has:

```json
{
  "tool":    "notebooklm | obsidian | defuddle | bash",
  "args":    "<full argument string>",
  "purpose": "short description for human reading"
}
```

`args` must be a faithful shell-quoted string. This is what evals diff against when checking sequencing.

## `warnings`

Machine-readable signals of imperfect conversion. Empty if the plan is clean.

```json
{
  "type":   "citation-dropped | ambiguous-title | missing-source | unsupported-construct | lossy-conversion | broken-link | slug-collision | auth-expired",
  "detail": "Citation [3] in briefing has no matching source in references list",
  "refs":   ["Summary.md"]
}
```

Warning types are a closed vocabulary. Extend it only by updating this doc.

### When to emit each warning

| Type | Trigger |
|---|---|
| `citation-dropped` | A `[N]` appears in artifact text but not in its references list. Never drop silently. |
| `ambiguous-title` | Two sources share a sanitized title; disambiguator appended. |
| `missing-source` | A source in a references list has no corresponding source in the notebook's `source list`. |
| `unsupported-construct` | Artifact contains a construct (custom HTML, complex table, etc.) with no clean markdown equivalent. |
| `lossy-conversion` | Content had to be simplified (e.g., flattened equation, stripped formatting). Include what was lost. |
| `broken-link` | A wikilink target doesn't resolve to any write in this plan or any existing vault note. |
| `slug-collision` | Derived slug matches an existing folder but the topic appears different. Plan should stop; user must confirm. |
| `auth-expired` | Pre-flight check detected NotebookLM auth is stale; plan is returned but execute would fail. |

## `links`

Every wikilink generated anywhere in `body_sections` appears here, with its target path. This is the link-integrity check surface.

```json
{
  "from":     "Research/<slug>/<Hub>.md",
  "to":       "Research/<slug>/Insights/<Concept>.md",
  "wikilink": "[[Concept]]",
  "status":   "will-create | exists | broken"
}
```

- `will-create` → `to` is in this plan's `writes`.
- `exists` → producer verified the file exists in the vault already.
- `broken` → no target; must also appear in `warnings[]` as a `broken-link`.

A well-formed plan has no `broken` links. If execution would proceed despite broken links, require user confirmation.

## Worked example: Capture dry-run

Input (provided to the skill):
- `vault = "MyVault"`, `topic = "Surface Codes"`, `mode = dry-run`
- mock briefing doc text with citations `[1]`, `[2]`, `[3]`
- mock source list: `[{id: s1, title: "Fowler 2012", url: "https://..."}, {id: s2, title: "Nielsen Chuang Ch10", url: null}]` — note `[3]` has no matching source
- mock notebook_id: `nb_abcdef`
- no existing hub

Expected plan (abridged):

```json
{
  "workflow": "capture",
  "mode": "dry-run",
  "vault": "MyVault",
  "topic": "Surface Codes",
  "slug": "surface-codes",
  "insight_mode": "evergreen",
  "research_root": "Research",
  "notebook": { "action": "reuse", "id": "nb_abcdef", "title": "Research: Surface Codes" },
  "reads": [
    { "kind": "vault-hub", "path": "Research/surface-codes/Surface Codes.md", "reason": "check for existing hub" },
    { "kind": "notebooklm-artifact", "artifact_id": "art_briefing", "artifact_type": "briefing-doc", "reason": "synthesis input" },
    { "kind": "notebooklm-sources", "notebook_id": "nb_abcdef", "reason": "enumerate sources for source notes" }
  ],
  "writes": [
    {
      "action": "create",
      "path": "Research/surface-codes/Surface Codes.md",
      "type": "hub",
      "reason": "new topic",
      "frontmatter": { "topic": "Surface Codes", "slug": "surface-codes", "type": "hub", "created": "2026-04-17", "updated": "2026-04-17", "notebook_id": "nb_abcdef", "status": "active", "tags": ["research", "surface-codes"] },
      "body_sections": {
        "Insights": "- [[Stabilizer Formalism]] — group-theoretic framework\n- [[Threshold Theorem]] — ...",
        "Sources":  "- [[Fowler 2012 — Surface codes]]\n- [[Nielsen Chuang — Chapter 10]]",
        "Artifacts":"- Briefing: [[Summary]]",
        "NotebookLM":"- Notebook ID: `nb_abcdef`\n- Last synced: 2026-04-17"
      },
      "preserves": []
    },
    {
      "action": "create",
      "path": "Research/surface-codes/Summary.md",
      "type": "summary",
      "reason": "briefing doc downloaded",
      "frontmatter": { "topic": "Surface Codes", "slug": "surface-codes", "type": "summary", "created": "2026-04-17", "updated": "2026-04-17", "source_artifact": "art_briefing", "notebook_id": "nb_abcdef", "tags": ["research", "surface-codes", "summary"] },
      "body_sections": { "body": "...converted briefing with [1] [2] [3] markers preserved..." , "References": "- [1] → [[Fowler 2012 — Surface codes]]\n- [2] → [[Nielsen Chuang — Chapter 10]]" },
      "preserves": []
    },
    { "action": "create", "path": "Research/surface-codes/Insights/Stabilizer Formalism.md", "type": "insight", "reason": "extracted concept", "frontmatter": { "concept": "Stabilizer Formalism", "type": "insight", "created": "2026-04-17", "updated": "2026-04-17", "topics": ["[[Surface Codes]]"], "sources": ["[[Fowler 2012 — Surface codes]]"], "tags": ["insight"] }, "body_sections": { "body": "..." }, "preserves": [] },
    { "action": "create", "path": "Research/surface-codes/Insights/Threshold Theorem.md", "type": "insight", "reason": "extracted concept", "frontmatter": { "...": "..." }, "body_sections": { "body": "..." }, "preserves": [] },
    { "action": "create", "path": "Research/surface-codes/Sources/Fowler 2012 — Surface codes.md", "type": "source", "reason": "new external source", "frontmatter": { "title": "Fowler 2012 — Surface codes", "type": "source", "source_type": "paper", "source_url": "https://...", "access_date": "2026-04-17", "notebook_id": "nb_abcdef", "notebook_source_id": "s1", "referenced_in": ["[[Surface Codes]]"], "tags": ["source", "paper"] }, "body_sections": { "...": "..." }, "preserves": [] },
    { "action": "create", "path": "Research/surface-codes/Sources/Nielsen Chuang — Chapter 10.md", "type": "source", "reason": "new external source", "frontmatter": { "...": "..." }, "body_sections": { "...": "..." }, "preserves": [] }
  ],
  "commands": [
    { "tool": "obsidian", "args": "vault=\"MyVault\" read file=\"Surface Codes\"", "purpose": "check hub exists" },
    { "tool": "notebooklm", "args": "source list --notebook nb_abcdef --json", "purpose": "enumerate sources" },
    { "tool": "notebooklm", "args": "download report /tmp/briefing.md -a art_briefing -n nb_abcdef", "purpose": "download briefing" },
    { "tool": "obsidian", "args": "vault=\"MyVault\" create name=\"Surface Codes\" path=\"Research/surface-codes/Surface Codes.md\" silent", "purpose": "create hub" }
  ],
  "warnings": [
    { "type": "citation-dropped", "detail": "Citation [3] in briefing has no matching source in references list; kept marker but no wikilink target", "refs": ["Research/surface-codes/Summary.md"] }
  ],
  "links": [
    { "from": "Research/surface-codes/Surface Codes.md", "to": "Research/surface-codes/Insights/Stabilizer Formalism.md", "wikilink": "[[Stabilizer Formalism]]", "status": "will-create" },
    { "from": "Research/surface-codes/Surface Codes.md", "to": "Research/surface-codes/Insights/Threshold Theorem.md",  "wikilink": "[[Threshold Theorem]]",  "status": "will-create" },
    { "from": "Research/surface-codes/Surface Codes.md", "to": "Research/surface-codes/Sources/Fowler 2012 — Surface codes.md", "wikilink": "[[Fowler 2012 — Surface codes]]", "status": "will-create" },
    { "from": "Research/surface-codes/Surface Codes.md", "to": "Research/surface-codes/Sources/Nielsen Chuang — Chapter 10.md", "wikilink": "[[Nielsen Chuang — Chapter 10]]", "status": "will-create" },
    { "from": "Research/surface-codes/Summary.md",       "to": "Research/surface-codes/Sources/Fowler 2012 — Surface codes.md", "wikilink": "[[Fowler 2012 — Surface codes]]", "status": "will-create" },
    { "from": "Research/surface-codes/Summary.md",       "to": "Research/surface-codes/Sources/Nielsen Chuang — Chapter 10.md", "wikilink": "[[Nielsen Chuang — Chapter 10]]", "status": "will-create" }
  ]
}
```

## Output format

- In `dry-run`: emit the JSON plan as the response, inside a ```json``` fenced block. Nothing else after it. The user / evaluator reads the plan directly.
- In `execute`: emit a short human-readable preview (bullet list of writes, any warnings), then ask for confirmation unless the user has already granted it. After confirmation, execute commands in order and report outcomes.

Plans are never edited during execution. If a command fails, stop and report — do not re-plan silently.
