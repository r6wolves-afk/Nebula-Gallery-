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
  formData.append("media", new Blob([samplePng], { type: "image/png" }), filename);

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
  const privateMedia = privateUpload.media[0];
  createdIds.push({ id: privateMedia.id, user: users.jace });

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
  forbiddenFormData.append("media", new Blob([samplePng], { type: "image/png" }), "regular-shared.png");
  const regularSharedStatus = await status("/api/gallery/upload", users.jace, { method: "POST", body: forbiddenFormData });
  assert(regularSharedStatus === 403, "Regular user can upload directly to shared gallery");

  const sharedUpload = await upload(users.admin, "shared", "shared-no-exif.png");
  const sharedMedia = sharedUpload.media[0];
  createdIds.push({ id: sharedMedia.id, user: users.admin });
  const makeSharedPrivateStatus = await status(`/api/gallery/media/${sharedMedia.id}/private`, users.admin, { method: "POST" });
  assert(makeSharedPrivateStatus === 403, "Shared media can be transferred back to private");

  const jaceShared = await request("/api/gallery/media?scope=shared", users.jace);
  const miraShared = await request("/api/gallery/media?scope=shared", users.mira);
  const ownerSharedMedia = jaceShared.media.find((media) => media.id === privateMedia.id);
  const adminSharedForJace = jaceShared.media.find((media) => media.id === sharedMedia.id);

  assert(jaceShared.media.some((media) => media.id === privateMedia.id), "Owner-shared media is not visible in shared gallery");
  assert(miraShared.media.some((media) => media.id === privateMedia.id), "Owner-shared media is not visible to another user");
  assert(jaceShared.media.some((media) => media.id === sharedMedia.id), "User cannot see shared media");
  assert(miraShared.media.some((media) => media.id === sharedMedia.id), "Second user cannot see shared media");
  assert(ownerSharedMedia?.canDelete === true, "Owner-shared media is not manageable in shared gallery");
  assert(adminSharedForJace?.canDelete === false, "Regular user can manage another user's shared media");
  assert(sharedMedia.addedByName === "Admin", "Shared media does not expose who added it");

  const timeline = await request("/api/gallery/timeline?scope=all", users.jace);
  const unsorted = await request("/api/gallery/media?scope=all&unsorted=true", users.jace);

  assert(privateMedia.capturedAt === null && privateMedia.year === null && privateMedia.month === null, "No-EXIF media should be unsorted");
  assert(privateMedia.fallbackCapturedAt, "No-EXIF media should retain fallback file date metadata");
  assert(timeline.unsortedCount >= 1, "Timeline does not expose unsorted media count");
  assert(unsorted.media.some((media) => media.id === privateMedia.id), "Unsorted filter does not include no-EXIF media");

  console.log(
    JSON.stringify(
      {
        privateAccess: "passed",
        sharedAccess: "passed",
        regularSharedUpload: regularSharedStatus,
        unsortedCount: timeline.unsortedCount,
        capturedAt: privateMedia.capturedAt,
        fallbackCapturedAt: privateMedia.fallbackCapturedAt,
        timelineYears: timeline.years.map((year) => `${year.year}:${year.count}`)
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