# Service Status for Claude Code

This is a single-business service communication records system. Read README.md, then the matching recipe in .claude/commands. Every answer about business state starts with the CLI.

## Commands

One CLI: scripts/status.mjs. Run npm run status -- help. Every command accepts --json. Exact codes, case-insensitive names and partial UUIDs resolve records. Ambiguous references list candidates and exit 1.

- /help
- /list
- /show
- /service-health
- /update-due
- /attention
- /maintenance
- /overlaps
- /owner-load
- /subscriber-review
- /compliance
- /activity
- /history
- /weekly-review
- /impact
- /add-component
- /set-component
- /add-incident
- /schedule-maintenance
- /log
- /resolve
- /review-subscriber
- /opt-out
- /import
- /export
- /draft-update
- /draft-maintenance
- /docs
- /view
- /customise
- /new-view

## Operating rules

Read before writing. Require an actor and user-supplied facts for changes. Never infer permission, incident resolution or service recovery. Drafts stay in drafts/. Nothing sends or publishes. Do not start an early maintenance window or complete it before verification. Component observations are separate from incident resolution. Imported subscribers remain in review; preserve opt-outs. See docs/compliance.md for internal rules and the cited retention principle.

Use local PGlite unless DATABASE_URL explicitly selects a trusted PostgreSQL operator. Never seed a shared database. This is not a multi-tenant service and provides no individual logins. Keep real imports, drafts and reports private. Do not open files from .env in chat.

## Changes

Migrations live in supabase/migrations. The one database adapter is scripts/lib/db.mjs. Brand, document and report definitions are brand.json, documents.json and views.json. Add tests for changes in behaviour and run npm test. TEST_DATABASE_URL must be an empty disposable database. Keep workflows in this one command library. No sends, publication or destructive record cleanup.

Omni by Enterprise DNA customises and runs the system for one setup fee, then a retainer.
