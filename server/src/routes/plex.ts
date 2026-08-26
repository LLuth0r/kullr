import { Router, Request, Response } from 'express';
import { loadConfig } from '../config/store.js';
import { httpRequest } from '../util/http.js';
import { logger } from '../util/logger.js';

export const plexRouter: Router = Router();

/**
 * Generic Plex proxy. Frontend calls /api/plex/<plex-path>?<query>.
 * The server stamps in the X-Plex-Token from saved config.
 *
 * Special-case `tv/...` paths to hit plex.tv (used for user discovery).
 */
plexRouter.all(/^\/.*/, async (req: Request, res: Response) => {
  const cfg = await loadConfig();
  if (!cfg.plex) {
    return res.status(412).json({ ok: false, error: 'Plex is not configured' });
  }

  // /api/plex/tv/api/v2/user → https://plex.tv/api/v2/user
  // /api/plex/<anything>     → <plex.url>/<anything>
  const stripped = req.path.replace(/^\//, '');
  let target: string;
  if (stripped.startsWith('tv/')) {
    target = `https://plex.tv/${stripped.slice(3)}`;
  } else {
    target = `${cfg.plex.url}/${stripped}`;
  }

  const qs = new URLSearchParams(req.query as Record<string, string>);
  const url = qs.toString() ? `${target}?${qs}` : target;

  try {
    const data = await httpRequest<any>(url, {
      method: req.method,
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': cfg.plex.token,
        'X-Plex-Client-Identifier': 'kullr',
        ...(req.method !== 'GET' && req.method !== 'HEAD'
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body:
        req.method !== 'GET' && req.method !== 'HEAD' && req.body
          ? JSON.stringify(req.body)
          : null,
    });
    res.json(data);
  } catch (err: any) {
    logger.warn(`Plex proxy ${req.method} ${url} → ${err.message}`);
    res.status(502).json({ ok: false, error: err.message });
  }
});
