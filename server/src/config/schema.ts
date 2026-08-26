import { z } from 'zod';

/**
 * Source of truth for the persisted config schema.
 * Both server and frontend types derive from these.
 */

const urlString = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .transform((v) => v.replace(/\/+$/, ''));

export const PlexConfigSchema = z.object({
  url: urlString,
  token: z.string().trim().min(1, 'Plex token is required'),
});

export const TautulliConfigSchema = z.object({
  url: urlString,
  apiKey: z.string().trim().min(1, 'Tautulli API key is required'),
});

export const ArrInstanceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Instance name is required'),
  url: urlString,
  apiKey: z.string().trim().min(1, 'API key is required'),
  /** Cached on save by hitting /api/v3/rootFolder */
  rootFolders: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  /**
   * Optional path translation applied to a Plex-reported file path before
   * matching it against this instance's root folders — for setups where
   * Plex and this *arr instance see the same share mounted at different
   * container paths (e.g. Plex at /mnt/user/data, Sonarr/Radarr at /data).
   * Both empty/omitted means "paths already match, no translation."
   */
  pathMapFrom: z.string().trim().optional(),
  pathMapTo: z.string().trim().optional(),
});

export const AppConfigSchema = z.object({
  plex: PlexConfigSchema.optional(),
  tautulli: TautulliConfigSchema.optional(),
  sonarr: z.array(ArrInstanceSchema).default([]),
  radarr: z.array(ArrInstanceSchema).default([]),
});

export type PlexConfig = z.infer<typeof PlexConfigSchema>;
export type TautulliConfig = z.infer<typeof TautulliConfigSchema>;
export type ArrInstance = z.infer<typeof ArrInstanceSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

/** Returned to the frontend — secrets masked. */
export interface MaskedAppConfig {
  plex?: { url: string; token: string };       // token masked
  tautulli?: { url: string; apiKey: string };  // apiKey masked
  sonarr: Array<Omit<ArrInstance, 'apiKey'> & { apiKey: string }>;
  radarr: Array<Omit<ArrInstance, 'apiKey'> & { apiKey: string }>;
  configured: boolean;
}

export const MASKED_PLACEHOLDER = '__masked__';

export function maskSecret(secret: string | undefined): string {
  if (!secret) return '';
  if (secret.length <= 4) return '••••';
  return `••••••••${secret.slice(-4)}`;
}

export function maskConfig(cfg: AppConfig): MaskedAppConfig {
  return {
    plex: cfg.plex
      ? { url: cfg.plex.url, token: maskSecret(cfg.plex.token) }
      : undefined,
    tautulli: cfg.tautulli
      ? { url: cfg.tautulli.url, apiKey: maskSecret(cfg.tautulli.apiKey) }
      : undefined,
    sonarr: cfg.sonarr.map((s) => ({ ...s, apiKey: maskSecret(s.apiKey) })),
    radarr: cfg.radarr.map((r) => ({ ...r, apiKey: maskSecret(r.apiKey) })),
    configured: !!(cfg.plex && cfg.tautulli),
  };
}

/**
 * If `newVal` is empty or still the masked placeholder (i.e. the user didn't
 * touch the field), fall back to the real stored secret.
 */
export function restoreSecret(newVal: string, oldVal: string | undefined): string {
  return newVal && newVal !== '' && !newVal.startsWith('••••')
    ? newVal
    : (oldVal ?? newVal);
}

/**
 * Merge an incoming (possibly masked) config from the frontend with the existing
 * stored config, preserving secrets that were sent back as the masked placeholder.
 */
export function mergeWithStored(incoming: AppConfig, stored: AppConfig): AppConfig {
  return {
    plex: incoming.plex
      ? {
          url: incoming.plex.url,
          token: restoreSecret(incoming.plex.token, stored.plex?.token),
        }
      : undefined,
    tautulli: incoming.tautulli
      ? {
          url: incoming.tautulli.url,
          apiKey: restoreSecret(incoming.tautulli.apiKey, stored.tautulli?.apiKey),
        }
      : undefined,
    sonarr: incoming.sonarr.map((s) => {
      const prev = stored.sonarr.find((p) => p.id === s.id);
      return { ...s, apiKey: restoreSecret(s.apiKey, prev?.apiKey) };
    }),
    radarr: incoming.radarr.map((r) => {
      const prev = stored.radarr.find((p) => p.id === r.id);
      return { ...r, apiKey: restoreSecret(r.apiKey, prev?.apiKey) };
    }),
  };
}
