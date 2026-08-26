/**
 * Tiny console-based logger. Stays dependency-free on purpose; if we ever need
 * structured logging or rotation, swap in pino without touching call sites.
 */
function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string, ...rest: unknown[]) =>
    console.log(`[${ts()}] [INFO] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) =>
    console.warn(`[${ts()}] [WARN] ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) =>
    console.error(`[${ts()}] [ERR ] ${msg}`, ...rest),
  debug: (msg: string, ...rest: unknown[]) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${ts()}] [DBG ] ${msg}`, ...rest);
    }
  },
};
