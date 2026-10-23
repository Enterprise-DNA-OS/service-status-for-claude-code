# Service Status for Claude Code

Own the records behind your service updates: affected services, update promises, maintenance windows and subscriber review. Turn them into working briefs and read-only reports.

| Do it yourself | We customise it | We run it for you |
|---|---|---|
| Free, MIT. Install the working base. | Your service names, update rules, Statuspage records and notices. | Installed and operated through Omni by Enterprise DNA. One setup fee, then a retainer. |

[Get your version built](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=statuspage) · [Instead of Atlassian Statuspage](https://enterprisedna.co/omni/instead-of/statuspage)

## Start with a working service desk

Node 20 or later. Open the folder in Claude Code, Codex, OpenCode or Cursor. All runtimes use CLAUDE.md and the same command recipes.

```bash
npm install
npm run demo
npm run status -- weekly-review
npm run docs
npm run view
```

Local PGlite needs no separate database service. DATA_DIR selects another local directory. DATABASE_URL selects PostgreSQL with a trusted operator role. Never seed a shared database. This is a single-business operations database; it has no browser access or individual user accounts.

The fictional Kauri Service Desk seed includes slow order lookups, delayed file delivery, overlapping portal maintenance and subscribers awaiting review. Dates are relative to the first seed. Repeating the seed preserves existing records.

## The weekly rituals

1. Monday: /weekly-review combines update promises, maintenance conflicts, service health and subscriber review.
2. During disruption: /add-incident, /impact and /log record affected services, confirmed facts and the next update promise.
3. Before planned work: /schedule-maintenance and /overlaps check shared service windows.
4. Before communication: /draft-update or /draft-maintenance prepares wording from recorded facts. Nothing sends or publishes.
5. On resolution: /resolve records the result. /set-component separately records the confirmed service condition.
6. Each week: /subscriber-review and /compliance surface purpose and retention reviews.

27 CLI commands and 31 slash-command recipes. Every CLI command accepts --json. Exact codes, case-insensitive names and partial UUIDs work. Ambiguous references list candidates and exit 1. Run npm run status -- help for arguments. Write commands require --actor. Read the matching recipe before changing records.

Component status is an operator observation, not inferred from an incident closing: another incident can still affect the service. Maintenance moves through scheduled, in_progress, verifying and completed. A human supplies all facts; the program does not check uptime. Activity records preserve changes but database administrators can alter them. These are not tamper-proof audit records.

## Ten questions this build answers

These are tested queries over your records, not claims that another product cannot answer them.

1. Which promised updates are overdue? /update-due.
2. Which incidents have no named owner? /attention.
3. Which planned changes overlap on the same service? /overlaps.
4. Which degraded services also have open incidents? /service-health.
5. Who owns the largest open communication queue? /owner-load.
6. Which services have not been reviewed in thirty days? /attention.
7. Which subscribers need a purpose or retention review? /subscriber-review.
8. How many reviewed subscribers match an affected service? /impact.
9. What wording did we record as the incident changed? /history.
10. Who changed a record and what did they say? /activity and the complete export.

The thirty-day service check is a configurable working rule, not a legal deadline. Eligibility counts exclude opted-out, unreviewed and overdue-review subscribers. Component counts can overlap; do not add them to infer unique recipients.

## Bring your Statuspage records

```bash
npm run status -- import statuspage --file=imports/example-subscribers.csv --actor="Your name" --dry-run
npm run status -- import statuspage --file=imports/example-subscribers.csv --actor="Your name"
```

Replace the fictional sample with your subscriber CSV or JSON export. Public API JSON responses for components, incidents and scheduled maintenance also work. Import components before linked history, or provide a combined JSON bundle. The importer preserves original columns, checks the whole file in one transaction and leaves every new subscriber in review. Repeat imports are unchanged; changed source records require --update. Existing local opt-outs stay opted out. [Export steps and mapping](docs/replace-statuspage.md).

An export is not proof of permission to contact someone. Review the purpose, evidence, review date and component selection before marking a subscriber active. The base sends nothing, even for active subscribers. Private incident history, audience permissions, Slack subscribers, metrics and integrations need separate migration work.

## Paperwork and read-only reports

Change brand.json once. npm run docs writes incident communication briefs and maintenance notices under docs-out/. npm run view writes the working week, maintenance calendar and subscriber review reports under views/. All are private local files, excluded from version control. Print to PDF after review. Draft wording is under drafts/.

[What a screen adds](docs/why-no-front-end.md) covers production hosting, live updates, mobile use, self-service subscriptions and delivery. Those are custom implementation work with Enterprise DNA. Keep the existing customer notification service running until its replacement is tested. The free base is useful for the records and preparation work on its own.

## Your first hour: ten things to ask for

1. Put our name and logo on the incident brief.
2. Import our subscriber list as a test run.
3. Map our export's contact heading.
4. Add the services our customers use.
5. Assign an owner to each service.
6. Change our service review interval.
7. Show update promises due today.
8. Group maintenance by service owner.
9. Add a recovery evidence field.
10. Draft the next maintenance notice.

/customise adds a migration, validation and tests for your requested change. /new-view adds a read-only report. No second command library and no separate repository per coding agent.

## Verification

npm test uses an isolated temporary database, migrates and seeds twice, exercises every command and tests transitions, failed-import rollback, repeat imports, opt-out preservation, audience counts, escaped HTML, denied public reads and CLI failures. The manual workflow tests Node 20/22 on Linux and Windows and PostgreSQL 17. Check the workflow result before claiming an environment passed. TEST_DATABASE_URL must name an empty disposable database.

## The price and the scope

Atlassian lists Statuspage Enterprise at US$1,499 a month: US$17,988 over twelve months at that rate. This is published-rate arithmetic, not a customer invoice. Lower plans exist. [Vendor pricing](https://www.atlassian.com/software/statuspage/pricing), checked 23 October 2026. [Research and selection](docs/research.md).

Enterprise DNA builds your version around your services, brings across agreed records and adds hosting, access controls and notification connections when agreed. Omni by Enterprise DNA operates it for one setup fee, then a retainer. [Book 30 minutes with Sam](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=statuspage).

MIT. Not affiliated with Atlassian or Anthropic. Hosting, delivery and coding-agent usage have their own costs.
