import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import exifr from "exifr";
import { imageSize } from "image-size";
import { imageMimeTypes, videoMimeTypes } from "../shared/gallery";

const execFileAsync = promisify(execFile);

interface ExtractedMetadata {
  width: number | null;
  height: number | null;
  duration: number | null;
  capturedAt: string | null;
  fallbackCapturedAt: string;
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

async function fallbackDate(filePath: string): Promise<Date> {
  const stats = await stat(filePath);
  return stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime;
}

async function extractImageMetadata(filePath: string): Promise<ExtractedMetadata> {
  const imageBuffer = await readFile(filePath);
  const dimensions = imageSize(imageBuffer);
  let capturedAt: Date | null = null;

  try {
    const exif = await exifr.parse(filePath, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "OffsetTimeOriginal"]
    });

    capturedAt = normalizeDate(exif?.DateTimeOriginal) ?? normalizeDate(exif?.CreateDate) ?? normalizeDate(exif?.ModifyDate);
  } catch {
    capturedAt = null;
  }

  return {
    width: dimensions.width ?? null,
    height: dimensions.height ?? null,
    duration: null,
    capturedAt: capturedAt?.toISOString() ?? null,
    fallbackCapturedAt: (await fallbackDate(filePath)).toISOString()
  };
}

async function extractVideoMetadata(filePath: string): Promise<ExtractedMetadata> {
  const fallbackCapturedAt = await fallbackDate(filePath);

  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=width,height,duration:format=duration:format_tags=creation_time",
        "-of",
        "json",
        filePath
      ],
      { timeout: 3000 }
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number; duration?: string }>;
      format?: { duration?: string; tags?: { creation_time?: string } };
    };
    const videoStream = parsed.streams?.find((stream) => stream.width || stream.height);
    const duration = Number(videoStream?.duration ?? parsed.format?.duration);
    const capturedAt = normalizeDate(parsed.format?.tags?.creation_time);

    return {
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      duration: Number.isFinite(duration) ? duration : null,
      capturedAt: capturedAt?.toISOString() ?? null,
      fallbackCapturedAt: fallbackCapturedAt.toISOString()
    };
  } catch {
    return {
      width: null,
      height: null,
      duration: null,
      capturedAt: null,
      fallbackCapturedAt: fallbackCapturedAt.toISOString()
    };
  }
}

export async function extractMediaMetadata(filePath: string, mimeType: string): Promise<ExtractedMetadata> {
  if (imageMimeTypes.has(mimeType)) {
    return extractImageMetadata(filePath);
  }

  if (videoMimeTypes.has(mimeType)) {
    return extractVideoMetadata(filePath);
  }

  const capturedAt = await fallbackDate(filePath);
  return { width: null, height: null, duration: null, capturedAt: null, fallbackCapturedAt: capturedAt.toISOString() };
}

export function capturedParts(capturedAt: string | null): { year: number | null; month: number | null } {
  if (!capturedAt) {
    return { year: null, month: null };
  }

  const date = new Date(capturedAt);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1
  };
}

export async function persistUpload(filePath: string, content: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}