import { Router, Request, Response } from 'express';
import { loadConfig } from '../config/store.js';
import { httpRequest } from '../util/http.js';
import { logger } from '../util/logger.js';

export const tautulliRouter: Router = Router();

/**
 * Frontend calls /api/tautulli?cmd=...&...; we forward to <tautulli.url>/api/v2
 * with the apikey stamped in.
 */
tautulliRouter.get('/', async (req: Request, res: Response) => {
  const cfg = await loadConfig();
  if (!cfg.tautulli) {
    return res.status(412).json({ ok: false, error: 'Tautulli is not configured' });
  }

  const params = new URLSearchParams(req.query as Record<string, string>);
  params.set('apikey', cfg.tautulli.apiKey);
  const url = `${cfg.tautulli.url}/api/v2?${params}`;

  try {
    const data = await httpRequest<any>(url);
    res.json(data);
  } catch (err: any) {
    logger.warn(`Tautulli proxy ${url.replace(cfg.tautulli.apiKey, '***')} → ${err.message}`);
    res.status(502).json({ ok: false, error: err.message });
  }
});
