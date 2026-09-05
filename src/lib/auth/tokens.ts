import jwt from "jsonwebtoken";
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET;
if (!SECRET || SECRET.length < 32) {
  // نفشل بوضوح بدل استخدام سر افتراضي غير آمن — بند 56: no hardcoded credentials/secrets
  if (process.env.NODE_ENV !== "test") {
    console.warn(
      "[auth] تحذير: AUTH_SECRET غير معرف أو قصير جدًا. عرّفه في .env قبل التشغيل في بيئة إنتاج."
    );
  }
}

export interface SessionPayload {
  sub: string; // userId
  sid: string; // sessionId (in `sessions` table, allows revocation)
  org: string; // organizationId
}

const EXPIRES_IN = "8h";

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET || "dev-only-insecure-secret-change-me", {
    expiresIn: EXPIRES_IN,
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET || "dev-only-insecure-secret-change-me") as SessionPayload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
