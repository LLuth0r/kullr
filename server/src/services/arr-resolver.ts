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
  filePath?: string;
  mediaType: MediaKind;
  /** External IDs from Plex's Guid array — a more robust match than paths. */
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
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

interface ArrEntry {
  id: number;
  path: string;
}

interface InstanceIndex {
  instance: ArrInstance;
  arrType: ArrType;
  /** Map of normalised arr-item folder → arr item */
  byPath: Map<string, ArrEntry>;
  /** Map of "imdb:tt123" / "tmdb:456" / "tvdb:789" → arr item */
  byExternalId: Map<string, ArrEntry>;
}

function indexExternalIds(
  map: Map<string, ArrEntry>,
  entry: ArrEntry,
  imdbId: string | undefined,
  tmdbId: number | undefined,
  tvdbId: number | undefined
): void {
  if (imdbId) map.set(`imdb:${imdbId}`, entry);
  if (tmdbId != null) map.set(`tmdb:${tmdbId}`, entry);
  if (tvdbId != null) map.set(`tvdb:${tvdbId}`, entry);
}

/** External-ID lookup keys for a Plex-side item, in preference order. */
function externalIdKeys(item: ResolveRequestItem): string[] {
  const keys: string[] = [];
  if (item.imdbId) keys.push(`imdb:${item.imdbId}`);
  if (item.tmdbId) keys.push(`tmdb:${item.tmdbId}`);
  if (item.tvdbId) keys.push(`tvdb:${item.tvdbId}`);
  return keys;
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
      const byPath = new Map<string, ArrEntry>();
      const byExternalId = new Map<string, ArrEntry>();
      for (const s of series) {
        const entry: ArrEntry = { id: s.id, path: s.path };
        byPath.set(normalizePath(s.path), entry);
        indexExternalIds(byExternalId, entry, s.imdbId, undefined, s.tvdbId);
      }
      out.push({ instance, arrType: 'sonarr', byPath, byExternalId });
    } catch (err: any) {
      logger.warn(`Sonarr index ${instance.name} failed: ${err.message}`);
    }
  }

  for (const instance of cfg.radarr.filter((i) => i.enabled)) {
    try {
      const movies = await listRadarrMovies(instance);
      const byPath = new Map<string, ArrEntry>();
      const byExternalId = new Map<string, ArrEntry>();
      for (const m of movies) {
        const entry: ArrEntry = { id: m.id, path: m.path };
        byPath.set(normalizePath(m.path), entry);
        indexExternalIds(byExternalId, entry, m.imdbId, m.tmdbId, undefined);
      }
      out.push({ instance, arrType: 'radarr', byPath, byExternalId });
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
 * Strategy, in order:
 *  1. Filter instances by media type (Sonarr=show, Radarr=movie).
 *  2. Path-based instance selection: translate the Plex file path per-instance
 *     (pathMapFrom/pathMapTo) and find the instance whose root folder is a
 *     prefix of that path — this stays primary since it's what correctly
 *     disambiguates when the same title exists in more than one instance
 *     (e.g. a "Movies" and a separate "4K Movies" Radarr instance).
 *  3. Within that instance, prefer an exact external-ID match (IMDb/TMDb/
 *     TVDB, from Plex's Guid array vs. Sonarr/Radarr's own ID fields) over
 *     folder-prefix matching — more robust to folder-naming differences.
 *  4. If no instance was found by path at all, fall back to an ID match
 *     across *all* candidate instances. Matches to exactly one instance are
 *     used directly; matches to more than one are reported as ambiguous
 *     (never guessed) since only a path signal can disambiguate that case.
 *
 * Returns a result describing what we found (or why we couldn't match).
 */
export async function resolveItems(
  cfg: AppConfig,
  items: ResolveRequestItem[]
): Promise<ResolveResultItem[]> {
  const index = await getIndex(cfg);

  return items.map((item) => {
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

    const filePath = item.filePath ? normalizePath(item.filePath) : '';
    const idKeys = externalIdKeys(item);

    // Tier 1: pick the instance whose root folder is the longest prefix of
    // the (possibly path-mapped) file path.
    let bestInstance: InstanceIndex | null = null;
    let bestRootLen = -1;
    let bestEffectivePath = filePath;
    if (filePath) {
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
    }

    if (bestInstance) {
      // Prefer an exact ID match within the path-selected instance; fall
      // back to the longest series/movie folder that's a path prefix.
      let bestItem: ArrEntry | null = null;
      for (const key of idKeys) {
        const hit = bestInstance.byExternalId.get(key);
        if (hit) {
          bestItem = hit;
          break;
        }
      }
      if (!bestItem) {
        let bestItemLen = -1;
        for (const [arrPath, entry] of bestInstance.byPath) {
          if (bestEffectivePath.startsWith(arrPath) && arrPath.length > bestItemLen) {
            bestItemLen = arrPath.length;
            bestItem = entry;
          }
        }
      }
      if (bestItem) {
        return {
          ratingKey: item.ratingKey,
          matched: true,
          instanceId: bestInstance.instance.id,
          instanceName: bestInstance.instance.name,
          arrType: bestInstance.arrType,
          arrItemId: bestItem.id,
          arrItemPath: bestItem.path,
        };
      }
      // Path found an instance but no entry inside it matched by ID or by
      // path — fall through to a cross-instance ID search before giving up.
    }

    // Tier 2: no instance found by path (or the path-matched instance didn't
    // actually contain this item) — try an ID match across every candidate.
    if (idKeys.length > 0) {
      const hits = new Map<string, { idx: InstanceIndex; entry: ArrEntry }>();
      for (const idx of candidates) {
        for (const key of idKeys) {
          const hit = idx.byExternalId.get(key);
          if (hit) {
            hits.set(idx.instance.id, { idx, entry: hit });
            break;
          }
        }
      }
      if (hits.size === 1) {
        const { idx, entry } = [...hits.values()][0];
        return {
          ratingKey: item.ratingKey,
          matched: true,
          instanceId: idx.instance.id,
          instanceName: idx.instance.name,
          arrType: idx.arrType,
          arrItemId: entry.id,
          arrItemPath: entry.path,
        };
      }
      if (hits.size > 1) {
        const names = [...hits.values()].map((h) => h.idx.instance.name).join(', ');
        return {
          ratingKey: item.ratingKey,
          matched: false,
          reason:
            `Matched by ID to more than one ${wantedArrType} instance (${names}) — ` +
            `configure a path mapping on one of them to disambiguate which owns this file`,
        };
      }
    }

    if (bestInstance) {
      return {
        ratingKey: item.ratingKey,
        matched: false,
        instanceId: bestInstance.instance.id,
        instanceName: bestInstance.instance.name,
        arrType: bestInstance.arrType,
        reason: `${bestInstance.instance.name} has no entry covering "${bestEffectivePath}"`,
      };
    }

    if (!filePath) {
      return {
        ratingKey: item.ratingKey,
        matched: false,
        reason: 'No file path or external ID (IMDb/TMDb/TVDB) provided',
      };
    }

    return {
      ratingKey: item.ratingKey,
      matched: false,
      reason: `File path "${filePath}" doesn't sit under any configured ${wantedArrType} root folder`,
    };
  });
}
