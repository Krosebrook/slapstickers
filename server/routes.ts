import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import rateLimit from "express-rate-limit";
import * as path from "path";
import * as fs from "fs";
import * as cron from "node-cron";
import {
  placementSuggestRequestSchema,
  designRemixRequestSchema,
  ALLOWED_DESIGN_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_DESIGN_SIZE,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from "@shared/schema";
import {
  getUploadDir,
  getSessionDir,
  deleteSessionDir,
  cleanupOldUploads,
  generateSessionId,
} from "./storage";
import { suggestPlacement, suggestDesignRemix, detectFaceInImage } from "./gemini";
import { suggestPlacementFallback, suggestDesignRemixFallback } from "./openai-backup";
import { registerFileRoutes } from "./file-server";

const upload = multer({
  dest: path.join(getUploadDir(), "tmp"),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    const allAllowed = [
      ...ALLOWED_DESIGN_TYPES,
      ...ALLOWED_IMAGE_TYPES,
      ...ALLOWED_VIDEO_TYPES,
    ];
    if (allAllowed.includes(file.mimetype as any)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many AI requests. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many uploads. Please wait a moment." },
});

export async function registerRoutes(app: Express): Promise<Server> {
  cron.schedule("0 * * * *", () => {
    const cleaned = cleanupOldUploads();
    if (cleaned > 0) {
      console.log(`Cleanup: removed ${cleaned} expired upload(s)`);
    }
  });

  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    });
  });

  app.post(
    "/api/v1/ai/placement-suggest",
    aiLimiter,
    async (req: Request, res: Response) => {
      try {
        const parsed = placementSuggestRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid request",
            details: parsed.error.flatten(),
          });
        }

        const { frames, designDescription, bodyPart } = parsed.data;

        for (const frame of frames) {
          const hasFace = await detectFaceInImage(frame);
          if (hasFace) {
            return res.status(400).json({
              error: "Face detected in frame",
              detail: "Please ensure the video only captures the body area, not the face.",
              code: "FACE_DETECTED",
            });
          }
        }

        try {
          const result = await suggestPlacement(frames, designDescription, bodyPart);
          return res.json(result);
        } catch (geminiErr) {
          console.error("Gemini failed, trying OpenAI fallback:", geminiErr);
          try {
            const fallback = await suggestPlacementFallback(frames, designDescription, bodyPart);
            return res.json(fallback);
          } catch (openaiErr) {
            console.error("OpenAI fallback also failed:", openaiErr);
            return res.json({
              provider: 'gemini',
              placementNotes: 'AI analysis unavailable. Using default suggestions.',
              suggestedPlacements: [
                { anchorX: 0.5, anchorY: 0.4, scale: 1.0, rotationDeg: 0, description: 'Center placement' },
              ],
              recommendedSizeCmRange: { min: 5, max: 15 },
              confidence: 0.1,
              warnings: ['Both AI providers were unavailable. These are default suggestions.'],
            });
          }
        }
      } catch (error) {
        console.error("Placement suggest error:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.post(
    "/api/v1/ai/design-remix",
    aiLimiter,
    async (req: Request, res: Response) => {
      try {
        const parsed = designRemixRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid request",
            details: parsed.error.flatten(),
          });
        }

        const { designImage, bodyFrames, style } = parsed.data;

        try {
          const result = await suggestDesignRemix(designImage, bodyFrames, style);
          return res.json(result);
        } catch (geminiErr) {
          console.error("Gemini remix failed, trying OpenAI fallback:", geminiErr);
          try {
            const fallback = await suggestDesignRemixFallback(designImage, style);
            return res.json(fallback);
          } catch (openaiErr) {
            console.error("OpenAI remix fallback also failed:", openaiErr);
            return res.json({
              provider: 'gemini',
              suggestions: [{
                title: 'Standard Application',
                description: 'Apply with multiply blend for ink-like appearance.',
                recommendedBlendMode: 'multiply',
                recommendedOpacity: 0.85,
                recommendedWarpIntensity: 0.2,
              }],
              overallNotes: 'AI analysis unavailable. Using default settings.',
              confidence: 0.1,
            });
          }
        }
      } catch (error) {
        console.error("Design remix error:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.post(
    "/api/v1/upload/design",
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        if (!ALLOWED_DESIGN_TYPES.includes(req.file.mimetype as any)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: `File type ${req.file.mimetype} not allowed for designs` });
        }

        if (req.file.size > MAX_DESIGN_SIZE) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: "Design file exceeds 10MB limit" });
        }

        const sessionId = (req.body.sessionId as string) || generateSessionId();
        const sessionDir = getSessionDir(sessionId);
        const ext = path.extname(req.file.originalname) || '.png';
        const destPath = path.join(sessionDir, `design${ext}`);

        fs.renameSync(req.file.path, destPath);

        return res.json({
          sessionId,
          filePath: destPath,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });
      } catch (error) {
        console.error("Upload design error:", error);
        return res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  app.post(
    "/api/v1/upload/video",
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        if (!ALLOWED_VIDEO_TYPES.includes(req.file.mimetype as any)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: `File type ${req.file.mimetype} not allowed for videos` });
        }

        if (req.file.size > MAX_VIDEO_SIZE) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: "Video file exceeds 50MB limit" });
        }

        const sessionId = (req.body.sessionId as string) || generateSessionId();
        const sessionDir = getSessionDir(sessionId);
        const ext = path.extname(req.file.originalname) || '.mp4';
        const destPath = path.join(sessionDir, `video${ext}`);

        fs.renameSync(req.file.path, destPath);

        return res.json({
          sessionId,
          filePath: destPath,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });
      } catch (error) {
        console.error("Upload video error:", error);
        return res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  app.delete(
    "/api/v1/session/:sessionId",
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        if (!sessionId || sessionId.length < 10) {
          return res.status(400).json({ error: "Invalid session ID" });
        }

        const deleted = deleteSessionDir(sessionId);
        return res.json({ deleted, sessionId });
      } catch (error) {
        console.error("Delete session error:", error);
        return res.status(500).json({ error: "Delete failed" });
      }
    }
  );

  registerFileRoutes(app);

  app.get("/api/v1/usage", (_req: Request, res: Response) => {
    res.json({
      aiProviders: {
        gemini: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
      },
      limits: {
        aiRequestsPerMinute: 10,
        uploadsPerMinute: 20,
        maxDesignSizeMb: 10,
        maxVideoSizeMb: 50,
        maxImageSizeMb: 15,
        uploadRetentionHours: 24,
      },
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
