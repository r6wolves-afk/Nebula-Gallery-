export type GalleryVisibility = "private" | "shared";

export type GalleryScope = GalleryVisibility | "all";

export type GalleryMediaKind = "image" | "video";

export type NebulaUserRole = "user" | "admin";

export interface NebulaUser {
  id: string;
  name: string;
  role: NebulaUserRole;
}

export interface GalleryMediaRecord {
  id: string;
  ownerUserId: string;
  addedByUserId: string;
  addedByName: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  capturedAt: string | null;
  fallbackCapturedAt: string;
  year: number | null;
  month: number | null;
  sourceFilePath: string;
  visibility: GalleryVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryMediaView {
  id: string;
  filename: string;
  mimeType: string;
  kind: GalleryMediaKind;
  visibility: GalleryVisibility;
  ownerUserId: string;
  ownerDisplayName: string;
  size: number;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  year: number;
  month: number;
  contentUrl: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  thumbnailUrl?: string;
}

export interface GalleryTimelineMonth {
  month: number;
  count: number;
}

export interface GalleryTimelineYear {
  year: number;
  count: number;
  months: GalleryTimelineMonth[];
}

export interface GalleryTimeline {
  scope: GalleryScope;
  years: GalleryTimelineYear[];
  unsortedCount: number;
}

export interface GalleryMediaQuery {
  scope?: GalleryScope;
  year?: number;
  month?: number;
  unsorted?: boolean;
}

export const imageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

export const videoMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

export function isSupportedMediaType(mimeType: string): boolean {
  return imageMimeTypes.has(mimeType) || videoMimeTypes.has(mimeType);
}

export function isVideoMimeType(mimeType: string): boolean {
  return videoMimeTypes.has(mimeType);
}