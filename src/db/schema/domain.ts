// ============================================================================
// Domain: Buildings → Units → Subscribers → Meters
// مستخرجة من تحليل: المشتركون + القراءات الأسبوعية (برنامج حسابات عمارة الأمين)
// ============================================================================
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(), // مثال: "1", "2" كما في Excel (البناية)
    name: varchar("name", { length: 255 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex("buildings_code_unique").on(t.organizationId, t.code),
  })
);

// ---------------------------------------------------------------------------
// Units (شقة/محل)
// ---------------------------------------------------------------------------
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    // الكود الثابت كما هو في Excel، مثال "1-01" — بند 36: Business Identifier وليس Primary Key
    code: varchar("code", { length: 32 }).notNull(),
    floorLabel: varchar("floor_label", { length: 64 }), // "الارضي", "حاصل", ...
    unitType: varchar("unit_type", { length: 32 }).notNull().default("سكني"), // سكني/تجاري
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex("units_code_unique").on(t.buildingId, t.code),
  })
);

// ---------------------------------------------------------------------------
// Subscribers (مشترك: قد يكون ساكن داخلي أو خارجي — بند 37)
// ---------------------------------------------------------------------------
export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }), // فارغ إذا خارجي
    code: varchar("code", { length: 32 }).notNull(), // "1-01" إلخ — يطابق كود Excel التاريخي
    name: varchar("name", { length: 255 }).notNull(),
    subscriberType: varchar("subscriber_type", { length: 16 }).notNull().default("داخلي"), // داخلي/خارجي — بند 37
    occupancyRole: varchar("occupancy_role", { length: 16 }).notNull().default("owner"), // owner/tenant — بند 35
    phone: varchar("phone", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    defaultGuardFee: numeric("default_guard_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    defaultPumpInsuranceFee: numeric("default_pump_insurance_fee", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    includedInWaterPricing: boolean("included_in_water_pricing").notNull().default(true), // بند 19
    moveInDate: date("move_in_date"),
    moveOutDate: date("move_out_date"), // بند 130: انتقال السكان
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex("subscribers_code_unique").on(t.organizationId, t.code),
    unitIdx: index("subscribers_unit_idx").on(t.unitId),
    phoneIdx: index("subscribers_phone_idx").on(t.phone),
  })
);

// ---------------------------------------------------------------------------
// Occupancy history — بند 35: لا يفقد تاريخ الوحدة عند تغيّر الساكن
// ---------------------------------------------------------------------------
export const unitOccupancies = pgTable(
  "unit_occupancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull().default("owner"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    finalMeterReading: numeric("final_meter_reading", { precision: 14, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unitIdx: index("occupancy_unit_idx").on(t.unitId),
  })
);

// ---------------------------------------------------------------------------
// Meters (عدادات المياه) + سجل الاستبدال — بند 9
// ---------------------------------------------------------------------------
export const meters = pgTable(
  "meters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    serialNumber: varchar("serial_number", { length: 64 }),
    installedAt: date("installed_at"),
    replacedAt: date("replaced_at"),
    replacementReason: text("replacement_reason"),
    oldFinalReading: numeric("old_final_reading", { precision: 14, scale: 3 }),
    newInitialReading: numeric("new_initial_reading", { precision: 14, scale: 3 }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    subscriberIdx: index("meters_subscriber_idx").on(t.subscriberId),
  })
);
