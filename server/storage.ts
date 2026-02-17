import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const TTL_HOURS = 24;

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function getUploadDir(): string {
  ensureUploadDir();
  return UPLOAD_DIR;
}

export function getSessionDir(sessionId: string): string {
  const dir = path.join(UPLOAD_DIR, sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function deleteSessionDir(sessionId: string): boolean {
  const dir = path.join(UPLOAD_DIR, sessionId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

export function cleanupOldUploads(): number {
  ensureUploadDir();
  const now = Date.now();
  const ttlMs = TTL_HOURS * 60 * 60 * 1000;
  let cleaned = 0;

  try {
    const entries = fs.readdirSync(UPLOAD_DIR);
    for (const entry of entries) {
      const entryPath = path.join(UPLOAD_DIR, entry);
      const stat = fs.statSync(entryPath);
      if (now - stat.mtimeMs > ttlMs) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        cleaned++;
      }
    }
  } catch (err) {
    console.error("Cleanup error:", err);
  }

  return cleaned;
}

export function generateSessionId(): string {
  return randomUUID();
}
