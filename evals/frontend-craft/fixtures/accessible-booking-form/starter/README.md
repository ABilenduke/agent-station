# Northbank Archive research appointments

Run `python3 -m http.server 4173 --bind 127.0.0.1` and visit `http://127.0.0.1:4173`.

No dependencies or network calls. All content is fictional. `api.js` exposes `window.archiveApi.reserve(booking)` and must retain its public behavior:

- Resolves after 900 ms with `{reference: 'NB-2046', ...booking}`.
- For `retry@example.test`, the first request fails; retrying succeeds.
- For `unavailable@example.test`, every request fails with a service-unavailable message.
- Any other email succeeds. Reload to reset the retry demonstration.

Booking fields are `name`, `email`, `date`, `purpose`, `access`, and `agreement`. Available dates are October 6, 13, and 20, 2026, each at 10 a.m. Do not send personal information to an external service.
