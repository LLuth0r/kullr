import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { configRouter } from './routes/config.js';
import { plexRouter } from './routes/plex.js';
import { tautulliRouter } from './routes/tautulli.js';
import { arrRouter } from './routes/arr.js';
import { mediaRouter } from './routes/media.js';
import { ensureConfigDir, loadConfig, configPath } from './config/store.js';
import { logger } from './util/logger.js';
import { invalidateResolverCache } from './services/arr-resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const STATIC_DIR =
  process.env.STATIC_DIR ?? path.resolve(__dirname, '../../public');

async function main(): Promise<void> {
  await ensureConfigDir();
  // Touch config so it's loaded into cache and we log the path
  await loadConfig();
  logger.info(`Config file: ${configPath()}`);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  // Liveness for Docker healthchecks
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, data: { status: 'alive' } });
  });

  // Invalidate the *arr resolver cache whenever config changes
  app.use('/api/config', (req, _res, next) => {
    if (req.method === 'PUT') invalidateResolverCache();
    next();
  });

  app.use('/api/config', configRouter);
  app.use('/api/plex', plexRouter);
  app.use('/api/tautulli', tautulliRouter);
  app.use('/api/arr', arrRouter);
  app.use('/api/media', mediaRouter);

  // Static frontend (only present in production builds)
  try {
    await fs.access(STATIC_DIR);
    app.use(express.static(STATIC_DIR, { index: 'index.html' }));
    // SPA fallback — anything that doesn't match /api goes to index.html
    app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
    logger.info(`Serving static frontend from ${STATIC_DIR}`);
  } catch {
    logger.info(
      `No static frontend at ${STATIC_DIR} — running API-only (use 'ng serve' for the frontend in dev)`
    );
  }

  // Error handler
  app.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
      logger.error(`Unhandled: ${err.message}`, err.stack);
      res.status(500).json({ ok: false, error: err.message });
    }
  );

  app.listen(PORT, () => {
    logger.info(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`, err.stack);
  process.exit(1);
});
