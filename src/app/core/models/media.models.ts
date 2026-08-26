export interface TautulliConfig {
  url: string;
  apiKey: string;
}

export interface PlexConfig {
  url: string;
  token: string;
}

/** A single Sonarr or Radarr instance. */
export interface ArrInstance {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  rootFolders: string[];
  enabled: boolean;
  /**
   * Optional path translation applied to a Plex-reported file path before
   * matching it against this instance's root folders — for setups where
   * Plex and this *arr instance see the same share at different container
   * paths (e.g. Plex at /mnt/user/data, Sonarr/Radarr at /data).
   */
  pathMapFrom?: string;
  pathMapTo?: string;
}

export interface AppConfig {
  tautulli?: TautulliConfig;
  plex?: PlexConfig;
  sonarr: ArrInstance[];
  radarr: ArrInstance[];
  /** True iff plex + tautulli are both populated server-side. */
  configured?: boolean;
}

export interface TautulliLibrary {
  section_id: string;
  section_name: string;
  section_type: 'movie' | 'show' | 'artist' | 'photo';
  count: string;
}

/** Plex user with access to the server */
export interface PlexUser {
  id: string;
  title: string;       // Display name
  username: string;
  email?: string;
  thumb?: string;
  isHome: boolean;      // Plex Home managed user
  isAdmin: boolean;
}

/** Per-user watch info for a single item */
export interface UserWatchInfo {
  userId: string;
  username: string;
  watched: boolean;
  viewCount: number;
  lastViewedAt: number | null;
}

/** Plex-native watch state aggregated across ALL users */
export interface PlexWatchState {
  watched: boolean;              // ANY user has watched
  viewCount: number;             // Sum across all users
  lastViewedAt: number | null;   // Most recent across all users
  viewOffset: number;            // Any user's resume offset
  /** For shows: max watched episodes across any user */
  watchedEpisodes?: number;
  totalEpisodes?: number;
  /** Per-user breakdown */
  watchedBy: UserWatchInfo[];
  /** Filesystem path Plex sees for this item (used by *arr resolver). */
  filePath?: string;
}

/** Describes the mismatch between Tautulli and Plex */
export type DiscrepancyType =
  | 'none'              // Both agree
  | 'plex_only'         // Plex says watched, Tautulli has no record
  | 'tautulli_only'     // Tautulli has plays, Plex says unwatched (rare, usually manual unmark)
  | 'count_mismatch';   // Both say watched but play counts differ significantly

export interface WatchDiscrepancy {
  type: DiscrepancyType;
  detail: string;
}

export interface MediaItem {
  rating_key: string;
  title: string;
  year?: string;
  media_type: 'movie' | 'show';
  library_name: string;
  library_id: string;
  file_size: number;
  play_count: number;           // Tautulli play count
  last_played: number | null;   // Tautulli last played
  progress_pct: number;
  users_watching?: number;
  seasons?: Season[];
  // ── Plex-native fields ──
  plex?: PlexWatchState;
  discrepancy?: WatchDiscrepancy;
  // ── *arr resolution ──
  arr?: {
    matched: boolean;
    instanceId?: string;
    instanceName?: string;
    arrType?: 'sonarr' | 'radarr';
    arrItemId?: number;
    arrItemPath?: string;
    reason?: string;
  };
}

export interface Season {
  rating_key: string;
  title: string;
  media_index: number;
  episodes: Episode[];
  episodes_total: number;
  episodes_watched: number;       // Tautulli count
  plexEpisodesWatched?: number;   // Plex count
}

export interface Episode {
  rating_key: string;
  title: string;
  media_index: number;
  play_count: number;           // Tautulli
  last_played: number | null;   // Tautulli
  file_size: number;
  // ── Plex-native fields ──
  plex?: PlexWatchState;
  discrepancy?: WatchDiscrepancy;
}

export interface StalenessInfo {
  label: string;
  color: string;
  bg: string;
  priority: number;
}

export interface LibraryStats {
  totalItems: number;
  totalSize: number;
  neverWatched: number;
  neverWatchedSize: number;
  staleCount: number;
  staleSize: number;
  reclaimable: number;
  reclaimablePct: number;
  discrepancyCount: number;
}

export interface MediaFilters {
  search: string;
  library: string;
  watchStatus: 'all' | 'never' | 'stale180' | 'stale365' | 'in_progress' | 'completed' | 'discrepancy';
  sort: 'staleness' | 'size_desc' | 'title' | 'last_played';
}
