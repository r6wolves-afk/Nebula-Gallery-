import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import type { GalleryMediaRecord, GalleryMediaView, GalleryVisibility } from "../shared/gallery";
import { isSupportedMediaType, isVideoMimeType } from "../shared/gallery";
import { requireAuthenticatedUser } from "./auth";
import { canDeleteMedia, canMakeMediaPrivate, canShareMedia, canUploadToVisibility } from "./galleryAccess";
import {
  addGalleryMedia,
  deleteGalleryMedia,
  galleryStoragePath,
  galleryUploadRelativePath,
  getGalleryMediaForUser,
  getGalleryMediaUnchecked,
  getGalleryTimeline,
  listGalleryMedia,
  updateGalleryVisibility
} from "./galleryStore";
import { capturedParts, extractMediaMetadata, persistUpload } from "./metadata";

// Standalone development/mock implementation of Nebula core's Gallery API contract.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 20
  }
});

function mediaView(media: GalleryMediaRecord): GalleryMediaView {
  const capturedAt = media.capturedAt ?? media.fallbackCapturedAt ?? media.createdAt;
  const { year, month } = capturedParts(capturedAt);

  return {
    id: media.id,
    ownerUserId: media.ownerUserId,
    ownerDisplayName: media.addedByName,
    kind: isVideoMimeType(media.mimeType) ? "video" : "image",
    visibility: media.visibility,
    filename: media.filename,
    mimeType: media.mimeType,
    size: media.fileSize,
    capturedAt,
    year,
    month,
    contentUrl: `/api/gallery/media/${media.id}/content`,
    width: media.width,
    height: media.height,
    durationSeconds: media.duration,
    thumbnailUrl: `/api/gallery/media/${media.id}/content?variant=thumbnail`,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt
  };
}

function parseScope(value: unknown): GalleryVisibility | "all" {
  return value === "private" || value === "shared" || value === "all" ? value : "all";
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function extensionForFile(file: Express.Multer.File): string {
  const originalExtension = path.extname(file.originalname).toLowerCase();

  if (originalExtension) {
    return originalExtension;
  }

  switch (file.mimetype) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    default:
      return "";
  }
}

export const galleryRouter = express.Router();

galleryRouter.get("/media", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const media = await listGalleryMedia(user, {
      scope: parseScope(req.query.scope),
      year: parseOptionalNumber(req.query.year),
      month: parseOptionalNumber(req.query.month),
      unsorted: req.query.unsorted === "true"
    });

    res.json({ media: media.map(mediaView) });
  } catch (error) {
    next(error);
  }
});

galleryRouter.get("/timeline", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const timeline = await getGalleryTimeline(user, parseScope(req.query.scope));
    res.json({ timeline: timeline.years });
  } catch (error) {
    next(error);
  }
});

galleryRouter.get("/media/:id", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const media = await getGalleryMediaForUser(user, req.params.id);

    if (!media) {
      res.sendStatus(404);
      return;
    }

    res.json({ media: mediaView(media) });
  } catch (error) {
    next(error);
  }
});

galleryRouter.get("/media/:id/content", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const media = await getGalleryMediaForUser(user, req.params.id);

    if (!media) {
      res.sendStatus(404);
      return;
    }

    const filePath = galleryStoragePath(media.sourceFilePath);

    try {
      await stat(filePath);
    } catch {
      res.sendStatus(404);
      return;
    }

    res.type(media.mimeType);
    const stream = createReadStream(filePath);
    stream.on("error", (error) => {
      if (res.headersSent) {
        res.destroy(error);
      } else {
        next(error);
      }
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

galleryRouter.post("/upload", upload.any(), async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const visibility: GalleryVisibility = req.body.visibility === "shared" ? "shared" : "private";

    if (!canUploadToVisibility(user, visibility)) {
      res.status(403).json({ error: "You are not allowed to add media directly to the shared gallery." });
      return;
    }

    const files = (Array.isArray(req.files) ? req.files : []).filter((file) => file.fieldname === "file" || file.fieldname === "media");
    const created: GalleryMediaRecord[] = [];

    for (const file of files) {
      if (!isSupportedMediaType(file.mimetype)) {
        res.status(415).json({ error: `${file.originalname} is not a supported gallery media type.` });
        return;
      }

      const id = randomUUID();
      const relativePath = galleryUploadRelativePath(user.id, id, extensionForFile(file));
      const absolutePath = galleryStoragePath(relativePath);
      await persistUpload(absolutePath, file.buffer);

      const metadata = await extractMediaMetadata(absolutePath, file.mimetype);
      const { year, month } = capturedParts(metadata.capturedAt ?? metadata.fallbackCapturedAt);
      const now = new Date().toISOString();
      const record: GalleryMediaRecord = {
        id,
        ownerUserId: user.id,
        addedByUserId: user.id,
        addedByName: user.name,
        filename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        capturedAt: metadata.capturedAt,
        fallbackCapturedAt: metadata.fallbackCapturedAt,
        year,
        month,
        sourceFilePath: relativePath,
        visibility,
        createdAt: now,
        updatedAt: now
      };

      created.push(await addGalleryMedia(record));
    }

    res.status(201).json({ media: created.length === 1 ? mediaView(created[0]) : created.map(mediaView) });
  } catch (error) {
    next(error);
  }
});

galleryRouter.post("/media/:id/share", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const media = await getGalleryMediaForUser(user, req.params.id);

    if (!media) {
      res.sendStatus(404);
      return;
    }

    if (!canShareMedia(user, media)) {
      res.sendStatus(403);
      return;
    }

    const updated = await updateGalleryVisibility(media.id, "shared");
    res.json({ media: updated ? mediaView(updated) : null });
  } catch (error) {
    next(error);
  }
});

galleryRouter.post("/media/:id/private", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const media = await getGalleryMediaUnchecked(req.params.id);

    if (!media || !canMakeMediaPrivate(user, media)) {
      res.sendStatus(media ? 403 : 404);
      return;
    }

    const updated = await updateGalleryVisibility(media.id, "private");
    res.json({ media: updated ? mediaView(updated) : null });
  } catch (error) {
    next(error);
  }
});

galleryRouter.delete("/media/:id", async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const media = await getGalleryMediaForUser(user, req.params.id);

    if (!media) {
      res.sendStatus(404);
      return;
    }

    if (!canDeleteMedia(user, media)) {
      res.sendStatus(403);
      return;
    }

    await deleteGalleryMedia(media.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});