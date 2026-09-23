# V29 — Final requested UI/accounting/auth fixes

This build is based directly on the uploaded V28 working build.

Key fixes:
- Sidebar order: Home → Weeks & Account → Electricity & Generators → Water Readings → Costs…
- Raw water price keeps decimals; approved price uses ROUNDUP.
- Numeric inputs use LTR/English digit presentation.
- Clicking a resident opens a full weekly account table, oldest → newest, without raw financial-movement log.
- Reports page has Print + PDF for the selected resident report table.
- PDF generation uses an off-screen visible canvas host to avoid blank PDFs.
- Payment editing is supported; no need to delete and recreate.
- Financial carry is signed: after payments, a positive remainder is debt; a negative result is credit and is carried into the next week as a negative previous amount.
- Google login uses popup first with redirect fallback, improving cross-device login reliability.
- Firestore rules explicitly allow an authenticated user to read/create their own member profile while restricting organization data to approved staff.

Important: publish the included firestore.rules in Firebase Console → Firestore → Rules after deploying this build.
