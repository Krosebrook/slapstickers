import { GoogleGenAI } from "@google/genai";
import type { AiPlacementResponse, AiDesignRemixResponse } from "@shared/schema";

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

const SAFE_PLACEMENT_DEFAULT: AiPlacementResponse = {
  provider: 'gemini',
  placementNotes: 'Unable to analyze image. Using default placement suggestions.',
  suggestedPlacements: [
    { anchorX: 0.5, anchorY: 0.4, scale: 1.0, rotationDeg: 0, description: 'Center placement' },
  ],
  recommendedSizeCmRange: { min: 5, max: 15 },
  confidence: 0.1,
  warnings: ['AI analysis was not available. These are default suggestions.'],
};

const SAFE_REMIX_DEFAULT: AiDesignRemixResponse = {
  provider: 'gemini',
  suggestions: [
    {
      title: 'Standard Application',
      description: 'Apply the design as-is with standard settings for a natural look.',
      recommendedBlendMode: 'multiply',
      recommendedOpacity: 0.85,
      recommendedWarpIntensity: 0.2,
    },
  ],
  overallNotes: 'AI analysis was not available. Using default recommendations.',
  confidence: 0.1,
};

export async function suggestPlacement(
  framesBase64: string[],
  designDescription?: string,
  bodyPart?: string,
): Promise<AiPlacementResponse> {
  if (!process.env.GEMINI_API_KEY) {
    return SAFE_PLACEMENT_DEFAULT;
  }

  try {
    const imageContents = framesBase64.map((frame) => ({
      inlineData: {
        data: frame,
        mimeType: "image/jpeg" as const,
      },
    }));

    const prompt = `You are a professional tattoo artist advisor. Analyze the body area shown in these reference images and suggest optimal tattoo placements.

${designDescription ? `Design description: ${designDescription}` : ''}
${bodyPart ? `Target body part: ${bodyPart}` : ''}

Respond with ONLY valid JSON matching this exact schema:
{
  "provider": "gemini",
  "placementNotes": "string - detailed notes about the placement",
  "suggestedPlacements": [
    {
      "anchorX": number (0-1, horizontal position),
      "anchorY": number (0-1, vertical position),
      "scale": number (0.5-3, relative size),
      "rotationDeg": number (-45 to 45),
      "description": "string describing this placement option"
    }
  ],
  "recommendedSizeCmRange": { "min": number, "max": number },
  "confidence": number (0-1),
  "warnings": ["string array of any concerns"]
}

Provide 1-3 placement suggestions. Consider muscle contours, skin flatness, and common tattoo placement conventions.`;

    const contents = [
      ...imageContents,
      prompt,
    ];

    const client = getAi();
    if (!client) return SAFE_PLACEMENT_DEFAULT;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return SAFE_PLACEMENT_DEFAULT;
    }

    const parsed = JSON.parse(rawText);
    parsed.provider = 'gemini';
    return parsed as AiPlacementResponse;
  } catch (error) {
    console.error("Gemini placement suggestion error:", error);
    return SAFE_PLACEMENT_DEFAULT;
  }
}

export async function suggestDesignRemix(
  designBase64: string,
  bodyFramesBase64?: string[],
  style?: string,
): Promise<AiDesignRemixResponse> {
  if (!process.env.GEMINI_API_KEY) {
    return SAFE_REMIX_DEFAULT;
  }

  try {
    const imageContents: any[] = [
      {
        inlineData: {
          data: designBase64,
          mimeType: "image/png",
        },
      },
    ];

    if (bodyFramesBase64) {
      for (const frame of bodyFramesBase64) {
        imageContents.push({
          inlineData: {
            data: frame,
            mimeType: "image/jpeg",
          },
        });
      }
    }

    const prompt = `You are a professional tattoo artist advisor. Analyze this tattoo design and suggest how to apply it most realistically on skin.

${style ? `Desired style: ${style}` : ''}

Respond with ONLY valid JSON matching this exact schema:
{
  "provider": "gemini",
  "suggestions": [
    {
      "title": "string - short name for the suggestion",
      "description": "string - detailed description",
      "recommendedBlendMode": "normal" | "multiply" | "overlay" | "screen",
      "recommendedOpacity": number (0-1),
      "recommendedWarpIntensity": number (0-1)
    }
  ],
  "overallNotes": "string - general advice for realistic tattoo preview",
  "confidence": number (0-1)
}

Provide 1-3 suggestions focusing on blend modes, opacity, and warp to make the preview look like real ink on skin.`;

    const contents = [
      ...imageContents,
      prompt,
    ];

    const client = getAi();
    if (!client) return SAFE_REMIX_DEFAULT;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return SAFE_REMIX_DEFAULT;
    }

    const parsed = JSON.parse(rawText);
    parsed.provider = 'gemini';
    return parsed as AiDesignRemixResponse;
  } catch (error) {
    console.error("Gemini design remix error:", error);
    return SAFE_REMIX_DEFAULT;
  }
}

export async function detectFaceInImage(imageBase64: string): Promise<boolean> {
  if (!process.env.GEMINI_API_KEY) {
    return false;
  }

  try {
    const client = getAi();
    if (!client) return false;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg",
          },
        },
        'Does this image contain a human face? Respond with ONLY the JSON: {"hasFace": true} or {"hasFace": false}',
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (rawText) {
      const parsed = JSON.parse(rawText);
      return parsed.hasFace === true;
    }
    return false;
  } catch (error) {
    console.error("Face detection error:", error);
    return false;
  }
}
