import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PlexWatchState, PlexUser, UserWatchInfo } from '../models';

/**
 * Calls the backend proxy at /api/plex/* — the server stamps in the X-Plex-Token
 * from saved config. The path /api/plex/tv/api/v2/... routes to plex.tv.
 */
@Injectable({ providedIn: 'root' })
export class PlexService {
  private http = inject(HttpClient);

  private machineId = signal<string>('');

  readonly users = signal<PlexUser[]>([]);

  /**
   * Probe the configured Plex server. Returns the friendly name (or fallback).
   * Also records the machineIdentifier for friend-server matching.
   */
  async getServerInfo(): Promise<string> {
    const data = await this.plexGet<any>('/');
    const serverName =
      data?.MediaContainer?.friendlyName ||
      data?.MediaContainer?.machineIdentifier ||
      'Plex Server';
    this.machineId.set(data?.MediaContainer?.machineIdentifier || '');
    return serverName;
  }

  async discoverUsers(): Promise<PlexUser[]> {
    const allUsers: PlexUser[] = [];

    // 1. Admin/owner
    try {
      const accountData = await this.plexGet<any>('/tv/api/v2/user');
      allUsers.push({
        id: String(accountData.id),
        title: accountData.title || accountData.username || 'Admin',
        username: accountData.username || '',
        email: accountData.email,
        thumb: accountData.thumb,
        isHome: false,
        isAdmin: true,
      });
    } catch (e) {
      console.warn('Failed to get admin account info:', e);
      allUsers.push({
        id: '0',
        title: 'Server Owner',
        username: 'admin',
        isHome: false,
        isAdmin: true,
      });
    }

    // 2. Friends/shared
    // NOTE: plex.tv/api/v2/friends was deprecated (returns 410 Gone). The
    // legacy plex.tv/api/users/ endpoint is what current Plex clients use
    // instead — it's XML-native so the JSON shape is MediaContainer.User
    // rather than a bare array.
    try {
      const friendsData = await this.plexGet<any>('/api/users/');
      const friendsList: any[] = Array.isArray(friendsData)
        ? friendsData
        : Array.isArray(friendsData?.MediaContainer?.User)
          ? friendsData.MediaContainer.User
          : friendsData?.MediaContainer?.User
            ? [friendsData.MediaContainer.User]
            : [];

      for (const friend of friendsList) {
        const hasAccess =
          friend.Server?.some?.(
            (s: any) => s.machineIdentifier === this.machineId()
          ) ??
          friend.servers?.some?.(
            (s: any) => s.machineIdentifier === this.machineId()
          ) ??
          true;

        if (hasAccess || (!friend.Server && !friend.servers)) {
          allUsers.push({
            id: String(friend.id),
            title: friend.title || friend.username || friend.friendlyName || `User ${friend.id}`,
            username: friend.username || '',
            email: friend.email,
            thumb: friend.thumb,
            isHome: friend.home === '1' || friend.home === 1 || friend.home === true,
            isAdmin: false,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to get shared users:', e);
    }

    // 3. Plex Home managed users
    try {
      const homeData = await this.plexGet<any>('/tv/api/v2/home/users');
      const homeUsers = homeData?.users || homeData || [];
      if (Array.isArray(homeUsers)) {
        for (const hu of homeUsers) {
          if (allUsers.some((u) => u.id === String(hu.id))) continue;
          allUsers.push({
            id: String(hu.id),
            title: hu.title || hu.username || `Home User ${hu.id}`,
            username: hu.username || '',
            thumb: hu.thumb,
            isHome: true,
            isAdmin: hu.admin === true || hu.admin === 1,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to get home users:', e);
    }

    this.users.set(allUsers);
    return allUsers;
  }

  /**
   * Aggregate library watch state across all accessible users.
   *
   * NOTE: We can't easily switch identities from the browser anymore (the
   * backend doesn't currently expose a per-user-token endpoint), so this falls
   * back to a single admin-token query. Adding multi-user support is a
   * straightforward backend addition if needed — see README for the trade-off.
   */
  async getLibraryWatchState(
    sectionId: string
  ): Promise<Map<string, PlexWatchState>> {
    const aggregated = new Map<string, PlexWatchState>();
    // Explicit container params — some Plex Media Server versions cap /all at
    // a default page size (commonly 50) unless a size is requested, silently
    // dropping everything past that cutoff from the library-wide aggregation.
    const data = await this.plexGet<any>(
      `/library/sections/${sectionId}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=100000`
    );
    const items = data?.MediaContainer?.Metadata || [];
    const adminUser = this.users().find((u) => u.isAdmin) ?? {
      id: '0',
      title: 'Admin',
      username: 'admin',
      isHome: false,
      isAdmin: true,
    };

    for (const item of items) {
      const rk = String(item.ratingKey);
      const viewCount = parseInt(item.viewCount) || 0;
      const lastViewedAt = item.lastViewedAt ? parseInt(item.lastViewedAt) : null;
      const viewOffset = parseInt(item.viewOffset) || 0;

      const isShow = item.type === 'show';
      const totalEpisodes = isShow ? parseInt(item.leafCount) || 0 : undefined;
      const watchedEpisodes = isShow
        ? parseInt(item.viewedLeafCount) || 0
        : undefined;
      const userWatched = isShow
        ? watchedEpisodes! > 0
        : viewCount > 0;

      const userInfo: UserWatchInfo = {
        userId: adminUser.id,
        username: adminUser.title,
        watched: userWatched,
        viewCount: isShow ? watchedEpisodes || 0 : viewCount,
        lastViewedAt,
      };

      // Pull a filesystem path needed by the *arr resolver later. Movies carry
      // a file directly on Media/Part; shows don't (a show has many files, one
      // per episode) but carry their root folder in Location instead — that's
      // exactly what we need to prefix-match against a Sonarr series folder.
      const filePath = isShow
        ? (item?.Location?.[0]?.path as string | undefined)
        : (item?.Media?.[0]?.Part?.[0]?.file as string | undefined);

      aggregated.set(rk, {
        watched: userWatched,
        viewCount: isShow ? watchedEpisodes || 0 : viewCount,
        lastViewedAt,
        viewOffset,
        watchedEpisodes,
        totalEpisodes,
        watchedBy: userWatched ? [userInfo] : [],
        filePath,
      });
    }

    // The section-level listing doesn't reliably include Location for shows
    // (it's a per-item detail field). Backfill it with one fetch per show
    // that's missing it — in parallel, so this doesn't scale linearly with
    // library size on the common case where it's already present.
    const showsMissingPath = [...aggregated.entries()].filter(
      ([rk, state]) =>
        !state.filePath && items.find((i: any) => String(i.ratingKey) === rk)?.type === 'show'
    );
    if (showsMissingPath.length > 0) {
      await Promise.all(
        showsMissingPath.map(async ([rk, state]) => {
          try {
            state.filePath = await this.getShowLocation(rk);
          } catch (e) {
            console.warn(`Failed to backfill location for show ${rk}:`, e);
          }
        })
      );
    }

    return aggregated;
  }

  /** Root folder path for a single show, via its full metadata (reliably includes Location). */
  private async getShowLocation(ratingKey: string): Promise<string | undefined> {
    const data = await this.plexGet<any>(`/library/metadata/${ratingKey}`);
    return data?.MediaContainer?.Metadata?.[0]?.Location?.[0]?.path as string | undefined;
  }

  async getShowEpisodeWatchState(
    showRatingKey: string
  ): Promise<Map<string, PlexWatchState>> {
    const aggregated = new Map<string, PlexWatchState>();
    const data = await this.plexGet<any>(
      `/library/metadata/${showRatingKey}/allLeaves?X-Plex-Container-Start=0&X-Plex-Container-Size=100000`
    );
    const episodes = data?.MediaContainer?.Metadata || [];
    const adminUser = this.users().find((u) => u.isAdmin) ?? {
      id: '0',
      title: 'Admin',
      username: 'admin',
      isHome: false,
      isAdmin: true,
    };

    for (const ep of episodes) {
      const rk = String(ep.ratingKey);
      const viewCount = parseInt(ep.viewCount) || 0;
      const lastViewedAt = ep.lastViewedAt ? parseInt(ep.lastViewedAt) : null;
      const viewOffset = parseInt(ep.viewOffset) || 0;
      const userWatched = viewCount > 0;
      const filePath = ep?.Media?.[0]?.Part?.[0]?.file as string | undefined;

      const userInfo: UserWatchInfo = {
        userId: adminUser.id,
        username: adminUser.title,
        watched: userWatched,
        viewCount,
        lastViewedAt,
      };

      aggregated.set(rk, {
        watched: userWatched,
        viewCount,
        lastViewedAt,
        viewOffset,
        watchedBy: userWatched ? [userInfo] : [],
        filePath,
      });
    }

    return aggregated;
  }

  // ── Private ──────────────────────────────────────

  private async plexGet<T>(path: string): Promise<T> {
    // Backend expects /api/plex/<plex-path>
    const cleaned = path.replace(/^\/+/, '');
    return firstValueFrom(this.http.get<T>(`/api/plex/${cleaned}`));
  }
}
