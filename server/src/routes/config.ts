import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  AppConfigSchema,
  ArrInstance,
  PlexConfigSchema,
  TautulliConfigSchema,
  ArrInstanceSchema,
  maskConfig,
  mergeWithStored,
} from '../config/schema.js';
import { loadConfig, saveConfig } from '../config/store.js';
import { httpRequest } from '../util/http.js';
import { logger } from '../util/logger.js';
import { fetchArrRootFolders, testArrConnection } from '../services/arr-client.js';

export const configRouter: Router = Router();

// ── GET /api/config ─────────────────────────────────
configRouter.get('/', async (_req: Request, res: Response) => {
  const cfg = await loadConfig();
  res.json({ ok: true, data: maskConfig(cfg) });
});

// ── PUT /api/config ─────────────────────────────────
configRouter.put('/', async (req: Request, res: Response) => {
  try {
    // Ensure every Sonarr/Radarr instance has a stable id
    const body = req.body ?? {};
    const stamped = {
      ...body,
      sonarr: (body.sonarr ?? []).map((s: any) => ({
        ...s,
        id: s?.id || randomUUID(),
      })),
      radarr: (body.radarr ?? []).map((r: any) => ({
        ...r,
        id: r?.id || randomUUID(),
      })),
    };

    const incoming = AppConfigSchema.parse(stamped);
    const stored = await loadConfig();
    const merged = mergeWithStored(incoming, stored);

    // Refresh root folders for every enabled *arr instance
    for (const instance of [...merged.sonarr, ...merged.radarr]) {
      if (!instance.enabled) continue;
      try {
        instance.rootFolders = await fetchArrRootFolders(instance);
      } catch (err: any) {
        logger.warn(
          `Could not fetch root folders for ${instance.name}: ${err.message}`
        );
        // Keep whatever we had cached previously rather than wiping it
      }
    }

    await saveConfig(merged);
    res.json({ ok: true, data: maskConfig(merged) });
  } catch (err: any) {
    logger.warn(`Config save failed: ${err.message}`);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── POST /api/config/test ───────────────────────────
// Body: { type: 'plex' | 'tautulli' | 'sonarr' | 'radarr', config: {...} }
// Returns connectivity status for a single block without saving.
configRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { type, config } = req.body ?? {};
    if (!type || !config) {
      return res.status(400).json({ ok: false, error: 'type + config required' });
    }

    switch (type) {
      case 'plex': {
        const parsed = PlexConfigSchema.parse(config);
        const data = await httpRequest<any>(`${parsed.url}/`, {
          headers: {
            Accept: 'application/json',
            'X-Plex-Token': parsed.token,
            'X-Plex-Client-Identifier': 'kullr',
          },
        });
        const name =
          data?.MediaContainer?.friendlyName ||
          data?.MediaContainer?.machineIdentifier ||
          'Plex Server';
        return res.json({ ok: true, data: { serverName: name } });
      }
      case 'tautulli': {
        const parsed = TautulliConfigSchema.parse(config);
        const url = `${parsed.url}/api/v2?apikey=${encodeURIComponent(
          parsed.apiKey
        )}&cmd=arnold`;
        const data = await httpRequest<any>(url);
        if (data?.response?.result !== 'success') {
          throw new Error(data?.response?.message || 'Tautulli rejected the request');
        }
        return res.json({ ok: true, data: { ok: true } });
      }
      case 'sonarr':
      case 'radarr': {
        const parsed = ArrInstanceSchema.parse({
          ...config,
          id: config.id || 'test',
        });
        const info = await testArrConnection(parsed, type);
        return res.json({ ok: true, data: info });
      }
      default:
        return res.status(400).json({ ok: false, error: `Unknown type: ${type}` });
    }
  } catch (err: any) {
    return res.json({ ok: false, error: err.message });
  }
});
