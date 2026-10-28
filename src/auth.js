// Passwortschutz. Nach der Anmeldung merkt sich der Browser ein Sitzungs-
// Cookie; Werkzeuge können stattdessen HTTP-Basic-Auth schicken.
import crypto from 'node:crypto';

const COOKIE = 'lager_sitzung';
const MAX_AGE_S = 180 * 24 * 3600;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(req, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
}

// Hinter Plesk/nginx hängt der Proxy die echte Adresse hinten an X-Forwarded-For.
function clientKey(req) {
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - 1] || req.socket.remoteAddress || 'alle';
}

export function createAuth(password) {
  // Ändert sich das Passwort, werden alle bisherigen Sitzungen ungültig.
  const session = password ? crypto.createHmac('sha256', password).update('filament-lager-sitzung').digest('hex') : '';
  const fails = new Map();

  function isLoggedIn(req) {
    if (!password) return true;
    if (safeEqual(readCookie(req, COOKIE), session)) return true;
    const header = req.headers.authorization || '';
    if (!header.startsWith('Basic ')) return false;
    const given = Buffer.from(header.slice(6), 'base64').toString().split(':').slice(1).join(':');
    return safeEqual(given, password);
  }

  function setCookie(req, res, value, maxAge) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.append('Set-Cookie', `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
  }

  // Ergebnis: 'ok' | 'falsch' | 'gesperrt'
  function login(req, res, given) {
    const key = clientKey(req);
    const now = Date.now();
    const entry = fails.get(key);
    if (entry && now - entry.since > FAIL_WINDOW_MS) fails.delete(key);
    if ((fails.get(key)?.count || 0) >= MAX_FAILS) return 'gesperrt';
    if (!safeEqual(given, password)) {
      const e = fails.get(key) || { count: 0, since: now };
      e.count += 1;
      fails.set(key, e);
      return 'falsch';
    }
    fails.delete(key);
    setCookie(req, res, session, MAX_AGE_S);
    return 'ok';
  }

  function logout(req, res) {
    setCookie(req, res, '', 0);
  }

  return { isLoggedIn, login, logout };
}
