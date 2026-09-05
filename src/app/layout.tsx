import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام إدارة حسابات عمارة الأمين",
  description: "نظام إدارة حسابات العمارة، المياه، الكهرباء، الخدمات والدفعات",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col bg-slate-50 text-slate-900"
        style={{ fontFamily: "Tahoma, Arial, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
