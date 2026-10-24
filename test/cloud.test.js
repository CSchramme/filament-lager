import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BambuCloud, CloudError, accountFromToken } from '../src/bambu/cloud.js';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method, headers: init.headers, body });
    const key = `${init.method} ${url.replace(/\?.*/, '')}`;
    const handler = routes[key];
    if (!handler) return new Response('nicht gefunden', { status: 404 });
    const r = handler({ url, body, headers: init.headers });
    const text = r.status === 204 ? null : typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {});
    return new Response(text, { status: r.status || 200, headers: r.headers });
  };
  fn.calls = calls;
  return fn;
}

const API = 'https://api.bambulab.com';

test('Anmeldung mit E-Mail-Code', async () => {
  const fetch = fakeFetch({
    [`POST ${API}/v1/user-service/user/login`]: ({ body }) => (body.code
      ? (body.code === '123456' ? { body: { accessToken: 'TOKEN' } } : { status: 400, body: { code: 2 } })
      : { body: { loginType: 'verifyCode' } }),
    [`POST ${API}/v1/user-service/user/sendemail/code`]: () => ({ body: {} }),
  });
  const cloud = new BambuCloud({ fetchImpl: fetch });
  assert.deepEqual(await cloud.login('ich@example.org', 'geheim'), { status: 'code' });
  assert.deepEqual(fetch.calls[1].body, { email: 'ich@example.org', type: 'codeLogin' });
  await assert.rejects(cloud.loginWithCode('ich@example.org', '000000'), /falsch/);
  const ok = await cloud.loginWithCode('ich@example.org', ' 123456 ');
  assert.equal(ok.token, 'TOKEN');
  assert.equal(cloud.token, 'TOKEN');
});

test('Direkte Anmeldung und falsches Passwort', async () => {
  const fetch = fakeFetch({
    [`POST ${API}/v1/user-service/user/login`]: ({ body }) => (body.password === 'richtig'
      ? { body: { accessToken: 'T2', expiresIn: 7776000 } }
      : { status: 400, body: { message: 'Incorrect password' } }),
  });
  const cloud = new BambuCloud({ fetchImpl: fetch });
  await assert.rejects(cloud.login('a@b.de', 'falsch'), (err) => err instanceof CloudError && err.code === 'credentials');
  assert.equal((await cloud.login('a@b.de', 'richtig')).token, 'T2');
});

test('Spulenliste wird seitenweise geladen und mit Token abgefragt', async () => {
  const all = Array.from({ length: 130 }, (_, i) => ({ id: i + 1 }));
  const fetch = fakeFetch({
    [`GET ${API}/v1/design-user-service/my/filament/v2`]: ({ url, headers }) => {
      assert.equal(headers.Authorization, 'Bearer TOK');
      const q = new URL(url).searchParams;
      const offset = Number(q.get('offset'));
      return { body: { hits: all.slice(offset, offset + Number(q.get('limit'))), total: all.length } };
    },
  });
  const spools = await new BambuCloud({ token: 'TOK', fetchImpl: fetch }).listSpools();
  assert.equal(spools.length, 130);
  assert.equal(fetch.calls.length, 2);
});

test('Fehler werden verständlich gemeldet', async () => {
  const cf = fakeFetch({ [`GET ${API}/v1/design-user-service/my/filament/v2`]: () => ({ status: 403, body: '<html>cloudflare</html>' }) });
  await assert.rejects(new BambuCloud({ token: 'x', fetchImpl: cf }).listSpools(), (e) => e.code === 'cloudflare');
  const expired = fakeFetch({ [`GET ${API}/v1/design-user-service/my/filament/v2`]: () => ({ status: 401, body: {} }) });
  await assert.rejects(new BambuCloud({ token: 'x', fetchImpl: expired }).listSpools(), (e) => e.code === 'auth');
  const offline = async () => {
    throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.bambulab.com') });
  };
  await assert.rejects(new BambuCloud({ token: 'x', fetchImpl: offline }).listSpools(), /nicht erreichbar.*ENOTFOUND/);
  await assert.rejects(new BambuCloud({ fetchImpl: offline }).listSpools(), (e) => e.code === 'auth');
});

test('Zwei-Faktor-Anmeldung über bambulab.com', async () => {
  const fetch = fakeFetch({
    'GET https://bambulab.com/api/csrf': () => ({ status: 204, body: '', headers: { 'set-cookie': 'bbl_csrf_token=CSRF1; Path=/' } }),
    'POST https://bambulab.com/api/sign-in/tfa': ({ headers, body }) => {
      assert.equal(headers['x-bbl-csrf-token'], 'CSRF1');
      assert.deepEqual(body, { tfaKey: 'KEY', tfaCode: '654321' });
      return { body: {}, headers: { 'set-cookie': 'token=TFATOKEN; Path=/; HttpOnly' } };
    },
  });
  const res = await new BambuCloud({ fetchImpl: fetch }).loginWithTfa('KEY', '654321');
  assert.equal(res.token, 'TFATOKEN');
});

test('Benutzername aus dem Token', () => {
  const payload = Buffer.from(JSON.stringify({ username: 'u_123' })).toString('base64url');
  assert.equal(accountFromToken(`a.${payload}.c`), 'u_123');
  assert.equal(accountFromToken('kein-jwt'), '');
});

test('MQTT-Benutzername aus dem Token oder über die Nutzer-ID', async () => {
  const payload = Buffer.from(JSON.stringify({ username: 'u_777' })).toString('base64url');
  assert.equal(await new BambuCloud({ token: `a.${payload}.c`, fetchImpl: fakeFetch({}) }).mqttUsername(), 'u_777');
  const fetch = fakeFetch({ [`GET ${API}/v1/design-user-service/my/preference`]: () => ({ body: { uid: 123456 } }) });
  assert.equal(await new BambuCloud({ token: 'kein-jwt', fetchImpl: fetch }).mqttUsername(), 'u_123456');
});
