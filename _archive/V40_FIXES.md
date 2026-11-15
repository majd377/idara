# V40 — fixes

- Fixed resident → building → unit → water-meter linkage and prevents selecting a unit from another building.
- Added automatic repair for legacy references that use building/unit codes instead of Firestore document IDs.
- Missing internal water meters are recreated automatically for active residents.
- New residents are added to existing water-reading rows and current applicable guard/pump-insurance services without retroactively charging old months.
- Added building delete controls to the Water page; deletion remains safe and refuses to orphan residents/financial history. Empty units can be removed together with the building.
- Implemented all Excel export handlers used by the active build: residents, water, electricity, payments, balances, and weekly summary.
- Improved PDF rendering host so html2canvas can actually render it instead of capturing an empty off-screen fixed element.
- Bumped asset cache version to 40.0.
