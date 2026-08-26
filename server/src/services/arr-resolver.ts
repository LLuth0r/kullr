import {
  ArrInstance,
  AppConfig,
} from '../config/schema.js';
import {
  ArrType,
  listRadarrMovies,
  listSonarrSeries,
  normalizePath,
} from './arr-client.js';
import { logger } from '../util/logger.js';

export type MediaKind = 'movie' | 'show';

export interface ResolveRequestItem {
  /** Plex ratingKey (opaque, used by frontend to correlate) */
  ratingKey: string;
  /** Filesystem path of the file as Plex sees it */
  filePath: string;
  mediaType: MediaKind;
}

export interface ResolveResultItem {
  ratingKey: string;
  matched: boolean;
  instanceId?: string;
  instanceName?: string;
  arrType?: ArrType;
  arrItemId?: number;       // Sonarr series id / Radarr movie id
  arrItemPath?: string;
  reason?: string;          // Why we couldn't match
}

interface InstanceIndex {
  instance: ArrInstance;
  arrType: ArrType;
  /** Map of normalised arr-item folder → arr item id */
  byPath: Map<string, { id: number; path: string }>;
}

let cache: { config: AppConfig; index: InstanceIndex[] } | null = null;

export function invalidateResolverCache(): void {
  cache = null;
}

async function buildIndex(cfg: AppConfig): Promise<InstanceIndex[]> {
  const out: InstanceIndex[] = [];

  for (const instance of cfg.sonarr.filter((i) => i.enabled)) {
    try {
      const series = await listSonarrSeries(instance);
      const byPath = new Map<string, { id: number; path: string }>();
      for (const s of series) {
        byPath.set(normalizePath(s.path), { id: s.id, path: s.path });
      }
      out.push({ instance, arrType: 'sonarr', byPath });
    } catch (err: any) {
      logger.warn(`Sonarr index ${instance.name} failed: ${err.message}`);
    }
  }

  for (const instance of cfg.radarr.filter((i) => i.enabled)) {
    try {
      const movies = await listRadarrMovies(instance);
      const byPath = new Map<string, { id: number; path: string }>();
      for (const m of movies) {
        byPath.set(normalizePath(m.path), { id: m.id, path: m.path });
      }
      out.push({ instance, arrType: 'radarr', byPath });
    } catch (err: any) {
      logger.warn(`Radarr index ${instance.name} failed: ${err.message}`);
    }
  }

  return out;
}

async function getIndex(cfg: AppConfig): Promise<InstanceIndex[]> {
  if (cache && cache.config === cfg) return cache.index;
  const index = await buildIndex(cfg);
  cache = { config: cfg, index };
  return index;
}

/**
 * Translate a Plex-reported file path into what a given *arr instance would
 * see, using its optional pathMapFrom/pathMapTo override. A no-op unless
 * both are set and the path actually starts with pathMapFrom.
 */
function applyPathMapping(filePath: string, instance: ArrInstance): string {
  const from = instance.pathMapFrom ? normalizePath(instance.pathMapFrom) : '';
  const to = instance.pathMapTo ? normalizePath(instance.pathMapTo) : '';
  if (!from || !to || !filePath.startsWith(from)) return filePath;
  return to + filePath.slice(from.length);
}

/**
 * Resolve a Plex item to its owning *arr instance.
 *
 * Strategy:
 *  1. Filter instances by media type (Sonarr=show, Radarr=movie).
 *  2. Translate the Plex file path per-instance (pathMapFrom/pathMapTo).
 *  3. Find the instance whose root folder is a prefix of that path.
 *  4. Within that instance, find the series/movie whose path is a prefix.
 *
 * Returns a result describing what we found (or why we couldn't match).
 */
export async function resolveItems(
  cfg: AppConfig,
  items: ResolveRequestItem[]
): Promise<ResolveResultItem[]> {
  const index = await getIndex(cfg);

  return items.map((item) => {
    const filePath = normalizePath(item.filePath || '');
    if (!filePath) {
      return {
        ratingKey: item.ratingKey,
        matched: false,
        reason: 'No file path provided',
      };
    }

    const wantedArrType: ArrType =
      item.mediaType === 'show' ? 'sonarr' : 'radarr';

    const candidates = index.filter((idx) => idx.arrType === wantedArrType);
    if (candidates.length === 0) {
      return {
        ratingKey: item.ratingKey,
        matched: false,
        reason: `No ${wantedArrType} instance configured`,
      };
    }

    // Pick the instance whose root folder is the longest prefix of the
    // (possibly path-mapped) file path.
    let bestInstance: InstanceIndex | null = null;
    let bestRootLen = -1;
    let bestEffectivePath = filePath;
    for (const idx of candidates) {
      const effectivePath = applyPathMapping(filePath, idx.instance);
      for (const root of idx.instance.rootFolders) {
        const r = normalizePath(root);
        if (r && effectivePath.startsWith(r) && r.length > bestRootLen) {
          bestRootLen = r.length;
          bestInstance = idx;
          bestEffectivePath = effectivePath;
        }
      }
    }

    if (!bestInstance) {
      return {
        ratingKey: item.ratingKey,
        matched: false,
        reason: `File path "${filePath}" doesn't sit under any configured ${wantedArrType} root folder`,
      };
    }

    // Within that instance, find the longest series/movie folder that is a prefix.
    let bestItem: { id: number; path: string } | null = null;
    let bestItemLen = -1;
    for (const [arrPath, info] of bestInstance.byPath) {
      if (bestEffectivePath.startsWith(arrPath) && arrPath.length > bestItemLen) {
        bestItemLen = arrPath.length;
        bestItem = info;
      }
    }

    if (!bestItem) {
      return {
        ratingKey: item.ratingKey,
        matched: false,
        instanceId: bestInstance.instance.id,
        instanceName: bestInstance.instance.name,
        arrType: bestInstance.arrType,
        reason: `${bestInstance.instance.name} has no entry covering "${bestEffectivePath}"`,
      };
    }

    return {
      ratingKey: item.ratingKey,
      matched: true,
      instanceId: bestInstance.instance.id,
      instanceName: bestInstance.instance.name,
      arrType: bestInstance.arrType,
      arrItemId: bestItem.id,
      arrItemPath: bestItem.path,
    };
  });
}
