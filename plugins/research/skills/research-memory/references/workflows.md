# Workflows — Detailed Steps

Exact command sequences for each workflow. All `obsidian` calls assume `vault="<vault>"` as the first parameter.

---

## Prepare (Obsidian → NotebookLM)

**Goal:** load vault notes + URLs into a NotebookLM notebook so the user can synthesize there.

### Inputs
- `vault` — vault name (required).
- `topic` — natural-language topic (required).
- `sources` — one or more of: folder path, note name, URL. Mix allowed.
- `notebook_id` — optional; if provided, add to an existing notebook instead of creating a new one.

### Steps

```bash
# 1. Resolve slug and paths.
SLUG=$(printf '%s' "$TOPIC" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g; s/^-//; s/-$//' | cut -c1-60)
ROOT="Research/$SLUG"

# 2. Check existing hub note; read if present.
obsidian vault="$VAULT" read file="$TOPIC" 2>/dev/null
# If found, parse frontmatter for an existing notebook_id.

# 3. Gather vault sources.
#    Folder-style: list all notes under a path.
obsidian vault="$VAULT" search query="path:$SOURCE_FOLDER" --json

#    Named notes: read each.
obsidian vault="$VAULT" read file="$NOTE_NAME"

# 4. For each external URL, extract clean markdown via defuddle (for archival).
#    (NotebookLM fetches the URL itself in step 6 — defuddle output is for the vault source note.)
defuddle "$URL" > /tmp/source-$i.md

# 5. Create or reuse NotebookLM notebook.
if [ -z "$NOTEBOOK_ID" ]; then
  NOTEBOOK_ID=$(notebooklm create "Research: $TOPIC" --json | jq -r '.id')
fi

# 6. Add each vault note as a source.
#    Write each note's content to a temp .md with a header identifying its origin, then upload.
cat > /tmp/note-$i.md <<EOF
# [Vault note: $NOTE_PATH]

$CONTENT
EOF
notebooklm source add /tmp/note-$i.md --notebook "$NOTEBOOK_ID" --json

# 7. Add each URL as a source (NotebookLM fetches natively).
notebooklm source add "$URL" --notebook "$NOTEBOOK_ID" --json

# 8. Collect source IDs and spawn a subagent to wait.
#    See the notebooklm skill's "Bulk Import with Source Waiting (Subagent Pattern)" for the Task invocation.

# 9. Stub or update the hub note with notebook_id.
obsidian vault="$VAULT" create name="$TOPIC" path="$ROOT/$TOPIC.md" \
  content="{stub from hub template}" silent
obsidian vault="$VAULT" property:set name="notebook_id" value="$NOTEBOOK_ID" file="$TOPIC"
obsidian vault="$VAULT" property:set name="updated" value="$(date -I)" file="$TOPIC"

# 10. Report paths to the user.
```

### Reporting

End with a block like:

```
Prepared notebook `Research: {topic}` (ID: `{notebook_id}`).
Added {N} vault notes + {M} URL sources.
Sources are indexing in the background (subagent is watching). ETA ~2 min.

Vault:
- Hub: Research/{slug}/{Topic}.md  (updated with notebook_id)
```

---

## Capture (NotebookLM → Obsidian)

**Goal:** pull NotebookLM artifacts and source list back into the vault as durable notes.

### Inputs
- `vault` — vault name (required).
- `notebook_id` OR `topic` — either the UUID directly, or the topic to look up.
- `artifacts` — which to capture (default: briefing-doc; expand if user named others).
- `mode` — `evergreen` (default) or `bundled`.

### Steps

```bash
# 1. Resolve notebook_id from topic if needed.
#    Check existing hub frontmatter first.
obsidian vault="$VAULT" read file="$TOPIC" 2>/dev/null | grep '^notebook_id:'
# If not found, search notebooks by title.
notebooklm list --json | jq '.notebooks[] | select(.title | contains("'$TOPIC'"))'

# 2. Verify the notebook still exists.
notebooklm list --json | jq '.notebooks[] | select(.id | startswith("'${NOTEBOOK_ID:0:8}'"))'
# If empty: abort, tell the user the notebook is gone.

# 3. Pull source list.
SOURCES_JSON=$(notebooklm source list --notebook "$NOTEBOOK_ID" --json)

# 4. List artifacts.
ARTIFACTS_JSON=$(notebooklm artifact list --notebook "$NOTEBOOK_ID" --json)

# 5. For each requested artifact that is status=completed, download.
mkdir -p "$VAULT_PATH/Research/$SLUG/Artifacts"
notebooklm download report "Research/$SLUG/Summary.md" \
  -a "$BRIEFING_ARTIFACT_ID" -n "$NOTEBOOK_ID"

# 6. Convert the briefing to a Summary note (add frontmatter, normalize citations).
#    Read the file back, prepend frontmatter, rewrite [N] citations to wikilinks where possible.

# 7. For each source in SOURCES_JSON:
for src in $(echo "$SOURCES_JSON" | jq -c '.sources[]'); do
  SRC_TITLE=$(echo "$src" | jq -r .title)
  SRC_URL=$(echo "$src" | jq -r .url)   # if web source
  # a. If it was originally a vault note (check the prepared header), skip creating a source note.
  # b. Otherwise, check for existing source note by source_url.
  EXISTING=$(obsidian vault="$VAULT" search query="source_url:\"$SRC_URL\"" --json | jq '.results | length')
  if [ "$EXISTING" -eq 0 ]; then
    # Sanitize title per naming.md.
    CLEAN=$(sanitize "$SRC_TITLE")
    obsidian vault="$VAULT" create name="$CLEAN" path="Research/$SLUG/Sources/$CLEAN.md" \
      content="{source template with frontmatter}" silent
  else
    # Update referenced_in on the existing source note.
    obsidian vault="$VAULT" property:set name="referenced_in" value="[[$TOPIC]]" file="$CLEAN" --append
  fi
done

# 8. Generate Insights (evergreen mode).
#    Read the briefing body. Identify distinct concepts (use the skill's judgment — ~3–8 concepts is typical).
#    For each concept, create an insight note. Check if one already exists (across the whole vault) first.
for CONCEPT in "${CONCEPTS[@]}"; do
  EXISTING=$(obsidian vault="$VAULT" read file="$CONCEPT" 2>/dev/null)
  if [ -z "$EXISTING" ]; then
    obsidian vault="$VAULT" create name="$CONCEPT" path="Research/$SLUG/Insights/$CONCEPT.md" \
      content="{insight template}" silent
  else
    # Add current topic to the insight's topics: list.
    obsidian vault="$VAULT" property:set name="topics" value="[[$TOPIC]]" file="$CONCEPT" --append
  fi
done

# 9. Update the hub note.
#    - Rewrite Insights, Sources, Artifacts sections from authoritative state.
#    - Preserve everything else (Next actions, Open questions, user edits).
#    - Refresh frontmatter: updated, notebook_id, artifacts[].
```

