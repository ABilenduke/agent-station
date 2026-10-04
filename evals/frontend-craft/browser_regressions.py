"""Real Chromium regressions for booking probes; run directly with Python Playwright."""

import json
from pathlib import Path
import unittest

from playwright.sync_api import sync_playwright
from verify_browser import Verifier


FORM = """
<form novalidate>
<label for="name">Name</label><input id="name" name="name" required>
<label for="email">Email</label><input id="email" name="email" type="email" required>
<label for="date">Appointment date</label><select id="date" name="date" required>
<option value="">Choose</option><option value="2026-10-13">October 13</option></select>
<label for="purpose">Research purpose</label><textarea id="purpose" name="purpose" required></textarea>
<label for="access">Access needs</label><textarea id="access" name="access"></textarea>
<label><input type="checkbox" name="agreement" required>I agree</label>
<button type="submit">Send request</button></form>
<p id="notice" role="status" tabindex="-1"></p>
<button type="button" id="revise" hidden>Revise request</button>
"""
HANDLER = """
const form = document.querySelector('form');
const notice = document.querySelector('#notice');
const button = form.querySelector('button');
let sending = false;
form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    for (const field of form.elements) {
        if (field.required && (!field.checkValidity() ||
            (['name', 'purpose'].includes(field.name) && !field.value.trim()))) {
            if (!window.silentValidation) {
                notice.textContent = 'Check this field before continuing.';
                field.setAttribute('aria-invalid', 'true');
                field.setAttribute('aria-describedby', 'notice');
                field.focus();
            }
            return;
        }
    }
    sending = true; button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    notice.textContent = 'Sending your request...';
    try {
        const result = await window.archiveApi.reserve(Object.fromEntries(new FormData(form)));
        notice.textContent = 'Confirmed: ' + result.reference;
        document.querySelector('#revise').hidden = false;
    } catch (error) {
        if (!window.silentFailure) notice.textContent = window.failureCopy;
    } finally {
        sending = false; button.disabled = false;
        form.setAttribute('aria-busy', 'false');
    }
});
document.querySelector('#revise').onclick = () => {
    notice.textContent = '';
    document.querySelector('#name').focus();
};
"""


class BookingProbeRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        cls.api = (Path(__file__).parent / 'fixtures/accessible-booking-form/starter/api.js').read_text()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.verifier = Verifier(self.browser, 'about:blank')
        self.copy = 'Unable to send; try again.'
        self.flags = {}

        def load():
            self.verifier.page.goto('about:blank')
            self.verifier.page.set_content(FORM)
            self.verifier.page.add_script_tag(content=self.api)
            self.verifier.page.evaluate('(values) => Object.assign(window, values)', {
                'failureCopy': self.copy, **self.flags,
            })
            self.verifier.page.add_script_tag(content=HANDLER)

        self.verifier.load = load

    def tearDown(self):
        self.verifier.page.close()

    def run_checks(self, names=None):
        run = self.verifier.run
        if names:
            self.verifier.run = lambda name, callback: run(name, callback) if name in names else None
        self.verifier.booking()
        return {item['id']: item for item in self.verifier.checks}

    def test_alternative_error_copy_preserves_retry_and_persistent_failure_checks(self):
        for copy in ('Unable to send; try again.', 'Your request wasn’t sent. Please retry.'):
            with self.subTest(copy=copy):
                self.copy = copy
                self.verifier.checks.clear()
                checks = self.run_checks()
                self.assertEqual(len(checks), 7)
                self.assertTrue(all(item['status'] == 'pass' for item in checks.values()), json.dumps(checks))

    def test_zero_api_calls_without_validation_feedback_fail(self):
        self.flags['silentValidation'] = True
        checks = self.run_checks({'validation-empty', 'validation-whitespace', 'validation-email'})
        self.assertEqual([item['status'] for item in checks.values()], ['fail'] * 3, checks)

    def test_stale_progress_is_not_accepted_as_a_service_error(self):
        self.flags['silentFailure'] = True
        checks = self.run_checks({'service-error-preserve-retry', 'persistent-service-error'})
        self.assertEqual([item['status'] for item in checks.values()], ['fail'] * 2, checks)

    def test_native_validation_focus_and_message_are_accepted(self):
        self.verifier.instrument_archive()
        self.verifier.page.locator('form').evaluate('el => el.noValidate = false')
        before = self.verifier.feedback()
        self.verifier.submit().click()
        result = self.verifier.validation_feedback(before, 'empty')
        self.assertIn('name', result['fields_with_feedback'])

    def test_hidden_associated_errors_do_not_pass(self):
        self.verifier.instrument_archive()
        self.verifier.booking_values()
        self.verifier.field('email', 'email').fill('bad-address')
        before = self.verifier.feedback()
        self.verifier.page.evaluate("""() => {
            const notice = document.querySelector('#notice');
            notice.textContent = 'Enter a valid email'; notice.hidden = true;
            const field = document.querySelector('#email');
            field.setAttribute('aria-invalid', 'true');
            field.setAttribute('aria-describedby', 'notice');
            document.querySelector('button').focus();
        }""")
        with self.assertRaisesRegex(AssertionError, 'without observed validation feedback'):
            self.verifier.validation_feedback(before, 'email')


if __name__ == '__main__':
    unittest.main()
