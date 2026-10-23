# Bring records from Atlassian Statuspage

## Export subscribers

In Statuspage open Subscribers, choose Export subscribers, select email, SMS or webhook records and request CSV or JSON. Atlassian emails the result. Slack subscriptions cannot be exported through this feature. [Official subscriber export guide](https://support.atlassian.com/statuspage/docs/export-subscribers/), checked 23 October 2026.

Save the downloaded file under imports/. Keep it private. The guide promises CSV/JSON but does not specify a fixed CSV heading contract; preview your actual file before migration. The importer recognises email or Email Address, phone_number, endpoint, optional channel/type and id. It preserves every original field in source_data. Alternative headings require an explicit mapping change and a fixture test.

```bash
npm run status -- import statuspage --file=imports/subscribers.csv --actor="Your name" --dry-run
npm run status -- import statuspage --file=imports/subscribers.csv --actor="Your name"
npm run status -- subscriber-review
```

The test run validates and rolls back the entire file. No subscriber becomes eligible merely by importing. Review purpose, permission evidence, review date and component preferences using review-subscriber. Unknown component preferences stay in the original data until mapped; first review requires an explicit selection. Existing opt-outs cannot be reactivated by this command. SMS and webhook records are stored only; nothing sends or calls those addresses.

## Components, incidents and maintenance

Public pages document read-only JSON endpoints for their components, incidents and scheduled maintenance. [Atlassian's own example API guide](https://support.status.atlassian.com/api), checked 23 October 2026. Download responses for your own page. The summary contains only unresolved/upcoming records; it is not a full history export. Retrieve all required history pages and reconcile the date range against the incumbent. Private pages require the administrator's separate authenticated export process; this program handles downloaded files and no credentials.

Import the components response first. Then import each incident or maintenance response with the same command. Alternatively combine their arrays as components, incidents and scheduled_maintenances in one JSON object. imports/example-statuspage.json demonstrates the documented response shape with fictional records. A subscriber JSON array is also accepted.

| Source | Destination |
|---|---|
| Component id, name, status, description | Service with preserved source id and complete source record |
| Incident id, name, status, impact, timestamps | Event, historical state and original source record |
| Incident components | Links to already imported services; missing links reject the file |
| incident_updates | Timestamped wording and status; source update ids prevent duplicates |
| Scheduled start and finish | Maintenance window; finish must be after start |
| Subscriber email, phone_number or endpoint | Contact in review; original preferences retained |

A repeated identical source row is unchanged and does not reset local work. Changed rows stop the whole import until the operator supplies --update. That option refreshes mapped source fields and links and keeps local owners, update promises and subscriber state. Back up before refreshing historical incidents: a source update can replace locally edited mapped fields. Duplicate source ids, broken timestamps, unsupported states and missing component references reject the entire file.

## Reconcile before switching

Compare subscriber counts by channel, component counts, incident date ranges, update counts and maintenance windows. Check opt-outs and map preferences. Use export --file=exports/dated-backup.json for a full native snapshot, including history. This is a private backup for inspection or a separately tested restore; it is not a vendor-format re-import file. CSV export requires --kind and preserves field text. Open external CSV text without evaluating spreadsheet formulas.

Metrics, audience permissions, automations, delivery history, attachments, custom page design, self-service subscriptions and Slack subscribers are not reconstructed from these exports. Enterprise DNA scopes and tests those separately. Keep existing notifications, monitoring and hosting running until the agreed replacements work. A record import can be completed in a day for a checked export; operational cutover depends on the integrations and history involved.
