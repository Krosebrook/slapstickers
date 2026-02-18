import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { deleteSessionDir } from "./storage";

let sharp: any = null;
try {
  sharp = require("sharp");
} catch {
  console.warn("sharp not available — EXIF stripping disabled");
}

const signedUrlTokens = new Map<string, { filePath: string; expires: number }>();

const cleanupTimers = new Map<string, NodeJS.Timeout>();

export async function stripExif(filePath: string): Promise<string> {
  if (!sharp) {
    return filePath;
  }

  try {
    const buffer = await sharp(filePath).rotate().toBuffer();
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error("stripExif error:", err);
    return filePath;
  }
}

export function generateSignedUrl(filePath: string, ttlSeconds: number = 900): string {
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  const token = crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;

  signedUrlTokens.set(token, { filePath, expires });

  const payload = `${token}:${expires}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return `/api/v1/files/${token}?expires=${expires}&sig=${sig}`;
}

export function verifySignedUrl(token: string, expires: string, sig: string): string | null {
  try {
    const secret = process.env.SESSION_SECRET || "fallback-secret";
    const expiresNum = parseInt(expires, 10);

    if (isNaN(expiresNum)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > expiresNum) {
      signedUrlTokens.delete(token);
      return null;
    }

    const payload = `${token}:${expires}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) {
      return null;
    }

    const entry = signedUrlTokens.get(token);
    if (!entry) {
      return null;
    }

    return entry.filePath;
  } catch (err) {
    console.error("verifySignedUrl error:", err);
    return null;
  }
}

export function scheduleEphemeralCleanup(sessionId: string, delayMs: number = 1800000): void {
  try {
    if (cleanupTimers.has(sessionId)) {
      clearTimeout(cleanupTimers.get(sessionId)!);
    }

    const timer = setTimeout(() => {
      try {
        deleteSessionDir(sessionId);
        console.log(`Ephemeral cleanup: deleted session ${sessionId}`);
      } catch (err) {
        console.error(`Ephemeral cleanup error for session ${sessionId}:`, err);
      }
      cleanupTimers.delete(sessionId);
    }, delayMs);

    cleanupTimers.set(sessionId, timer);
  } catch (err) {
    console.error("scheduleEphemeralCleanup error:", err);
  }
}

export function cancelEphemeralCleanup(sessionId: string): void {
  try {
    const timer = cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      cleanupTimers.delete(sessionId);
      console.log(`Ephemeral cleanup cancelled for session ${sessionId}`);
    }
  } catch (err) {
    console.error("cancelEphemeralCleanup error:", err);
  }
}
