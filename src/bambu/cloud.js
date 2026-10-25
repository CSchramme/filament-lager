// Client für die Bambu-Lab-Cloud: Anmeldung und die Endpunkte des
// Filament Managers aus Bambu Studio / Bambu Handy.
//
// Bambu dokumentiert diese Schnittstelle nicht öffentlich. Pfade und Felder
// stammen aus der Community (ha-bambulab, OrcaSlicer-Plugin
// "bambu-filament-manager") und können sich ändern.

const API_HOSTS = { global: 'https://api.bambulab.com', china: 'https://api.bambulab.cn' };
const MQTT_HOSTS = { global: 'us.mqtt.bambulab.com', china: 'cn.mqtt.bambulab.com' };
const WEB_HOSTS = { global: 'https://bambulab.com', china: 'https://bambulab.cn' };
const SPOOLS_PATH = '/v1/design-user-service/my/filament/v2';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const BASE_HEADERS = {
  'User-Agent': 'bambu_network_agent/01.09.05.01',
  'X-BBL-Client-Name': 'OrcaSlicer',
  'X-BBL-Client-Type': 'slicer',
  'X-BBL-Client-Version': '01.09.05.51',
  'X-BBL-Language': 'de-DE',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

export class CloudError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function cookieValue(headers, name) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  for (const line of list) {
    const m = new RegExp('(?:^|[;,]\\s*)' + name + '=([^;]+)').exec(line);
    if (m) return decodeURIComponent(m[1]);
  }
  return '';
}

export class BambuCloud {
  constructor({ region = 'global', token = '', fetchImpl = globalThis.fetch, apiBase, webBase, timeoutMs = 20000 } = {}) {
    this.region = region === 'china' ? 'china' : 'global';
    this.token = token;
    this.fetch = fetchImpl;
    this.apiBase = apiBase || API_HOSTS[this.region];
    this.webBase = webBase || WEB_HOSTS[this.region];
    this.timeoutMs = timeoutMs;
  }

