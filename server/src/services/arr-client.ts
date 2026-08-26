import { ArrInstance } from '../config/schema.js';
import { httpRequest } from '../util/http.js';

export type ArrType = 'sonarr' | 'radarr';

interface ArrSystemStatus {
  appName?: string;
  version?: string;
  instanceName?: string;
}

interface ArrRootFolder {
  id: number;
  path: string;
  accessible?: boolean;
  freeSpace?: number;
}

interface ArrSeriesItem {
  id: number;
  title: string;
  path: string;
  monitored: boolean;
  tvdbId?: number;
  imdbId?: string;
  sizeOnDisk?: number;
}

interface ArrMovieItem {
  id: number;
  title: string;
  path: string;
  monitored: boolean;
  tmdbId?: number;
  imdbId?: string;
  sizeOnDisk?: number;
}

function authHeaders(instance: ArrInstance): Record<string, string> {
  return {
    'X-Api-Key': instance.apiKey,
    Accept: 'application/json',
  };
}

export async function testArrConnection(
  instance: ArrInstance,
  expectedType: ArrType
): Promise<ArrSystemStatus & { rootFolders: string[] }> {
  const status = await httpRequest<ArrSystemStatus>(
    `${instance.url}/api/v3/system/status`,
    { headers: authHeaders(instance) }
  );
  const expected = expectedType === 'sonarr' ? 'Sonarr' : 'Radarr';
  if (status?.appName && status.appName !== expected) {
    throw new Error(
      `Connected to ${status.appName} but expected ${expected}. Check the URL.`
    );
  }
  const rootFolders = await fetchArrRootFolders(instance);
  return { ...status, rootFolders };
}

export async function fetchArrRootFolders(instance: ArrInstance): Promise<string[]> {
  const folders = await httpRequest<ArrRootFolder[]>(
    `${instance.url}/api/v3/rootFolder`,
    { headers: authHeaders(instance) }
  );
  return folders.map((f) => normalizePath(f.path));
}

export async function listSonarrSeries(instance: ArrInstance): Promise<ArrSeriesItem[]> {
  return httpRequest<ArrSeriesItem[]>(`${instance.url}/api/v3/series`, {
    headers: authHeaders(instance),
  });
}

export async function listRadarrMovies(instance: ArrInstance): Promise<ArrMovieItem[]> {
  return httpRequest<ArrMovieItem[]>(`${instance.url}/api/v3/movie`, {
    headers: authHeaders(instance),
  });
}

export interface DeleteOptions {
  deleteFiles: boolean;
  addImportListExclusion: boolean;
}

export async function deleteSonarrSeries(
  instance: ArrInstance,
  seriesId: number,
  opts: DeleteOptions
): Promise<void> {
  const params = new URLSearchParams({
    deleteFiles: String(opts.deleteFiles),
    addImportListExclusion: String(opts.addImportListExclusion),
  });
  await httpRequest<void>(
    `${instance.url}/api/v3/series/${seriesId}?${params}`,
    { method: 'DELETE', headers: authHeaders(instance), raw: true }
  );
}

export async function deleteRadarrMovie(
  instance: ArrInstance,
  movieId: number,
  opts: DeleteOptions
): Promise<void> {
  const params = new URLSearchParams({
    deleteFiles: String(opts.deleteFiles),
    addImportListExclusion: String(opts.addImportListExclusion),
  });
  await httpRequest<void>(
    `${instance.url}/api/v3/movie/${movieId}?${params}`,
    { method: 'DELETE', headers: authHeaders(instance), raw: true }
  );
}

/**
 * Set monitored=false on a Sonarr series. Doesn't touch episode-level
 * monitoring; we leave that to the user/Sonarr defaults.
 */
export async function unmonitorSonarrSeries(
  instance: ArrInstance,
  seriesId: number
): Promise<void> {
  // Sonarr requires the full series object on PUT
  const series = await httpRequest<any>(
    `${instance.url}/api/v3/series/${seriesId}`,
    { headers: authHeaders(instance) }
  );
  series.monitored = false;
  await httpRequest<void>(`${instance.url}/api/v3/series/${seriesId}`, {
    method: 'PUT',
    headers: { ...authHeaders(instance), 'Content-Type': 'application/json' },
    body: JSON.stringify(series),
    raw: true,
  });
}

export async function unmonitorRadarrMovie(
  instance: ArrInstance,
  movieId: number
): Promise<void> {
  const movie = await httpRequest<any>(
    `${instance.url}/api/v3/movie/${movieId}`,
    { headers: authHeaders(instance) }
  );
  movie.monitored = false;
  await httpRequest<void>(`${instance.url}/api/v3/movie/${movieId}`, {
    method: 'PUT',
    headers: { ...authHeaders(instance), 'Content-Type': 'application/json' },
    body: JSON.stringify(movie),
    raw: true,
  });
}

/** Normalise to forward slashes + strip trailing slash so path comparisons are stable. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}
