import { Injectable, signal, computed } from '@angular/core';
import {
  MediaItem,
  MediaFilters,
  TautulliLibrary,
  LibraryStats,
  PlexWatchState,
  WatchDiscrepancy,
  Episode,
} from '../models';
import { FormatService } from './format.service';
import { TautulliService } from './tautulli.service';
import { PlexService } from './plex.service';
import { ConfigService } from './config.service';

@Injectable({ providedIn: 'root' })
export class MediaStateService {
  // ── Signals (state) ──────────────────────────────
  readonly libraries = signal<TautulliLibrary[]>([]);
  readonly mediaItems = signal<MediaItem[]>([]);
  readonly expandedShows = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly loadingMsg = signal('');
  readonly error = signal('');
  readonly filters = signal<MediaFilters>({
    search: '',
    library: 'all',
    watchStatus: 'all',
    sort: 'staleness',
  });

  // ── Computed (derived state) ─────────────────────

  /** Helper: has ANY source confirmed this item was watched? */
  private isWatchedByAnyone(item: MediaItem): boolean {
    // Tautulli says watched
    if (item.play_count > 0) return true;
    // Plex: explicit watched flag
    if (item.plex?.watched) return true;
    // Plex: has view count
    if (item.plex && item.plex.viewCount > 0) return true;
    // Plex: any user in watchedBy
    if (item.plex?.watchedBy && item.plex.watchedBy.length > 0) return true;
    // Plex shows: any episodes watched
    if (item.plex?.watchedEpisodes && item.plex.watchedEpisodes > 0) return true;
    return false;
  }

  readonly stats = computed<LibraryStats>(() => {
    const items = this.mediaItems();
    const totalSize = items.reduce((s, i) => s + i.file_size, 0);
    // "Never watched" = NO source says it's been watched by ANY user
    const never = items.filter((i) => !this.isWatchedByAnyone(i));
    const neverSize = never.reduce((s, i) => s + i.file_size, 0);
    const stale = items.filter(
      (i) => {
        // Consider both Tautulli and Plex last-watched timestamps
        const tautulliDays = this.fmt.daysSince(i.last_played);
        const plexDays = this.fmt.daysSince(i.plex?.lastViewedAt ?? null);
        const mostRecentDays = Math.min(tautulliDays, plexDays);
        return mostRecentDays > 180 && this.isWatchedByAnyone(i);
      }
    );
    const staleSize = stale.reduce((s, i) => s + i.file_size, 0);
    const reclaimable = neverSize + staleSize;
    const discrepancyCount = items.filter(
      (i) => i.discrepancy && i.discrepancy.type !== 'none'
    ).length;

    return {
      totalItems: items.length,
      totalSize,
      neverWatched: never.length,
      neverWatchedSize: neverSize,
      staleCount: stale.length,
      staleSize,
      reclaimable,
      reclaimablePct: totalSize ? (reclaimable / totalSize) * 100 : 0,
      discrepancyCount,
    };
  });

  readonly filteredItems = computed<MediaItem[]>(() => {
    const items = this.mediaItems();
    const f = this.filters();

    const filtered = items.filter((item) => {
      if (
        f.search &&
        !item.title?.toLowerCase().includes(f.search.toLowerCase())
      )
        return false;
      if (f.library !== 'all' && String(item.library_id) !== f.library)
        return false;

      const days = this.fmt.daysSince(item.last_played);

      switch (f.watchStatus) {
        case 'never':
          return !this.isWatchedByAnyone(item);
        case 'stale180':
          return days >= 180;
        case 'stale365':
          return days >= 365;
        case 'in_progress':
          return (
            (item.progress_pct > 0 && item.progress_pct < 100) ||
            (!!item.plex?.viewOffset && item.plex.viewOffset > 0)
          );
        case 'completed':
          return this.isWatchedByAnyone(item);
        case 'discrepancy':
          return item.discrepancy != null && item.discrepancy.type !== 'none';
        default:
          return true;
      }
    });

    return filtered.sort((a, b) => {
      switch (f.sort) {
        case 'staleness': {
          const pa = this.fmt.staleness(this.fmt.daysSince(a.last_played)).priority;
          const pb = this.fmt.staleness(this.fmt.daysSince(b.last_played)).priority;
          return pa - pb || b.file_size - a.file_size;
        }
        case 'size_desc':
          return b.file_size - a.file_size;
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'last_played':
          return (b.last_played || 0) - (a.last_played || 0);
        default:
          return 0;
      }
    });
  });

