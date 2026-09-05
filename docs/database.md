# توثيق قاعدة البيانات — Phase 1-3

راجع أيضًا: `/docs/business-rules.md` للمعادلات، `/docs/migration.md` لمصدر البيانات المُرحّلة.

## الجداول المنفَّذة حتى الآن

### الهوية والصلاحيات (`src/db/schema/identity.ts`)
| الجدول | الغرض |
|---|---|
| `organizations` | المؤسسة (عمارة الأمين) — معرّف ثابت `11111111-1111-4111-8111-111111111111` لهذا الإصدار أحادي المؤسسة |
| `users` | حسابات الدخول، مرتبطة اختياريًا بمشترك (بوابة المشترك لاحقًا) |
| `roles` / `permissions` / `role_permissions` / `user_roles` | RBAC كامل — 6 أدوار بذرية، 25 صلاحية مصنّفة بالوحدة (module) |
| `sessions` | جلسات JWT قابلة للإبطال (تسجيل خروج حقيقي، ليس فقط حذف كوكي) |
| `audit_logs` | سجل تدقيق عام (action/entity/old/new/reason) — يُستخدم بدءًا من Phase 4 |
| `system_settings` | إعدادات Key/Value لكل مؤسسة، بديل عن Hard-coding |

### الهيكل التنظيمي (`src/db/schema/domain.ts`)
| الجدول | الغرض |
|---|---|
| `buildings` | العمارات (كود + اسم) |
| `units` | الوحدات، مرتبطة ببناية، كود ثابت مطابق لـ Excel (`1-01` إلخ) |
| `unit_occupancies` | تاريخ الإشغال (مالك/مستأجر) — لا يُفقد عند تغيّر الساكن |
| `subscribers` | المشتركون (داخلي/خارجي)، مع رسوم افتراضية (حارس/غاطس) مطابقة لـ Excel |
| `meters` | عدادات المياه + سجل الاستبدال (قراءة نهائية قديمة/أولية جديدة) |

## قواعد تصميم مطبَّقة
- كل جدول: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` (باستثناء `organizations` التي تستخدم معرّفًا ثابتًا مقصودًا).
- كل مبلغ مالي: `NUMERIC(14,2)`. كل استهلاك مياه: `NUMERIC(14,3)`.
- فهارس على: `organization_id`, `building_id`, `unit_id`, `subscriber_id`, الأكواد الفريدة (`code`).
- لا حذف فعلي لسجلات مالية (لم تُبنَ بعد — Phase 8) — فقط `is_active` للكيانات غير المالية حتى الآن.

## الجداول القادمة (Phase 5 فما فوق، لم تُبنَ بعد)
`billing_periods`, `meter_readings`, `energy_sources`, `energy_readings`, `operational_costs`,
`allocation_rules`, `services`, `charges`, `payments`, `payment_allocations`, `ledger_transactions`,
`external_consumers`, `emergency_events`, `message_templates`, `message_logs`, `attachments`.

## كيفية تطبيق التغييرات على Schema
```bash
npm run db:generate   # يولّد ملف SQL migration جديد في src/db/migrations
npm run db:migrate     # يطبّق كل migrations المعلّقة على DATABASE_URL
```
لا تستخدم `db:push` في الإنتاج (تفاعلي وغير موثّق — بند 122 من المواصفة).