### Citation normalization

The briefing contains `[1]`, `[2]`, etc. with a references list at the bottom. Rewrite:

1. Map each citation number to the corresponding source (by order in the references list).
2. Look up the source in your sanitized source-note list.
3. At the bottom of Summary.md, replace the NotebookLM references section with:

```markdown
## References

- [1] → [[Fowler 2012 — Surface codes]]
- [2] → [[Nielsen & Chuang — Chapter 10]]
```

4. Do not change `[N]` in the body text — readers need the markers to cross-reference.

### Reporting

```
Captured {N} artifacts from notebook `{notebook_title}`.

Vault:
- Research/{slug}/{Topic}.md         (hub, updated)
- Research/{slug}/Summary.md         (new)
- Research/{slug}/Insights/*.md      ({K} new, {L} updated)
- Research/{slug}/Sources/*.md       ({M} new, {P} updated)
- Research/{slug}/Artifacts/*        ({Q} files)
```

---

## Round-trip

Combines prepare + capture. Use when the user starts from a topic idea, not from existing vault material.

### Steps

```bash
# 1. Stub the hub note.
obsidian vault="$VAULT" create name="$TOPIC" path="Research/$SLUG/$TOPIC.md" \
  content="{stub template with status: stub}" silent

# 2. Run prepare with whatever initial sources the user gave.

# 3. Once sources are ready (subagent completes), generate artifacts.
#    Spawn another subagent to wait for each (artifacts take 5–45 min).
notebooklm generate report --format briefing-doc --notebook "$NOTEBOOK_ID" --json
notebooklm generate audio "..." --notebook "$NOTEBOOK_ID" --json   # if user asked for podcast
# ... etc.

# 4. When artifacts complete, run capture.

# 5. Flip hub status from 'stub' to 'active'.
obsidian vault="$VAULT" property:set name="status" value="active" file="$TOPIC"
```

---

## Common sub-operations

### Reading vault content into a temp file for NotebookLM

```bash
CONTENT=$(obsidian vault="$VAULT" read file="$NOTE")
cat > /tmp/prep.md <<EOF
---
source: vault-note
vault: $VAULT
path: $PATH
---

$CONTENT
EOF
```

### Searching for existing notes

```bash
# By title (wikilink-style).
obsidian vault="$VAULT" read file="$TITLE" 2>/dev/null

# By path prefix.
obsidian vault="$VAULT" search query="path:Research/$SLUG" --json

# By frontmatter property.
obsidian vault="$VAULT" search query="notebook_id:\"$ID\"" --json
obsidian vault="$VAULT" search query="source_url:\"$URL\"" --json
```

### Writing a note with template-based content

`obsidian-cli` supports templates, but for research-memory the templates are defined in this skill, not in the vault. Use `content="..."` directly:

```bash
obsidian vault="$VAULT" create \
  name="$TITLE" \
  path="$PATH" \
  content="$(render_template "$TYPE" "$CONTEXT")" \
  silent
```

### Safe property updates

Use `obsidian property:set` rather than rewriting the whole file. This preserves user edits elsewhere in the note.

```bash
obsidian vault="$VAULT" property:set name="updated" value="$(date -I)" file="$TITLE"
obsidian vault="$VAULT" property:set name="notebook_id" value="$ID" file="$TITLE"
```

For list properties, the `obsidian` CLI may support `--append` or similar; check `obsidian property:set --help` at runtime.

---

## Error recovery

| Failure | Recovery |
|---|---|
| `obsidian` command: connection refused | Obsidian not running. Ask user to open it. |
| `notebooklm` auth error | Run `notebooklm login` (interactive — hand off to user). |
| NotebookLM rate-limited on generate | Create/update hub, leave artifacts pending, report back to user with retry guidance. |
| Source fails to index | Log in the hub's Artifacts section as failed, continue with others. |
| Wikilink target missing | Create a stub note or report the broken link in the reporting block. |
