# V20 Final Notes

- Built from the working V19 base; Firebase config/ORG_ID preserved.
- Contributions dynamically recalculate the current water cup price when no per-reading manual override exists.
- Resident reading price defaults to the current automatically calculated cup price.
- Changing an individual resident's price away from the automatic price shows a confirmation warning; choosing OK keeps a manual price for that resident, cancel restores the automatic price.
- Current resident water charges and messages use the effective current price rather than stale stored charge values.
- Message order is: current water + services + previous balance/debts + total before payments + payments recorded + final amount due.
- Costs such as guard service, pump insurance, and external-generator rental are treated as resident-level charges by default and are excluded from the water-unit-price calculation; other costs can be explicitly marked as included/excluded.
- Settings uses the selected week for both delete-this-week and delete-all-except-selected actions.
- Resident create/edit UI is limited to admin/manager, and Firestore rules restrict subscriber writes to manager-level roles.
- Embedded initial period remains 2026-09-03 only.
