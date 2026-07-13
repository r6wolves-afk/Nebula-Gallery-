import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GalleryMediaQuery,
  GalleryMediaRecord,
  GalleryTimeline,
  GalleryTimelineYear,
  GalleryVisibility,
  NebulaUser
} from "../shared/gallery";
import { canViewMedia } from "./galleryAccess";

interface GalleryStoreFile {
  media: GalleryMediaRecord[];
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "gallery");
const storePath = path.join(rootDir, "media.json");
export const uploadsDir = path.join(rootDir, "uploads");
let storeMutationQueue: Promise<void> = Promise.resolve();

async function ensureGalleryStore(): Promise<void> {
  await mkdir(uploadsDir, { recursive: true });

  try {
    await stat(storePath);
  } catch {
    await writeFile(storePath, JSON.stringify({ media: [] }, null, 2), "utf8");
  }
}

async function readStore(): Promise<GalleryStoreFile> {
  await ensureGalleryStore();
  const raw = await readFile(storePath, "utf8");

  let parsed: GalleryStoreFile;

  try {
    parsed = JSON.parse(raw) as GalleryStoreFile;
  } catch {
    parsed = parseRecoverableStore(raw);
    await writeStore(parsed);
  }

  return { media: Array.isArray(parsed.media) ? parsed.media : [] };
}

function parseRecoverableStore(raw: string): GalleryStoreFile {
  for (let endIndex = raw.lastIndexOf("}"); endIndex > -1; endIndex = raw.lastIndexOf("}", endIndex - 1)) {
    try {
      const parsed = JSON.parse(raw.slice(0, endIndex + 1)) as GalleryStoreFile;

      if (Array.isArray(parsed.media)) {
        return parsed;
      }
    } catch {
      // Keep walking backward until a complete store object is found.
    }
  }

  return { media: [] };
}

async function writeStore(store: GalleryStoreFile): Promise<void> {
  await ensureGalleryStore();
  const tempPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, storePath);
}

async function withStoreMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storeMutationQueue.then(operation, operation);
  storeMutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function sortTimestamp(media: GalleryMediaRecord): string {
  return media.capturedAt ?? media.fallbackCapturedAt ?? media.createdAt;
}

export async function listGalleryMedia(user: NebulaUser, query: GalleryMediaQuery): Promise<GalleryMediaRecord[]> {
  const scope = query.scope ?? "all";
  const store = await readStore();

  return store.media
    .filter((media) => canViewMedia(user, media))
    .filter((media) => scope === "all" || media.visibility === scope)
    .filter((media) => !query.unsorted || media.year === null || media.month === null)
    .filter((media) => query.year === undefined || media.year === query.year)
    .filter((media) => query.month === undefined || media.month === query.month)
    .sort((left, right) => sortTimestamp(right).localeCompare(sortTimestamp(left)) || right.createdAt.localeCompare(left.createdAt));
}

export async function getGalleryMediaForUser(user: NebulaUser, id: string): Promise<GalleryMediaRecord | null> {
  const store = await readStore();
  const media = store.media.find((item) => item.id === id);

  if (!media || !canViewMedia(user, media)) {
    return null;
  }

  return media;
}

export async function getGalleryMediaUnchecked(id: string): Promise<GalleryMediaRecord | null> {
  const store = await readStore();
  return store.media.find((item) => item.id === id) ?? null;
}

export async function addGalleryMedia(media: GalleryMediaRecord): Promise<GalleryMediaRecord> {
  return withStoreMutation(async () => {
    const store = await readStore();
    store.media.push(media);
    await writeStore(store);
    return media;
  });
}

export async function updateGalleryVisibility(id: string, visibility: GalleryVisibility): Promise<GalleryMediaRecord | null> {
  return withStoreMutation(async () => {
    const store = await readStore();
    const media = store.media.find((item) => item.id === id);

    if (!media) {
      return null;
    }

    media.visibility = visibility;
    media.updatedAt = new Date().toISOString();
    await writeStore(store);
    return media;
  });
}

export async function deleteGalleryMedia(id: string): Promise<GalleryMediaRecord | null> {
  const media = await withStoreMutation(async () => {
    const store = await readStore();
    const index = store.media.findIndex((item) => item.id === id);

    if (index === -1) {
      return null;
    }

    const [deletedMedia] = store.media.splice(index, 1);
    await writeStore(store);
    return deletedMedia;
  });

  if (!media) {
    return null;
  }

  try {
    await unlink(path.join(rootDir, media.sourceFilePath));
  } catch {
    // Metadata deletion should succeed even if a file was already removed externally.
  }

  return media;
}

export async function getGalleryTimeline(user: NebulaUser, scope: GalleryVisibility | "all"): Promise<GalleryTimeline> {
  const media = await listGalleryMedia(user, { scope });
  const yearMap = new Map<number, GalleryTimelineYear>();
  let unsortedCount = 0;

  for (const item of media) {
    if (item.year === null || item.month === null) {
      unsortedCount += 1;
      continue;
    }

    const year = yearMap.get(item.year) ?? { year: item.year, count: 0, months: [] };
    year.count += 1;

    const month = year.months.find((entry) => entry.month === item.month);
    if (month) {
      month.count += 1;
    } else {
      year.months.push({ month: item.month, count: 1 });
    }

    yearMap.set(item.year, year);
  }

  const years = [...yearMap.values()]
    .sort((left, right) => right.year - left.year)
    .map((year) => ({
      ...year,
      months: year.months.sort((left, right) => right.month - left.month)
    }));

  return { scope, years, unsortedCount };
}

export function galleryStoragePath(relativePath: string): string {
  return path.join(rootDir, relativePath);
}

export function galleryUploadRelativePath(userId: string, id: string, extension: string): string {
  return path.join("uploads", userId, `${id}${extension}`).replaceAll(path.sep, "/");
}