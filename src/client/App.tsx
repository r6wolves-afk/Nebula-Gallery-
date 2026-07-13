import { ChangeEvent, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  Cloud,
  Film,
  Grid3X3,
  ImageIcon,
  LayoutDashboard,
  Library,
  Lock,
  Package,
  Search,
  Share2,
  Shield,
  Square,
  Settings,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { GalleryMediaView, GalleryTimeline, GalleryVisibility, NebulaUser } from "../shared/gallery";
import { isVideoMimeType } from "../shared/gallery";

const demoUsers: NebulaUser[] = [
  { id: "jace", name: "Jace", role: "user" },
  { id: "mira", name: "Mira", role: "user" },
  { id: "admin", name: "Admin", role: "admin" }
];

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

type MediaKindFilter = "all" | "photos" | "videos";

function authHeaders(user: NebulaUser): HeadersInit {
  return {
    "X-Nebula-User-Id": user.id,
    "X-Nebula-User-Name": user.name,
    "X-Nebula-User-Role": user.role
  };
}

async function galleryFetch<T>(url: string, user: NebulaUser, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(user),
      ...init.headers
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function useMediaObjectUrl(media: GalleryMediaView | null, user: NebulaUser): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!media) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(media.contentUrl, { headers: authHeaders(user) })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load media");
        }

        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [media, user]);

  return url;
}

function mediaKindLabel(mimeType: string): "Picture" | "Video" {
  return isVideoMimeType(mimeType) ? "Video" : "Picture";
}

function MediaThumb({
  media,
  user,
  isSelected,
  selectionMode,
  onOpen,
  onToggleSelect
}: {
  media: GalleryMediaView;
  user: NebulaUser;
  isSelected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}) {
  const objectUrl = useMediaObjectUrl(media, user);
  const isVideo = isVideoMimeType(media.mimeType);
  const mediaKind = mediaKindLabel(media.mimeType);
  const timelineLabel = media.year && media.month ? `${monthNames[media.month - 1]} ${media.year}` : "Unsorted";
  const canSelect = media.canDelete || media.canShare;

  function handleTileClick() {
    if (selectionMode && canSelect) {
      onToggleSelect();
      return;
    }

    onOpen();
  }

  return (
    <article className={isSelected ? "media-tile selected" : "media-tile"}>
      {canSelect ? (
        <button
          className="select-toggle"
          onClick={onToggleSelect}
          type="button"
          aria-label={isSelected ? `Deselect ${media.filename}` : `Select ${media.filename}`}
        >
          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
        </button>
      ) : null}
      <button className="media-open" onClick={handleTileClick} type="button">
        <div className="media-frame">
          {objectUrl && !isVideo ? <img src={objectUrl} alt={media.filename} /> : null}
          {objectUrl && isVideo ? <video src={objectUrl} muted playsInline /> : null}
          {!objectUrl ? (
            <div className="media-placeholder">{isVideo ? <Film size={34} /> : <ImageIcon size={34} />}</div>
          ) : null}
        </div>
        <div className="media-caption">
          <span>{media.filename}</span>
          <small>{mediaKind} - {timelineLabel}</small>
        </div>
      </button>
    </article>
  );
}

