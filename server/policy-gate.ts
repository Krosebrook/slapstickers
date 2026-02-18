import { GoogleGenAI } from "@google/genai";
import type { ModerationResult, ModerationFlag, ConsentPayload } from "@shared/schema";
import {
  moderationResultSchema,
  moderationFlagSchema,
  consentPayloadSchema,
} from "@shared/schema";

export type { ModerationResult, ModerationFlag, ConsentPayload };
export { moderationResultSchema, moderationFlagSchema, consentPayloadSchema };

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

const CAUTIOUS_APPROVED: ModerationResult = {
  approved: true,
  flags: [
    {
      type: 'other',
      severity: 'low',
      description: 'AI moderation unavailable. Content cautiously approved with low confidence.',
    },
  ],
  confidence: 0.1,
  provider: 'local',
};

export async function moderateContent(imageBase64: string): Promise<ModerationResult> {
  const client = getAi();
  if (!client) {
    return CAUTIOUS_APPROVED;
  }

  try {
    const prompt = `You are a content safety moderator for a tattoo try-on application. Analyze this uploaded image for the following policy violations:

1. **Minor detection**: Does the image appear to show a person under 18 years old?
2. **Hate/extremist symbols**: Does the image contain hate symbols, extremist imagery, or white supremacist content?
3. **Self-harm content**: Does the image depict or promote self-harm, cutting, or suicide?
4. **Nudity**: Does the image contain nudity that would violate content provider policies (explicit genitalia, sexual content)?

Respond with ONLY valid JSON matching this exact schema:
{
  "approved": boolean,
  "flags": [
    {
      "type": "minor_detected" | "hate_symbol" | "self_harm" | "nudity" | "provider_blocked" | "other",
      "severity": "low" | "medium" | "high" | "critical",
      "description": "string explaining what was detected"
    }
  ],
  "confidence": number (0-1, how confident you are in the assessment),
  "provider": "gemini"
}

Rules:
- Set approved=false if ANY flag has severity "high" or "critical"
- Set approved=true if there are no flags or all flags are "low" or "medium"
- If minor is detected, set type="minor_detected" with severity="critical"
- If hate symbols found, set type="hate_symbol" with severity="critical"
- If self-harm content found, set type="self_harm" with severity="high" or "critical"
- If nudity found, set type="nudity" with severity based on explicitness
- Return an empty flags array if the image is clean`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg",
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return CAUTIOUS_APPROVED;
    }

    const parsed = JSON.parse(rawText);
    parsed.provider = 'gemini';
    const validated = moderationResultSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return { ...parsed, provider: 'gemini' } as ModerationResult;
  } catch (error: any) {
    console.error("Content moderation error:", error);
    if (error?.message?.includes('SAFETY') || error?.status === 400) {
      return {
        approved: false,
        flags: [
          {
            type: 'provider_blocked',
            severity: 'critical',
            description: 'Content was blocked by the AI provider safety filters.',
          },
        ],
        confidence: 0.9,
        provider: 'gemini',
      };
    }
    return CAUTIOUS_APPROVED;
  }
}

export function validateConsent(consent: ConsentPayload): boolean {
  const parsed = consentPayloadSchema.safeParse(consent);
  if (!parsed.success) {
    return false;
  }

  const { faceFreeConfirmed, ageVerified, contentConsent, timestamp } = parsed.data;

  if (!faceFreeConfirmed || !ageVerified || !contentConsent) {
    return false;
  }

  if (!timestamp || isNaN(Date.parse(timestamp))) {
    return false;
  }

  return true;
}

export async function moderateDesign(designBase64: string): Promise<ModerationResult> {
  const client = getAi();
  if (!client) {
    return CAUTIOUS_APPROVED;
  }

  try {
    const prompt = `You are a content safety moderator for a tattoo try-on application. Analyze this tattoo DESIGN image specifically for the following policy violations:

1. **Hate/extremist symbols**: Does this design contain hate symbols (swastikas, SS bolts, Confederate flags, KKK imagery, white power symbols, extremist group logos, etc.)?
2. **Extremist imagery**: Does the design promote extremist ideologies, terrorism, or violent movements?
3. **Self-harm content**: Does the design depict or glorify self-harm, cutting, suicide, or pro-anorexia content?

Note: This is a tattoo design, so artistic depictions of skulls, snakes, daggers, etc. are generally acceptable. Focus on actual hate symbols and extremist content.

Respond with ONLY valid JSON matching this exact schema:
{
  "approved": boolean,
  "flags": [
    {
      "type": "hate_symbol" | "self_harm" | "other",
      "severity": "low" | "medium" | "high" | "critical",
      "description": "string explaining what was detected"
    }
  ],
  "confidence": number (0-1, how confident you are in the assessment),
  "provider": "gemini"
}

Rules:
- Set approved=false if ANY flag has severity "high" or "critical"
- Set approved=true if there are no flags or all flags are "low" or "medium"
- Common tattoo art (skulls, roses, tribal patterns, animals) should be approved
- Return an empty flags array if the design is clean`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: designBase64,
            mimeType: "image/png",
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return CAUTIOUS_APPROVED;
    }

    const parsed = JSON.parse(rawText);
    parsed.provider = 'gemini';
    const validated = moderationResultSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return { ...parsed, provider: 'gemini' } as ModerationResult;
  } catch (error: any) {
    console.error("Design moderation error:", error);
    if (error?.message?.includes('SAFETY') || error?.status === 400) {
      return {
        approved: false,
        flags: [
          {
            type: 'provider_blocked',
            severity: 'critical',
            description: 'Design was blocked by the AI provider safety filters.',
          },
        ],
        confidence: 0.9,
        provider: 'gemini',
      };
    }
    return CAUTIOUS_APPROVED;
  }
}
