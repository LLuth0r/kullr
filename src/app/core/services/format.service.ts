import { Injectable } from '@angular/core';
import { StalenessInfo, PlexWatchState } from '../models';

@Injectable({ providedIn: 'root' })
export class FormatService {
  fileSize(bytes: number): string {
    if (!bytes) return '—';
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  }

  daysSince(timestamp: number | null): number {
    if (!timestamp) return Infinity;
    const t = timestamp * 1000;
    return Math.floor((Date.now() - t) / 86_400_000);
  }

  /**
   * Get the most recent "days since watched" across both Tautulli and Plex.
   * Returns the SMALLER value (more recent watch = fewer days).
   */
  bestDaysSince(tautulliLastPlayed: number | null, plex?: PlexWatchState | null): number {
    const tDays = this.daysSince(tautulliLastPlayed);
    const pDays = this.daysSince(plex?.lastViewedAt ?? null);
    return Math.min(tDays, pDays);
  }

  /**
   * Determine if an item has been watched by ANY source.
   * Used to override "NEVER WATCHED" when Plex has data.
   */
  isWatchedAnywhere(
    tautulliPlayCount: number,
    plex?: PlexWatchState | null
  ): boolean {
    if (tautulliPlayCount > 0) return true;
    if (!plex) return false;
    return plex.watched || plex.viewCount > 0 ||
      (plex.watchedBy?.length ?? 0) > 0 ||
      (plex.watchedEpisodes ?? 0) > 0;
  }

  formatDate(timestamp: number | null): string {
    if (!timestamp) return 'Never';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  /**
   * Best-available date from either source.
   */
  bestDate(tautulliLastPlayed: number | null, plex?: PlexWatchState | null): string {
    const tTs = tautulliLastPlayed || 0;
    const pTs = plex?.lastViewedAt || 0;
    const best = Math.max(tTs, pTs);
    return best ? this.formatDate(best) : 'Never';
  }

  staleness(days: number): StalenessInfo {
    if (days === Infinity)
      return { label: 'NEVER WATCHED', color: '#e54545', bg: 'rgba(229,69,69,0.1)', priority: 0 };
    if (days > 365)
      return { label: `${Math.floor(days / 365)}y+ ago`, color: '#e87070', bg: 'rgba(232,112,112,0.08)', priority: 1 };
    if (days > 180)
      return { label: `${Math.floor(days / 30)}mo ago`, color: '#e8943a', bg: 'rgba(232,148,58,0.08)', priority: 2 };
    if (days > 90)
      return { label: `${Math.floor(days / 30)}mo ago`, color: '#d4b844', bg: 'rgba(212,184,68,0.08)', priority: 3 };
    if (days > 30)
      return { label: `${days}d ago`, color: '#6cc98a', bg: 'rgba(108,201,138,0.07)', priority: 4 };
    return { label: `${days}d ago`, color: '#34c76a', bg: 'rgba(52,199,106,0.07)', priority: 5 };
  }

  /**
   * Combined staleness that considers both sources.
   * If Plex says watched but no timestamp is available, returns "WATCHED (Plex)" instead of "NEVER WATCHED".
   */
  combinedStaleness(
    tautulliLastPlayed: number | null,
    tautulliPlayCount: number,
    plex?: PlexWatchState | null
  ): StalenessInfo {
    const bestDays = this.bestDaysSince(tautulliLastPlayed, plex);

    // If neither source has a timestamp but Plex confirms watched
    if (bestDays === Infinity && this.isWatchedAnywhere(tautulliPlayCount, plex)) {
      return { label: 'WATCHED (Plex)', color: '#6cc98a', bg: 'rgba(108,201,138,0.07)', priority: 4 };
    }

    return this.staleness(bestDays);
  }
}
