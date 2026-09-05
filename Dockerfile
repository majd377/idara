# syntax=docker/dockerfile:1

# ---------- المرحلة 1: تثبيت الاعتماديات ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- المرحلة 2: البناء ----------
FROM node:22-alpine AS builder
WORKDIR /app
# ملاحظة مهمة: متغيرات NEXT_PUBLIC_* تُدمج داخل حزمة الواجهة وقت "docker build"، وليس وقت التشغيل.
# لذلك تُمرَّر كـ build ARG وليس عبر environment: في docker-compose.
ARG NEXT_PUBLIC_DEFAULT_ORG_ID=11111111-1111-4111-8111-111111111111
ENV NEXT_PUBLIC_DEFAULT_ORG_ID=${NEXT_PUBLIC_DEFAULT_ORG_ID}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# قيم وهمية للبناء فقط (لا تُستخدم وقت التشغيل الفعلي، القيم الحقيقية تأتي من docker-compose/.env)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime-please-ignore-32chars"
RUN npm run build

# ---------- المرحلة 3أ: صورة "المايجريتور" — تشغيل migrate ثم seed مرة واحدة ----------
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts tsconfig.json ./
COPY src/db ./src/db
COPY src/lib ./src/lib
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed"]

# ---------- المرحلة 3ب: التشغيل (صورة نهائية صغيرة، standalone فقط) ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
