# Public-page SEO

Apply this reference to public content intended for discovery. An authenticated dashboard, isolated component, or private preview does not need a marketing SEO workstream. Preserve the project's indexing intent and established rendering architecture.

## Make the actual content discoverable

Use crawlable links with real destinations and meaningful anchor text. Provide stable routes for distinct content. Verify that the important copy and links appear in the rendered document; content hidden behind a required interaction may not be available to crawlers. Where JavaScript supplies content, inspect the server response and rendered result separately. Server rendering or pre-rendering can improve availability, but do not impose a framework migration as a styling change. Preserve useful HTTP statuses for missing pages. [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

Set a descriptive, page-specific title consistent with the visible main heading and subject. Avoid repeating boilerplate until the title loses its meaning. Check the final document head, including client-side route changes; source templates alone do not establish the emitted result. [Google's title guidance](https://developers.google.com/search/docs/appearance/title-link)

Use an accurate meta description where the project supports it, and preserve established canonical and social-preview conventions. Do not invent a production origin or add structured data for content that is not present. When these decisions are outside the requested change, surface the missing information instead of silently changing site-wide behavior.

## Keep indexing intent explicit

Inspect existing robots directives and canonical behavior before changing them. `robots.txt` governs crawling and is not a reliable way to keep a URL out of search results. Private material requires access control; `noindex` is not an authorization mechanism. Do not remove staging exclusions or publish previews as a side effect of frontend work. [Google's robots.txt guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro)

For the changed public route, check its direct URL, returned status, title, heading structure, meaningful navigation, rendered content, and relevant indexing directives. Browser tests establish implementation behavior; they do not prove indexing or ranking. Record unavailable deployment-level checks explicitly.
