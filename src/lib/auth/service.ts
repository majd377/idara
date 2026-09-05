import { db, users, sessions, roles, userRoles, rolePermissions, permissions } from "@/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { verifyPassword } from "./password";
import { signSessionToken, hashToken, verifySessionToken } from "./tokens";
import { cookies } from "next/headers";

const SESSION_COOKIE = "amin_session";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface AuthResult {
  ok: boolean;
  error?: string;
  token?: string;
}

/** بند 55: Authentication — تسجيل دخول بكلمة مرور مع rate limiting/lockout بسيط */
export async function login(
  organizationId: string,
  username: string,
  password: string,
  meta: { ip?: string; userAgent?: string }
): Promise<AuthResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.username, username)))
    .limit(1);

  if (!user || !user.isActive) {
    return { ok: false, error: "بيانات الدخول غير صحيحة" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "الحساب مقفل مؤقتًا بسبب محاولات دخول فاشلة متكررة. حاول لاحقًا." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = parseInt(user.failedLoginAttempts || "0", 10) + 1;
    const patch: Partial<typeof users.$inferInsert> = {
      failedLoginAttempts: String(attempts),
    };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      patch.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      patch.failedLoginAttempts = "0";
    }
    await db.update(users).set(patch).where(eq(users.id, user.id));
    return { ok: false, error: "بيانات الدخول غير صحيحة" };
  }

  // نجاح: صفّر العدّاد وسجل وقت الدخول
  await db
    .update(users)
    .set({ failedLoginAttempts: "0", lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      tokenHash: "", // نحدّثه بعد توليد التوكن لأن التوكن يحتاج sessionId
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    })
    .returning();

  const token = signSessionToken({ sub: user.id, sid: session.id, org: organizationId });
  await db.update(sessions).set({ tokenHash: hashToken(token) }).where(eq(sessions.id, session.id));

  return { ok: true, token };
}

export async function logout(token: string) {
  const payload = verifySessionToken(token);
  if (!payload) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, payload.sid));
}

/** يقرأ المستخدم الحالي من الكوكي — يستخدم في Server Components وAPI Routes */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || !user.isActive) return null;

  return { user, organizationId: payload.org };
}

/** بند 53/58: يجمع كل صلاحيات المستخدم عبر أدواره */
export async function getUserPermissionKeys(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  return new Set(rows.map((r) => r.key));
}

export async function hasPermission(userId: string, permissionKey: string): Promise<boolean> {
  const keys = await getUserPermissionKeys(userId);
  return keys.has(permissionKey);
}

export { SESSION_COOKIE };
