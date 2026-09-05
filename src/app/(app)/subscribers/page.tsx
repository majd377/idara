import { db, subscribers, units, buildings } from "@/db";
import { eq, and, or, ilike } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/service";
import { redirect } from "next/navigation";

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; building?: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const { q, building } = await searchParams;

  const conditions = [eq(subscribers.organizationId, session.organizationId)];
  if (q) {
    conditions.push(
      or(ilike(subscribers.name, `%${q}%`), ilike(subscribers.code, `%${q}%`))!
    );
  }
  if (building) {
    conditions.push(eq(buildings.code, building));
  }

  const rows = await db
    .select({
      id: subscribers.id,
      code: subscribers.code,
      name: subscribers.name,
      subscriberType: subscribers.subscriberType,
      phone: subscribers.phone,
      isActive: subscribers.isActive,
      guardFee: subscribers.defaultGuardFee,
      pumpFee: subscribers.defaultPumpInsuranceFee,
      buildingCode: buildings.code,
      floorLabel: units.floorLabel,
    })
    .from(subscribers)
    .leftJoin(units, eq(units.id, subscribers.unitId))
    .leftJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(...conditions))
    .orderBy(subscribers.code);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">المشتركون</h1>
      <p className="text-slate-500 mb-6">
        {rows.length} مشترك — بيانات حقيقية مُرحّلة من دليل المشتركين في ملف Excel.
      </p>

      <form className="flex gap-2 mb-4" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="ابحث بالاسم أو الكود..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <select
          name="building"
          defaultValue={building || ""}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل العمارات</option>
          <option value="1">عمارة 1</option>
          <option value="2">عمارة 2</option>
        </select>
        <button className="rounded-lg bg-teal-700 text-white px-4 py-2 text-sm font-medium hover:bg-teal-800">
          بحث
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">الكود</th>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">العمارة / الدور</th>
              <th className="px-4 py-3 font-medium">النوع</th>
              <th className="px-4 py-3 font-medium">الهاتف</th>
              <th className="px-4 py-3 font-medium">الحارس</th>
              <th className="px-4 py-3 font-medium">الغاطس</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono">{s.code}</td>
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3 text-slate-500">
                  {s.buildingCode ? `عمارة ${s.buildingCode} / ${s.floorLabel}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "text-xs px-2 py-1 rounded-full " +
                      (s.subscriberType === "داخلي"
                        ? "bg-teal-50 text-teal-800"
                        : "bg-amber-50 text-amber-800")
                    }
                  >
                    {s.subscriberType}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{s.phone || "—"}</td>
                <td className="px-4 py-3">{Number(s.guardFee)} ₪</td>
                <td className="px-4 py-3">{Number(s.pumpFee)} ₪</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-8 text-center text-slate-500">لا توجد نتائج مطابقة.</div>
        )}
      </div>
    </div>
  );
}
