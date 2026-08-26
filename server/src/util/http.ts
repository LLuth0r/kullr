/**
 * Wrapper around fetch() that:
 *  - normalises errors so callers get a useful message
 *  - applies a 15s default timeout (configurable per call)
 *  - returns parsed JSON OR raw text depending on content-type
 */
export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Stringified body (we only ever send JSON or nothing). */
  body?: string | null;
  timeoutMs?: number;
  /** If true, skip JSON parse and return raw text. */
  raw?: boolean;
}

export async function httpRequest<T = unknown>(
  url: string,
  opts: HttpOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body ?? undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      const snippet = detail ? ' - ' + detail.slice(0, 300) : '';
      throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' from ' + url + snippet);
    }

    if (opts.raw) {
      return (await res.text()) as unknown as T;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      throw new Error('Request to ' + url + ' timed out after ' + timeoutMs + 'ms');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
