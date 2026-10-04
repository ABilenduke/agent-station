# Design a useful experiment

Start with the decision and the smallest observation that could change it. A probe should record:

- Hypothesis and which decision criterion it addresses.
- Runtime, dependency versions, relevant configuration, and input shape.
- Reproducible command or minimal script, observed output, and interpretation.
- What was not exercised and the next check if the result is inconclusive.

Use temporary directories or disposable services where appropriate. Keep repository source and existing
changes intact. A report may embed a short script or retain necessary artifacts at an authorized research
destination. Do not leave important evidence solely at a temporary path that may disappear; preserve the
command and material output in the report. Exclude secrets, private payloads, and unnecessary raw logs.

## Performance questions

Define workload, measurement, environment, and acceptance threshold before interpreting numbers.
Separate initialization from steady-state work if relevant; account for representative data, concurrency,
caching, and variability. Report actual measurements and method. Do not translate one local timing
into a production throughput, cost, or reliability guarantee. If representative conditions are missing,
use the probe to establish a narrower fact and name the remaining benchmark.

## Feasibility and compatibility

Exercise the consequential interface and edge cases, not only the easiest happy path. Compare the
prototype's runtime and dependency versions with the target environment. Test doubles can establish
local behavior but do not verify live authentication, quotas, integration contracts, or failure modes.
Check supported behavior in authoritative documentation as well as observed behavior when relevant.

## Inconclusive results

A missing package, unavailable service, or configuration error is an experiment limitation until the
intended path runs. Diagnose proportionately; if repeated attempts yield no new information, change
approach or record the exact blocker. Never turn an unavailable test into a passing result. Preserve
negative results that rule out an option, with the conditions under which that conclusion holds.
