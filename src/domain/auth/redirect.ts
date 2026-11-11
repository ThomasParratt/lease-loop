// Where sign-in sends the browser (D91): back to the page it came from (`?next=`), but only a
// page of this site under the visitor's locale, never the sign-in page itself, and otherwise
// the catalogue. Anything that could leave the site (`//host`, a scheme, a backslash, a dot
// segment, an encoded slash) falls back: a phishing link must not use our sign-in to redirect.

/** The path to go to after signing in, for `locale`. */
export function safeNextPath(next: string | undefined, locale: string): string {
  const fallback = `/${locale}/catalogue`;
  if (!next) return fallback;
  if (!/^\/[A-Za-z0-9\-._~/?#=&%]*$/.test(next)) return fallback;
  if (next.startsWith('//') || /%2f|%5c/i.test(next)) return fallback;
  const path = next.split(/[?#]/)[0] ?? '';
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return fallback;
  if (path !== `/${locale}` && !path.startsWith(`/${locale}/`)) return fallback;
  if (path === `/${locale}/login` || path.startsWith(`/${locale}/login/`)) return fallback;
  return next;
}

/** `path` with `key=value` added to its query, before any `#hash`. */
export function withQueryParam(path: string, key: string, value: string): string {
  const [beforeHash, ...hash] = path.split('#');
  const separator = beforeHash!.includes('?') ? '&' : '?';
  const pair = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  return `${beforeHash}${separator}${pair}${hash.length > 0 ? `#${hash.join('#')}` : ''}`;
}

/** The locale a safe path starts with (`/fi/…` → `fi`), or `fallback`. */
export function localeOfPath(path: string, locales: readonly string[], fallback: string): string {
  const first = path.split(/[/?#]/)[1] ?? '';
  return locales.includes(first) ? first : fallback;
}
