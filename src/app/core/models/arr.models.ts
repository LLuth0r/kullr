/** Result returned by /api/media/resolve for a single Plex item. */
export interface ResolveResult {
  ratingKey: string;
  matched: boolean;
  instanceId?: string;
  instanceName?: string;
  arrType?: 'sonarr' | 'radarr';
  arrItemId?: number;
  arrItemPath?: string;
  reason?: string;
}

/** Per-item outcome of /api/media/delete. */
export interface DeleteResult {
  ratingKey: string;
  title?: string;
  ok: boolean;
  action?: string;
  error?: string;
}

export interface DeleteRequestItem {
  ratingKey: string;
  filePath?: string;
  mediaType: 'movie' | 'show';
  title?: string;
  /** External IDs from Plex's Guid array — a more robust match than paths. */
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
}

export interface DeleteOptions {
  deleteFiles: boolean;
  unmonitor: boolean;
  addImportListExclusion: boolean;
}
