# Architecture

Modular monolith: Express API + SQLite في النسخة الأولى، مع تصميم جداول طبيعي يسمح بالترحيل إلى PostgreSQL.

Modules: Buildings, Units, Subscribers, Meters, Billing Periods, Readings, Energy, Costs, Services, Ledger, Payments, Reports, Audit, Import.

الحسابات المالية في `server/services/calculator.js` و`server/services/billing.js` وليست داخل واجهة المستخدم.
