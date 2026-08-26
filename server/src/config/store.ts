import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppConfig, AppConfigSchema } from './schema.js';
import { logger } from '../util/logger.js';

const CONFIG_DIR = process.env.CONFIG_DIR ?? '/config';
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const EMPTY: AppConfig = { sonarr: [], radarr: [] };

let cached: AppConfig | null = null;

export function configPath(): string {
  return CONFIG_FILE;
}

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = AppConfigSchema.parse(parsed);
    cached = validated;
    return validated;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      logger.info(`No config file at ${CONFIG_FILE}, starting fresh`);
      cached = { ...EMPTY };
      return cached;
    }
    logger.warn(`Failed to load config (${err.message}), starting fresh`);
    cached = { ...EMPTY };
    return cached;
  }
}

/**
 * Atomic write: write to temp file, fsync, rename over the real file.
 * Avoids torn writes if the process dies mid-save.
 */
export async function saveConfig(cfg: AppConfig): Promise<void> {
  await ensureConfigDir();
  const validated = AppConfigSchema.parse(cfg);
  const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
  const data = JSON.stringify(validated, null, 2);
  const fh = await fs.open(tmp, 'w', 0o600);
  try {
    await fh.writeFile(data, 'utf-8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, CONFIG_FILE);
  // Best-effort permissions tighten (no-op on Windows)
  try {
    await fs.chmod(CONFIG_FILE, 0o600);
  } catch {
    /* ignore */
  }
  cached = validated;
}

export function invalidateCache(): void {
  cached = null;
}
