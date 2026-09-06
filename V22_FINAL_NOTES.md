# V22 Final

Base: V21 stable.

- Subscriber form no longer asks for guard fee or pump insurance.
- Residents page shows current amount owed as **المديونية**.
- Resident report requires subscriber + week and offers from/to week for the PDF range.
- Resident message separates guard, other expenses, previous debts, subtotal, current-week payments, and final amount due.
- Water charge in resident reports/messages rounds to nearest whole ILS; persisted automatic calculation also rounds.
- Comprehensive weekly horizontal account table replaces the old latest-reads/financial-movements sections.
- PDF button downloads only the resident report card via html2pdf.js; no print page action.
- Core water calculation remains: residents building totals + external water; Abu Zayid + Sweissi power; contributions reduce net operating cost.
