#!/usr/bin/env python3
"""Observe benchmark behavior in Chromium; this is not a design or WCAG grader.

Usage: python3 verify_browser.py --url http://127.0.0.1:4173 \
    --case accessible-booking-form --output /tmp/form-observations.json

Exit 0: observations recorded (inspect JSON status); 2: harness could not run.
Selector mismatch is reported separately from an observed behavior failure.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlparse

from playwright.sync_api import TimeoutError as BrowserTimeout, sync_playwright


CASES = (
    "field-notes-landing",
    "harbor-vue-operations",
    "accessible-booking-form",
    "river-guide-article",
)


class ManualReview(Exception):
    """The generic probe cannot safely identify the intended UI."""


def unique(locator, description):
    matches = [item for item in locator.all() if item.is_visible()]
    if len(matches) != 1:
        raise ManualReview(f"{description}: expected one visible match, found {len(matches)}")
    return matches[0]


def eventually(predicate, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


class Verifier:
    def __init__(self, browser, url):
        self.url = url
        self.page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        self.page.set_default_timeout(4000)
        self.checks = []
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def run(self, name, callback):
        try:
            evidence = callback()
            self.checks.append({"id": name, "status": "pass", "evidence": evidence or {}})
        except AssertionError as error:
            self.checks.append({"id": name, "status": "fail", "evidence": str(error)})
        except (ManualReview, BrowserTimeout) as error:
            self.checks.append({"id": name, "status": "manual_review", "evidence": str(error)})
        except Exception as error:
            self.checks.append({"id": name, "status": "manual_review", "evidence": f"Probe error: {type(error).__name__}: {error}"})

    def load(self):
        self.page.goto(self.url, wait_until="networkidle", timeout=30000)
        self.page.set_viewport_size({"width": 1440, "height": 1000})

    def field(self, name, label):
        named = self.page.locator(f'[name="{name}"]')
        if any(item.is_visible() for item in named.all()):
            return unique(named, f"field {name}")
        return unique(self.page.get_by_label(re.compile(label, re.I)), f"field {label}")

    def submit(self):
        return unique(self.page.locator('form button[type="submit"], form input[type="submit"], form button:not([type])'), "submit control")

    def common(self):
        def reflow():
            self.load()
            results = []
            for width in (390, 320):
                self.page.set_viewport_size({"width": width, "height": 844})
                self.page.wait_for_timeout(100)
                results.append(self.page.evaluate("""() => ({width: innerWidth,
                    documentWidth: document.documentElement.scrollWidth})"""))
            assert all(item["documentWidth"] <= item["width"] + 1 for item in results), f"Body overflow observed: {results}"
            return results

        def labels():
            self.load()
            unnamed = self.page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').evaluate_all("""els => els.filter(el => el.getClientRects().length && !(
                el.getAttribute('aria-label')?.trim() ||
                (el.getAttribute('aria-labelledby') || '').split(/\\s+/).some(id => document.getElementById(id)?.textContent.trim()) ||
                [...(el.labels || [])].some(label => label.textContent.trim()) || el.title.trim()
            )).map(el => ({tag: el.tagName, name: el.name, placeholder: el.placeholder || ''}))""")
            assert not unnamed, f"Visible controls lack an observed programmatic label: {unnamed}"
            return {"unlabeled_controls": [], "method": "HTML labels, aria-label/labelledby, and title; not a full accessible-name computation"}

        self.run("narrow-body-reflow", reflow)
        self.run("form-control-labels", labels)

    def axe(self, script):
        """Scan fresh initial states; retain findings rather than assign conformance."""
        report = {
            "engine": "axe-core",
            "script_path": str(script.resolve()),
            "script_sha256": hashlib.sha256(script.read_bytes()).hexdigest(),
            "scope": "Fresh initial document at desktop and mobile; interaction states are not scanned.",
            "interpretation": "No automated violations means only that selected axe rules found none in these states. Incomplete findings require human review. This does not establish WCAG conformance.",
            "observations": [],
        }
        requested_tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
        for viewport in ({"width": 1440, "height": 1000}, {"width": 390, "height": 844}):
            observation = {"viewport": viewport, "requested_tags": requested_tags}
            report["observations"].append(observation)
            try:
                self.page.set_viewport_size(viewport)
                self.page.goto(self.url, wait_until="networkidle", timeout=30000)
                self.page.add_script_tag(path=str(script.resolve()))
                self.page.wait_for_function("Boolean(window.axe?.run)")
                result = self.page.evaluate("""async requested => {
                    await document.fonts.ready;
                    const available = new Set(axe.getRules().flatMap(rule => rule.tags));
                    const active = requested.filter(tag => available.has(tag));
                    if (!active.length) throw new Error('No requested WCAG tags available');
                    const results = await axe.run(document, {
                        runOnly: {type: 'tag', values: active}
                    });
                    return {
                        version: axe.version,
                        active_tags: active,
                        unavailable_tags: requested.filter(tag => !available.has(tag)),
                        timestamp: results.timestamp,
                        violations: results.violations,
                        incomplete: results.incomplete,
                        passed_rule_ids: results.passes.map(rule => rule.id),
                        inapplicable_rule_ids: results.inapplicable.map(rule => rule.id)
                    };
                }""", requested_tags)
                observation.update(result)
                observation["status"] = "violations" if result["violations"] else "needs_review" if result["incomplete"] else "no_automated_violations"
                self.checks.append({
                    "id": f"axe-initial-{viewport['width']}",
                    "status": "fail" if result["violations"] else "manual_review" if result["incomplete"] else "pass",
                    "evidence": {
                        "version": result["version"],
                        "violation_rule_ids": [item["id"] for item in result["violations"]],
                        "incomplete_rule_ids": [item["id"] for item in result["incomplete"]],
                        "details": "automated_accessibility.observations",
                    },
                })
            except Exception as error:
                observation.update({"status": "scan_error", "error": f"{type(error).__name__}: {error}"})
                self.checks.append({"id": f"axe-initial-{viewport['width']}", "status": "manual_review", "evidence": observation["error"]})
        return report

    def landing(self):
        def workshop_choice():
            self.load()
            observed = []
            for value, label in (("mono", "monoprint"), ("block", "block print")):
                choices = self.page.locator(f'[data-workshop="{value}"]')
                if not any(item.is_visible() for item in choices.all()):
                    choices = self.page.get_by_role("link", name=re.compile(label, re.I))
                unique(choices, f"choose {label}").click()
                selected = self.field("workshop", "workshop").input_value()
                observed.append({"clicked": value, "selected": selected})
                assert selected == value, f"Workshop selection mismatch: {observed}"
            return observed

        def reservation():
            self.load()
            self.field("workshop", "workshop").select_option("block")
            self.field("name", "name").fill("Ada")
            self.field("email", "email").fill("ada@example.test")
            self.submit().click()
            assert eventually(lambda: "Ada" in self.page.locator("body").inner_text()), "No visible confirmation naming Ada after valid submit."
            body = self.page.locator("body").inner_text()
            assert "68" in body and "October 8" in body, "Workshop date/price missing after reservation."
            assert re.search(r"no (?:booking|payment)|not (?:send|sent)|preview|demonstration|demo", body, re.I), "Local preview meaning missing after reservation."
            return {"name": "Ada", "workshop": "block", "local_preview_text_present": True}

        self.run("workshop-selection", workshop_choice)
        self.run("reservation-confirmation", reservation)

    def harbor(self):
        def search():
            return unique(self.page.get_by_role("textbox", name=re.compile("search|find", re.I)), "job search")

        def status(value):
            selects = self.page.get_by_role("combobox", name=re.compile("status|filter", re.I))
            if any(item.is_visible() for item in selects.all()):
                control = unique(selects, "status filter")
                options = control.locator("option").evaluate_all("els => els.map(el => ({value: el.value, text: el.textContent.trim()}))")
                matching = [option for option in options if option["value"] == value or re.match(rf"^{re.escape(value)}(?:\s|$)", option["text"], re.I)]
                if len(matching) != 1:
                    raise ManualReview(f"Could not identify status option {value}: {options}")
                control.select_option(matching[0]["value"])
            else:
                unique(self.page.get_by_role("button", name=re.compile(rf"^{re.escape(value)}(?:\s|$)", re.I)), f"status {value}").click()

        def ids():
            rows = self.page.get_by_role("row").all_text_contents()
            if not rows:
                raise ManualReview("No table rows; inspect the alternative job presentation manually.")
            return [match.group(0) for row in rows if (match := re.search(r"HB-\d{4}", row))]

        def filters():
            self.load()
            status("At risk")
            assert eventually(lambda: set(ids()) == {"HB-1042", "HB-1046", "HB-1051"}), f"Unexpected At risk results: {ids()}"
            search().fill("Little Atlas")
            assert eventually(lambda: ids() == ["HB-1046"]), f"Combined search/filter results: {ids()}"
            status("All")
            search().fill("Riverside")
            assert eventually(lambda: set(ids()) == {"HB-1044", "HB-1049"}), f"Unexpected Riverside results: {ids()}"
            search().fill("NoSuchCustomer")
            assert eventually(lambda: ids() == []), f"Unmatched search still shows jobs: {ids()}"
            assert re.search(r"no (?:jobs|results|deliveries|matches)|nothing found|0 (?:jobs|results)", self.page.locator("body").inner_text(), re.I), "No understandable empty-result message observed."
            return {"at_risk": 3, "combined": "HB-1046", "riverside": 2, "empty": 0}

        def sort():
            self.load()
            before = ids()
            assert len(before) == 12, f"Expected 12 initial jobs, observed {before}"
            control = unique(self.page.get_by_role("button", name=re.compile("due", re.I)), "due-time sort")
            control.click()
            assert eventually(lambda: ids()[0] != before[0]), "Due sort did not reverse the first visible job."
            after = ids()
            assert (before[0], before[-1], after[0], after[-1]) == ("HB-1042", "HB-1053", "HB-1053", "HB-1042"), f"Unexpected order: before {before}; after {after}"
            control.click()
            assert eventually(lambda: ids() == before), f"Second toggle did not restore ascending order: {ids()}"
            return {"ascending": [before[0], before[-1]], "descending": [after[0], after[-1]]}

        def details():
            self.load()
            row = unique(self.page.get_by_role("row").filter(has_text="HB-1046"), "Little Atlas row")
            button = unique(row.get_by_role("button"), "Little Atlas detail button")
            button.focus()
            button.press("Enter")
            assert eventually(lambda: "One parcel is missing its label" in self.page.locator("body").inner_text()), "Selected handoff note did not appear."
            close = unique(self.page.get_by_role("button", name=re.compile("close", re.I)), "close job details")
            close.focus()
            close.press("Enter")
            assert eventually(lambda: "One parcel is missing its label" not in self.page.locator("body").inner_text()), "Job detail did not close."
            return {"selected": "HB-1046", "keyboard_open_close": True, "focus_after_close": self.page.evaluate("document.activeElement?.outerHTML.slice(0, 300)")}

        self.run("search-status-empty", filters)
        self.run("due-time-sorting", sort)
        self.run("job-details-keyboard", details)

    def instrument_archive(self):
        self.load()
        if not self.page.evaluate("Boolean(window.archiveApi?.reserve)"):
            raise ManualReview("Public archiveApi.reserve was not available for non-invasive request counting.")
        self.page.evaluate("""() => {
            window.__archiveProbe = {calls: 0, pending: 0, failures: 0};
            const reserve = window.archiveApi.reserve;
            window.archiveApi.reserve = async function(...args) {
                window.__archiveProbe.calls++;
                window.__archiveProbe.pending++;
                try { return await Reflect.apply(reserve, this, args); }
                catch (error) { window.__archiveProbe.failures++; throw error; }
                finally { window.__archiveProbe.pending--; }
            };
        }""")

    def feedback(self):
        """Observe visible announcements/focus and actual field-error associations."""
        return self.page.evaluate("""() => {
            const visible = el => el && el.getClientRects().length > 0 &&
                getComputedStyle(el).visibility !== 'hidden';
            const text = el => visible(el) ? el.innerText.trim() : '';
            const active = document.activeElement;
            const regions = [...document.querySelectorAll(
                '[role="alert"], [role="status"], [aria-live]:not([aria-live="off"]), [tabindex]:focus'
            )].filter(el => text(el)).map(el => ({id: el.id, text: text(el)}));
            const controls = [...document.querySelectorAll('input, select, textarea')]
                .filter(visible).map(el => ({
                    key: [...document.querySelectorAll('input, select, textarea')].indexOf(el),
                    name: el.name, id: el.id, focused: el === active,
                    nativeInvalid: !!el.validity && !el.validity.valid,
                    nativeMessage: el.validationMessage || '',
                    nativeValidationEnabled: !!el.willValidate && !el.form?.noValidate,
                    ariaInvalid: el.getAttribute('aria-invalid') === 'true',
                    associated: ['aria-describedby', 'aria-errormessage'].flatMap(attr =>
                        (el.getAttribute(attr) || '').split(/\\s+/).filter(Boolean)
                            .map(id => ({id, text: text(document.getElementById(id))})))
                        .filter(item => item.text),
                    focusedSummaryLink: !!el.id && !!active && active !== document.body &&
                        [...active.querySelectorAll('a[href]')].some(a => a.getAttribute('href') === '#' + el.id)
                }));
            return {regions, controls};
        }""")

    def validation_feedback(self, before, kind):
        observed = self.feedback()
        old_regions = {item['text'] for item in before['regions']}
        announced = any(item['text'] not in old_regions for item in observed['regions'])
        expected = {'empty': {'name', 'email', 'date', 'purpose', 'agreement'},
                    'whitespace': {'name', 'purpose'}, 'email': {'email'}}[kind]
        labels = {'name': 'name', 'email': 'email', 'date': 'appointment|date',
                  'purpose': 'research|purpose', 'agreement': 'understand|agree'}
        expected_keys = {self.field(name, labels[name]).evaluate(
            "el => [...document.querySelectorAll('input, select, textarea')].indexOf(el)"
        ) for name in expected}
        old_associations = {item['text'] for control in before['controls'] for item in control['associated']}
        supported = []
        for control in observed['controls']:
            if control['key'] not in expected_keys:
                continue
            associated = any(item['text'] not in old_associations for item in control['associated'])
            native = (control['nativeInvalid'] and control['nativeMessage'] and control['focused']
                      and control['nativeValidationEnabled']
                      and self.submit().get_attribute('formnovalidate') is None)
            custom = associated or (announced and (
                control['ariaInvalid'] or control['focusedSummaryLink']))
            if native or custom:
                supported.append(control['name'])
        assert supported, f"Submission blocked without observed validation feedback for {kind}: {observed}"
        return {"fields_with_feedback": supported, "observed": observed}

    def service_failure_feedback(self, before, pending, first_failure=True):
        assert eventually(lambda: self.page.evaluate(
            "window.__archiveProbe.failures > 0 && window.__archiveProbe.pending === 0"
        )), "Expected API failure did not settle."
        old_text = {item['text'] for item in before['regions']}
        pending_text = {item['text'] for item in pending['regions']} if first_failure else set()

        def error_regions():
            return [item for item in self.feedback()['regions']
                    if item['text'] not in old_text and item['text'] not in pending_text]

        assert eventually(error_regions), "Service failed without new visible announced/focused feedback."
        button = self.submit()
        assert button.is_enabled() and button.get_attribute('aria-disabled') != 'true', "Retry action remains disabled after failure."
        return error_regions()

    def booking_values(self, email="alex@example.test"):
        values = {"name": "Alex Reed", "email": email, "purpose": "Family research", "access": "Adjustable desk"}
        for name, value in values.items():
            self.field(name, {"name": "name", "email": "email", "purpose": "research|purpose", "access": "access"}[name]).fill(value)
        self.field("date", "appointment|date").select_option("2026-10-13")
        self.field("agreement", "understand|agree").check()
        return {**values, "date": "2026-10-13"}

    def booking(self):
        def calls():
            return self.page.evaluate("window.__archiveProbe.calls")

        def validation(kind):
            self.instrument_archive()
            if kind != "empty":
                self.booking_values()
                if kind == "whitespace":
                    self.field("name", "name").fill("   ")
                    self.field("purpose", "research|purpose").fill("   ")
                else:
                    self.field("email", "email").fill("bad-address")
            before = self.feedback()
            self.submit().click()
            self.page.wait_for_timeout(200)
            assert calls() == 0, f"{kind} input reached archiveApi.reserve ({calls()} calls)."
            return {"api_calls": calls(), "invalid_input": kind,
                    "feedback": self.validation_feedback(before, kind)}

        def pending():
            self.instrument_archive()
            self.booking_values()
            button = self.submit()
            button.dblclick(delay=30)
            self.page.wait_for_timeout(80)
            count = calls()
            assert count == 1, f"Rapid double click started {count} requests."
            busy = self.page.locator('[aria-busy="true"], [role="status"], [aria-live="polite"], [aria-live="assertive"]').all_text_contents()
            assert any(re.search("send|submitt|requesting|processing|loading", text, re.I) for text in busy) or self.page.locator('[aria-busy="true"]').count(), f"No observed announced progress or aria-busy while pending; regions: {busy}"
            return {"api_calls_while_pending": count, "live_region_text": busy}

        def retry():
            self.instrument_archive()
            values = self.booking_values("retry@example.test")
            before = self.feedback()
            self.submit().click()
            pending_feedback = self.feedback()
            error_feedback = self.service_failure_feedback(before, pending_feedback)
            actual = {name: self.field(name, name if name != "purpose" else "research|purpose").input_value() for name in values}
            assert actual == values, f"Entered values changed after failure: {actual}"
            assert self.field("agreement", "understand|agree").is_checked(), "Agreement lost after failure."
            self.submit().click()
            assert eventually(lambda: "NB-2046" in self.page.locator("body").inner_text()), "Retry did not visibly confirm NB-2046."
            assert calls() == 2, f"Expected two deliberate requests, observed {calls()}."
            return {"api_calls": calls(), "preserved_values": actual, "reference": "NB-2046",
                    "error_feedback": error_feedback}

        def persistent():
            self.instrument_archive()
            self.booking_values("unavailable@example.test")
            before = self.feedback()
            failures = []
            for _ in range(2):
                previous = calls()
                self.submit().click()
                pending_feedback = self.feedback()
                assert eventually(lambda: calls() == previous + 1), "Retry did not reach the API."
                failures.append(self.service_failure_feedback(before, pending_feedback, first_failure=previous == 0))
                assert self.field("email", "email").input_value() == "unavailable@example.test", "Input lost after service failure."
            assert "NB-2046" not in self.page.locator("body").inner_text(), "Persistent failure incorrectly showed success."
            return {"api_calls": calls(), "success_fabricated": False, "error_feedback": failures}

        def revise():
            self.instrument_archive()
            values = self.booking_values()
            self.submit().click()
            assert eventually(lambda: "NB-2046" in self.page.locator("body").inner_text()), "Successful request had no visible reference."
            control = self.page.get_by_role("button", name=re.compile("revise|edit|change.*request|change.*details", re.I))
            if not any(item.is_visible() for item in control.all()):
                control = self.page.get_by_role("link", name=re.compile("revise|edit|change.*request|change.*details", re.I))
            if not any(item.is_visible() for item in control.all()):
                raise ManualReview("No revise/edit control matched; inspect whether a differently named revision action exists.")
            unique(control, "revise request").click()
            actual = {name: self.field(name, name if name != "purpose" else "research|purpose").input_value() for name in values}
            assert actual == values, f"Revision lost request values: {actual}"
            return {"preserved_values": actual, "focus_after_revise": self.page.evaluate("document.activeElement?.outerHTML.slice(0, 300)")}

        for kind in ("empty", "whitespace", "email"):
            self.run(f"validation-{kind}", lambda kind=kind: validation(kind))
        self.run("pending-progress-duplicate-prevention", pending)
        self.run("service-error-preserve-retry", retry)
        self.run("persistent-service-error", persistent)
        self.run("revise-confirmed-request", revise)

    def article(self):
        def indexing():
            response = self.page.request.get(self.url)
            assert response.ok, f"HTTP status {response.status}"
            source = response.text()
            self.load()
            meta = self.page.evaluate("""() => ({title: document.title,
                lang: document.documentElement.lang,
                description: document.querySelector('meta[name="description"]')?.content || '',
                robots: [...document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')].map(el => el.content),
                canonical: document.querySelector('link[rel="canonical"]')?.href || ''})""")
            problems = []
            if not re.search("river|Alderwick", meta["title"], re.I): problems.append("generic page title")
            if not meta["lang"].startswith("en"): problems.append("missing English document language")
            if not meta["description"].strip(): problems.append("missing search description")
            if any(re.search(r"noindex|\bnone\b", value, re.I) for value in meta["robots"]): problems.append("HTML robots blocks indexing")
            if re.search(r"noindex|\bnone\b", response.headers.get("x-robots-tag", ""), re.I): problems.append("HTTP robots blocks indexing")
            if meta["canonical"] != "https://walks.alderwick.example/guides/river-loop/": problems.append("missing or incorrect production canonical")
            for phrase in ("5.2", "2.4", "12 steps", "floodwater", "September 1, 2026"):
                if phrase not in source: problems.append(f"content missing from initial HTML: {phrase}")
            assert not problems, f"Observed public-page issues: {problems}; metadata: {meta}"
            return meta

        def navigation():
            self.load()
            fragments = self.page.locator('a[href^="#"]')
            targets = []
            for fragment in fragments.all():
                href = fragment.get_attribute("href")
                if href and href != "#" and fragment.is_visible():
                    targets.append(href)
            needed = {"#route", "#sections", "#access", "#getting-here", "#seasonal"}
            if not needed.issubset(targets):
                raise ManualReview(f"Expected section anchors missing or renamed; inspect navigation semantics manually. Observed {targets}")
            for href in sorted(needed):
                link = self.page.locator(f'a[href="{href}"]').first
                link.focus()
                link.press("Enter")
                assert eventually(lambda: self.page.url.endswith(href)), f"Keyboard anchor did not update fragment: {href}"
                target = self.page.locator(href)
                assert target.count() == 1, f"Anchor target missing or duplicated: {href}"
            return {"keyboard_fragments": sorted(needed)}

        def structure():
            self.load()
            values = self.page.evaluate("""() => ({main: document.querySelectorAll('main, [role="main"]').length,
              h1: document.querySelectorAll('h1').length, h2: document.querySelectorAll('h2').length,
              tableHeaders: document.querySelectorAll('table th').length,
              unnamedImages: [...document.images].filter(el => !el.hasAttribute('alt')).map(el => el.getAttribute('src'))})""")
            assert values["main"] == 1 and values["h1"] == 1 and values["h2"] >= 5, f"Missing article landmarks/headings: {values}"
            assert values["tableHeaders"] >= 4, f"Route table lacks observed header cells: {values}"
            assert not values["unnamedImages"], f"Images missing alternative attributes: {values['unnamedImages']}"
            return values

        self.run("public-indexing-initial-content", indexing)
        self.run("section-navigation-keyboard", navigation)
        self.run("article-semantic-structure", structure)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--case", required=True, choices=CASES)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--axe-script", type=Path, help="Optional local pinned axe-core browser bundle; no downloads are performed.")
    args = parser.parse_args()
    if urlparse(args.url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("Use a locally served fixture; these probes submit fictional form data.")
    report = {
        "schema_version": 1,
        "case": args.case,
        "url": args.url,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "limitations": [
            "These are behavioral observations, not design scores or a WCAG conformance audit.",
            "Selector changes require manual review; manual_review is not a passing result.",
            "Reduced motion is requested, but animation, contrast, screen-reader output, and visible focus need separate inspection.",
            "Archive API instrumentation counts calls while preserving original arguments and responses.",
            "Optional axe scans cover initial desktop/mobile states only; clean automated results do not establish WCAG conformance.",
        ],
    }
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                verifier = Verifier(browser, args.url)
                verifier.load()
                if args.axe_script:
                    report["automated_accessibility"] = verifier.axe(args.axe_script)
                verifier.common()
                getattr(verifier, {"field-notes-landing": "landing", "harbor-vue-operations": "harbor", "accessible-booking-form": "booking", "river-guide-article": "article"}[args.case])()
                verifier.checks.append({"id": "uncaught-browser-errors", "status": "fail" if verifier.errors else "pass", "evidence": verifier.errors})
                report["checks"] = verifier.checks
                report["summary"] = dict(Counter(check["status"] for check in verifier.checks))
                report["status"] = "fail" if report["summary"].get("fail") else "manual_review" if report["summary"].get("manual_review") else "pass"
            finally:
                browser.close()
    except Exception as error:
        report["status"] = "harness_error"
        report["error"] = f"{type(error).__name__}: {error}"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "status": report["status"], "summary": report.get("summary", {})}))
    return 2 if report["status"] == "harness_error" else 0


if __name__ == "__main__":
    sys.exit(main())
