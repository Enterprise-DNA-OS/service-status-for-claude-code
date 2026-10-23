# Verification, 23 October 2026

- Linux, Node 22.23.1, PGlite: npm test PASS, 27 commands and 82 assertions.
- Linux, isolated PostgreSQL 16.2: the same npm test PASS, 27 commands and 82 assertions. The temporary database server was stopped after testing.
- npm run demo, npm run docs and npm run view: PASS. Four branded documents and three private reports rendered. The working-week report was inspected in a headless browser.
- Three actual demo outputs are retained in docs/evidence/demo-runs.json and used on the comparison page.
- Brand lint: no errors. No author placeholders or banned prose found in the authored documentation.
- Windows and the configured PostgreSQL 17 CI job are unverified. The manual GitHub workflow could not start because the organisation's account payments or spending limit blocked runners. No test steps ran in that attempt. [Workflow attempt](https://github.com/Enterprise-DNA-OS/service-status-for-claude-code/actions/runs/40032509186).

The tests cover all CLI commands, ambiguous matches, state transitions, invalid timestamps, failed-import rollback, repeat imports, changed-contact review, opt-out preservation, component audience counts, full export, draft generation, escaped HTML and denied reads through public roles and views. Tests use fictional records only.
