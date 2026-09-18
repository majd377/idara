V56 — accuracy, performance, PDF, security

- Keep fundBalance = revenues - withdrawals - resident current debt, intentionally.
- Resident account reads persisted ledger/reading charges instead of rebuilding global prices from resident-only data.
- Remove global costs/contributions reads from resident mode.
- Viewer keeps access to all operational/reporting pages except settings.
- Expand page data dependencies so reports/payments/debts/fund have all required source data.
- Fix external water consumption to divide meter litres by 1000 in current totals.
- Cache manager/resident account series separately.
- Fit resident PDF to a safe A4 landscape content width.
- Keep exact numbers without Math.round/Math.ceil/toFixed.
- Security rules no longer grant residents whole cost/contribution collections.
- v56 cache-buster for GitHub Pages.
