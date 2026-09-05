# عمارة الأمين — النسخة السحابية السهلة

هذه النسخة تستخدم Google Authentication + Cloud Firestore، لذلك بيانات العمارة ليست مرتبطة بمتصفح أو جهاز واحد. Firestore يوفر أيضًا cache محليًا للسرعة والعمل عند انقطاع الشبكة، بينما المصدر المشترك للبيانات هو السحابة.

## نشر GitHub Pages
1. ارفع محتويات هذا المجلد إلى جذر المستودع.
2. GitHub → Settings → Pages → Deploy from branch → `main` → `/ (root)`.
3. في Firebase Authentication فعّل Google.
4. في Authentication → Settings → Authorized domains أضف `majd377.github.io`.
5. أنشئ Cloud Firestore.
6. ضع محتوى `firestore.rules` في Firestore Rules وانشره.

## أول تسجيل دخول
أول حساب ينشئ نفسه بدور `admin` إذا لم يكن هناك عضو بعد. الحسابات اللاحقة تبدأ `pending` ويمنحها المدير الصلاحية من صفحة الإعدادات.

## المزايا الرئيسية
- تسجيل دخول Google.
- بيانات مشتركة بين الحسابات المصرح لها.
- حفظ Firestore + offline cache.
- تعديل بيانات السكان.
- أرشفة/حذف آمن للسكان.
- فتح أسبوع جديد.
- تعديل القراءة السابقة والحالية.
- تصدير Excel حقيقي XLSX داخل المتصفح.
- حذف أسبوع بصلاحية مدير/مدير مساعد.
- إدارة صلاحيات الحسابات.
- كشف حساب الساكن.

## ملاحظة أمنية
إعداد Firebase Web Config الموجود في `firebase-config.js` عبارة عن إعدادات تطبيق ويب عامة وليست Service Account private key. الحماية الحقيقية للبيانات تأتي من Authentication + Firestore Security Rules.
