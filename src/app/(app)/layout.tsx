import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { href: "/dashboard", label: "لوحة التحكم" },
  { href: "/buildings", label: "العمارات والوحدات" },
  { href: "/subscribers", label: "المشتركون" },
  { href: "/meters", label: "العدادات" },
  { href: "/periods", label: "الفترات الحسابية" },
  { href: "/readings", label: "القراءات" },
  { href: "/costs", label: "التكاليف التشغيلية" },
  { href: "/water", label: "المياه" },
  { href: "/services", label: "الخدمات" },
  { href: "/emergency", label: "الطوارئ" },
  { href: "/generators", label: "المولدات" },
  { href: "/payments", label: "الدفعات" },
  { href: "/ledger", label: "الأرصدة" },
  { href: "/statements", label: "كشف الحسابات" },
  { href: "/reports", label: "التقارير" },
  { href: "/messages", label: "الرسائل" },
  { href: "/users", label: "المستخدمون والصلاحيات" },
  { href: "/settings", label: "الإعدادات" },
  { href: "/audit", label: "سجل النشاط" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-1 min-h-screen">
      <aside className="w-64 shrink-0 bg-teal-900 text-teal-50 p-4 hidden md:flex md:flex-col">
        <div className="text-lg font-bold mb-6 px-2">عمارة الأمين</div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm hover:bg-teal-800 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-4">
          <LogoutButton label={`تسجيل الخروج (${session.user.fullName})`} />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
