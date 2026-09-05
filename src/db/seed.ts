// تشغيل: npm run db:seed
// ينشئ: مؤسسة افتراضية (عمارة الأمين)، كتالوج صلاحيات، أدوار النظام، ومستخدم مدير عام
import { db, organizations, permissions, roles, rolePermissions, users, userRoles } from "./index";
import { hashPassword } from "../lib/auth/password";
import { eq } from "drizzle-orm";
import { DEFAULT_ORG_ID } from "./constants";

// كتالوج الصلاحيات — مرجعي وقابل للتوسع مع كل Phase قادمة
const PERMISSION_CATALOG: { key: string; module: string; descriptionAr: string; isSensitive?: boolean }[] = [
  // Buildings/Units/Subscribers
  { key: "buildings.manage", module: "buildings", descriptionAr: "إدارة العمارات والوحدات" },
  { key: "subscribers.manage", module: "subscribers", descriptionAr: "إدارة المشتركين" },
  { key: "meters.manage", module: "meters", descriptionAr: "إدارة العدادات واستبدالها" },
  // Readings
  { key: "readings.enter", module: "readings", descriptionAr: "إدخال قراءات المياه" },
  { key: "readings.approve", module: "readings", descriptionAr: "اعتماد القراءات", isSensitive: true },
  { key: "readings.edit_after_approval", module: "readings", descriptionAr: "تعديل قراءة بعد الاعتماد", isSensitive: true },
  // Periods
  { key: "periods.manage", module: "periods", descriptionAr: "إنشاء وإدارة الفترات الحسابية" },
  { key: "periods.approve", module: "periods", descriptionAr: "اعتماد الفترة الحسابية", isSensitive: true },
  { key: "periods.close", module: "periods", descriptionAr: "إقفال الفترة الحسابية", isSensitive: true },
  { key: "periods.reopen", module: "periods", descriptionAr: "إعادة فتح فترة مغلقة", isSensitive: true },
  // Costs / Energy / Water pricing
  { key: "costs.manage", module: "costs", descriptionAr: "إدارة التكاليف التشغيلية والطاقة والسولار" },
  { key: "prices.edit", module: "prices", descriptionAr: "تعديل سعر المياه أو الكهرباء المعتمد", isSensitive: true },
  // Services / Emergency
  { key: "services.manage", module: "services", descriptionAr: "إدارة الخدمات (حارس، غاطس، صيانة)" },
  { key: "emergency.manage", module: "emergency", descriptionAr: "تسجيل مصاريف الطوارئ" },
  // Payments / Ledger
  { key: "payments.create", module: "payments", descriptionAr: "تسجيل دفعة" },
  { key: "payments.reverse", module: "payments", descriptionAr: "عكس/إلغاء دفعة", isSensitive: true },
  { key: "ledger.adjust", module: "ledger", descriptionAr: "تسجيل تسوية/تعديل على رصيد", isSensitive: true },
  { key: "ledger.view_all", module: "ledger", descriptionAr: "عرض كشوف حسابات كل المشتركين" },
  // Reports / Messages
  { key: "reports.view", module: "reports", descriptionAr: "عرض واستخراج التقارير" },
  { key: "messages.send", module: "messages", descriptionAr: "إرسال رسائل واتساب للمشتركين" },
  // Admin
  { key: "users.manage", module: "users", descriptionAr: "إدارة المستخدمين والأدوار والصلاحيات", isSensitive: true },
  { key: "settings.manage", module: "settings", descriptionAr: "تعديل إعدادات النظام" },
  { key: "audit.view", module: "audit", descriptionAr: "عرض سجل النشاط" },
  { key: "import.run", module: "import", descriptionAr: "استيراد بيانات من Excel" },
  // Resident (self-service only, enforced additionally at data-scope level)
  { key: "self.view_account", module: "self", descriptionAr: "عرض حسابه الشخصي فقط" },
];

