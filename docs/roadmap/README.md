# Roadmap

Forward-looking work only. Implemented phases live in
[`../history/`](../history/). For current behaviour, see
[`../architecture/`](../architecture/).

## Open items

- [`01-sms-automation.md`](./01-sms-automation.md) — LLM-powered SMS
  intake for staff call-outs, running late, and shift-swap requests.
  Not started. Twilio not yet installed.
- [`02-production-readiness.md`](./02-production-readiness.md) —
  Remaining work before a paid launch: AI audit logging,
  error/loading boundaries, observability, runbooks.

## How to use this folder

- Keep each file to a single coherent initiative.
- Describe **why** and **what "done" looks like**, not a sprint
  breakdown. Detailed implementation plans belong in a temporary
  branch doc or PR description, not here.
- When work ships, move a concise summary into
  [`../history/`](../history/) and delete the roadmap file.
