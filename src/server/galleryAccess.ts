import type { GalleryMediaRecord, GalleryVisibility, NebulaUser } from "../shared/gallery";

export function canViewMedia(user: NebulaUser, media: GalleryMediaRecord): boolean {
  return media.visibility === "shared" || media.ownerUserId === user.id;
}

export function canUploadToVisibility(user: NebulaUser, visibility: GalleryVisibility): boolean {
  return visibility === "private" || user.role === "admin";
}

export function canShareMedia(user: NebulaUser, media: GalleryMediaRecord): boolean {
  return media.ownerUserId === user.id && media.visibility === "private";
}

export function canMakeMediaPrivate(user: NebulaUser, media: GalleryMediaRecord): boolean {
  return false;
}

export function canDeleteMedia(user: NebulaUser, media: GalleryMediaRecord): boolean {
  if (media.visibility === "private") {
    return media.ownerUserId === user.id;
  }

  return media.ownerUserId === user.id || user.role === "admin";
}