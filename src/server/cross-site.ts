// The cross-site write check (D91, CSRF). Session cookies are SameSite=Lax already; on top of
// that `handleRoute` refuses a write (any method but GET, HEAD and OPTIONS) that the browser
// says came from another site: `Sec-Fetch-Site` other than same-origin or none, or an `Origin`
// whose host is not this one. A request with neither header (curl, a test) is not a browser
// form post from another site, so it is let through to the route's own checks.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when `request` is a write that another site made the browser send. */
export function isCrossSiteWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true; // `null` (an opaque origin) and anything unreadable
  }
  const host = request.headers.get('host') ?? new URL(request.url).host;
  return originHost !== host;
}
