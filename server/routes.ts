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
  consentPayloadSchema,
  placementSchema,
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
import { moderateContent, moderateDesign, validateConsent } from "./policy-gate";
import { stripExif, generateSignedUrl, scheduleEphemeralCleanup, cancelEphemeralCleanup } from "./privacy";
import { jobQueue } from "./job-queue";
import type { NewJob } from "./job-queue";
import { removeBackground } from "./background-removal";

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
  jobQueue.startProcessing();

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
    "/api/v1/moderate/content",
    aiLimiter,
    async (req: Request, res: Response) => {
      try {
        const { imageBase64, consent } = req.body;
        if (!imageBase64 || typeof imageBase64 !== "string") {
          return res.status(400).json({ error: "imageBase64 is required" });
        }

        if (consent) {
          const consentParsed = consentPayloadSchema.safeParse(consent);
          if (!consentParsed.success) {
            return res.status(400).json({ error: "Invalid consent payload", details: consentParsed.error.flatten() });
          }
          if (!validateConsent(consentParsed.data)) {
            return res.status(403).json({
              error: "Consent validation failed",
              detail: "All consent fields must be confirmed before processing.",
              code: "CONSENT_REQUIRED",
            });
          }
        }

        const result = await moderateContent(imageBase64);
        return res.json(result);
      } catch (error) {
        console.error("Moderate content error:", error);
        return res.status(500).json({ error: "Moderation failed" });
      }
    }
  );

  app.post(
    "/api/v1/moderate/design",
    aiLimiter,
    async (req: Request, res: Response) => {
      try {
        const { designBase64 } = req.body;
        if (!designBase64 || typeof designBase64 !== "string") {
          return res.status(400).json({ error: "designBase64 is required" });
        }

        const result = await moderateDesign(designBase64);
        return res.json(result);
      } catch (error) {
        console.error("Moderate design error:", error);
        return res.status(500).json({ error: "Moderation failed" });
      }
    }
  );

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
              detail: "Please ensure the photo only captures the body area, not the face.",
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

        await stripExif(destPath);

        const removeBg = req.body.removeBg !== 'false';
        const tolerance = parseInt(req.body.tolerance as string, 10) || 30;
        let processedPath = destPath;
        let bgRemoved = false;

        if (removeBg && req.file.mimetype !== 'image/svg+xml') {
          try {
            const processedFilePath = path.join(sessionDir, `design_transparent.png`);
            await removeBackground(destPath, processedFilePath, {
              tolerance,
              mode: 'auto',
            });
            processedPath = processedFilePath;
            bgRemoved = true;
          } catch (bgErr) {
            console.error("Background removal failed, using original:", bgErr);
          }
        }

        const signedUrl = generateSignedUrl(processedPath);
        const originalSignedUrl = bgRemoved ? generateSignedUrl(destPath) : undefined;

        return res.json({
          sessionId,
          filePath: processedPath,
          signedUrl,
          originalSignedUrl,
          originalName: req.file.originalname,
          mimeType: bgRemoved ? 'image/png' : req.file.mimetype,
          size: req.file.size,
          bgRemoved,
        });
      } catch (error) {
        console.error("Upload design error:", error);
        return res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  app.post(
    "/api/v1/process/remove-background",
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        const tolerance = parseInt(req.body.tolerance as string, 10) || 30;
        const mode = (req.body.mode as string) || 'auto';

        const sessionId = (req.body.sessionId as string) || generateSessionId();
        const sessionDir = getSessionDir(sessionId);
        const outputPath = path.join(sessionDir, `design_transparent.png`);

        let targetColor: { r: number; g: number; b: number } | undefined;
        if (mode === 'color' && req.body.colorR && req.body.colorG && req.body.colorB) {
          targetColor = {
            r: parseInt(req.body.colorR, 10),
            g: parseInt(req.body.colorG, 10),
            b: parseInt(req.body.colorB, 10),
          };
        }

        await removeBackground(req.file.path, outputPath, {
          tolerance,
          mode: mode as 'auto' | 'white' | 'color',
          targetColor,
        });

        fs.unlinkSync(req.file.path);

        const signedUrl = generateSignedUrl(outputPath);

        return res.json({
          sessionId,
          signedUrl,
          filePath: outputPath,
          bgRemoved: true,
          tolerance,
          mode,
        });
      } catch (error) {
        console.error("Background removal error:", error);
        return res.status(500).json({ error: "Background removal failed" });
      }
    }
  );

  app.post(
    "/api/v1/upload/body-image",
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype as any)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: `File type ${req.file.mimetype} not allowed for images` });
        }

        if (req.file.size > MAX_IMAGE_SIZE) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: "Image file exceeds 15MB limit" });
        }

        const sessionId = (req.body.sessionId as string) || generateSessionId();
        const sessionDir = getSessionDir(sessionId);
        const ext = path.extname(req.file.originalname) || '.jpg';
        const destPath = path.join(sessionDir, `body${ext}`);

        fs.renameSync(req.file.path, destPath);

        await stripExif(destPath);

        const signedUrl = generateSignedUrl(destPath);

        return res.json({
          sessionId,
          filePath: destPath,
          signedUrl,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });
      } catch (error) {
        console.error("Upload body image error:", error);
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
          return res.status(500).json({ error: "Video file exceeds 50MB limit" });
        }

        const sessionId = (req.body.sessionId as string) || generateSessionId();
        const sessionDir = getSessionDir(sessionId);
        const ext = path.extname(req.file.originalname) || '.mp4';
        const destPath = path.join(sessionDir, `video${ext}`);

        fs.renameSync(req.file.path, destPath);

        const signedUrl = generateSignedUrl(destPath);

        return res.json({
          sessionId,
          filePath: destPath,
          signedUrl,
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

  app.post(
    "/api/v1/jobs/submit",
    aiLimiter,
    async (req: Request, res: Response) => {
      try {
        const { type, sessionId, inputData, consent } = req.body;

        if (!type || !sessionId || !inputData) {
          return res.status(400).json({ error: "type, sessionId, and inputData are required" });
        }

        if (!['premium_still', 'video_render'].includes(type)) {
          return res.status(400).json({ error: "type must be 'premium_still' or 'video_render'" });
        }

        if (consent) {
          const consentParsed = consentPayloadSchema.safeParse(consent);
          if (!consentParsed.success || !validateConsent(consentParsed.data)) {
            return res.status(403).json({
              error: "Consent required for premium processing",
              code: "CONSENT_REQUIRED",
            });
          }
        }

        const placementParsed = placementSchema.safeParse(inputData.placement);
        if (!placementParsed.success) {
          return res.status(400).json({ error: "Invalid placement data", details: placementParsed.error.flatten() });
        }

        const newJob: NewJob = {
          type,
          sessionId,
          inputData: {
            bodyImagePath: inputData.bodyImagePath,
            designImagePath: inputData.designImagePath,
            placement: placementParsed.data,
            bodySegmentationData: inputData.bodySegmentationData,
            videoPath: inputData.videoPath,
            previewMode: inputData.previewMode || "fresh",
          },
        };

        const jobId = jobQueue.submitJob(newJob);
        const job = jobQueue.getJob(jobId);

        return res.json(job);
      } catch (error) {
        console.error("Job submit error:", error);
        return res.status(500).json({ error: "Job submission failed" });
      }
    }
  );

  app.get("/api/v1/jobs/:jobId", (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId as string;
      const job = jobQueue.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      return res.json(job);
    } catch (error) {
      console.error("Job status error:", error);
      return res.status(500).json({ error: "Failed to get job status" });
    }
  });

  app.get("/api/v1/jobs/session/:sessionId", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId as string;
      const jobs = jobQueue.getSessionJobs(sessionId);
      return res.json({ jobs });
    } catch (error) {
      console.error("Session jobs error:", error);
      return res.status(500).json({ error: "Failed to get session jobs" });
    }
  });

  app.post("/api/v1/jobs/:jobId/cancel", (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId as string;
      const cancelled = jobQueue.cancelJob(jobId);
      if (!cancelled) {
        return res.status(400).json({ error: "Job cannot be cancelled (not found or already finished)" });
      }
      return res.json({ cancelled: true, jobId });
    } catch (error) {
      console.error("Job cancel error:", error);
      return res.status(500).json({ error: "Failed to cancel job" });
    }
  });

  app.post("/api/v1/session/:sessionId/save", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId as string;
      cancelEphemeralCleanup(sessionId);
      return res.json({ saved: true, sessionId });
    } catch (error) {
      console.error("Session save error:", error);
      return res.status(500).json({ error: "Failed to save session" });
    }
  });

  app.post("/api/v1/session/:sessionId/ephemeral", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId as string;
      const { delayMs } = req.body;
      scheduleEphemeralCleanup(sessionId, delayMs || 1800000);
      return res.json({ scheduled: true, sessionId, deleteAfterMs: delayMs || 1800000 });
    } catch (error) {
      console.error("Ephemeral schedule error:", error);
      return res.status(500).json({ error: "Failed to schedule cleanup" });
    }
  });

  app.delete(
    "/api/v1/session/:sessionId",
    async (req: Request, res: Response) => {
      try {
        const sessionId = req.params.sessionId as string;
        if (!sessionId || sessionId.length < 10) {
          return res.status(400).json({ error: "Invalid session ID" });
        }

        cancelEphemeralCleanup(sessionId);
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
      features: {
        moderation: true,
        premiumStill: true,
        videoRender: true,
        exifStripping: true,
        signedUrls: true,
        ephemeralProcessing: true,
      },
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
