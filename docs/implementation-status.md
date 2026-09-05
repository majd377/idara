# Implementation Status

## Implemented in this first executable build
- SQLite database with normalized core entities.
- Arabic RTL responsive admin UI.
- Dashboard KPIs.
- Subscribers, buildings and auto-created water meters.
- Billing periods.
- Water readings with validation/status.
- Energy sources and readings.
- Operational costs.
- Central water calculation engine.
- Unit price ROUNDUP rule.
- Water charges + ledger entries.
- Payments + ledger credits.
- Subscriber account view.
- Audit logging for core mutations.
- Excel workbook inventory importer (non-destructive).

## Intentionally next
- Full Excel row-by-row migration/reconciliation for all historical sheets.
- Service assignment engine (monthly guard/pump insurance) and duplicate protection.
- Full allocation engine for arbitrary cost distribution with per-subscriber allocation records.
- Period approval/close workflow UI and permissions/authentication.
- PDF/Excel reports.
- WhatsApp provider integration.
- Object storage for attachments.
- PostgreSQL production adapter.
