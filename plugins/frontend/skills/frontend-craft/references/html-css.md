# HTML and CSS that hold up under real content

Modified synthesis with platform references listed in [sources.md](sources.md). Preserve the project's framework, component APIs, styling convention, and browser support targets.

## Let the platform do its job

Use links for navigation and buttons for actions; native controls already carry keyboard behavior. A custom key handler is needed only for behavior the native element does not supply. Set button types intentionally inside forms. Use headings, lists, labels, fieldsets, and tables to expose content relationships rather than reconstructing them entirely with ARIA.

Keep meaningful DOM order consistent with reading and focus order. Visual CSS reordering cannot repair a confusing semantic sequence. Use real text for meaningful content, leaving generated content and background images for presentation where appropriate.

## Design for intrinsic size

- Let content determine height. Avoid fixed heights for text-bearing cards, controls, or sections unless their overflow behavior is part of the design.
- Use flex/grid and content-driven breakpoints. Remember their automatic minimum sizes: `min-inline-size: 0` on the appropriate child or `minmax(0, 1fr)` on a grid track can allow content to shrink. Confirm which element causes the overflow before changing it.
- Provide sensible wrapping for long names, URLs, and translated labels. Truncation is a decision about information loss: keep the full value available when users need it.
- Bound reading width separately from page width. Images should reserve their space and fit their intended crop; data and code may need an explicitly usable scroll container.
- Fix the cause of page-level overflow. Broad `overflow-x: hidden` can conceal content or clip focus and overlays.
- Use relative text sizes and allow zoom. Check narrow widths and enlarged text; a desktop composition scaled down is rarely enough.

## Keep the implementation coherent

Extend existing tokens rather than adding nearly identical values. Keep selector specificity predictable and styles close to the component conventions. For a new surface, a small set of role-based custom properties can be enough; a new design-system dependency is not a prerequisite.

Reuse the project's icon and asset pipeline. Reserve image dimensions; size and compress assets for their actual display. Lazy-load noncritical media where useful, while keeping important initial-view content promptly available. Add fonts or animation packages only when their benefit justifies their load and maintenance cost.

Animate properties deliberately and check smoothness when using expensive effects. Avoid broad transitions that animate unrelated state changes. Add virtualization only after data volume or measurement demonstrates the need, and verify its keyboard, search, and assistive-technology behavior.

Verify representative short and long content, absent media, loading, supported themes, and a narrow viewport. Add meaningful regression coverage when behavior changes; static CSS or copy adjustments usually need targeted visual inspection rather than tests that assert their own implementation.
