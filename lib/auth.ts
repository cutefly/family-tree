import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "ft_session";

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const expected = Buffer.from(keyHex, "hex");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

export function signSessionToken(payload: {
  userId: string;
  email: string;
}): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string
): { userId: string; email: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    if (
      typeof parsed?.userId === "string" &&
      typeof parsed?.email === "string"
    ) {
      return { userId: parsed.userId, email: parsed.email };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<{
  userId: string;
  email: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
