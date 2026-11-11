// D91: a write sent by another site is refused (CSRF), checked from the browser's own headers.
import { describe, expect, it } from 'vitest';
import { isCrossSiteWrite } from './cross-site';

const request = (method: string, headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/session', { method, headers });

describe('isCrossSiteWrite', () => {
  it('never refuses a read', () => {
    expect(isCrossSiteWrite(request('GET', { origin: 'https://evil.example' }))).toBe(false);
    expect(isCrossSiteWrite(request('HEAD', { 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  it('lets a same-origin write through', () => {
    const headers = { origin: 'http://localhost:3000', host: 'localhost:3000' };
    expect(isCrossSiteWrite(request('POST', headers))).toBe(false);
    expect(isCrossSiteWrite(request('DELETE', { 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });

  it('lets a write with no browser headers through (curl, the tests)', () => {
    expect(isCrossSiteWrite(request('POST', {}))).toBe(false);
  });

  it('refuses a write from another origin, a sibling site or an opaque origin', () => {
    const host = { host: 'localhost:3000' };
    expect(isCrossSiteWrite(request('POST', { ...host, origin: 'https://evil.example' }))).toBe(
      true
    );
    expect(isCrossSiteWrite(request('POST', { ...host, origin: 'http://localhost:4000' }))).toBe(
      true
    );
    expect(isCrossSiteWrite(request('POST', { ...host, origin: 'null' }))).toBe(true);
    expect(isCrossSiteWrite(request('POST', { ...host, origin: 'not a url' }))).toBe(true);
    expect(isCrossSiteWrite(request('PATCH', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(isCrossSiteWrite(request('PUT', { 'sec-fetch-site': 'same-site' }))).toBe(true);
  });

  it('compares with the request URL when there is no Host header', () => {
    expect(isCrossSiteWrite(request('POST', { origin: 'http://localhost:3000' }))).toBe(false);
  });
});
