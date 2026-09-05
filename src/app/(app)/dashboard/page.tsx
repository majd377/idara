import { getCurrentUser, getUserPermissionKeys } from "@/lib/auth/service";
import { db, roles, userRoles } from "@/db";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) return null;

  const permissionKeys = await getUserPermissionKeys(session.user.id);
  const myRoles = await db
    .select({ nameAr: roles.nameAr, key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, session.user.id));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">لوحة التحكم</h1>
      <p className="text-slate-500 mb-6">
        مرحبًا، {session.user.fullName}. هذه شاشة تحقق للمرحلة 1-2 (قاعدة البيانات + المصادقة
        والصلاحيات). لوحة التحكم الكاملة بالمؤشرات المالية والاستهلاك تُبنى في المرحلة 7-8.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <h2 className="font-semibold mb-2">أدوارك</h2>
        <ul className="text-sm text-slate-700 space-y-1">
          {myRoles.map((r) => (
            <li key={r.key}>• {r.nameAr}</li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold mb-2">صلاحياتك ({permissionKeys.size})</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {[...permissionKeys].sort().map((k) => (
            <span key={k} className="bg-teal-50 text-teal-800 rounded-full px-2 py-1">
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
