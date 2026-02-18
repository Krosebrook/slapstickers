import { randomUUID } from "crypto";
import type { Placement, JobStatus } from "@shared/schema";

export interface NewJob {
  type: "premium_still" | "video_render";
  sessionId: string;
  inputData: {
    bodyImagePath?: string;
    designImagePath?: string;
    placement: Placement;
    bodySegmentationData?: string;
    videoPath?: string;
    previewMode: "fresh" | "healed";
  };
}

const POLL_INTERVAL_MS = 500;
const JOB_EXPIRY_MS = 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JobQueue {
  private jobs: Map<string, JobStatus> = new Map();
  private pendingQueue: string[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private currentJobId: string | null = null;

  submitJob(job: NewJob): string {
    const id = randomUUID();
    const now = new Date().toISOString();

    const estimatedTimeMs =
      job.type === "premium_still" ? 120000 : 300000;

    const status: JobStatus = {
      id,
      type: job.type,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      sessionId: job.sessionId,
      estimatedTimeMs,
    };

    this.jobs.set(id, status);
    this.pendingQueue.push(id);
    return id;
  }

  getJob(jobId: string): JobStatus | undefined {
    return this.jobs.get(jobId);
  }

  getSessionJobs(sessionId: string): JobStatus[] {
    const result: JobStatus[] = [];
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId) {
        result.push(job);
      }
    }
    return result;
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === "queued" || job.status === "processing") {
      job.status = "cancelled";
      job.updatedAt = new Date().toISOString();

      const idx = this.pendingQueue.indexOf(jobId);
      if (idx !== -1) {
        this.pendingQueue.splice(idx, 1);
      }

      return true;
    }

    return false;
  }

  startProcessing(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.tick();
    }, POLL_INTERVAL_MS);

    console.log("[JobQueue] Worker started, polling every", POLL_INTERVAL_MS, "ms");
  }

  stopProcessing(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("[JobQueue] Worker stopped");
  }

  private tick(): void {
    this.cleanupExpiredJobs();

    if (this.processing) return;

    const nextId = this.pendingQueue.shift();
    if (!nextId) return;

    const job = this.jobs.get(nextId);
    if (!job || job.status === "cancelled") return;

    this.processJob(nextId).catch((err) => {
      console.error("[JobQueue] Unexpected error in processJob:", err);
    });
  }

  private async processJob(jobId: string): Promise<void> {
    this.processing = true;
    this.currentJobId = jobId;

    const job = this.jobs.get(jobId);
    if (!job) {
      this.processing = false;
      this.currentJobId = null;
      return;
    }

    job.status = "processing";
    job.updatedAt = new Date().toISOString();

    try {
      if (job.type === "premium_still") {
        await this.processPremiumStill(job);
      } else if (job.type === "video_render") {
        await this.processVideoRender(job);
      }
    } catch (err: any) {
      job.status = "failed";
      job.error = err?.message || "Unknown error";
      job.updatedAt = new Date().toISOString();
      console.error(`[JobQueue] Job ${jobId} failed:`, err);
    } finally {
      this.processing = false;
      this.currentJobId = null;
    }
  }

  private isCancelled(job: JobStatus): boolean {
    return job.status === "cancelled";
  }

  private async processPremiumStill(job: JobStatus): Promise<void> {
    const steps: Array<{ progress: number; label: string; delayMs: number }> = [
      { progress: 10, label: "analyzing", delayMs: 800 },
      { progress: 30, label: "segmenting", delayMs: 1200 },
      { progress: 50, label: "enhancing", delayMs: 1500 },
      { progress: 80, label: "compositing", delayMs: 1000 },
      { progress: 100, label: "done", delayMs: 0 },
    ];

    for (const step of steps) {
      if (this.isCancelled(job)) return;

      job.progress = step.progress;
      job.updatedAt = new Date().toISOString();
      console.log(`[JobQueue] Job ${job.id} premium_still: ${step.progress}% - ${step.label}`);

      if (step.delayMs > 0) {
        await sleep(step.delayMs);
      }
    }

    if (this.isCancelled(job)) return;

    job.status = "completed";
    job.resultUrl = `/api/jobs/${job.id}/result`;
    job.updatedAt = new Date().toISOString();
    console.log(`[JobQueue] Job ${job.id} premium_still completed (simulated). Real Gemini image enhancement requires specific image generation APIs.`);
  }

  private async processVideoRender(job: JobStatus): Promise<void> {
    const steps: Array<{ progress: number; label: string; delayMs: number }> = [
      { progress: 5, label: "extracting frames", delayMs: 1500 },
      { progress: 20, label: "anchor placement", delayMs: 2000 },
      { progress: 50, label: "tracking", delayMs: 3000 },
      { progress: 80, label: "compositing", delayMs: 2000 },
      { progress: 100, label: "done", delayMs: 0 },
    ];

    for (const step of steps) {
      if (this.isCancelled(job)) return;

      job.progress = step.progress;
      job.updatedAt = new Date().toISOString();
      console.log(`[JobQueue] Job ${job.id} video_render: ${step.progress}% - ${step.label}`);

      if (step.delayMs > 0) {
        await sleep(step.delayMs);
      }
    }

    if (this.isCancelled(job)) return;

    job.status = "completed";
    job.resultUrl = `/api/jobs/${job.id}/result`;
    job.updatedAt = new Date().toISOString();
    console.log(`[JobQueue] Job ${job.id} video_render completed (simulated). Real video compositing requires frame-by-frame processing APIs.`);
  }

  private cleanupExpiredJobs(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === "completed" || job.status === "failed" || job.status === "cancelled") &&
        now - new Date(job.updatedAt).getTime() > JOB_EXPIRY_MS
      ) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobQueue = new JobQueue();
