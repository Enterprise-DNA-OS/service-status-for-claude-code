# Record checks and their sources

/compliance identifies records needing a human review. It does not certify legal compliance, permission to send, service availability or safe maintenance.

| Rule | Check | Source |
|---|---|---|
| PRIVACY-9 | Imported or unreviewed subscribers, overdue review dates and opted-out records need a purpose or retention decision. No automatic deletion. | [NZ Privacy Commissioner, principle 9](https://www.privacy.org.nz/privacy-principles/9/), checked 23 October 2026. Personal information should not be retained longer than its lawful purpose requires. |
| OPS-OWNER | A service or open incident has no named owner. | Internal operating rule, not legislation. |
| OPS-UPDATE | An open event has no next update promise or the promise has passed. | Internal operating rule, not legislation. |

The operator chooses a retention review date appropriate to the purpose and jurisdiction. The law does not prescribe this program's review interval. An opted-out record stays excluded from audience counts; the operator separately decides whether any lawful retention need remains. This build never deletes contact records automatically or sends messages.

New imports start in review regardless of a vendor's confirmed flag. Activating a subscriber needs a human-supplied purpose, evidence reference, review date and component selection. Re-importing changed source data cannot reactivate an opt-out. An opted-out subscriber needs a separate reviewed procedure if they later ask to subscribe again.

Database tables use row-level security without public access policies; views use the caller's permissions. Run as a trusted owner. Access controls for a shared service, backups, storage encryption and jurisdiction-specific rules must be agreed before real data is installed. Generated reports, imports and exports are private records. File modes restrict access on Linux; Windows operators must apply appropriate directory permissions. Activity is editable by database administrators, not cryptographic evidence.