  constructor(
    private fmt: FormatService,
    private tautulli: TautulliService,
    private plex: PlexService,
    private configSvc: ConfigService
  ) {}

  private hasPlex(): boolean {
    return !!this.configSvc.config().plex;
  }

  // ── Actions ──────────────────────────────────────

  updateFilters(partial: Partial<MediaFilters>): void {
    this.filters.update((f) => ({ ...f, ...partial }));
  }

  async loadLibraries(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      // Phase 0: Discover all Plex users
      if (this.hasPlex()) {
        this.loadingMsg.set('Discovering Plex users…');
        try {
          await this.plex.getServerInfo();
          const users = await this.plex.discoverUsers();
          console.log(`Found ${users.length} Plex users:`, users.map((u) => u.title));
        } catch (e) {
          console.warn('User discovery failed, continuing with admin only:', e);
        }
      }

      this.loadingMsg.set('Fetching libraries…');
      const libs = await this.tautulli.getLibraries();
      this.libraries.set(libs);

      const allMedia: MediaItem[] = [];

      for (const lib of libs) {
        // Phase 1: Get Tautulli data
        this.loadingMsg.set(`Scanning ${lib.section_name} (Tautulli)…`);
        let tautulliItems: MediaItem[] = [];
        try {
          const items = await this.tautulli.getLibraryMediaInfo(lib.section_id);
          tautulliItems = items.map((item) => ({
            ...item,
            library_name: lib.section_name,
            library_id: lib.section_id,
            media_type: lib.section_type as 'movie' | 'show',
          }));
        } catch (e) {
          console.warn(`Tautulli failed for ${lib.section_name}:`, e);
        }

        // Phase 2: Get Plex watch state (aggregated across all users)
        let plexWatchMap = new Map<string, PlexWatchState>();
        if (this.hasPlex()) {
          const userCount = this.plex.users().length;
          this.loadingMsg.set(
            `Scanning ${lib.section_name} (Plex · ${userCount} user${userCount !== 1 ? 's' : ''})…`
          );
          try {
            plexWatchMap = await this.plex.getLibraryWatchState(lib.section_id);
          } catch (e) {
            console.warn(`Plex watch state failed for ${lib.section_name}:`, e);
          }
        }

        // Phase 3: Merge and detect discrepancies
        this.loadingMsg.set(`Analyzing ${lib.section_name}…`);
        for (const item of tautulliItems) {
          const plexState = plexWatchMap.get(item.rating_key) || null;
          const discrepancy = this.detectDiscrepancy(item, plexState);

          allMedia.push({
            ...item,
            plex: plexState ?? undefined,
            discrepancy,
          });
        }
      }

      // Phase 4: Resolve each item to its owning *arr instance (if any are configured)
      const cfg = this.configSvc.config();
      const hasAnyArr = cfg.sonarr.length > 0 || cfg.radarr.length > 0;
      if (hasAnyArr) {
        this.loadingMsg.set('Matching Sonarr / Radarr…');
        try {
          const requestItems = allMedia
            .filter((m) => m.plex?.filePath)
            .map((m) => ({
              ratingKey: m.rating_key,
              filePath: m.plex!.filePath!,
              mediaType: m.media_type,
            }));
          const results = await this.configSvc.resolveItems(requestItems);
          const byKey = new Map(results.map((r) => [r.ratingKey, r]));
          for (const m of allMedia) {
            const r = byKey.get(m.rating_key);
            if (r) {
              m.arr = {
                matched: r.matched,
                instanceId: r.instanceId,
                instanceName: r.instanceName,
                arrType: r.arrType,
                arrItemId: r.arrItemId,
                arrItemPath: r.arrItemPath,
                reason: r.reason,
              };
            } else {
              // Never sent to the resolver at all — say why, instead of
              // leaving `arr` undefined and falling back to a generic message.
              m.arr = {
                matched: false,
                reason: !m.plex
                  ? 'No matching Plex item found for this Tautulli entry'
                  : 'Plex did not report a file path for this item',
              };
            }
          }
        } catch (e: any) {
          console.warn('Resolver failed:', e.message);
        }
      }

      this.mediaItems.set(allMedia);
    } catch (e: any) {
      this.error.set(`Failed to load: ${e.message}`);
    } finally {
      this.loading.set(false);
      this.loadingMsg.set('');
    }
  }

  async toggleShowExpansion(ratingKey: string): Promise<void> {
    const expanded = new Set(this.expandedShows());

    if (expanded.has(ratingKey)) {
      expanded.delete(ratingKey);
      this.expandedShows.set(expanded);
      return;
    }

    try {
      // Get Tautulli season/episode data
      const seasons = await this.tautulli.getShowSeasons(ratingKey);

      // Get Plex per-episode watch state
      let plexEpMap = new Map<string, PlexWatchState>();
      if (this.hasPlex()) {
        try {
          plexEpMap = await this.plex.getShowEpisodeWatchState(ratingKey);
        } catch (e) {
          console.warn('Plex episode watch state failed:', e);
        }
      }

      // Merge Plex state into episodes and compute per-season Plex counts
      for (const season of seasons) {
        let plexWatchedCount = 0;
        for (const ep of season.episodes) {
          const plexEp = plexEpMap.get(ep.rating_key) || null;
          if (plexEp) {
            (ep as Episode).plex = plexEp;
            (ep as Episode).discrepancy = this.detectEpisodeDiscrepancy(ep, plexEp);
            if (plexEp.watched) plexWatchedCount++;
          } else {
            (ep as Episode).discrepancy = { type: 'none', detail: '' };
          }
        }
        season.plexEpisodesWatched = plexWatchedCount;
      }

      this.mediaItems.update((items) =>
        items.map((item) =>
          item.rating_key === ratingKey ? { ...item, seasons } : item
        )
      );

      expanded.add(ratingKey);
      this.expandedShows.set(expanded);
    } catch (e) {
      console.error('Failed to expand show:', e);
    }
  }

  reset(): void {
    this.libraries.set([]);
    this.mediaItems.set([]);
    this.expandedShows.set(new Set());
    this.loading.set(false);
    this.error.set('');
    this.filters.set({
      search: '',
      library: 'all',
      watchStatus: 'all',
      sort: 'staleness',
    });
  }

  // ── Discrepancy Detection ────────────────────────

  private formatWatchedByNames(state: PlexWatchState): string {
    if (!state.watchedBy || state.watchedBy.length === 0) return '';
    const names = state.watchedBy.map((u) => u.username).join(', ');
    return ` by ${names}`;
  }

  private detectDiscrepancy(
    item: MediaItem,
    plexState: PlexWatchState | null
  ): WatchDiscrepancy {
    if (!plexState) {
      return { type: 'none', detail: 'No Plex data available' };
    }

    const tautulliWatched = item.play_count > 0;
    const plexWatched = plexState.watched;
    const byNames = this.formatWatchedByNames(plexState);

    if (plexWatched && !tautulliWatched) {
      if (item.media_type === 'show') {
        return {
          type: 'plex_only',
          detail: `Plex: ${plexState.watchedEpisodes}/${plexState.totalEpisodes} eps watched${byNames} · Tautulli: no history`,
        };
      }
      return {
        type: 'plex_only',
        detail: `Plex: watched${byNames} (${plexState.viewCount} plays) · Tautulli: no history`,
      };
    }

    if (tautulliWatched && !plexWatched) {
      return {
        type: 'tautulli_only',
        detail: `Tautulli: ${item.play_count} plays · Plex: marked unwatched (all users)`,
      };
    }

    if (
      tautulliWatched &&
      plexWatched &&
      item.media_type === 'movie' &&
      Math.abs(item.play_count - plexState.viewCount) >= 2
    ) {
      return {
        type: 'count_mismatch',
        detail: `Tautulli: ${item.play_count} plays · Plex: ${plexState.viewCount} plays${byNames}`,
      };
    }

    return { type: 'none', detail: '' };
  }

  private detectEpisodeDiscrepancy(
    ep: Episode,
    plexState: PlexWatchState
  ): WatchDiscrepancy {
    const tautulliWatched = ep.play_count > 0;
    const plexWatched = plexState.watched;
    const byNames = this.formatWatchedByNames(plexState);

    if (plexWatched && !tautulliWatched) {
      return {
        type: 'plex_only',
        detail: `Plex: watched${byNames} · Tautulli: no record`,
      };
    }

    if (tautulliWatched && !plexWatched) {
      return {
        type: 'tautulli_only',
        detail: `Tautulli: ${ep.play_count} plays · Plex: unwatched (all users)`,
      };
    }

    return { type: 'none', detail: '' };
  }
}
