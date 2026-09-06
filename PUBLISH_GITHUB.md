# النشر

1. احذف/استبدل ملفات النسخة القديمة بمحتويات هذه النسخة.
2. يجب أن يكون `index.html` و`app.js` و`initial-data.js` في جذر المستودع.
3. فعّل GitHub Pages من `main / (root)`.
4. Firebase:
   - Google Sign-In مفعّل.
   - `majd377.github.io` ضمن Authorized Domains.
   - Firestore Rules من الملف `firestore.rules`.

## البيانات التاريخية المضمنة

لا ترفع ملف Excel الأصلي إلى GitHub. البيانات التاريخية المطلوبة موجودة داخل `initial-data.js` بعد تنظيفها.

عند دخول المدير لأول مرة، تتم مزامنة البيانات المفقودة إلى Firestore.

## الحذف

إذا حذف المدير سجلًا موجودًا في البيانات المضمنة، ينشئ النظام Tombstone في `seedDeletes` حتى لا يعيد الكود إنشاء السجل في الزيارة التالية.

لا تضع أي Service Account JSON أو Private Key أو `.env` داخل المستودع.
