/**
 * Web Cinema — TMDB API (v3) for the browser.
 * Prefer VITE_NEXORA_TMDB_API_KEY; VITE_TMDB_API_KEY is supported for compatibility.
 */
import axios from 'axios';

export const TMDB_API_KEY = (
  import.meta.env.VITE_NEXORA_TMDB_API_KEY?.trim()
  || import.meta.env.VITE_TMDB_API_KEY?.trim()
  || ''
);

export const TMDB_KEY_URL = 'https://www.themoviedb.org/settings/api';

/**
 * Browser-safe TMDB client — do not add custom headers here: extra headers trigger a CORS
 * preflight that TMDB does not reliably support, which surfaces as “failed / check API key”.
 */
export const tmdbHttp = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  timeout: 25_000,
  headers: { Accept: 'application/json' },
});

/** Maps axios/TMDB errors to a clear user-facing string. */
export function formatTmdbAxiosError(err) {
  const data = err.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.status_message === 'string' && data.status_message) return data.status_message;
    if (Array.isArray(data.errors)) {
      const parts = data.errors.map((x) => (typeof x === 'string' ? x : x?.message || '')).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
  }
  const st = err.response?.status;
  if (st === 401 || st === 403) {
    return 'TMDB rejected this API key. Confirm the key in .env (VITE_NEXORA_TMDB_API_KEY), save, then fully restart npm run dev.';
  }
  if (!err.response) {
    return 'Network error — check your connection, VPN, or try again shortly.';
  }
  return err.message || 'Could not load data from TMDB.';
}
