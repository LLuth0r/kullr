import { Router, Request, Response } from 'express';
import { loadConfig } from '../config/store.js';
import {
  resolveItems,
  ResolveRequestItem,
} from '../services/arr-resolver.js';
import {
  deleteSonarrSeries,
  deleteRadarrMovie,
  unmonitorSonarrSeries,
  unmonitorRadarrMovie,
} from '../services/arr-client.js';
import { logger } from '../util/logger.js';

export const mediaRouter: Router = Router();

// ── POST /api/media/resolve ─────────────────────────
// Body: { items: [{ratingKey, filePath, mediaType}] }
mediaRouter.post('/resolve', async (req: Request, res: Response) => {
  try {
    const items: ResolveRequestItem[] = Array.isArray(req.body?.items)
      ? req.body.items
      : [];
    const cfg = await loadConfig();
    const results = await resolveItems(cfg, items);
    res.json({ ok: true, data: results });
  } catch (err: any) {
    logger.warn(`/media/resolve failed: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/media/delete ──────────────────────────
// Body: {
//   items: [{ratingKey, filePath, mediaType, title}],
//   deleteFiles: boolean,
//   unmonitor: boolean,
//   addImportListExclusion: boolean
// }
//
// If `deleteFiles` is true we DELETE through *arr (which removes the file AND
// the entry). If `unmonitor` is true and `deleteFiles` is false, we just flip
// monitored=false. If both are false the request is rejected (no-op).
mediaRouter.post('/delete', async (req: Request, res: Response) => {
  try {
    const {
      items = [],
      deleteFiles = false,
      unmonitor = false,
      addImportListExclusion = false,
    } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'items[] is required' });
    }
    if (!deleteFiles && !unmonitor) {
      return res
        .status(400)
        .json({ ok: false, error: 'Either deleteFiles or unmonitor must be true' });
    }

    const cfg = await loadConfig();
    const resolved = await resolveItems(cfg, items);
    const results: Array<{
      ratingKey: string;
      title?: string;
      ok: boolean;
      action?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const r = resolved[i];
      if (!r.matched || !r.arrItemId || !r.arrType) {
        results.push({
          ratingKey: item.ratingKey,
          title: item.title,
          ok: false,
          error: r.reason ?? 'No matching *arr instance',
        });
        continue;
      }

      const instance =
        r.arrType === 'sonarr'
          ? cfg.sonarr.find((s) => s.id === r.instanceId)!
          : cfg.radarr.find((s) => s.id === r.instanceId)!;

      try {
        if (deleteFiles) {
          if (r.arrType === 'sonarr') {
            await deleteSonarrSeries(instance, r.arrItemId, {
              deleteFiles: true,
              addImportListExclusion,
            });
          } else {
            await deleteRadarrMovie(instance, r.arrItemId, {
              deleteFiles: true,
              addImportListExclusion,
            });
          }
          results.push({
            ratingKey: item.ratingKey,
            title: item.title,
            ok: true,
            action: `Deleted from ${instance.name} (files removed)`,
          });
        } else if (unmonitor) {
          if (r.arrType === 'sonarr') {
            await unmonitorSonarrSeries(instance, r.arrItemId);
          } else {
            await unmonitorRadarrMovie(instance, r.arrItemId);
          }
          results.push({
            ratingKey: item.ratingKey,
            title: item.title,
            ok: true,
            action: `Unmonitored in ${instance.name}`,
          });
        }
      } catch (err: any) {
        logger.warn(
          `Delete ${item.ratingKey} via ${instance.name} failed: ${err.message}`
        );
        results.push({
          ratingKey: item.ratingKey,
          title: item.title,
          ok: false,
          error: err.message,
        });
      }
    }

    res.json({ ok: true, data: results });
  } catch (err: any) {
    logger.error(`/media/delete failed: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});
