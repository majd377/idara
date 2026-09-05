# نظام إدارة حسابات عمارة الأمين

نظام ويب لإدارة حسابات عمارة سكنية: استهلاك المياه، الكهرباء/المولدات، المصاريف التشغيلية،
الخدمات، الدفعات، والأرصدة — يحل محل نظام Excel اليدوي الحالي.

**الحالة الحالية: Phase 1-3 مكتملة ومُختبرة فعليًا** (قاعدة البيانات، المصادقة والصلاحيات،
العمارات/الوحدات/المشتركون مع بيانات حقيقية مُرحّلة من Excel). راجع `/docs` للتفاصيل الكاملة.

## المتطلبات
- Docker + Docker Compose (الطريقة الموصى بها) **أو** Node.js 22+ و PostgreSQL 16+ محليًا.

## التشغيل عبر Docker (موصى به)

```bash
cp .env.example .env
# افتح .env وعدّل: POSTGRES_PASSWORD, AUTH_SECRET (32+ حرفًا عشوائيًا), SEED_ADMIN_PASSWORD

docker compose up --build
```

هذا سيقوم بالترتيب:
1. تشغيل PostgreSQL.
2. تطبيق كل الـ migrations (`migrator` service).
3. زرع الصلاحيات والأدوار الستة ومستخدم "المدير العام" الأول (بيانات الدخول من `.env`).
4. تشغيل التطبيق على http://localhost:3000

لترحيل بيانات المشتركين الحقيقية من Excel (37 مشتركًا، عمارتان):
```bash
docker compose run --rm migrator npm run db:import-legacy
```

## التشغيل محليًا بدون Docker (للتطوير)

```bash
npm install

# تشغيل PostgreSQL محليًا، ثم:
export $(grep -v '^#' .env | grep -v '^$' | xargs)
npm run db:migrate
npm run db:seed              # يطبع معرّف المؤسسة — يجب أن يطابق NEXT_PUBLIC_DEFAULT_ORG_ID في .env
npm run db:import-legacy     # اختياري: يستورد بيانات Excel الحقيقية

npm run dev                  # http://localhost:3000
```

⚠️ **مهم:** لا تُصدّر `NODE_ENV=development` في الـ shell عند تشغيل `npm run build` — يتعارض مع
وضع الإنتاج الداخلي لـ Next.js ويسبب فشل بناء غامض. اترك Next.js/Docker يديرانه تلقائيًا.

## البنية التقنية
- **الواجهة/الخادم:** Next.js 16 (App Router) + TypeScript + Tailwind CSS، عربي RTL بالكامل.
- **قاعدة البيانات:** PostgreSQL + Drizzle ORM (وليس Prisma — انظر السبب في `/docs/architecture.md`).
- **المصادقة:** JWT + جلسات قابلة للإبطال (جدول `sessions`) + bcrypt + rate limiting.
- **الصلاحيات:** RBAC كامل (6 أدوار بذرية، 25 صلاحية) — غير مُبرمَجة بشكل صلب (Hard-coded).

## الأوامر المتاحة
| الأمر | الوصف |
|---|---|
| `npm run dev` / `build` / `start` | تشغيل Next.js |
| `npm run db:generate` | توليد migration SQL جديد من التغييرات في `src/db/schema/*.ts` |
| `npm run db:migrate` | تطبيق كل migrations المعلّقة |
| `npm run db:seed` | زرع المؤسسة + الأدوار + الصلاحيات + مستخدم مدير عام أول |
| `npm run db:import-legacy` | استيراد بيانات المشتركين الحقيقية من Excel (idempotent) |

## التوثيق الكامل
- `/docs/business-rules.md` — كل معادلة مالية مستخرجة من Excel الفعلي (بما فيها Golden Test Case).
- `/docs/database.md` — شرح كل جدول والعلاقات.
- `/docs/migration.md` — Data Dictionary وحالات المراجعة (Ambiguous cases) من الترحيل.

## خارطة الطريق (Phases القادمة، غير مُنفَّذة بعد)
Phase 4: العدادات وربطها بالمشتركين بالكامل · Phase 5: الفترات الحسابية · Phase 6: الطاقة والتكاليف
التشغيلية · Phase 7: محرك تسعير المياه · Phase 8: الرسوم/الدفعات/دفتر الأستاذ · Phase 9 فما فوق:
الخدمات، التقارير، بوابة المشترك، الرسائل، الاستيراد الكامل، الاختبارات، والتوثيق النهائي.
