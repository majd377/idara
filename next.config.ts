import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // يولّد حزمة تشغيل مستقلة (server.js + الحد الأدنى من node_modules) لصورة Docker صغيرة وسريعة
  output: "standalone",
};

export default nextConfig;
