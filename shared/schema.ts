import { z } from "zod";

export const ALLOWED_DESIGN_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'] as const;
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const MAX_DESIGN_SIZE = 10 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

export const placementSchema = z.object({
  anchorX: z.number().min(0).max(1),
  anchorY: z.number().min(0).max(1),
  scale: z.number().min(0.1).max(5),
  rotationDeg: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  blendMode: z.enum(['normal', 'multiply', 'overlay', 'screen']),
  warpIntensity: z.number().min(0).max(1),
});

export type Placement = z.infer<typeof placementSchema>;

export const aiPlacementResponseSchema = z.object({
  provider: z.literal('gemini').or(z.literal('openai')),
  placementNotes: z.string(),
  suggestedPlacements: z.array(z.object({
    anchorX: z.number(),
    anchorY: z.number(),
    scale: z.number(),
    rotationDeg: z.number(),
    description: z.string(),
  })).max(3),
  recommendedSizeCmRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type AiPlacementResponse = z.infer<typeof aiPlacementResponseSchema>;

export const aiDesignRemixResponseSchema = z.object({
  provider: z.literal('gemini').or(z.literal('openai')),
  suggestions: z.array(z.object({
    title: z.string(),
    description: z.string(),
    recommendedBlendMode: z.enum(['normal', 'multiply', 'overlay', 'screen']),
    recommendedOpacity: z.number().min(0).max(1),
    recommendedWarpIntensity: z.number().min(0).max(1),
  })),
  overallNotes: z.string(),
  confidence: z.number().min(0).max(1),
});

export type AiDesignRemixResponse = z.infer<typeof aiDesignRemixResponseSchema>;

export const approvalPacketSchema = z.object({
  sessionId: z.string(),
  createdAt: z.string(),
  design: z.object({
    originalName: z.string(),
    mimeType: z.string(),
    localUri: z.string(),
  }),
  media: z.object({
    sourceVideoUri: z.string().optional(),
    stills: z.array(z.string()),
  }),
  placement: placementSchema,
  ai: z.object({
    provider: z.string().optional(),
    placementNotes: z.string().optional(),
    recommendedSizeCmRange: z.object({ min: z.number(), max: z.number() }).optional(),
    confidence: z.number().optional(),
    warnings: z.array(z.string()).optional(),
  }).optional(),
  consent: z.object({
    faceFreeConfirmed: z.boolean(),
  }),
});

export type ApprovalPacket = z.infer<typeof approvalPacketSchema>;

export interface TattooSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  designUri: string;
  designName: string;
  videoUri?: string;
  stills: string[];
  placement: Placement;
  aiNotes?: string;
  aiSuggestions?: AiPlacementResponse;
  approvalPacket?: ApprovalPacket;
  status: 'draft' | 'editing' | 'exported';
}

export const placementSuggestRequestSchema = z.object({
  frames: z.array(z.string()).min(1).max(3),
  designDescription: z.string().optional(),
  bodyPart: z.string().optional(),
});

export const designRemixRequestSchema = z.object({
  designImage: z.string(),
  bodyFrames: z.array(z.string()).max(2).optional(),
  style: z.string().optional(),
});
