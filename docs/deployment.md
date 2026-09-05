# Deployment

## Local — Recommended

```bash
npm install
npm start
```

SQLite file:

```text
db/amin.db
```

خذ نسخة احتياطية من الملف قبل أي ترقية كبيرة.

## GitHub

```bash
git init
git add .
git commit -m "Initial Amin Building Manager"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## Vercel

يوجد `vercel.json` و`api/index.js` لتجهيز المشروع كوظيفة Node، لكن **SQLite المحلية غير مناسبة لبيانات إنتاج على Vercel لأن التخزين هناك غير دائم**.

استخدم Vercel بعد ربط طبقة قاعدة بيانات مستضافة دائمة. الخيار الأقرب لفكرة SQLite هو Turso/libSQL، أو استخدم PostgreSQL في بيئة إنتاجية.

لا تنشر `db/amin.db` إلى GitHub ولا تعتمد على Vercel لتخزينه.

## نشر الواجهة العامة لاحقًا

الخيار الأنسب:
- GitHub: حفظ الكود وإدارة الإصدارات.
- Local SQLite: التشغيل الفعلي المحلي إذا كانت الإدارة تعمل من جهاز واحد.
- Vercel: مناسب للواجهة/الطبقة العامة بعد ربط قاعدة بيانات مستضافة دائمة.

لا ترفع `db/amin.db` إلى GitHub.