function MetadataPanel({ media }: { media: GalleryMediaView }) {
  const capturedLabel = media.capturedAt ? new Date(media.capturedAt).toLocaleString() : "Unsorted";
  const rows = [
    ["Owner", media.ownerUserId],
    ["Added by", media.addedByName],
    ["Visibility", media.visibility],
    ["Media type", mediaKindLabel(media.mimeType)],
    ["Captured", capturedLabel],
    ["File date", new Date(media.fallbackCapturedAt).toLocaleString()],
    ["Type", media.mimeType],
    ["Size", `${(media.fileSize / 1024 / 1024).toFixed(2)} MB`],
    ["Dimensions", media.width && media.height ? `${media.width} x ${media.height}` : "Unknown"],
    ["Duration", media.duration ? `${media.duration.toFixed(1)}s` : "Not available"],
    ["Source", media.sourceFilePath]
  ];

  return (
    <aside className="metadata-panel">
      <h3>Metadata</h3>
      {rows.map(([label, value]) => (
        <div className="metadata-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </aside>
  );
}

function Lightbox({ media, user, onClose }: { media: GalleryMediaView; user: NebulaUser; onClose: () => void }) {
  const objectUrl = useMediaObjectUrl(media, user);
  const isVideo = isVideoMimeType(media.mimeType);

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button className="icon-button close-button" onClick={onClose} type="button" aria-label="Close preview">
        <X size={20} />
      </button>
      <div className="preview-stage">
        {objectUrl && isVideo ? <video src={objectUrl} controls autoPlay /> : null}
        {objectUrl && !isVideo ? <img src={objectUrl} alt={media.filename} /> : null}
        {!objectUrl ? <div className="preview-empty">Loading preview</div> : null}
      </div>
      <MetadataPanel media={media} />
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<NebulaUser>(demoUsers[0]);
  const [scope, setScope] = useState<GalleryVisibility>("private");
  const [timeline, setTimeline] = useState<GalleryTimeline | null>(null);
  const [media, setMedia] = useState<GalleryMediaView[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedUnsorted, setSelectedUnsorted] = useState(false);
  const [mediaKindFilter, setMediaKindFilter] = useState<MediaKindFilter>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [activeMedia, setActiveMedia] = useState<GalleryMediaView | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshGallery(nextScope = scope, year = selectedYear, month = selectedMonth, unsorted = selectedUnsorted) {
    const params = new URLSearchParams({ scope: nextScope });

    if (unsorted) {
      params.set("unsorted", "true");
    } else if (year) {
      params.set("year", String(year));

      if (month) {
        params.set("month", String(month));
      }
    }

    const [mediaResult, timelineResult] = await Promise.all([
      galleryFetch<{ media: GalleryMediaView[] }>(`/api/gallery/media?${params}`, user),
      galleryFetch<GalleryTimeline>(`/api/gallery/timeline?scope=${nextScope}`, user)
    ]);

    setMedia(mediaResult.media);
    setTimeline(timelineResult);
    setSelectedMediaIds((current) => new Set(mediaResult.media.filter((item) => current.has(item.id)).map((item) => item.id)));
  }

  useEffect(() => {
    refreshGallery().catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Unable to load gallery");
    });
  }, [user, scope, selectedYear, selectedMonth, selectedUnsorted]);

  function chooseScope(nextScope: GalleryVisibility) {
    setScope(nextScope);
    setSelectedYear(null);
    setSelectedMonth(null);
    setSelectedUnsorted(false);
    setSelectionMode(false);
    setSelectedMediaIds(new Set());
    setActiveMedia(null);
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => !current);
    setSelectedMediaIds(new Set());
  }

  function toggleMediaSelection(mediaId: string) {
    setSelectionMode(true);
    setSelectedMediaIds((current) => {
      const next = new Set(current);

      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }

      if (!next.size) {
        setSelectionMode(false);
      }

      return next;
    });
  }

  function selectAllDeletable() {
    setSelectionMode(true);
    setSelectedMediaIds(new Set(filteredMedia.filter((item) => item.canDelete || item.canShare).map((item) => item.id)));
  }

  function chooseMediaKindFilter(nextFilter: MediaKindFilter) {
    setMediaKindFilter(nextFilter);
    setSelectionMode(false);
    setSelectedMediaIds(new Set());
  }

  async function shareSelectedMedia() {
    const selected = media.filter((item) => selectedMediaIds.has(item.id) && item.canShare);

    if (!selected.length) {
      return;
    }

    setError(null);

    try {
      await Promise.all(selected.map((item) => galleryFetch(`/api/gallery/media/${item.id}/share`, user, { method: "POST" })));
      setSelectedMediaIds(new Set());
      setSelectionMode(false);
      await refreshGallery();
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Share failed");
    }
  }

  async function deleteSelectedMedia() {
    const selected = media.filter((item) => selectedMediaIds.has(item.id) && item.canDelete);

    if (!selected.length) {
      return;
    }

    setError(null);

    try {
      await Promise.all(selected.map((item) => galleryFetch(`/api/gallery/media/${item.id}`, user, { method: "DELETE" })));
      setSelectedMediaIds(new Set());
      setSelectionMode(false);
      await refreshGallery();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;

    if (!files?.length) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("media", file));
      formData.set("visibility", scope);
      await galleryFetch<{ media: GalleryMediaView[] }>("/api/gallery/upload", user, {
        method: "POST",
        body: formData
      });
      await refreshGallery();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function mutateMedia(mediaId: string, action: "share" | "private" | "delete") {
    const method = action === "delete" ? "DELETE" : "POST";
    const path = action === "delete" ? `/api/gallery/media/${mediaId}` : `/api/gallery/media/${mediaId}/${action}`;

    await galleryFetch(path, user, { method });
    setActiveMedia(null);
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      next.delete(mediaId);
      return next;
    });
    await refreshGallery();
  }

  const selectableCount = media.filter((item) => item.canDelete || item.canShare).length;
  const shareableSelectedCount = media.filter((item) => selectedMediaIds.has(item.id) && item.canShare).length;
  const hasShareableSelection = shareableSelectedCount > 0;
  const selectedCount = selectedMediaIds.size;
  const filteredMedia = media.filter((item) => {
    if (mediaKindFilter === "photos") {
      return !isVideoMimeType(item.mimeType);
    }

    if (mediaKindFilter === "videos") {
      return isVideoMimeType(item.mimeType);
    }

    return true;
  });
  const filteredSelectableCount = filteredMedia.filter((item) => item.canDelete || item.canShare).length;
  const mediaCountLabel = `${filteredMedia.length} ${mediaKindFilter === "photos" ? "photo" : mediaKindFilter === "videos" ? "video" : "item"}${filteredMedia.length === 1 ? "" : "s"}`;

  return (
    <div className="shell addon-shell">
      <aside className="sidebar addon-sidebar">
        <div className="addon-brand">
          <p className="eyebrow">NEBULA ADD-ON</p>
          <h1>Nebula Gallery</h1>
        </div>

        <div className="sidebar-tools">
          <label className="search-box sidebar-search">
            <Search size={16} />
            <input placeholder="Search media" type="search" />
          </label>
          <label className="upload-button icon-upload" aria-label="Upload media" title="Upload media">
            <Upload size={18} />
            <input
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              multiple
              onChange={handleUpload}
              type="file"
            />
          </label>
        </div>

        <div className="segmented sidebar-scope" aria-label="Gallery scope">
          <button className={scope === "private" ? "selected" : ""} onClick={() => chooseScope("private")} type="button">
            <Lock size={15} /> Private
          </button>
          <button className={scope === "shared" ? "selected" : ""} onClick={() => chooseScope("shared")} type="button">
            <Share2 size={15} /> Shared
          </button>
        </div>

        <p className="sidebar-section-label">Browse</p>
        <div className="timeline-browser addon-timeline">
          <button
            className={!selectedYear && !selectedUnsorted ? "timeline-all active" : "timeline-all"}
            onClick={() => { setSelectedYear(null); setSelectedMonth(null); setSelectedUnsorted(false); }}
            type="button"
          >
            <CalendarDays size={18} /> All media
          </button>
          <button
            className={selectedUnsorted ? "timeline-all active" : "timeline-all"}
            onClick={() => { setSelectedYear(null); setSelectedMonth(null); setSelectedUnsorted(true); }}
            type="button"
          >
            <ImageIcon size={18} /> <span>Unsorted</span><small>{timeline?.unsortedCount ?? 0}</small>
          </button>
          {timeline?.years.map((year) => (
            <div className="timeline-year" key={year.year}>
              <button
                className={selectedYear === year.year && !selectedMonth && !selectedUnsorted ? "active" : ""}
                onClick={() => { setSelectedYear(year.year); setSelectedMonth(null); setSelectedUnsorted(false); }}
                type="button"
              >
                <span>{year.year}</span><small>{year.count}</small>
              </button>
              {year.months.map((month) => (
                <button
                  className={selectedYear === year.year && selectedMonth === month.month && !selectedUnsorted ? "month active" : "month"}
                  key={month.month}
                  onClick={() => { setSelectedYear(year.year); setSelectedMonth(month.month); setSelectedUnsorted(false); }}
                  type="button"
                >
                  <span>{monthNames[month.month - 1]}</span><small>{month.count}</small>
                </button>
              ))}
            </div>
          ))}
        </div>

        <label className="user-switcher addon-user">
          Signed in
          <select
            value={user.id}
            onChange={(event) => setUser(demoUsers.find((candidate) => candidate.id === event.target.value) ?? demoUsers[0])}
          >
            {demoUsers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.role})</option>
            ))}
          </select>
        </label>
      </aside>

      <main className="workspace addon-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">NEBULA PORTAL</p>
            <h1>Nebula Gallery</h1>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input placeholder="Search media and settings" type="search" />
          </label>
          <label className="user-switcher">
            Signed in
            <select
              value={user.id}
              onChange={(event) => setUser(demoUsers.find((candidate) => candidate.id === event.target.value) ?? demoUsers[0])}
            >
              {demoUsers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.role})</option>
              ))}
            </select>
          </label>
        </header>

        <section className="gallery-toolbar">
          <div className="segmented" aria-label="Gallery scope">
            <button className={scope === "private" ? "selected" : ""} onClick={() => chooseScope("private")} type="button">
              <Lock size={16} /> Private
            </button>
            <button className={scope === "shared" ? "selected" : ""} onClick={() => chooseScope("shared")} type="button">
              <Share2 size={16} /> Shared
            </button>
          </div>
          <label className="upload-button">
            <Upload size={17} /> {isUploading ? "Importing" : "Upload"}
            <input
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              multiple
              onChange={handleUpload}
              type="file"
            />
          </label>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="gallery-layout">
          <aside className="timeline-browser">
            <button
              className={!selectedYear && !selectedUnsorted ? "timeline-all active" : "timeline-all"}
              onClick={() => { setSelectedYear(null); setSelectedMonth(null); setSelectedUnsorted(false); }}
              type="button"
            >
              <CalendarDays size={18} /> All media
            </button>
            <button
              className={selectedUnsorted ? "timeline-all active" : "timeline-all"}
              onClick={() => { setSelectedYear(null); setSelectedMonth(null); setSelectedUnsorted(true); }}
              type="button"
            >
              <ImageIcon size={18} /> <span>Unsorted</span><small>{timeline?.unsortedCount ?? 0}</small>
            </button>
            {timeline?.years.map((year) => (
              <div className="timeline-year" key={year.year}>
                <button
                  className={selectedYear === year.year && !selectedMonth && !selectedUnsorted ? "active" : ""}
                  onClick={() => { setSelectedYear(year.year); setSelectedMonth(null); setSelectedUnsorted(false); }}
                  type="button"
                >
                  <span>{year.year}</span><small>{year.count}</small>
                </button>
                {year.months.map((month) => (
                  <button
                    className={selectedYear === year.year && selectedMonth === month.month && !selectedUnsorted ? "month active" : "month"}
                    key={month.month}
                    onClick={() => { setSelectedYear(year.year); setSelectedMonth(month.month); setSelectedUnsorted(false); }}
                    type="button"
                  >
                    <span>{monthNames[month.month - 1]}</span><small>{month.count}</small>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <section className="media-section">
            <div className="section-heading">
              <div>
                <h2>{scope === "private" ? "Private Gallery" : "Shared Gallery"}</h2>
                <p>{selectionMode ? `${selectedCount} selected` : mediaCountLabel}</p>
              </div>
              <div className="media-kind-filter" aria-label="Media type filter">
                <button className={mediaKindFilter === "all" ? "active" : ""} onClick={() => chooseMediaKindFilter("all")} type="button">
                  <Grid3X3 size={15} /> All Media
                </button>
                <button className={mediaKindFilter === "photos" ? "active" : ""} onClick={() => chooseMediaKindFilter("photos")} type="button">
                  <ImageIcon size={15} /> Photos
                </button>
                <button className={mediaKindFilter === "videos" ? "active" : ""} onClick={() => chooseMediaKindFilter("videos")} type="button">
                  <Film size={15} /> Videos
                </button>
              </div>
              <div className="gallery-actions">
                {user.role === "admin" ? <span className="admin-chip"><Shield size={14} /> Admin controls enabled</span> : null}
                {media.length ? (
                  <button className="secondary-action" onClick={toggleSelectionMode} type="button">
                    {selectionMode ? "Cancel select" : "Select"}
                  </button>
                ) : null}
                {selectionMode ? (
                  <>
                    <button className="secondary-action" disabled={!filteredSelectableCount} onClick={selectAllDeletable} type="button">
                      Select all
                    </button>
                    <button className="secondary-action" disabled={!selectedCount} onClick={() => setSelectedMediaIds(new Set())} type="button">
                      Clear
                    </button>
                    {hasShareableSelection ? (
                      <button className="secondary-action" onClick={shareSelectedMedia} type="button">
                        <Share2 size={16} /> Share selected
                      </button>
                    ) : null}
                    <button className="danger-action" disabled={!selectedCount} onClick={deleteSelectedMedia} type="button">
                      <Trash2 size={16} /> Delete selected
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {filteredMedia.length ? (
              <div className="media-grid">
                {filteredMedia.map((item) => (
                  <MediaThumb
                    key={item.id}
                    media={item}
                    user={user}
                    isSelected={selectedMediaIds.has(item.id)}
                    selectionMode={selectionMode}
                    onOpen={() => setActiveMedia(item)}
                    onToggleSelect={() => toggleMediaSelection(item.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                {mediaKindFilter === "videos" ? <Film size={38} /> : <ImageIcon size={38} />}
                <h3>No media here yet</h3>
                <p>{media.length ? `No ${mediaKindFilter} match this view.` : "Import images or videos to start building this timeline."}</p>
              </div>
            )}
          </section>
        </div>
      </main>

      {activeMedia ? (
        <Lightbox media={activeMedia} user={user} onClose={() => setActiveMedia(null)} />
      ) : null}

      {activeMedia ? (
        <div className="action-dock">
          {activeMedia.canShare ? (
            <button onClick={() => mutateMedia(activeMedia.id, "share")} type="button"><Share2 size={16} /> Move to shared</button>
          ) : null}
          {activeMedia.canMakePrivate ? (
            <button onClick={() => mutateMedia(activeMedia.id, "private")} type="button"><Lock size={16} /> Make private</button>
          ) : null}
          {activeMedia.canDelete ? (
            <button className="danger" onClick={() => mutateMedia(activeMedia.id, "delete")} type="button"><Trash2 size={16} /> Delete</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}