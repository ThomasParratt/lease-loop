// GET /api/identifications/callback?state=…&code=…
// Where the broker sends the browser back (D95, D96). It completes the request only for the
// browser that holds its state cookie, before it expires, once, and only when the broker's code
// redeems to the nonce we gave. Then:
// - sign-in: the person's account (found by the HMAC of the identity code) gets a new session;
// - signing: the browser goes back to the application with `?identification=<id>`.
// Every outcome is a 303 redirect to a page of this site, never to an address from the request;
// a failure adds `identificationError=<code>`. The state cookie is cleared in every case.
import { cookies } from 'next/headers';
import { localeOfPath, withQueryParam } from '@/domain/auth/redirect';
import { signsInWithBank } from '@/domain/identity/identification';
import { locales, defaultLocale } from '@/i18n/locales';
import { accountActor, findAccountByIdentity } from '@/server/accounts';
import { readSessionToken } from '@/server/actor';
import { handleRoute } from '@/server/api-response';
import { db } from '@/server/db';
import { identificationCallbackQuerySchema } from '@/server/identification-schemas';
import {
  completeIdentification,
  IDENTIFICATION_COOKIE,
  identificationCookieHeader,
} from '@/server/identifications';
import { openSession } from '@/server/login';
import { sessionCookieHeader } from '@/server/sessions';
import { redeemAtTestBank } from '@/server/test-bank';

function redirect(location: string, setCookies: string[]): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

const loginPage = (next: string | null) =>
  `/${localeOfPath(next ?? '', locales, defaultLocale)}/login`;

export const GET = handleRoute(async (request) => {
  const clear = identificationCookieHeader(null);
  const query = identificationCallbackQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!query.success) {
    return redirect(
      withQueryParam(loginPage(null), 'identificationError', 'identification_failed'),
      [clear]
    );
  }
  const now = new Date().toISOString();
  const result = await completeIdentification(db, {
    state: query.data.state,
    cookieState: (await cookies()).get(IDENTIFICATION_COOKIE)?.value,
    code: query.data.code ?? null,
    now,
    redeem: (code) => redeemAtTestBank(code, Date.parse(now)),
  });
  if (!result.ok) {
    // A failed signing goes back to the application; a failed sign-in to the sign-in page.
    const back =
      result.purpose === 'sign_contract' && result.next ? result.next : loginPage(result.next);
    return redirect(withQueryParam(back, 'identificationError', result.code), [clear]);
  }

  const { identification } = result;
  if (identification.purpose === 'sign_contract') {
    return redirect(withQueryParam(identification.next, 'identification', identification.id), [
      clear,
    ]);
  }
  const account = await findAccountByIdentity(db, identification.identityHash!);
  const actor = account ? accountActor(account) : null;
  const person = account?.customer ? signsInWithBank(account.customer.type) : false;
  if (!account || actor === null || !person) {
    return redirect(
      withQueryParam(loginPage(identification.next), 'identificationError', 'no_account'),
      [clear]
    );
  }
  const session = await openSession(
    db,
    account,
    actor,
    { previousToken: await readSessionToken(), method: identification.method ?? 'bank' },
    now
  );
  const maxAge = (Date.parse(session.expiresAt) - Date.parse(now)) / 1000;
  return redirect(identification.next, [clear, sessionCookieHeader(session.token, maxAge)]);
});
