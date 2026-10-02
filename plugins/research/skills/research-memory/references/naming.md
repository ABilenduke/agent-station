# Naming and Idempotency

Stable naming is the foundation of idempotent round-trips. Repeated runs on the same topic must land in the same files.

## Topic slug

Lowercase, kebab-case, ASCII-only. Used for the folder name.

Algorithm:
1. Lowercase.
2. Replace any character that is not `[a-z0-9]` with `-`.
3. Collapse runs of `-` to a single `-`.
4. Strip leading/trailing `-`.
5. Truncate to 60 characters.

Examples:

| Input | Slug |
|---|---|
| `Quantum Error Correction` | `quantum-error-correction` |
| `LLMs & Retrieval-Augmented Generation` | `llms-retrieval-augmented-generation` |
| `Ridley Scott's directorial style` | `ridley-scott-s-directorial-style` |
| `2024 election aftermath` | `2024-election-aftermath` |
| `日本の映画史 (Japanese film history)` | `japanese-film-history` (transliterate/strip non-ASCII; if the user runs in a non-Latin script vault, keep the script — but still lowercase and kebab-case within it) |

The slug is for the filesystem. The **hub note title** uses the natural-language form so wikilinks read naturally in Obsidian.

## Hub note title

Use the topic as the user phrased it, with normal capitalization:

- `Quantum Error Correction`  (title case for proper terms)
- `LLMs and retrieval-augmented generation`  (sentence case is fine if that matches the user's vault)

Pick one convention per vault and stick with it. If the vault already has other notes, inspect a few and match their style before creating.

## Insight note titles

The concept itself — no topic prefix. This is what makes insights reusable.

- ✅ `Surface Codes.md`
- ❌ `QEC - Surface Codes.md`
- ❌ `Quantum Error Correction / Surface Codes.md`

Exception: when two topics use the same term with different meanings, disambiguate with a parenthetical.

- `Threshold (QEC).md`
- `Threshold (statistics).md`

## Source note titles

Derive from the source's own title, sanitized. Keep enough to be recognizable.

Sanitization rules:
1. Replace `:` with ` —` (em-dash with surrounding spaces) — Obsidian disallows `:` in filenames on some platforms.
2. Replace `/` with ` — `.
3. Replace `\`, `<`, `>`, `"`, `|`, `?`, `*` with `` (delete).
4. Collapse internal whitespace runs to a single space.
5. Trim to 80 characters. If truncating, end on a word boundary.
6. Prepend an author/year tag when disambiguation helps: `Fowler 2012 — Surface codes`.

Examples:

| Source | Note title |
|---|---|
| Paper: "Surface codes: Towards practical large-scale quantum computation" by Fowler et al. 2012 | `Fowler 2012 — Surface codes` |
| Article: "The Future of LLMs: What Comes Next?" on Some Blog, 2024 | `The Future of LLMs — What Comes Next` |
| YouTube: "Scott Aaronson lecture — complexity theory" | `Scott Aaronson lecture — complexity theory` |

## URL → source note match

When re-running a workflow, match existing source notes by `source_url` (frontmatter), not by title. Titles can drift; URLs are stable.

Procedure on capture:
1. For each source in the notebook, look up existing notes: `obsidian vault="..." search query="source_url:\"<url>\""`.
2. If found → update in place.
3. If not found → create a new source note.

## Conflict resolution

When a target path already exists:

- **Hub note exists with different slug**: the user renamed the topic. Ask before merging. Do not silently rename folders (breaks wikilinks).
- **Insight note exists with matching title in another topic folder**: good — reuse it. Add the current topic to its `topics:` frontmatter list. Don't duplicate.
- **Source note exists with matching `source_url`**: reuse. Add current hub to `referenced_in`.
- **Source note exists with matching title but different URL**: collision. Append a short author/year disambiguator to the new one.
- **Summary.md exists for a different notebook**: the topic has multiple notebooks. Either overwrite (if the user said "resync") or append a dated subsection. Ask when ambiguous.

## Idempotency checklist

Before any write, verify:

```bash
# Does the topic folder exist?
obsidian vault="$VAULT" search query="path:Research/$SLUG" total

# Does the hub note exist?
obsidian vault="$VAULT" read file="$TOPIC_TITLE" 2>/dev/null

# What insights already exist?
obsidian vault="$VAULT" search query="path:Research/$SLUG/Insights" total

# What sources already exist?
obsidian vault="$VAULT" search query="path:Research/$SLUG/Sources" total
```

Base subsequent actions on what already exists. Never blindly overwrite.

## When the user renames a topic

If the user tells you they've renamed a topic ("rename 'QEC' to 'Quantum Error Correction'"):

1. Compute the new slug.
2. Move the folder: `Research/qec/` → `Research/quantum-error-correction/` (use shell `mv` through a bash call, or `obsidian` rename commands if available).
3. Rename the hub note file.
4. Run a vault-wide search for the old title and update wikilinks: `obsidian vault="..." search query="[[QEC]]"` — then rewrite each hit.
5. Update `topic`, `slug`, and all tag lists in the topic folder's notes.
6. Update `topics:` lists in Insights that referenced the old hub.

This is the one case where the skill writes across the vault. Confirm with the user before executing, and show the list of files that will change.
