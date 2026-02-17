import OpenAI from "openai";
import type { AiPlacementResponse, AiDesignRemixResponse } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export async function suggestPlacementFallback(
  framesBase64: string[],
  designDescription?: string,
  bodyPart?: string,
): Promise<AiPlacementResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  try {
    const imageMessages = framesBase64.map((frame) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${frame}` },
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a professional tattoo placement advisor. Analyze body images and suggest placements. Respond with JSON: { "provider": "openai", "placementNotes": "string", "suggestedPlacements": [{"anchorX": 0-1, "anchorY": 0-1, "scale": 0.5-3, "rotationDeg": -45 to 45, "description": "string"}], "recommendedSizeCmRange": {"min": number, "max": number}, "confidence": 0-1, "warnings": [] }`,
        },
        {
          role: "user",
          content: [
            ...imageMessages,
            {
              type: "text",
              text: `Suggest tattoo placements.${designDescription ? ` Design: ${designDescription}` : ''}${bodyPart ? ` Body part: ${bodyPart}` : ''}`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response");

    const parsed = JSON.parse(content);
    parsed.provider = 'openai';
    return parsed as AiPlacementResponse;
  } catch (error) {
    console.error("OpenAI placement fallback error:", error);
    throw error;
  }
}

export async function suggestDesignRemixFallback(
  designBase64: string,
  style?: string,
): Promise<AiDesignRemixResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a tattoo artist. Analyze the design and suggest realistic application settings. Respond with JSON: { "provider": "openai", "suggestions": [{"title": "string", "description": "string", "recommendedBlendMode": "normal"|"multiply"|"overlay"|"screen", "recommendedOpacity": 0-1, "recommendedWarpIntensity": 0-1}], "overallNotes": "string", "confidence": 0-1 }`,
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${designBase64}` } },
            { type: "text", text: `How to make this tattoo design look realistic on skin?${style ? ` Style: ${style}` : ''}` },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response");

    const parsed = JSON.parse(content);
    parsed.provider = 'openai';
    return parsed as AiDesignRemixResponse;
  } catch (error) {
    console.error("OpenAI design remix fallback error:", error);
    throw error;
  }
}
