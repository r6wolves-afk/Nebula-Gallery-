import { ChangeEvent, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  Film,
  Grid3X3,
  ImageIcon,
  Lock,
  Search,
  Share2,
  Square,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { GalleryMediaView, GalleryScope } from "../shared/gallery";

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

interface GalleryTimelineMonthView {
  month: number;
  count: number;
}

interface GalleryTimelineYearView {
  year: number;
  count: number;
  months: GalleryTimelineMonthView[];
}

async function readResponseMessage(response: Response): Promise<string> {
  const text = await response.text();

  if (!text) {
    return `Request failed with ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? text;
  } catch {
    return text;
  }
}

async function galleryFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(await readResponseMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function mediaKindLabel(media: GalleryMediaView): "Picture" | "Video" {
  return media.kind === "video" ? "Video" : "Picture";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function canShareMedia(media: GalleryMediaView): boolean {
  return media.visibility === "private";
}

function canMakeMediaPrivate(media: GalleryMediaView): boolean {
  return media.visibility === "shared";
}

function canDeleteMedia(media: GalleryMediaView): boolean {
  return true;
}

function canSelectMedia(media: GalleryMediaView): boolean {
  return canDeleteMedia(media) || canShareMedia(media) || canMakeMediaPrivate(media);
}

function MediaThumb({
  media,
  isSelected,
  selectionMode,
  onOpen,
  onContentError,
  onToggleSelect
}: {
  media: GalleryMediaView;
  isSelected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onContentError: () => void;
  onToggleSelect: () => void;
}) {
  const isVideo = media.kind === "video";
  const mediaKind = mediaKindLabel(media);
  const timelineLabel = `${monthNames[media.month - 1]} ${media.year}`;
  const canSelect = canSelectMedia(media);

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
          {!isVideo ? <img src={media.contentUrl} alt={media.filename} onError={onContentError} /> : null}
          {isVideo ? <video src={media.contentUrl} muted playsInline preload="metadata" onError={onContentError} /> : null}
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
  const rows = [
    ["Owner", media.ownerDisplayName || media.ownerUserId],
    ["Visibility", media.visibility],
    ["Media type", mediaKindLabel(media)],
    ["Captured", formatDateTime(media.capturedAt)],
    ["Created", formatDateTime(media.createdAt)],
    ["Type", media.mimeType],
    ["Size", `${(media.size / 1024 / 1024).toFixed(2)} MB`],
    ["Dimensions", media.width && media.height ? `${media.width} x ${media.height}` : null],
    ["Duration", media.durationSeconds ? `${media.durationSeconds.toFixed(1)}s` : null]
  ];

  return (
    <aside className="metadata-panel">
      <h3>Metadata</h3>
      {rows.filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => (
        <div className="metadata-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </aside>
  );
}

function Lightbox({ media, onClose, onContentError }: { media: GalleryMediaView; onClose: () => void; onContentError: () => void }) {
  const isVideo = media.kind === "video";

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button className="icon-button close-button" onClick={onClose} type="button" aria-label="Close preview">
        <X size={20} />
      </button>
      <div className="preview-stage">
        {isVideo ? <video src={media.contentUrl} controls autoPlay preload="metadata" onError={onContentError} /> : null}
        {!isVideo ? <img src={media.contentUrl} alt={media.filename} onError={onContentError} /> : null}
      </div>
      <MetadataPanel media={media} />
    </div>
  );
}

export function App() {
  const [scope, setScope] = useState<GalleryScope>("private");
  const [timeline, setTimeline] = useState<GalleryTimelineYearView[]>([]);
  const [media, setMedia] = useState<GalleryMediaView[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [mediaKindFilter, setMediaKindFilter] = useState<MediaKindFilter>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [activeMedia, setActiveMedia] = useState<GalleryMediaView | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshGallery(nextScope = scope) {
    const params = new URLSearchParams({ scope: nextScope });

    const [mediaResult, timelineResult] = await Promise.all([
      galleryFetch<{ media: GalleryMediaView[] }>(`/api/gallery/media?${params}`),
      galleryFetch<{ timeline: GalleryTimelineYearView[] }>(`/api/gallery/timeline?scope=${nextScope}`)
    ]);

    setMedia(mediaResult.media);
    setTimeline(timelineResult.timeline);
    setSelectedMediaIds((current) => new Set(mediaResult.media.filter((item) => current.has(item.id)).map((item) => item.id)));
  }

  useEffect(() => {
    refreshGallery().catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Unable to load gallery");
    });
  }, [scope]);

  function chooseScope(nextScope: GalleryScope) {
    setScope(nextScope);
    setSelectedYear(null);
    setSelectedMonth(null);
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
    setSelectedMediaIds(new Set(filteredMedia.filter(canSelectMedia).map((item) => item.id)));
  }

  function chooseMediaKindFilter(nextFilter: MediaKindFilter) {
    setMediaKindFilter(nextFilter);
    setSelectionMode(false);
    setSelectedMediaIds(new Set());
  }

  function chooseTimelineYear(nextYear: string) {
    setSelectedYear(nextYear ? Number(nextYear) : null);
    setSelectedMonth(null);
  }

  function clearTimelineFilter() {
    setSelectedYear(null);
    setSelectedMonth(null);
  }

  function showContentLoadError() {
    setError("Unable to load media content.");
  }

  async function shareSelectedMedia() {
    const selected = media.filter((item) => selectedMediaIds.has(item.id) && canShareMedia(item));

    if (!selected.length) {
      return;
    }

    setError(null);

    try {
      await Promise.all(selected.map((item) => galleryFetch(`/api/gallery/media/${item.id}/share`, { method: "POST" })));
      setSelectedMediaIds(new Set());
      setSelectionMode(false);
      await refreshGallery();
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Share failed");
    }
  }

  async function deleteSelectedMedia() {
    const selected = media.filter((item) => selectedMediaIds.has(item.id) && canDeleteMedia(item));

    if (!selected.length) {
      return;
    }

    setError(null);

    try {
      await Promise.all(selected.map((item) => galleryFetch(`/api/gallery/media/${item.id}`, { method: "DELETE" })));
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
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("visibility", scope === "shared" ? "shared" : "private");
        await galleryFetch<{ media: GalleryMediaView }>("/api/gallery/upload", {
          method: "POST",
          body: formData
        });
      }
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

    setError(null);

    try {
      await galleryFetch(path, { method });
      setActiveMedia(null);
      setSelectedMediaIds((current) => {
        const next = new Set(current);
        next.delete(mediaId);
        return next;
      });
      await refreshGallery();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Media update failed");
    }
  }

  const shareableSelectedCount = media.filter((item) => selectedMediaIds.has(item.id) && canShareMedia(item)).length;
  const hasShareableSelection = shareableSelectedCount > 0;
  const selectedCount = selectedMediaIds.size;
  const filteredMedia = media.filter((item) => {
    if (selectedYear && item.year !== selectedYear) {
      return false;
    }

    if (selectedMonth && item.month !== selectedMonth) {
      return false;
    }

    if (mediaKindFilter === "photos") {
      return item.kind === "image";
    }

    if (mediaKindFilter === "videos") {
      return item.kind === "video";
    }

    return true;
  });
  const filteredSelectableCount = filteredMedia.filter(canSelectMedia).length;
  const mediaCountLabel = `${filteredMedia.length} ${mediaKindFilter === "photos" ? "photo" : mediaKindFilter === "videos" ? "video" : "item"}${filteredMedia.length === 1 ? "" : "s"}`;
  const selectedTimelineYear = timeline.find((year) => year.year === selectedYear) ?? null;

  return (
    <div className="shell addon-shell">
      <aside className="sidebar addon-sidebar">
        <div className="addon-brand">
          <p className="eyebrow">GALLERY</p>
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
          <button className={scope === "all" ? "selected" : ""} onClick={() => chooseScope("all")} type="button">
            <CalendarDays size={15} /> All
          </button>
        </div>

        <p className="sidebar-section-label">Browse</p>
        <div className="timeline-browser addon-timeline">
          <button
            className={!selectedYear ? "timeline-all active" : "timeline-all"}
            onClick={clearTimelineFilter}
            type="button"
          >
            <CalendarDays size={18} /> All media
          </button>
          <label className="timeline-select-label" htmlFor="timeline-year">
            <span>Year</span>
            <select id="timeline-year" onChange={(event) => chooseTimelineYear(event.target.value)} value={selectedYear ?? ""}>
              <option value="">Choose year</option>
              {timeline.map((year) => (
                <option key={year.year} value={year.year}>
                  {year.year} ({year.count})
                </option>
              ))}
            </select>
          </label>
          {selectedTimelineYear ? (
            <div className="timeline-month-filter" aria-label="Month filter">
              <button
                className={!selectedMonth ? "month active" : "month"}
                onClick={() => setSelectedMonth(null)}
                type="button"
              >
                <span>All months</span><small>{selectedTimelineYear.count}</small>
              </button>
              {selectedTimelineYear.months.map((month) => (
                <button
                  className={selectedMonth === month.month ? "month active" : "month"}
                  key={month.month}
                  onClick={() => setSelectedMonth(month.month)}
                  type="button"
                >
                  <span>{monthNames[month.month - 1]}</span><small>{month.count}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <main className="workspace addon-workspace">
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="media-section">
            <div className="section-heading">
              <div>
                <h2>{scope === "private" ? "Private Gallery" : scope === "shared" ? "Shared Gallery" : "All Gallery"}</h2>
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
                <label className="upload-button compact-gallery-upload">
                  <Upload size={16} /> {isUploading ? "Importing" : "Upload"}
                  <input
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    multiple
                    onChange={handleUpload}
                    type="file"
                  />
                </label>
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
                    isSelected={selectedMediaIds.has(item.id)}
                    selectionMode={selectionMode}
                    onOpen={() => setActiveMedia(item)}
                    onContentError={showContentLoadError}
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
      </main>

      {activeMedia ? (
        <Lightbox media={activeMedia} onClose={() => setActiveMedia(null)} onContentError={showContentLoadError} />
      ) : null}

      {activeMedia ? (
        <div className="action-dock">
          {canShareMedia(activeMedia) ? (
            <button onClick={() => mutateMedia(activeMedia.id, "share")} type="button"><Share2 size={16} /> Move to shared</button>
          ) : null}
          {canMakeMediaPrivate(activeMedia) ? (
            <button onClick={() => mutateMedia(activeMedia.id, "private")} type="button"><Lock size={16} /> Move to private</button>
          ) : null}
          {canDeleteMedia(activeMedia) ? (
            <button className="danger" onClick={() => mutateMedia(activeMedia.id, "delete")} type="button"><Trash2 size={16} /> Delete</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}