# Frontmatter Reference

Every note type has a defined set of frontmatter fields. YAML-safe, lowercase, underscored.

## Common fields (all note types)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | One of: `hub`, `summary`, `study-guide`, `mindmap`, `insight`, `source`, `questions`, `rollup` |
| `created` | ISO date | yes | `2026-04-17`. Never change after creation. |
| `updated` | ISO date | yes | Refresh whenever the note is rewritten. |
| `tags` | string list | yes | Always includes `research` + the topic slug. Plus domain tags. |

## Hub note

| Field | Type | Required | Notes |
|---|---|---|---|
| `topic` | string | yes | Natural-language topic, quoted. |
| `slug` | string | yes | Lowercase kebab-case. |
| `notebook_id` | UUID | when NotebookLM used | Primary/active notebook UUID. |
| `notebooks` | list | optional | Present when >1 notebook exists; see vault-structure.md. |
| `status` | string | yes | `stub`, `active`, or `archived`. |
| `parent_topic` | wikilink | optional | `"[[Parent Topic]]"` — the parent hub, if this is a sub-topic. |
| `artifacts` | list of objects | optional | Each with `type`, `id`, `path`, `generated` (ISO date). |
| `archived` | ISO date | only if archived | Date archived. |

## Summary / Study Guide / Mindmap

| Field | Type | Required | Notes |
|---|---|---|---|
| `topic` | string | yes | Matches the hub. |
| `slug` | string | yes | Matches the hub. |
| `source_artifact` | string | yes | NotebookLM artifact ID this was downloaded from. |
| `notebook_id` | UUID | yes | Traceability. |

## Insight note

| Field | Type | Required | Notes |
|---|---|---|---|
| `concept` | string | yes | The concept name (same as note title). |
| `topics` | list of wikilinks | yes | At least one hub this belongs to. |
| `sources` | list of wikilinks | optional | Source notes this concept derives from. |
| `status` | string | optional | `draft`, `stable`, `deprecated`. |

Insights intentionally do **not** carry `topic`/`slug`/`notebook_id` — they should be reusable across topics. The `topics` list is how they connect to hubs.

## Source note

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Source's own title, quoted. |
| `source_type` | string | yes | One of: `paper`, `article`, `video`, `book`, `podcast`, `lecture`, `thread`, `other`. |
| `author` | string | optional | Or author list joined with `, `. |
| `year` | integer | optional | Publication year. |
| `source_url` | URL | when applicable | Canonical URL for the source. |
| `access_date` | ISO date | yes | When the source was last accessed/archived. |
| `notebook_id` | UUID | when applicable | Which notebook indexed this source. |
| `notebook_source_id` | string | when applicable | NotebookLM source ID. |
| `referenced_in` | list of wikilinks | optional | Which hubs link to this source. |

## Questions (split-out)

| Field | Type | Required | Notes |
|---|---|---|---|
| `topic` | string | yes | Matches the hub. |
| `slug` | string | yes | Matches the hub. |

## Conventions

- **Quoting:** quote any string value that contains `:`, `#`, `[`, `]`, `{`, `}`, `,`, `&`, `*`, `?`, `|`, `>`, `<`, `=`, `!`, `%`, `@`, `` ` `` — anywhere in it. When in doubt, quote.
- **Wikilinks in YAML:** wrap the whole wikilink in double quotes: `- "[[Some Note]]"`. Bare `[[...]]` in YAML is ambiguous.
- **Dates:** ISO 8601 date (not datetime unless needed). `2026-04-17`.
- **Lists:** always YAML block-style (dash on its own line) for readability.
- **No empty strings.** Omit the field entirely instead.

## What NOT to put in frontmatter

- Full summary/description text → goes in the body, not `description:`.
- The generated briefing or synthesis itself → body.
- Counts or computed values → Obsidian Dataview/Bases can compute these on demand; don't store derived data.
