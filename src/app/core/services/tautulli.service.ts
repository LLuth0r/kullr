import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  TautulliLibrary,
  MediaItem,
  Season,
  Episode,
} from '../models';

interface TautulliResponse<T = any> {
  response: {
    result: 'success' | 'error';
    message?: string;
    data: T;
  };
}

/**
 * Calls the backend proxy at /api/tautulli, which stamps in the API key
 * stored server-side. The frontend never holds Tautulli credentials.
 */
@Injectable({ providedIn: 'root' })
export class TautulliService {
  private http = inject(HttpClient);

  async getLibraries(): Promise<TautulliLibrary[]> {
    const data = await this.call<TautulliLibrary[]>('get_libraries');
    return data.filter((l) => ['movie', 'show'].includes(l.section_type));
  }

  async getLibraryMediaInfo(sectionId: string): Promise<MediaItem[]> {
    const data = await this.call<{ data: any[] }>('get_library_media_info', {
      section_id: sectionId,
      length: '2000',
      order_column: 'file_size',
      order_dir: 'desc',
    });

    return (data?.data || []).map((item: any) => ({
      ...item,
      file_size: parseInt(item.file_size) || 0,
      play_count: parseInt(item.play_count) || 0,
      last_played: item.last_played ? parseInt(item.last_played) : null,
      progress_pct: 0,
    }));
  }

  async getChildren(ratingKey: string): Promise<any[]> {
    const data = await this.call<{ children_list: any[] }>(
      'get_children_metadata',
      { rating_key: ratingKey }
    );
    return data?.children_list || [];
  }

  async getShowSeasons(ratingKey: string): Promise<Season[]> {
    const rawSeasons = await this.getChildren(ratingKey);
    const seasons: Season[] = [];

    for (const season of rawSeasons) {
      try {
        const rawEpisodes = await this.getChildren(season.rating_key);
        const episodes: Episode[] = rawEpisodes.map((ep: any) => ({
          rating_key: ep.rating_key,
          title: ep.title,
          media_index: parseInt(ep.media_index) || 0,
          play_count: parseInt(ep.play_count) || 0,
          last_played: ep.last_played ? parseInt(ep.last_played) : null,
          file_size: parseInt(ep.file_size) || 0,
        }));

        seasons.push({
          rating_key: season.rating_key,
          title: season.title || `Season ${season.media_index}`,
          media_index: parseInt(season.media_index) || 0,
          episodes,
          episodes_total: episodes.length,
          episodes_watched: episodes.filter((e) => e.play_count > 0).length,
        });
      } catch {
        seasons.push({
          rating_key: season.rating_key,
          title: season.title || `Season ${season.media_index}`,
          media_index: parseInt(season.media_index) || 0,
          episodes: [],
          episodes_total: 0,
          episodes_watched: 0,
        });
      }
    }

    return seasons;
  }

  // ── Private ──────────────────────────────────────

  private async call<T>(
    cmd: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    let httpParams = new HttpParams().set('cmd', cmd);
    for (const [key, val] of Object.entries(params)) {
      httpParams = httpParams.set(key, val);
    }
    const res = await firstValueFrom(
      this.http.get<TautulliResponse<T>>('/api/tautulli', { params: httpParams })
    );
    if (res?.response?.result !== 'success') {
      throw new Error(res?.response?.message || 'Tautulli API error');
    }
    return res.response.data;
  }
}
