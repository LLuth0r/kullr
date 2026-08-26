import { Router, Request, Response } from 'express';
import { loadConfig } from '../config/store.js';

export const arrRouter: Router = Router();

/**
 * Returns configured Sonarr+Radarr instances (no API keys).
 * Used by the dashboard to show which instance owns each item.
 */
arrRouter.get('/instances', async (_req: Request, res: Response) => {
  const cfg = await loadConfig();
  const data = {
    sonarr: cfg.sonarr.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      rootFolders: s.rootFolders,
      enabled: s.enabled,
    })),
    radarr: cfg.radarr.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      rootFolders: r.rootFolders,
      enabled: r.enabled,
    })),
  };
  res.json({ ok: true, data });
});
