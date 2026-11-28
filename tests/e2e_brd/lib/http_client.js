'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

function solveMathPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error(`Invalid CAPTCHA prompt: ${prompt}`);
  }
  const match = prompt.match(/(-?\d+)\s*([+\-*×x])\s*(-?\d+)/i);
  if (!match) {
    throw new Error(`Could not parse CAPTCHA math prompt: "${prompt}"`);
  }
  const a = Number(match[1]);
  const op = match[2].toLowerCase();
  const b = Number(match[3]);
  if (op === '+') return String(a + b);
  if (op === '-') return String(a - b);
  if (op === '*' || op === '×' || op === 'x') return String(a * b);
  throw new Error(`Unsupported CAPTCHA operator "${op}" in "${prompt}"`);
}

class OpaqueHttpClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.cookies = new Map();
    this.adminToken = null;
    this.csrfToken = null;
    this.staffToken = null;
    this.staffId = null;
    this.defaultTimeoutMs = options.timeoutMs || 10000;
  }

  clone(overrides = {}) {
    const c = new OpaqueHttpClient(overrides.baseUrl || this.baseUrl, {
      timeoutMs: this.defaultTimeoutMs
    });
    return c;
  }

  clearSession() {
    this.cookies.clear();
    this.adminToken = null;
    this.csrfToken = null;
    this.staffToken = null;
    this.staffId = null;
  }

  _storeSetCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const raw of list) {
      const firstPart = String(raw).split(';')[0];
      const eqIdx = firstPart.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = firstPart.slice(0, eqIdx).trim();
      const val = firstPart.slice(eqIdx + 1).trim();
      if (/max-age=0/i.test(raw) || val === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, val);
      }
      if (name === 'cwp_csrf' && val) {
        this.csrfToken = val;
      }
    }
  }

  _buildCookieHeader() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  request(method, urlPath, options = {}) {
    const targetUrl = urlPath.startsWith('http://') || urlPath.startsWith('https://')
      ? new URL(urlPath)
      : new URL(urlPath.startsWith('/') ? urlPath : `/${urlPath}`, `${this.baseUrl}/`);

    const isHttps = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const headers = { ...(options.headers || {}) };

    let bodyStr = null;
    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
        bodyStr = options.body;
      } else {
        bodyStr = JSON.stringify(options.body);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
      if (!headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }
    }

    if (!options.omitCookies) {
      const cookieHeader = this._buildCookieHeader();
      if (cookieHeader && !headers.Cookie && !headers.cookie) {
        headers.Cookie = cookieHeader;
      }
    }

    const authMode = options.authMode || 'auto';
    if (authMode === 'bearer-admin' && this.adminToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.adminToken}`;
    } else if (authMode === 'bearer-staff' && this.staffToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.staffToken}`;
    } else if (authMode === 'auto' && !headers.Authorization) {
      if (!this.cookies.has('cwp_adm_sess') && this.adminToken) {
        headers.Authorization = `Bearer ${this.adminToken}`;
      } else if (!this.cookies.has('cwp_adm_sess') && this.staffToken) {
        headers.Authorization = `Bearer ${this.staffToken}`;
      }
    }

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    const hasBearer = Boolean(headers.Authorization || headers.authorization);
    if (isMutation && !options.omitCsrf && !hasBearer) {
      const csrf = options.csrfTokenOverride !== undefined
        ? options.csrfTokenOverride
        : (this.cookies.get('cwp_csrf') || this.csrfToken);
      if (csrf && !headers['X-CSRF-Token']) {
        headers['X-CSRF-Token'] = csrf;
      }
    }

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          protocol: targetUrl.protocol,
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: method.toUpperCase(),
          headers,
          timeout: options.timeoutMs || this.defaultTimeoutMs
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            if (!options.omitCookies) {
              this._storeSetCookies(res.headers['set-cookie']);
            }
            const rawText = Buffer.concat(chunks).toString('utf8');
            let json = null;
            const contentType = String(res.headers['content-type'] || '');
            if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
              try {
                json = JSON.parse(rawText);
              } catch {
                json = null;
              }
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              text: rawText,
              json
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`HTTP timeout on ${method} ${targetUrl.pathname}`));
      });
      req.on('error', reject);

      if (bodyStr !== null) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  get(urlPath, options = {}) {
    return this.request('GET', urlPath, options);
  }

  post(urlPath, body, options = {}) {
    return this.request('POST', urlPath, { ...options, body });
  }

  put(urlPath, body, options = {}) {
    return this.request('PUT', urlPath, { ...options, body });
  }

  del(urlPath, options = {}) {
    return this.request('DELETE', urlPath, options);
  }

  apiAction(action, payload = {}, options = {}) {
    return this.post('/api', { action, ...payload }, options);
  }

  async adminLogin({ username = 'admin', password, useCookies = true } = {}) {
    const loginOptions = useCookies ? { omitCookies: false, omitCsrf: true } : { omitCookies: true, omitCsrf: true };
    let res = await this.apiAction('verifyAdminPassword', { username, password }, loginOptions);

    if (res.status === 403 && res.json && res.json.captchaRequired) {
      let captcha = res.json.captcha;
      if (!captcha || !captcha.prompt) {
        const capRes = await this.apiAction('getAdminCaptcha', { username }, loginOptions);
        captcha = capRes.json;
      }
      const captchaAnswer = solveMathPrompt(captcha.prompt);
      res = await this.apiAction(
        'verifyAdminPassword',
        {
          username,
          password,
          captchaId: captcha.challengeId,
          captchaAnswer
        },
        loginOptions
      );
    }

    if (res.status === 200 && res.json && res.json.success) {
      this.adminToken = res.json.token || null;
      if (res.json.csrfToken) {
        this.csrfToken = res.json.csrfToken;
      }
    }
    return res;
  }

  async staffLogin({ phone, staffId, identifier, pin, deviceId } = {}) {
    const payload = { pin };
    if (phone) payload.phone = phone;
    if (staffId) payload.staffId = staffId;
    if (identifier) payload.identifier = identifier;
    if (deviceId) payload.deviceId = deviceId;

    const res = await this.apiAction('verifyStaffPin', payload, { authMode: 'none', omitCsrf: true });
    if (res.status === 200 && res.json && res.json.success) {
      this.staffToken = res.json.token || null;
      this.staffId = res.json.staffId || (res.json.staff && res.json.staff.id) || null;
    }
    return res;
  }

  readSseEvents(urlPath, { headers = {}, authMode = 'bearer-admin', timeoutMs = 3500, maxEvents = 3, triggerFn } = {}) {
    const targetUrl = new URL(urlPath.startsWith('/') ? urlPath : `/${urlPath}`, `${this.baseUrl}/`);
    const isHttps = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const reqHeaders = { Accept: 'text/event-stream', ...headers };

    if (authMode === 'bearer-admin' && this.adminToken && !reqHeaders.Authorization) {
      reqHeaders.Authorization = `Bearer ${this.adminToken}`;
    } else if (authMode === 'bearer-staff' && this.staffToken && !reqHeaders.Authorization) {
      reqHeaders.Authorization = `Bearer ${this.staffToken}`;
    }
    const cookieHeader = this._buildCookieHeader();
    if (cookieHeader && !reqHeaders.Cookie && authMode !== 'none') {
      reqHeaders.Cookie = cookieHeader;
    }

    return new Promise((resolve, reject) => {
      const events = [];
      let buffer = '';
      let triggered = false;
      let settled = false;

      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { req.destroy(); } catch {}
        if (err) reject(err);
        else resolve({ status: statusCode, events });
      };

      const timer = setTimeout(() => finish(), timeoutMs);
      let statusCode = 0;

      const req = transport.request(
        {
          protocol: targetUrl.protocol,
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: 'GET',
          headers: reqHeaders
        },
        (res) => {
          statusCode = res.statusCode;
          if (statusCode >= 400) {
            res.resume();
            finish();
            return;
          }

          res.setEncoding('utf8');
          res.on('data', async (chunk) => {
            buffer += chunk.replace(/\r\n/g, '\n');
            let idx;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const rawFrame = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const parsed = parseSseFrame(rawFrame);
              if (parsed) {
                events.push(parsed);
                if (!triggered && typeof triggerFn === 'function') {
                  triggered = true;
                  Promise.resolve().then(() => triggerFn()).catch(() => {});
                }
                if (events.length >= maxEvents) {
                  finish();
                  return;
                }
              }
            }
          });

          if (!triggered && typeof triggerFn === 'function') {
            setTimeout(() => {
              if (!triggered && !settled) {
                triggered = true;
                Promise.resolve().then(() => triggerFn()).catch(() => {});
              }
            }, 150);
          }

          res.on('end', () => finish());
        }
      );

      req.on('error', (err) => {
        if (!settled) finish(err);
      });
      req.end();
    });
  }
}

function parseSseFrame(rawFrame) {
  const lines = rawFrame.split('\n');
  let eventName = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  const rawData = dataLines.join('\n');
  let data = rawData;
  try {
    data = JSON.parse(rawData);
  } catch {}
  return { event: eventName, data };
}

module.exports = {
  OpaqueHttpClient,
  solveMathPrompt,
  parseSseFrame
};
