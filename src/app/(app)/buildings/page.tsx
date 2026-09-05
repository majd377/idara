import { db, buildings, units } from "@/db";
import { eq, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/service";
import { redirect } from "next/navigation";

export default async function BuildingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const rows = await db
    .select({
      id: buildings.id,
      code: buildings.code,
      name: buildings.name,
      isActive: buildings.isActive,
      unitsCount: count(units.id),
    })
    .from(buildings)
    .leftJoin(units, eq(units.buildingId, buildings.id))
    .where(eq(buildings.organizationId, session.organizationId))
    .groupBy(buildings.id)
    .orderBy(buildings.code);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">العمارات والوحدات</h1>
      <p className="text-slate-500 mb-6">
        قائمة العمارات المسجلة وعدد الوحدات في كل منها (بيانات حقيقية مُرحّلة من ملف Excel).
      </p>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          لا توجد عمارات مسجلة حتى الآن.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">عدد الوحدات</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-mono">{b.code}</td>
                  <td className="px-4 py-3">{b.name}</td>
                  <td className="px-4 py-3">{b.unitsCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-1 rounded-full " +
                        (b.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {b.isActive ? "نشطة" : "غير نشطة"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
