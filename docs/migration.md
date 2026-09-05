# Excel Migration

استخدم `npm run import:excel -- path.xlsx` لعمل inventory أولي للملف.

بعد تثبيت Mapping النهائي، يجب إدخال البيانات في جداول:
subscribers, units, meters, billing_periods, meter_readings, energy_readings, operational_costs, payments, ledger_transactions.

يجب إجراء reconciliation أسبوعًا بأسبوع قبل إقفال الترحيل.
