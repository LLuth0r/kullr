import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AppConfig,
  ArrInstance,
  PlexConfig,
  TautulliConfig,
  DeleteOptions,
  DeleteRequestItem,
  DeleteResult,
  ResolveResult,
} from '../models';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const EMPTY: AppConfig = { sonarr: [], radarr: [], configured: false };

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);

  /** Current config as known by the server (with secrets masked). */
  readonly config = signal<AppConfig>({ ...EMPTY });
  readonly loaded = signal(false);

  readonly isConfigured = computed(() => !!this.config().configured);

  async load(): Promise<AppConfig> {
    const res = await firstValueFrom(
      this.http.get<ApiEnvelope<AppConfig>>('/api/config')
    );
    if (!res.ok || !res.data) {
      throw new Error(res.error ?? 'Failed to load config');
    }
    const cfg: AppConfig = {
      ...res.data,
      sonarr: res.data.sonarr ?? [],
      radarr: res.data.radarr ?? [],
    };
    this.config.set(cfg);
    this.loaded.set(true);
    return cfg;
  }

  async save(cfg: AppConfig): Promise<AppConfig> {
    const res = await firstValueFrom(
      this.http.put<ApiEnvelope<AppConfig>>('/api/config', cfg)
    );
    if (!res.ok || !res.data) {
      throw new Error(res.error ?? 'Failed to save config');
    }
    const updated: AppConfig = {
      ...res.data,
      sonarr: res.data.sonarr ?? [],
      radarr: res.data.radarr ?? [],
    };
    this.config.set(updated);
    this.loaded.set(true);
    return updated;
  }

  async testPlex(cfg: PlexConfig): Promise<{ serverName: string }> {
    const res = await firstValueFrom(
      this.http.post<ApiEnvelope<{ serverName: string }>>('/api/config/test', {
        type: 'plex',
        config: cfg,
      })
    );
    if (!res.ok) throw new Error(res.error ?? 'Plex test failed');
    return res.data!;
  }

  async testTautulli(cfg: TautulliConfig): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<ApiEnvelope<unknown>>('/api/config/test', {
        type: 'tautulli',
        config: cfg,
      })
    );
    if (!res.ok) throw new Error(res.error ?? 'Tautulli test failed');
  }

  async testArr(
    type: 'sonarr' | 'radarr',
    instance: ArrInstance
  ): Promise<{ instanceName?: string; version?: string; rootFolders: string[] }> {
    const res = await firstValueFrom(
      this.http.post<
        ApiEnvelope<{ instanceName?: string; version?: string; rootFolders: string[] }>
      >('/api/config/test', {
        type,
        config: instance,
      })
    );
    if (!res.ok) throw new Error(res.error ?? type + ' test failed');
    return res.data!;
  }

  async resolveItems(items: DeleteRequestItem[]): Promise<ResolveResult[]> {
    const res = await firstValueFrom(
      this.http.post<ApiEnvelope<ResolveResult[]>>('/api/media/resolve', { items })
    );
    if (!res.ok) throw new Error(res.error ?? 'Resolve failed');
    return res.data ?? [];
  }

  async deleteItems(
    items: DeleteRequestItem[],
    opts: DeleteOptions
  ): Promise<DeleteResult[]> {
    const res = await firstValueFrom(
      this.http.post<ApiEnvelope<DeleteResult[]>>('/api/media/delete', {
        items,
        ...opts,
      })
    );
    if (!res.ok) throw new Error(res.error ?? 'Delete failed');
    return res.data ?? [];
  }
}
