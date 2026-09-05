# نشر عمارة الأمين على GitHub وVercel

## لماذا ظهرت الصفحة بدون CSS والأزرار لا تعمل؟

كان المشروع يستخدم مسارات جذرية مثل `/styles.css` و`/app.js`، وهي لا تعمل بشكل صحيح عندما يكون الموقع GitHub Pages على مسار مشروع مثل `https://USER.github.io/REPO/`. كذلك GitHub Pages يستضيف ملفات ثابتة فقط، لذلك لا يمكنه تشغيل Node.js/Express أو SQLite مباشرة.

هذه النسخة أصلحت الأمرين:

- أضفت `index.html` في جذر المستودع.
- جعلت ملفات CSS وJavaScript تستخدم مسارات نسبية.
- أضفت `.nojekyll`.
- أضفت `static-demo.js`؛ عند فتح الموقع من GitHub Pages يعمل كـ Demo تفاعلي محفوظ في المتصفح بواسطة `localStorage` حتى لا تكون الصفحة ميتة.
- التشغيل المحلي الكامل يبقى Node.js + SQLite حقيقية.

## GitHub Pages

في GitHub:

1. ارفع محتويات المشروع إلى المستودع.
2. افتح Settings → Pages.
3. Source = Deploy from a branch.
4. Branch = `main` وFolder = `/ (root)`.
5. احفظ.

بعدها افتح رابط Pages الخاص بالمستودع.

## التشغيل الحقيقي محليًا

```bash
npm install
npm start
```

ثم:

`http://localhost:3000`

البيانات الحقيقية تحفظ في:

`db/amin.db`

## Vercel

Vercel مناسب لتشغيل طبقة Node/API، لكن لا تعتمد على SQLite داخل بيئة Vercel كقاعدة بيانات دائمة للحسابات الحقيقية. قبل الإنتاج على الإنترنت اربط التطبيق بقاعدة بيانات مستضافة دائمة.

الـ `vercel.json` و`api/index.js` موجودان لهذا الغرض، وتمت تهيئة مسار SQLite إلى `/tmp` على Vercel فقط حتى لا يفشل Runtime أثناء المعاينة، مع التنبيه أن البيانات هناك ليست تخزينًا إنتاجيًا دائمًا.
