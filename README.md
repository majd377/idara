# عمارة الأمين — V16 Embedded Historical Seed

نسخة مبنية على V11 المستقرة، مع **بيانات Excel القديمة مضمنة داخل الكود** بدل استيراد Excel من داخل الموقع.

## ماذا أُضيف؟

- بيانات تاريخية حتى **03/09/2026** مضمنة في `initial-data.js`.
- 2 عمارات.
- 36 ساكنًا داخليًا + مستهلك خارجي.
- 36 وحدة و37 عداد مياه.
- 29 فترة تاريخية.
- 1066 قراءة مياه (تشمل الخارجي تاريخيًا).
- 48 قراءة كهرباء/مولدات.
- 3 سجلات تكاليف مولد خارجي (القيم غير الصفرية الموجودة في Excel).
- أسعار الكوب التاريخية لكل أسبوع.
- صفحة **البيانات التاريخية** لعرض ما تم تضمينه.
- مزامنة أولية تلقائية للمدير إلى Firebase/Firestore.
- مطابقة بالـBusiness Keys لتجنب تكرار المباني والوحدات والسكان والعدادات والفترات إذا كانت موجودة مسبقًا.
- لا يتم استبدال بيانات Firebase الموجودة أو تعديل قيمها؛ تتم إضافة ما هو مفقود فقط.
- حذف السجلات المضمنة يسجل **tombstone** في `seedDeletes` حتى لا تعود للظهور في المزامنة التالية.
- البيانات المستقبلية/غير المكتملة في ورقة `10-09` **غير مضمنة**.

## الفكرة

`initial-data.js` هو "نسخة البداية التاريخية".

عند دخول المدير:
1. يقرأ النظام البيانات الموجودة في Firestore.
2. يطابق البيانات التاريخية معها.
3. يضيف السجلات الناقصة إلى Firestore.
4. يعيد تحميل البيانات من Firebase.
5. لاحقًا، أي تعديل يدوي على Firebase يبقى كما هو.
6. إذا تم حذف سجل تاريخي من واجهة الموقع، يتم تسجيل حذفه في `seedDeletes` حتى لا يعاد إنشاؤه من الكود.

## النشر

ارفع محتويات المشروع مباشرة إلى جذر GitHub Pages.

لا ترفع ملف Excel الأصلي إلى GitHub.

`firestore.rules` جزء من المشروع ويمكن نشره، لكن لا ترفع أي Service Account أو Private Key.

## ملاحظة

بيانات Excel التاريخية تتضمن قراءات وحسابات مياه/طاقة، لكنها لا تحتوي سجل دفعات مالي موثوقًا لكل السكان؛ لذلك لم يتم اختراع دفعات أو أرصدة مالية غير موجودة في الملف.


## V17 updates
- Added Debts page and debt ledger transactions.
- Added cost allocation modes: equal per resident, divide by N, fixed amount per resident.
- Added guard service and external generator as cost types.
- Subscriber edits are restricted to administrative roles in the UI.


## V21 additions
- Guard service is a standalone module with per-person amount and exclusions.
- Pump insurance remains separate from guard.
- Payment rollover is represented by the ledger: period-specific payments stay in their original period; unpaid/overpaid effects roll into the next period balance.
- Auto-save status is explicit and delayed 650ms to reduce accidental data loss.


## V23.1 Precision Update
- Subscriber form is identity/unit only; guard/pump settings are maintained separately.
- Resident report selects a specific week and a PDF range; PDF contains only the resident account table.
- Carry-forward logic uses only the prior net closing balance; current-period payments are deducted at the end; overpayments become credit carry-forward.
- Subscriber table label is Madyounia/indebtedness and reflects the selected period's final unpaid amount.
- Delete controls follow Firestore's manager/admin delete permissions.
