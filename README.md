# عمارة الأمين — V15

نسخة GitHub Pages مبنية كصفحة واحدة لتفادي مشاكل المسارات والـcache في النشر. تستخدم Firebase Authentication + Firestore.

## مهم
- ارفع `index.html` و`firestore.rules` و`README.md` إلى جذر مستودع GitHub Pages.
- فعّل Google في Firebase Authentication.
- أضف `majd377.github.io` إلى Authorized domains.
- انشر قواعد `firestore.rules`.
- لا ترفع Service Account أو Private Key أو ملفات Excel الحقيقية.

## المدير
`mjdshbyr449@gmail.com` هو حساب المدير الرئيسي. يمكنه ترقية ملف bootstrap قديم من pending إلى admin.

## ملاحظات
إذا تعذر تحميل Firebase سيظهر الخطأ على شاشة البداية بدل التعليق بلا نهاية. وإذا فشلت قراءة Collection معينة فلن ينهار الموقع كله؛ يسجلها في console ويستمر.
