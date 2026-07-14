const baseUrl = "http://127.0.0.1:4174";
const samplePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

const users = {
  jace: { id: "jace", name: "Jace", role: "user" },
  mira: { id: "mira", name: "Mira", role: "user" },
  admin: { id: "admin", name: "Admin", role: "admin" }
};

function authHeaders(user) {
  return {
    "X-Nebula-User-Id": user.id,
    "X-Nebula-User-Name": user.name,
    "X-Nebula-User-Role": user.role
  };
}

async function request(path, user, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(user), ...init.headers }
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed with ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function upload(user, visibility, filename) {
  const formData = new FormData();
  formData.set("visibility", visibility);
  formData.append("file", new Blob([samplePng], { type: "image/png" }), filename);

  return request("/api/gallery/upload", user, { method: "POST", body: formData });
}

async function status(path, user, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(user), ...init.headers }
  });

  return response.status;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const createdIds = [];

try {
  const privateUpload = await upload(users.jace, "private", "private-no-exif.png");
  const privateMedia = privateUpload.media;
  createdIds.push({ id: privateMedia.id, user: users.jace });

  assert(privateMedia.kind === "image", "Uploaded image media does not use the core media kind contract");
  assert(typeof privateMedia.capturedAt === "string" && privateMedia.capturedAt.length > 0, "Media capturedAt should be required");
  assert(Number.isInteger(privateMedia.year) && Number.isInteger(privateMedia.month), "Media year and month should be numeric");
  assert(privateMedia.contentUrl === `/api/gallery/media/${privateMedia.id}/content`, "Media content URL does not point at the content endpoint");
  assert(typeof privateMedia.thumbnailUrl === "string", "Media thumbnailUrl should be tolerated when present");
  assert(!("sourceFilePath" in privateMedia), "Media JSON exposes server storage paths");
  assert(!("fileSize" in privateMedia), "Media JSON exposes the mock storage field instead of size");

  const ownerPrivate = await request("/api/gallery/media?scope=private", users.jace);
  const otherPrivate = await request("/api/gallery/media?scope=private", users.mira);
  const otherPrivateByIdStatus = await status(`/api/gallery/media/${privateMedia.id}`, users.mira);

  assert(ownerPrivate.media.some((media) => media.id === privateMedia.id), "Owner cannot see private media");
  assert(!otherPrivate.media.some((media) => media.id === privateMedia.id), "Another user can list private media");
  assert(otherPrivateByIdStatus === 404, "Another user can fetch private media by id");

  const sharedFromPrivate = await request(`/api/gallery/media/${privateMedia.id}/share`, users.jace, { method: "POST" });
  assert(sharedFromPrivate.media.visibility === "shared", "Owner cannot move private media to shared gallery");

  const forbiddenFormData = new FormData();
  forbiddenFormData.set("visibility", "shared");
  forbiddenFormData.append("file", new Blob([samplePng], { type: "image/png" }), "regular-shared.png");
  const regularSharedStatus = await status("/api/gallery/upload", users.jace, { method: "POST", body: forbiddenFormData });
  assert(regularSharedStatus === 403, "Regular user can upload directly to shared gallery");

  const sharedUpload = await upload(users.admin, "shared", "shared-no-exif.png");
  const sharedMedia = sharedUpload.media;
  createdIds.push({ id: sharedMedia.id, user: users.admin });
  const makeSharedPrivateStatus = await status(`/api/gallery/media/${sharedMedia.id}/private`, users.admin, { method: "POST" });
  assert(makeSharedPrivateStatus === 403, "Shared media can be transferred back to private");

  const jaceShared = await request("/api/gallery/media?scope=shared", users.jace);
  const miraShared = await request("/api/gallery/media?scope=shared", users.mira);
  const ownerSharedMedia = jaceShared.media.find((media) => media.id === privateMedia.id);
  const adminSharedForJace = jaceShared.media.find((media) => media.id === sharedMedia.id);
  const adminSharedDeleteByJaceStatus = await status(`/api/gallery/media/${sharedMedia.id}`, users.jace, { method: "DELETE" });

  assert(jaceShared.media.some((media) => media.id === privateMedia.id), "Owner-shared media is not visible in shared gallery");
  assert(miraShared.media.some((media) => media.id === privateMedia.id), "Owner-shared media is not visible to another user");
  assert(jaceShared.media.some((media) => media.id === sharedMedia.id), "User cannot see shared media");
  assert(miraShared.media.some((media) => media.id === sharedMedia.id), "Second user cannot see shared media");
  assert(ownerSharedMedia?.visibility === "shared", "Owner-shared media does not report shared visibility");
  assert(adminSharedDeleteByJaceStatus === 403, "Regular user can manage another user's shared media");
  assert(sharedMedia.ownerDisplayName === "Admin", "Shared media does not expose who owns it");

  const timeline = await request("/api/gallery/timeline?scope=all", users.jace);

  assert(timeline.timeline.some((year) => year.year === privateMedia.year), "Timeline does not include uploaded media year");

  console.log(
    JSON.stringify(
      {
        privateAccess: "passed",
        sharedAccess: "passed",
        regularSharedUpload: regularSharedStatus,
        mediaKind: privateMedia.kind,
        timelineYears: timeline.timeline.map((year) => `${year.year}:${year.count}`)
      },
      null,
      2
    )
  );
} finally {
  await Promise.all(
    createdIds.reverse().map((created) => status(`/api/gallery/media/${created.id}`, created.user, { method: "DELETE" }))
  );
}