  async call(url, { method = 'GET', body, headers = {}, auth = true, okStatuses = [] } = {}) {
    const h = { ...BASE_HEADERS, ...headers };
    if (auth) {
      if (!this.token) throw new CloudError('Nicht bei Bambu angemeldet.', 401, 'auth');
      h.Authorization = 'Bearer ' + this.token;
    }
    let res;
    try {
      res = await this.fetch(url, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err.cause && err.cause.message ? err.cause.message : err.message;
      throw new CloudError(`Bambu Cloud nicht erreichbar (${reason}).`, 0, 'network');
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = null;
    }
    if (res.status === 403 && /cloudflare/i.test(text)) {
      throw new CloudError('Die Bambu Cloud hat die Anfrage blockiert (Cloudflare). Später erneut versuchen oder den Token manuell eintragen.', 403, 'cloudflare');
    }
    if (res.status === 401) {
      throw new CloudError('Die Bambu-Anmeldung ist abgelaufen. Bitte neu anmelden.', 401, 'auth');
    }
    if ((res.status < 200 || res.status >= 300) && !okStatuses.includes(res.status)) {
      const msg = (json && (json.message || json.error)) || text.slice(0, 200) || 'keine Antwort';
      throw new CloudError(`Bambu Cloud: ${method} ${url.replace(/\?.*/, '')} -> HTTP ${res.status}: ${msg}`, res.status);
    }
    if (json === null) throw new CloudError('Bambu Cloud hat keine gültige Antwort geschickt.', res.status);
    return { status: res.status, json, headers: res.headers };
  }

  request(method, path, { body, query } = {}) {
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)) : '';
    return this.call(this.apiBase + path + qs, { method, body }).then((r) => r.json);
  }

  // -- Anmeldung ----------------------------------------------------------

  // Ergebnis: { status: 'ok', token } | { status: 'code' } | { status: 'tfa', tfaKey }
  async login(account, password) {
    const { status, json } = await this.call(this.apiBase + '/v1/user-service/user/login', {
      method: 'POST',
      auth: false,
      body: { account, password, apiError: '' },
      okStatuses: [400],
    });
    if (status === 400) throw new CloudError(json.message || 'E-Mail oder Passwort ist falsch.', 400, 'credentials');
    if (json.accessToken) {
      this.token = json.accessToken;
      return { status: 'ok', token: json.accessToken, expiresIn: json.expiresIn || 0 };
    }
    if (json.loginType === 'verifyCode') {
      await this.sendCode(account);
      return { status: 'code' };
    }
    if (json.loginType === 'tfa') return { status: 'tfa', tfaKey: json.tfaKey };
    throw new CloudError('Unbekannte Antwort der Bambu-Anmeldung: ' + JSON.stringify(json).slice(0, 200));
  }

  async sendCode(account) {
    if (account.includes('@')) {
      await this.call(this.apiBase + '/v1/user-service/user/sendemail/code', {
        method: 'POST', auth: false, body: { email: account, type: 'codeLogin' },
      });
    } else {
      await this.call(this.webBase + '/api/v1/user-service/user/sendsmscode', {
        method: 'POST', auth: false, body: { phone: account, type: 'codeLogin' },
      });
    }
  }

  async loginWithCode(account, code) {
    const { status, json } = await this.call(this.apiBase + '/v1/user-service/user/login', {
      method: 'POST', auth: false, body: { account, code: String(code).trim() }, okStatuses: [400],
    });
    if (status === 400) {
      if (json.code === 1) {
        await this.sendCode(account);
        throw new CloudError('Der Code ist abgelaufen. Ein neuer Code wurde verschickt.', 400, 'code-expired');
      }
      throw new CloudError('Der Code ist falsch. Bitte erneut eingeben.', 400, 'code-wrong');
    }
    if (!json.accessToken) throw new CloudError('Bambu hat keinen Token geliefert.');
    this.token = json.accessToken;
    return { status: 'ok', token: json.accessToken, expiresIn: json.expiresIn || 0 };
  }

  async loginWithTfa(tfaKey, code) {
    const csrf = await this.call(this.webBase + '/api/csrf', { auth: false, okStatuses: [204] });
    const csrfToken = cookieValue(csrf.headers, 'bbl_csrf_token');
    if (!csrfToken) throw new CloudError('Bambu hat kein CSRF-Token geliefert. Bitte mit E-Mail-Code anmelden.');
    const res = await this.call(this.webBase + '/api/sign-in/tfa', {
      method: 'POST',
      auth: false,
      headers: { 'x-bbl-csrf-token': csrfToken, Cookie: 'bbl_csrf_token=' + csrfToken },
      body: { tfaKey, tfaCode: String(code).trim() },
    });
    const token = cookieValue(res.headers, 'token');
    if (!token) throw new CloudError('Der Zwei-Faktor-Code wurde nicht akzeptiert.', 400, 'code-wrong');
    this.token = token;
    return { status: 'ok', token, expiresIn: 0 };
  }

  // -- Filament Manager -----------------------------------------------------

  async listSpools() {
    const spools = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await this.request('GET', SPOOLS_PATH, { query: { offset, limit: PAGE_SIZE } });
      const hits = (data.hits || []).filter((h) => h && typeof h === 'object');
      spools.push(...hits);
      offset += hits.length;
      if (!hits.length || typeof data.total !== 'number' || offset >= data.total) break;
    }
    return spools;
  }

  createSpool(body) {
    return this.request('POST', SPOOLS_PATH, { body });
  }

  // body: { id, filamentName, ...geänderte Felder }
  updateSpool(body) {
    return this.request('PUT', SPOOLS_PATH, { body });
  }

  deleteSpools(ids) {
    return this.request('DELETE', SPOOLS_PATH + '/batch', { body: { ids: ids.map(Number) } });
  }

  // Druckverlauf, neueste zuerst. after: ID des letzten Eintrags der vorigen Seite.
  async listTasks({ limit = 50, after } = {}) {
    const data = await this.request('GET', '/v1/user-service/my/tasks', { query: { limit, after } });
    return (data.hits || []).filter((t) => t && typeof t === 'object');
  }

  async listDevices() {
    const data = await this.request('GET', '/v1/iot-service/api/user/bind');
    return (data.devices || []).filter((d) => d && typeof d === 'object');
  }

  // Benutzername für die Cloud-MQTT-Verbindung zum Drucker: "u_<Nutzer-ID>".
  async mqttUsername() {
    const fromToken = String(jwtPayload(this.token).username || '');
    if (fromToken.startsWith('u_')) return fromToken;
    const data = await this.request('GET', '/v1/design-user-service/my/preference');
    if (!data.uid) throw new CloudError('Bambu hat keine Nutzer-ID geliefert.');
    return 'u_' + data.uid;
  }
}

export function mqttHost(region) {
  return MQTT_HOSTS[region === 'china' ? 'china' : 'global'];
}

function jwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return {};
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) || {};
  } catch {
    return {};
  }
}

// Anzeigename aus dem Token, falls er einer ist (für von Hand eingetragene Tokens).
export function accountFromToken(token) {
  const p = jwtPayload(token);
  return p.email || p.preferred_username || p.username || '';
}
