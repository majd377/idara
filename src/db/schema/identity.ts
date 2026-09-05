// ============================================================================
// Identity, RBAC (Roles/Permissions), and Audit — Phase 1 + Phase 2
// ============================================================================
// راجع /docs/business-rules.md للقواعد المستخلصة من ملفات Excel
// راجع /docs/database.md لشرح كل جدول والعلاقات

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Organizations — يدعم أكثر من عمارة/مؤسسة مستقبلًا (بند 84-85 من المواصفة)
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(), // مثال: "عمارة الأمين"
  currencyCode: varchar("currency_code", { length: 8 }).notNull().default("ILS"),
  currencySymbol: varchar("currency_symbol", { length: 8 }).notNull().default("₪"),
  waterUnitLabel: varchar("water_unit_label", { length: 32 }).notNull().default("كوب (م³)"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Hebron"),
  whatsappPhonePrefix: varchar("whatsapp_phone_prefix", { length: 16 }).notNull().default("972"),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 16 }).default("#0f766e"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    username: varchar("username", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    passwordHash: text("password_hash").notNull(),
    // ربط اختياري بمشترك، يستخدم لبوابة المشترك (Resident Portal — بند 54)
    subscriberId: uuid("subscriber_id"),
    isActive: boolean("is_active").notNull().default(true),
    failedLoginAttempts: varchar("failed_login_attempts", { length: 8 }).notNull().default("0"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordResetToken: text("password_reset_token"),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usernameUnique: uniqueIndex("users_username_unique").on(t.organizationId, t.username),
    emailIdx: index("users_email_idx").on(t.email),
  })
);

// ---------------------------------------------------------------------------
// Roles / Permissions (RBAC) — بند 53
// أدوار مقترحة كبذور: Super Admin, Manager, Accountant, Meter Operator, Viewer, Resident
// لكنها ليست Hard-coded؛ يمكن للمشرف إنشاء أدوار جديدة.
// ---------------------------------------------------------------------------
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(), // super_admin, manager, accountant, meter_operator, viewer, resident
    nameAr: varchar("name_ar", { length: 128 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false), // أدوار النظام الافتراضية لا تُحذف
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUnique: uniqueIndex("roles_key_unique").on(t.organizationId, t.key),
  })
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // مثال: readings.enter, readings.approve, periods.close, payments.reverse, prices.edit
    key: varchar("key", { length: 128 }).notNull().unique(),
    module: varchar("module", { length: 64 }).notNull(), // readings, periods, payments, prices, users, reports...
    descriptionAr: text("description_ar").notNull(),
    isSensitive: boolean("is_sensitive").notNull().default(false), // بند 58: عمليات مالية حساسة تحتاج صلاحية إضافية
  }
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  })
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  })
);

// ---------------------------------------------------------------------------
// Sessions (JWT opaque refresh tracking — لتمكين تسجيل الخروج الآمن وإبطال الجلسات)
// ---------------------------------------------------------------------------
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  })
);

// ---------------------------------------------------------------------------
// Audit Log — بند 57 و146: كل عملية مهمة، قابلة للبحث
// ---------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 128 }).notNull(), // e.g. reading.updated, period.closed
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
    userIdx: index("audit_user_idx").on(t.userId),
    createdIdx: index("audit_created_idx").on(t.createdAt),
  })
);

// ---------------------------------------------------------------------------
// System Settings — Key/Value قابل للتوسع بدل تعديل الكود (بند 136-137)
// ---------------------------------------------------------------------------
export const systemSettings = pgTable(
  "system_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 128 }).notNull(),
    valueJson: jsonb("value_json").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUnique: uniqueIndex("settings_key_unique").on(t.organizationId, t.key),
  })
);
