// استيراد المشتركين الحقيقيين من الملف المرجعي: برنامج حسابات عمارة الأمين الاحترافي.xlsx (شيت "المشتركون")
// هذه بيانات فعلية مستخرجة من Excel وليست بيانات تجريبية — بند 69/163 من المواصفة.
// تشغيل: npm run db:import-legacy
import { db, buildings, units, subscribers } from "./index";
import { eq, and } from "drizzle-orm";
import { DEFAULT_ORG_ID } from "./constants";

interface LegacyRow {
  code: string;
  name: string;
  buildingCode: string; // "1" | "2" | "0" (0 = خارجي، بلا بناية حقيقية)
  floorLabel: string;
  subscriberType: "داخلي" | "خارجي";
  phone: string | null;
  guardFee: number;
  pumpInsuranceFee: number;
}

// منسوخة حرفيًا من الشيت (الصفوف 5-41) — راجع /docs/migration.md لمصدر كل قيمة
const LEGACY_ROWS: LegacyRow[] = [
  { code: "1-01", name: "أمجد الشاويش", buildingCode: "1", floorLabel: "الارضي", subscriberType: "داخلي", phone: "972599761832", guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-02", name: "محلات أبو تامر عبيد", buildingCode: "1", floorLabel: "حاصل", subscriberType: "داخلي", phone: null, guardFee: 0, pumpInsuranceFee: 15 },
  { code: "1-03", name: "محلات حميد للصرافة", buildingCode: "1", floorLabel: "حاصل", subscriberType: "داخلي", phone: null, guardFee: 0, pumpInsuranceFee: 15 },
  { code: "1-04", name: "محلات سعيد المدهون", buildingCode: "1", floorLabel: "حاصل", subscriberType: "داخلي", phone: null, guardFee: 0, pumpInsuranceFee: 15 },
  { code: "1-05", name: "حسام شاهين أبو محمد", buildingCode: "1", floorLabel: "سده", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-06", name: "خالد شاهين", buildingCode: "1", floorLabel: "سده", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-07", name: "محمد أبو حسنة", buildingCode: "1", floorLabel: "سده", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-08", name: "ابو اسلام عواد", buildingCode: "1", floorLabel: "1", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-09", name: "أبو علاء محمد مصلح", buildingCode: "1", floorLabel: "1", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-10", name: "فيصل عبدالهادي", buildingCode: "1", floorLabel: "1", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-11", name: "ايمن احمد", buildingCode: "1", floorLabel: "2", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-12", name: "محمود ابو ركبه", buildingCode: "1", floorLabel: "2", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-13", name: "خليل المدهون", buildingCode: "1", floorLabel: "2", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-14", name: "أبو رامي الدريملي", buildingCode: "1", floorLabel: "3", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-15", name: "تامر أبو علبة", buildingCode: "1", floorLabel: "3", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-16", name: "أحمد هنية", buildingCode: "1", floorLabel: "3", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-17", name: "أمير المسحال", buildingCode: "1", floorLabel: "4", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-18", name: "أبو أشرف حرب", buildingCode: "1", floorLabel: "4", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-19", name: "محمد حمد", buildingCode: "1", floorLabel: "4", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-20", name: "احمد المجدلاوي", buildingCode: "1", floorLabel: "5", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "1-21", name: "ابو المجد شبير", buildingCode: "1", floorLabel: "5", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-22", name: "عماد عوض", buildingCode: "1", floorLabel: "5", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "1-23", name: "عامر ابو محمد مصلح", buildingCode: "1", floorLabel: "6", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-01", name: "أبو خالد سليمان", buildingCode: "2", floorLabel: "الارضي", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-02", name: "صقر ياغي", buildingCode: "2", floorLabel: "الارضي", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-03", name: "ابو انس مصلح", buildingCode: "2", floorLabel: "الارضي", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-04", name: "مصطفى أبو عيده", buildingCode: "2", floorLabel: "سده", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-05", name: "حسام عبدالباقي", buildingCode: "2", floorLabel: "سده", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "2-06", name: "وليد مصلح", buildingCode: "2", floorLabel: "سده", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-07", name: "نيفين الحتو", buildingCode: "2", floorLabel: "1", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "2-08", name: "نسمة السيد", buildingCode: "2", floorLabel: "1", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-09", name: "ابو محمد الحايك", buildingCode: "2", floorLabel: "1", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-10", name: "فهد زيادة", buildingCode: "2", floorLabel: "2", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 0 },
  { code: "2-11", name: "محمد ظاهر", buildingCode: "2", floorLabel: "2", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-12", name: "ابو عمر عاشور", buildingCode: "2", floorLabel: "3", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  { code: "2-13", name: "ام كرم ابو القرايا", buildingCode: "2", floorLabel: "3", subscriberType: "داخلي", phone: null, guardFee: 30, pumpInsuranceFee: 15 },
  // مشترك خارجي — لا ينتمي لوحدة داخل عمارة الأمين (بند 37)
  { code: "X-01", name: "عمارة البنا 1", buildingCode: "0", floorLabel: "خارجي", subscriberType: "خارجي", phone: null, guardFee: 0, pumpInsuranceFee: 0 },
];

// ملاحظة توثيقية: الصفوف 1-03 و1-04 في الملف الأصلي تحمل رقم هاتف في خانة إضافية غير رسمية
// (خارج نطاق أعمدة الدليل المعتمدة) — لم تُستورد لعدم وضوح المقصود منها (هاتف بديل؟ هاتف المالك؟).
// أُدرجت كحالة "Ambiguous" — راجع /docs/migration.md § reconciliation-cases.

async function main() {
  console.log("🚚 بدء استيراد المشتركين من الملف المرجعي...");

  const buildingIdByCode = new Map<string, string>();
  for (const code of ["1", "2"]) {
    let [b] = await db
      .select()
      .from(buildings)
      .where(and(eq(buildings.organizationId, DEFAULT_ORG_ID), eq(buildings.code, code)))
      .limit(1);
    if (!b) {
      [b] = await db
        .insert(buildings)
        .values({ organizationId: DEFAULT_ORG_ID, code, name: `عمارة الأمين ${code}` })
        .returning();
      console.log(`✓ عمارة جديدة: ${b.name} (${b.id})`);
    }
    buildingIdByCode.set(code, b.id);
  }

  let created = 0;
  let skipped = 0;

  for (const row of LEGACY_ROWS) {
    const [existing] = await db
      .select()
      .from(subscribers)
      .where(and(eq(subscribers.organizationId, DEFAULT_ORG_ID), eq(subscribers.code, row.code)))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }

    let unitId: string | null = null;
    if (row.subscriberType === "داخلي") {
      const buildingId = buildingIdByCode.get(row.buildingCode)!;
      const [unit] = await db
        .insert(units)
        .values({
          buildingId,
          code: row.code,
          floorLabel: row.floorLabel,
          unitType: row.name.startsWith("محلات") ? "تجاري" : "سكني",
        })
        .returning();
      unitId = unit.id;
    }

    await db.insert(subscribers).values({
      organizationId: DEFAULT_ORG_ID,
      unitId,
      code: row.code,
      name: row.name,
      subscriberType: row.subscriberType,
      phone: row.phone,
      defaultGuardFee: String(row.guardFee),
      defaultPumpInsuranceFee: String(row.pumpInsuranceFee),
      includedInWaterPricing: true, // TODO/Configurable Rule: لم يُحسم بعد هل X-01 يدخل في سعر الوحدة (بند 129)
    });
    created++;
  }

  console.log(`✓ تم إنشاء ${created} مشترك، وتخطي ${skipped} (موجودون مسبقًا).`);
  console.log("🚚 اكتمل الاستيراد.");
  process.exit(0);
}

main().catch((err) => {
  console.error("فشل الاستيراد:", err);
  process.exit(1);
});
