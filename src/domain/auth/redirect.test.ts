// D91: after sign-in the browser goes back to the page it came from, but only to a page of this
// site in the visitor's language: never to another site (an open redirect a phishing link uses).
import { describe, expect, it } from 'vitest';
import { localeOfPath, safeNextPath, withQueryParam } from './redirect';

describe('safeNextPath', () => {
  it('keeps a page of this site under the locale, with its query and hash', () => {
    expect(safeNextPath('/en/leases', 'en')).toBe('/en/leases');
    expect(safeNextPath('/fi/apply/q-1?step=2#top', 'fi')).toBe('/fi/apply/q-1?step=2#top');
    expect(safeNextPath('/en', 'en')).toBe('/en');
  });

  it('falls back to the catalogue for nothing, another site or a trick', () => {
    for (const next of [
      undefined,
      '',
      'https://evil.example/en',
      '//evil.example/en',
      '/\\evil.example',
      '/en\\@evil.example',
      'javascript:alert(1)',
      '/en/../../evil',
      '/enx/leases',
      '/sv/leases',
      '/en/login',
      ' /en/leases',
      '/en/%2F%2Fevil.example',
    ]) {
      expect(safeNextPath(next, 'en'), String(next)).toBe('/en/catalogue');
    }
  });
});

describe('withQueryParam', () => {
  it('adds a parameter to a path with or without a query, keeping the hash last', () => {
    expect(withQueryParam('/en/applications/a-1', 'identification', 'idn-1')).toBe(
      '/en/applications/a-1?identification=idn-1'
    );
    expect(withQueryParam('/en/x?y=1#sign', 'k', 'a b')).toBe('/en/x?y=1&k=a%20b#sign');
  });
});

describe('localeOfPath', () => {
  it('reads the first segment when it is a locale, else the fallback', () => {
    expect(localeOfPath('/fi/leases', ['en', 'fi'], 'en')).toBe('fi');
    expect(localeOfPath('/fi?x=1', ['en', 'fi'], 'en')).toBe('fi');
    expect(localeOfPath('/xx/leases', ['en', 'fi'], 'en')).toBe('en');
  });
});