const ROLE_DEFINITIONS: { key: string; nameAr: string; description: string; permissionKeys: string[] | "*" }[] = [
  { key: "super_admin", nameAr: "مدير عام", description: "صلاحية كاملة على النظام", permissionKeys: "*" },
  {
    key: "manager",
    nameAr: "مدير",
    description: "الإدارة والتقارير والمراجعة والاعتماد",
    permissionKeys: [
      "buildings.manage", "subscribers.manage", "meters.manage",
      "readings.enter", "readings.approve",
      "periods.manage", "periods.approve", "periods.close",
      "costs.manage", "services.manage", "emergency.manage",
      "payments.create", "ledger.view_all",
      "reports.view", "messages.send", "audit.view",
    ],
  },
  {
    key: "accountant",
    nameAr: "محاسب",
    description: "الحسابات والدفعات والمصاريف",
    permissionKeys: [
      "readings.enter", "costs.manage", "services.manage", "emergency.manage",
      "payments.create", "payments.reverse", "ledger.adjust", "ledger.view_all",
      "reports.view", "import.run",
    ],
  },
  {
    key: "meter_operator",
    nameAr: "قارئ عدادات",
    description: "إدخال القراءات فقط",
    permissionKeys: ["readings.enter"],
  },
  {
    key: "viewer",
    nameAr: "مشاهد",
    description: "قراءة فقط، بدون تعديل",
    permissionKeys: ["reports.view", "ledger.view_all"],
  },
  {
    key: "resident",
    nameAr: "مشترك",
    description: "الوصول إلى حسابه الشخصي فقط عبر بوابة المشترك",
    permissionKeys: ["self.view_account"],
  },
];

async function main() {
  console.log("🌱 بدء الزرع...");

  // 1) Organization
  let [org] = await db.select().from(organizations).where(eq(organizations.id, DEFAULT_ORG_ID)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ id: DEFAULT_ORG_ID, name: "عمارة الأمين", currencyCode: "ILS", currencySymbol: "₪" })
      .returning();
    console.log("✓ تم إنشاء المؤسسة الافتراضية:", org.id);
  } else {
    console.log("• المؤسسة موجودة مسبقًا:", org.id);
  }

  // 2) Permissions (upsert by key)
  const permissionIdByKey = new Map<string, string>();
  for (const p of PERMISSION_CATALOG) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.key, p.key)).limit(1);
    if (existing) {
      permissionIdByKey.set(p.key, existing.id);
      continue;
    }
    const [created] = await db.insert(permissions).values(p).returning();
    permissionIdByKey.set(p.key, created.id);
  }
  console.log(`✓ كتالوج الصلاحيات جاهز (${permissionIdByKey.size})`);

  // 3) Roles + role_permissions
  const roleIdByKey = new Map<string, string>();
  for (const r of ROLE_DEFINITIONS) {
    let [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, org.id))
      .then((rows) => rows.filter((x) => x.key === r.key));
    if (!role) {
      [role] = await db
        .insert(roles)
        .values({ organizationId: org.id, key: r.key, nameAr: r.nameAr, description: r.description, isSystem: true })
        .returning();
    }
    roleIdByKey.set(r.key, role.id);

    const grantKeys = r.permissionKeys === "*" ? [...permissionIdByKey.keys()] : r.permissionKeys;
    for (const pk of grantKeys) {
      const permissionId = permissionIdByKey.get(pk);
      if (!permissionId) continue;
      const [existingGrant] = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id))
        .then((rows) => rows.filter((x) => x.permissionId === permissionId));
      if (!existingGrant) {
        await db.insert(rolePermissions).values({ roleId: role.id, permissionId });
      }
    }
  }
  console.log(`✓ أدوار النظام جاهزة (${roleIdByKey.size})`);

  // 4) Super admin user
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn(
      "⚠ لم يتم تعيين SEED_ADMIN_PASSWORD في .env — سيتم تخطي إنشاء المستخدم المدير. عرّف كلمة مرور آمنة وأعد التشغيل."
    );
  } else {
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.organizationId, org.id))
      .then((rows) => rows.filter((u) => u.username === adminUsername));

    if (!existingAdmin) {
      const passwordHash = await hashPassword(adminPassword);
      const [admin] = await db
        .insert(users)
        .values({
          organizationId: org.id,
          fullName: "المدير العام",
          username: adminUsername,
          passwordHash,
        })
        .returning();
      await db.insert(userRoles).values({ userId: admin.id, roleId: roleIdByKey.get("super_admin")! });
      console.log(`✓ تم إنشاء المستخدم المدير العام: ${adminUsername}`);
    } else {
      console.log("• المستخدم المدير موجود مسبقًا");
    }
  }

  console.log("\n📌 معرّف المؤسسة (ضعه في NEXT_PUBLIC_DEFAULT_ORG_ID):", org.id);
  console.log("🌱 اكتمل الزرع.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ فشل الزرع:", err);
  process.exit(1);
});
