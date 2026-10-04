# Product interfaces and reusable components

Modified synthesis of the pinned sources in [sources.md](sources.md). Prefer familiar interaction patterns when they help people complete work.

## Preserve the product's language

Inspect a representative page and the components it uses before proposing changes. Keep established navigation, tokens, control vocabulary, and interaction contracts unless the request authorizes changing them. A local refinement should improve its surrounding system. Do not convert an operational interface into a marketing composition merely to make it look more distinctive.

Find the primary task, the information needed to make its decision, and the next likely task. Organize the page around that sequence. Make scope visible: selected account, active filters, selected rows, time range, or other context that changes the meaning of an action.

## Density and hierarchy

- Preserve useful information density. Improve alignment, grouping, column priority, typography, and state clarity before reducing the number of visible records.
- Keep comparable values aligned. Use tabular numerals where scanning numerical columns benefits; distinguish units, precision, and totals. Preserve meaningful table semantics.
- Use typography and surface treatment to distinguish navigation, controls, and working content. Oversized headings should not displace the work without a task-specific reason.
- At narrow widths, prioritize information deliberately: reflow controls, collapse supporting navigation, or provide an accessible local scroll region for a truly two-dimensional table. Keep necessary data reachable and related labels understandable.
- Match state colors and interaction affordances to existing tokens. Selection, warning, error, and ordinary decoration should not be confused.

## Complete the actual interaction

Identify the states this component or flow can reach, rather than applying every state to every element. Check idle, keyboard focus, active/selected, loading, empty, invalid, failed, and successful states where relevant.

Loading should preserve orientation and communicate progress without suggesting success. Empty data and no filter matches need different recovery actions. Errors should preserve entered work and name the next useful action. Use the same action vocabulary in controls and their outcomes.

Reuse established accessible controls. For overlays, check clipping, stacking, focus entry and return, dismissal, and background interaction. A modal is appropriate when the task needs a bounded decision; routine details can often remain inline.

Preserve native link behaviors and existing routing. Keep shareable filters or pagination in the URL when that fits the product's established navigation; transient hover, input composition, and open-state details do not automatically belong there.

For reusable components, preserve the public props/events/slots contract unless a change is requested. Test representative consumers and difficult content, not just a pristine isolated example. Let the hosting surface control layout where the existing component API expects it.

Use [accessibility](accessibility.md) for interaction requirements and [rendered review](rendered-review.md) to assess the result in context.
