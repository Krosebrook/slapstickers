import * as fs from "fs";
import * as path from "path";

let sharp: any = null;
try {
  sharp = require("sharp");
} catch {
  console.warn("sharp not available — background removal disabled");
}

export interface RemoveBgOptions {
  tolerance: number;
  targetColor?: { r: number; g: number; b: number };
  mode: "auto" | "white" | "color";
}

const DEFAULT_OPTIONS: RemoveBgOptions = {
  tolerance: 30,
  mode: "auto",
};

async function detectDominantEdgeColor(
  inputPath: string
): Promise<{ r: number; g: number; b: number }> {
  if (!sharp) return { r: 255, g: 255, b: 255 };

  const { data, info } = await sharp(inputPath)
    .resize(100, 100, { fit: "fill" })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  const colorCounts = new Map<string, { r: number; g: number; b: number; count: number }>();

  const samplePixel = (x: number, y: number) => {
    const idx = (y * w + x) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const bucket = `${Math.round(r / 10) * 10},${Math.round(g / 10) * 10},${Math.round(b / 10) * 10}`;
    const existing = colorCounts.get(bucket);
    if (existing) {
      existing.count++;
    } else {
      colorCounts.set(bucket, { r, g, b, count: 1 });
    }
  };

  for (let x = 0; x < w; x++) {
    samplePixel(x, 0);
    samplePixel(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    samplePixel(0, y);
    samplePixel(w - 1, y);
  }

  let dominant = { r: 255, g: 255, b: 255, count: 0 };
  for (const [, val] of colorCounts) {
    if (val.count > dominant.count) {
      dominant = val;
    }
  }

  return { r: dominant.r, g: dominant.g, b: dominant.b };
}

function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  return Math.sqrt(
    (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
  );
}

export async function removeBackground(
  inputPath: string,
  outputPath: string,
  options: Partial<RemoveBgOptions> = {}
): Promise<string> {
  if (!sharp) {
    throw new Error("sharp is required for background removal");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  let targetColor: { r: number; g: number; b: number };

  if (opts.mode === "white") {
    targetColor = { r: 255, g: 255, b: 255 };
  } else if (opts.mode === "color" && opts.targetColor) {
    targetColor = opts.targetColor;
  } else {
    targetColor = await detectDominantEdgeColor(inputPath);
  }

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const width = metadata.width || 500;
  const height = metadata.height || 500;

  const { data } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const tolerance = opts.tolerance;
  const maxDist = tolerance * (441.67 / 100);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const dist = colorDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b);

    if (dist <= maxDist) {
      const ratio = dist / maxDist;
      if (ratio < 0.5) {
        pixels[i + 3] = 0;
      } else {
        pixels[i + 3] = Math.round(255 * ((ratio - 0.5) * 2));
      }
    }
  }

  await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(outputPath);

  return outputPath;
}

export async function removeBackgroundFromBuffer(
  inputBuffer: Buffer,
  options: Partial<RemoveBgOptions> = {}
): Promise<Buffer> {
  if (!sharp) {
    throw new Error("sharp is required for background removal");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width || 500;
  const height = metadata.height || 500;

  let targetColor: { r: number; g: number; b: number };

  if (opts.mode === "white") {
    targetColor = { r: 255, g: 255, b: 255 };
  } else if (opts.mode === "color" && opts.targetColor) {
    targetColor = opts.targetColor;
  } else {
    const smallBuf = await sharp(inputBuffer)
      .resize(100, 100, { fit: "fill" })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const sw = smallBuf.info.width;
    const sh = smallBuf.info.height;
    const sc = smallBuf.info.channels;
    const sd = smallBuf.data;
    const colorCounts = new Map<string, { r: number; g: number; b: number; count: number }>();

    const samplePixel = (x: number, y: number) => {
      const idx = (y * sw + x) * sc;
      const r = sd[idx];
      const g = sd[idx + 1];
      const b = sd[idx + 2];
      const bucket = `${Math.round(r / 10) * 10},${Math.round(g / 10) * 10},${Math.round(b / 10) * 10}`;
      const existing = colorCounts.get(bucket);
      if (existing) existing.count++;
      else colorCounts.set(bucket, { r, g, b, count: 1 });
    };

    for (let x = 0; x < sw; x++) { samplePixel(x, 0); samplePixel(x, sh - 1); }
    for (let y = 1; y < sh - 1; y++) { samplePixel(0, y); samplePixel(sw - 1, y); }

    let dominant = { r: 255, g: 255, b: 255, count: 0 };
    for (const [, val] of colorCounts) {
      if (val.count > dominant.count) dominant = val;
    }
    targetColor = { r: dominant.r, g: dominant.g, b: dominant.b };
  }

  const { data } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const maxDist = opts.tolerance * (441.67 / 100);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const dist = colorDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b);

    if (dist <= maxDist) {
      const ratio = dist / maxDist;
      if (ratio < 0.5) {
        pixels[i + 3] = 0;
      } else {
        pixels[i + 3] = Math.round(255 * ((ratio - 0.5) * 2));
      }
    }
  }

  return sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}
