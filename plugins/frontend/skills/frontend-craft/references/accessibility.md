# Accessibility verification

Use the project's declared requirements; default new work to WCAG 2.2 AA. Respect existing WCAG 2.1 obligations, including their reporting requirements. This is a focused implementation aid, not a complete conformance audit. Sources and upstream attribution are in [sources.md](sources.md).

## Operate the task

Complete the important flow by keyboard. Check logical focus order, visible focus, reachable actions, and freedom from traps. Sticky elements and overlays must not entirely cover the focused component; keeping it fully visible is the preferable design. Use native elements before implementing custom semantics. Keep visible labels in accessible names, expose state changes, and describe meaningful images. Decorative images should be ignored by assistive technology. [WCAG 2.2](https://www.w3.org/TR/2024/REC-WCAG22-20241212/)

When using a modal, verify focus enters a suitable element, remains in the modal while open, and returns sensibly on close. Check Escape dismissal and background inertness according to the component's intended behavior. Reuse an accessible component and test its actual integration. [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

Labels remain present when a field has a value. Associate hints and errors with controls; preserve entered values after a failed submission. Provide clear correction guidance and an appropriate focus destination or error summary. Announce important asynchronous outcomes without moving focus unnecessarily. Allow password managers and paste, and avoid unnecessary repeated entry. [WCAG 2.2](https://www.w3.org/TR/2024/REC-WCAG22-20241212/)

## Measure rather than guess

- **Text contrast:** Test foreground against its actual background, including overlays, imagery, and placeholders. WCAG AA generally requires 4.5:1; large text requires 3:1. Large means at least 18pt regular or 14pt bold, not any heading. Apply the criterion's exceptions accurately. [Contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- **Control contrast:** Check boundaries and state indicators that are necessary to identify a component, together with meaningful graphical objects, against the applicable 3:1 non-text criterion. Do not rely on color alone for errors or selection. [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- **Target size:** WCAG 2.2 AA uses 24 × 24 CSS pixels with defined spacing and other exceptions; it does not mandate 44 × 44 for every link. Use larger targets, often around 44px, where touch ergonomics warrant them. Measure the interactive area, not just the icon. [Target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **Reflow:** Check a 320 CSS-pixel-wide viewport and increased zoom/text size. Ordinary content should remain usable without two-dimensional scrolling; genuinely two-dimensional material such as a table can use the criterion's exception while surrounding content reflows. A mobile screenshot alone does not establish zoom behavior. [Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Honor reduced-motion preferences for nonessential movement and preserve understandable state feedback. Provide required pause controls for qualifying autoplay content and avoid hazardous flashing. Reduced motion is a design default here; do not label every animation as an AA failure. [WCAG 2.2](https://www.w3.org/TR/2024/REC-WCAG22-20241212/)

Use automated checks to find measurable issues, then manually verify keyboard behavior, reading order, names, and recovery. Report exactly what was exercised. A clean scanner or an accessibility-tree snapshot does not prove screen-reader usability or whole-page conformance.
