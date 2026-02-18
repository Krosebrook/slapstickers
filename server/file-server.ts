import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { verifySignedUrl } from "./privacy";

export function registerFileRoutes(app: Express): void {
  app.get("/api/v1/files/:token", (req: Request, res: Response) => {
    const { token } = req.params;
    const { expires, sig } = req.query;

    if (!expires || !sig || typeof expires !== 'string' || typeof sig !== 'string') {
      return res.status(400).json({ error: "Missing signature parameters" });
    }

    const filePath = verifySignedUrl(token, expires, sig);
    if (!filePath) {
      return res.status(403).json({ error: "Invalid or expired URL" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(filePath);
  });
}
