# عمارة الأمين — نظام إدارة الحسابات

نظام ويب عربي RTL لإدارة حسابات العمارة: السكان والوحدات، عدادات المياه، قراءات أسبوعية، مصادر الطاقة والمولدات، المصاريف التشغيلية، الطوارئ، الدفعات وكشف الحساب.

## التشغيل المحلي — الوضع الموصى به حاليًا

هذا المشروع يستخدم **SQLite محليًا** حتى تبقى قاعدة البيانات ملفًا واحدًا سهل النسخ الاحتياطي والنقل.

### المتطلبات
- Node.js 20+ (يفضل 22)
- npm

### التشغيل

```bash
npm install
npm start
```

ثم افتح:

```text
http://localhost:3000
```

على Windows يمكنك تشغيل `run.bat`، وعلى Linux/macOS `./run.sh`.

قاعدة البيانات المحلية:

```text
db/amin.db
```

> احتفظ بنسخة احتياطية من ملف `db/amin.db` دوريًا.

## GitHub

المستودع جاهز للنشر على GitHub بعد فك الضغط:

```bash
git init
git add .
git commit -m "Initial Amin Building Manager"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

ملف `.gitignore` يستثني قاعدة البيانات المحلية والملفات المرفوعة.

## Vercel — تنبيه مهم

يمكن نشر المشروع تقنيًا عبر Vercel باستخدام `vercel.json` و`api/index.js`، **لكن لا تستخدم Vercel مع ملف SQLite المحلي كقاعدة بيانات إنتاجية**؛ نظام ملفات وظائف Vercel ليس قرصًا دائمًا لقاعدة بيانات SQLite القابلة للكتابة.

للنشر الحقيقي أمام المستخدمين لديك مساران:

1. **Local-first:** استخدم النسخة الحالية مع SQLite على جهاز الإدارة، وارفع الكود إلى GitHub فقط للنسخ والإدارة.
2. **Hosted:** أبقِ SQLite في الواجهة المحلية، ووفّر للإصدار المنشور قاعدة بيانات مستضافة متوافقة مع SQLite مثل Turso/libSQL، أو انقل طبقة الإنتاج إلى PostgreSQL/خدمة ذات تخزين دائم.

لا تضع بيانات الحسابات الحقيقية على Vercel قبل اختيار قاعدة بيانات مستضافة دائمة.

## هيكل المشروع

- `public/` الواجهة العربية RTL
- `server/` API والمنطق
- `server/services/` محرك الحسابات
- `db/` schema + SQLite محلية
- `scripts/` أدوات الاستيراد
- `docs/` التوثيق
- `api/` محول Vercel

## منطق الحساب الأساسي

### استهلاك المياه

```text
(Current Reading - Previous Reading) / 1000
```

### تكلفة الطاقة

```text
(Current Energy Reading - Previous Energy Reading + Loss) × Price per kWh
```

### السعر الخام للوحدة

```text
Net Operational Cost / Total Billable Water Consumption
```

### السعر المعتمد

```text
ROUNDUP(Raw Unit Price, 0)
```

### قيمة مياه المشترك

```text
Subscriber Consumption × Applied Unit Price
```

## ملاحظة

هذه النسخة هي Foundation تشغيلية حقيقية. قبل اعتبارها نسخة Production نهائية يجب استكمال الترحيل التاريخي الكامل من Excel، قواعد توزيع الخدمات والمصاريف، تسجيل الدخول والصلاحيات، اعتماد وإقفال الفترات، التقارير PDF/Excel، النسخ الاحتياطي الاحترافي، وربط قاعدة بيانات مستضافة عند استخدام النشر العام.


## GitHub Pages

The repository contains a root `index.html` and relative asset paths so GitHub Pages can render the UI correctly from a repository subpath. GitHub Pages cannot run the SQLite/Node backend, so it automatically switches to an interactive browser-only preview backed by `localStorage`.

For the real local SQLite application use `npm install` then `npm start`.


## واجهة سهلة — الإصدار 2
- القائمة الرئيسية أصبحت ستة أقسام واضحة فقط.
- صفحة قراءات الماء تسمح بتعديل السابقة والحالية، مع حفظ الكل دفعة واحدة.
- أضيف تصدير Excel حقيقي عند التشغيل المحلي، وتصدير CSV متوافق مع Excel في GitHub Pages.
- الواجهة تركز على خطوات العمل اليومية بدل القوائم التقنية.
