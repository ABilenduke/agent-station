---
name: frontend-craft
description: 'Design, build, refine, or critique web interfaces when layout, visual hierarchy, responsive behavior, or interaction design needs judgment, excluding purely functional fixes, backend work, and tests without a design change.'
---

# Frontend Craft

Make the interface serve its audience and task, with deliberate visual decisions and evidence from
the rendered result. Work with the project's framework and tools; HTML, CSS, accessibility, and
content are foundations across stacks.

## Establish the brief

Inspect the relevant page or component, existing design system, content, assets, and project
instructions. Identify the audience, primary action, and whether the assignment is new design,
refinement, implementation of a supplied design, or review. Preserve the existing identity and
behavior unless changing them is part of the request.

Resolve discoverable details from the project. Ask only when an unresolved choice would materially
change the result; otherwise state a useful assumption and proceed. Choose one defensible direction
autonomously. Offer alternatives when requested or when they help resolve a consequential ambiguity.
A small edit needs a small decision, not a new design process.

Use the brief and real content to establish hierarchy, density, typography, color, imagery, and
motion. Explain the few choices that matter. Existing tokens and component conventions are the
starting point. For new systems, establish a compact, coherent vocabulary without installing a
framework or design system merely to satisfy this skill.

## Load the guidance the task needs

| Work                                                                           | Reference                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| New visual direction, expressive public site, composition or typography        | [Art direction](references/art-direction.md)           |
| Operational interface, existing product, reusable component, dense information | [Product interfaces](references/product-interfaces.md) |
| Markup, styling, responsive layout, long or variable content                   | [HTML and CSS](references/html-css.md)                 |
| Interactive controls, forms, keyboard, focus, contrast, reflow, motion         | [Accessibility](references/accessibility.md)           |
| Public page, content-heavy site, navigation or search discoverability          | [Public-page SEO](references/public-page-seo.md)       |
| Visual critique, browser verification, final assessment of a changed interface | [Rendered review](references/rendered-review.md)       |

Read references when their decisions arise; do not load the entire library for every task.
Content-heavy pages usually need reading hierarchy, resilient layout, and public-page guidance.
Project-specific rules, including Cylinder tokens or Vue conventions, belong to that project.

## Implement the intended experience

Use semantic elements and native browser behavior where they fit. Reuse the project's components,
styling conventions, package manager, and supported browser targets. Give responsive layout,
keyboard use, content resilience, and relevant loading, empty, error, and success states the same
attention as the initial screenshot. For a static prototype, make its interaction boundary clear.

Distinguish requirements from heuristics. A familiar font, card, gradient, neutral palette, or
animation can be appropriate. Assess its purpose and execution against this brief. Distinctiveness
should come from the subject and composition; established product interfaces often benefit more
from consistency and clarity. Do not replace one repeated aesthetic with another.

Use supplied or project assets first. Search for references or produce imagery when it materially
improves the task, observing available tooling and asset permissions. Optional tools enhance the
work; no image generator, browser brand, external skill, runtime, or hook is a prerequisite for
starting. An unavailable tool limits the verification claim, not the truth of the claim.

## Review the result and correct what matters

For implemented visual changes, render the affected surface using the project's existing workflow
and inspect its actual screenshots at representative wide and narrow sizes. Exercise its important
interactions and states. Load [rendered review](references/rendered-review.md) for the evidence loop.
In a review-only request, return findings; change code only when fixes are within the requested scope.
In a planning-only context, describe the approach and verification without performing implementation.

Keep two judgments distinct:

- **Design critique:** Does the hierarchy serve the task? Do composition, density, type, content,
  imagery, and motion fit the audience and brief? What should remain unchanged?
- **Technical verification:** Do the relevant behavior, responsive, accessibility, markup, performance,
  and public-page checks pass? What was actually measured or operated?

Form the visual assessment before using automated findings to complete the technical assessment.
Prioritize the few weaknesses with the greatest user impact. Correct them within scope, then inspect
the affected result again. A scanner pass does not establish good composition; a beautiful screenshot
does not establish working behavior or accessibility. Use an independent reviewer when the task's
complexity warrants it and delegation is available.

Finish when the requested outcome and applicable checks are satisfied and another assessment finds
no material unresolved issue within scope. Do not force cosmetic changes merely to perform another
iteration. If rendering or a required check is unavailable, complete the useful work available and
identify the unverified surface and concrete missing prerequisite. Never substitute imagined browser
results or a self-assigned score for observed evidence.

Deliver the changed behavior, the consequential design choices, verification performed, and remaining
limitations. Reuse project documentation when decisions need to persist; do not create extra artifacts
for routine edits.

## Maintenance

[Source provenance](references/sources.md) records pinned upstream influences and retained notices.
Change guidance in response to demonstrated failures. Evaluate visual quality, technical correctness,
and workflow cost separately before treating a revised skill as an improvement.
