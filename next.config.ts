import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" مطلوب فقط داخل صورة Docker (Dockerfile يضبط DOCKER_BUILD=1 قبل البناء).
  // إن تُرك مفعّلاً دائمًا، فإن "npm run build && npm start" محليًا (مثلاً بعد git clone)
  // يفشل في تحميل CSS/JS بصمت لأن standalone يغيّر طريقة تقديم الملفات الثابتة —
  // وهذا سبب شائع لظهور HTML بلا أي تنسيق بعد رفع/سحب المشروع من Git.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
};

export default nextConfig;
