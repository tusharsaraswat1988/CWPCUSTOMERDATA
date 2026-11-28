'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const BROWSER_CANDIDATES = [
  { name: 'cdp-chrome', path: process.env.CHROME_PATH },
  { name: 'cdp-chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'cdp-chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'cdp-edge', path: process.env.EDGE_PATH },
  { name: 'cdp-edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'cdp-edge', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' }
];

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function fetchLocalJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('CDP HTTP timeout')));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractHtmlSummary(html, currentUrl, consoleErrors = []) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  const elementIds = [];
  const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = idRegex.exec(html)) !== null) {
    elementIds.push(m[1]);
  }

  const scriptSrcs = [];
  const scriptRegex = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = scriptRegex.exec(html)) !== null) {
    scriptSrcs.push(m[1]);
  }

  const linkHrefs = [];
  const stylesheetHrefs = [];
  const linkTagRegex = /<link\b([^>]*)>/gi;
  while ((m = linkTagRegex.exec(html)) !== null) {
    const attrs = m[1];
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    linkHrefs.push(href);
    const relMatch = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i);
    const isStylesheet = (relMatch && /\bstylesheet\b/i.test(relMatch[1])) || /\.css(?:[?#]|$)/i.test(href);
    if (isStylesheet) {
      stylesheetHrefs.push(href);
    }
  }

  const navTabIds = elementIds.filter((id) => id.startsWith('v2NavBtn'));
  const viewIds = elementIds.filter((id) => id.startsWith('v2View_'));

  const assetVersionErrors = [];
  for (const src of [...scriptSrcs, ...stylesheetHrefs]) {
    if ((src.includes('/admin-v2/') || src.startsWith('/css/') || src.startsWith('/js/')) && !src.includes('?v=')) {
      assetVersionErrors.push(`Missing ?v= query parameter on ${src}`);
    }
  }

  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title,
    url: currentUrl,
    html,
    elementIds,
    navTabIds,
    viewIds,
    scriptSrcs,
    linkHrefs,
    stylesheetHrefs,
    assetVersionErrors,
    consoleErrors: consoleErrors.slice(),
    textContent
  };
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('Global WebSocket not available in this Node runtime');
    }
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = (ev) => reject(new Error(ev && ev.message ? ev.message : 'CDP WebSocket connection failed'));
      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message || 'CDP error'));
          else res(msg.result);
          return;
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params && msg.params.type === 'error') {
          const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
          this.consoleErrors.push(text || 'console.error');
        } else if (msg.method === 'Runtime.exceptionThrown' && msg.params && msg.params.exceptionDetails) {
          const d = msg.params.exceptionDetails;
          const errText = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'Uncaught exception';
          this.consoleErrors.push(errText);
        }
      };
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout on ${method}`));
        }
      }, 10000);
      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expr) {
    const wrapped = expr.trim().startsWith('(') ? expr : `(() => {\n${expr}\n})()`;
    const res = await this.send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true
    });
    if (res && res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'Runtime evaluate error');
    }
    return res && res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}

class BrowserDriver {
  constructor(options = {}) {
    this.requestedMode = options.browserMode || 'auto';
    this.httpClient = options.httpClient;
    this.mode = 'http-fallback';
    this.cdp = null;
    this.proc = null;
    this.userDataDir = null;
    this.playwrightBrowser = null;
    this.playwrightPage = null;
    this.consoleErrors = [];
    this.currentUrl = '';
    this.currentHtml = '';
  }

  async init() {
    if (this.requestedMode === 'none') {
      this.mode = 'none';
      return this.mode;
    }
    if (this.requestedMode === 'http') {
      this.mode = 'http-fallback';
      return this.mode;
    }

    if (this.requestedMode === 'auto') {
      for (const pkgName of ['playwright', 'playwright-core']) {
        try {
          const pw = require(pkgName);
          if (pw && pw.chromium) {
            this.playwrightBrowser = await pw.chromium.launch({ headless: true });
            const ctx = await this.playwrightBrowser.newContext({ viewport: { width: 1280, height: 800 } });
            this.playwrightPage = await ctx.newPage();
            this.playwrightPage.on('console', (msg) => {
              if (msg.type() === 'error') this.consoleErrors.push(msg.text());
            });
            this.playwrightPage.on('pageerror', (err) => {
              this.consoleErrors.push(err.message);
            });
            this.mode = 'playwright';
            return this.mode;
          }
        } catch {}
      }
    }

    if (this.requestedMode === 'auto' || this.requestedMode === 'cdp') {
      const found = BROWSER_CANDIDATES.find((c) => c.path && fs.existsSync(c.path));
      if (found) {
        try {
          await this._launchCdp(found);
          this.mode = found.name;
          return this.mode;
        } catch (err) {
          await this.close();
          if (this.requestedMode === 'cdp') {
            throw err;
          }
        }
      } else if (this.requestedMode === 'cdp') {
        throw new Error('No Chrome or Edge binary found for --browser=cdp');
      }
    }

    this.mode = 'http-fallback';
    return this.mode;
  }

  async _launchCdp(browserSpec) {
    const port = await findFreePort();
    const tmpRoot = process.env.E2E_TMP_DIR || os.tmpdir();
    fs.mkdirSync(tmpRoot, { recursive: true });
    this.userDataDir = path.join(tmpRoot, `cwp_e2e_cdp_${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(this.userDataDir, { recursive: true });

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${this.userDataDir}`,
      'about:blank'
    ];

    this.proc = spawn(browserSpec.path, args, {
      stdio: 'ignore',
      windowsHide: true
    });

    let wsUrl = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (this.proc.exitCode !== null) {
        throw new Error(`Browser process exited prematurely with code ${this.proc.exitCode}`);
      }
      try {
        const list = await fetchLocalJson(`http://127.0.0.1:${port}/json/list`);
        if (Array.isArray(list)) {
          const pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pageTarget) {
            wsUrl = pageTarget.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
      await sleep(150);
    }

    if (!wsUrl) {
      throw new Error('Timed out waiting for CDP WebSocket target');
    }

    this.cdp = new CdpSession(wsUrl);
    await this.cdp.connect();
  }

  clearConsoleErrors() {
    this.consoleErrors = [];
    if (this.cdp) this.cdp.consoleErrors = [];
  }

  getConsoleErrors() {
    return this.cdp ? this.cdp.consoleErrors.slice() : this.consoleErrors.slice();
  }

  isHttpFallback() {
    return this.mode === 'http-fallback' || this.mode === 'none';
  }

  async goto(urlPathOrFull, { viewport, waitForSelector, waitForText, settleMs = 300 } = {}) {
    const fullUrl = urlPathOrFull.startsWith('http://') || urlPathOrFull.startsWith('https://')
      ? urlPathOrFull
      : `${this.httpClient.baseUrl}${urlPathOrFull.startsWith('/') ? urlPathOrFull : `/${urlPathOrFull}`}`;
    this.currentUrl = fullUrl;
    this.clearConsoleErrors();

    if (this.mode === 'playwright' && this.playwrightPage) {
      if (viewport) await this.playwrightPage.setViewportSize(viewport);
      await this.playwrightPage.goto(fullUrl, { waitUntil: 'networkidle' });
      if (waitForSelector) await this.waitForSelector(waitForSelector, 5000);
      if (waitForText) await this.waitForText(waitForText, 5000);
      this.currentHtml = await this.playwrightPage.content();
      return { url: this.playwrightPage.url(), html: this.currentHtml };
    }

    if (this.cdp) {
      if (viewport) {
        await this.cdp.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.width <= 600
        });
      }
      await this.cdp.send('Page.navigate', { url: fullUrl });
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const ready = await this.cdp.evaluate('return document.readyState;');
        if (ready === 'complete') break;
        await sleep(80);
      }
      // Wait for microtasks / initial fetch() hydration & animation frames to settle
      await this.cdp.evaluate(`
        return new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ${Number(settleMs) || 300})));
        });
      `);
      if (waitForSelector) await this.waitForSelector(waitForSelector, 5000);
      if (waitForText) await this.waitForText(waitForText, 5000);
      this.currentHtml = await this.cdp.evaluate('return document.documentElement.outerHTML;');
      const liveUrl = await this.cdp.evaluate('return window.location.href;');
      this.currentUrl = liveUrl || fullUrl;
      return { url: this.currentUrl, html: this.currentHtml };
    }

    // HTTP fallback (also used when mode === 'none' if explicitly called)
    const res = await this.httpClient.get(fullUrl);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      const redirected = res.headers.location.startsWith('http')
        ? res.headers.location
        : `${this.httpClient.baseUrl}${res.headers.location}`;
      const r2 = await this.httpClient.get(redirected);
      this.currentUrl = redirected;
      this.currentHtml = r2.text;
      return { url: this.currentUrl, html: this.currentHtml, status: r2.status };
    }
    this.currentHtml = res.text;
    return { url: this.currentUrl, html: this.currentHtml, status: res.status };
  }

  async evaluate(expression) {
    if (this.mode === 'playwright' && this.playwrightPage) {
      const wrapped = expression.trim().startsWith('(') ? expression : `(() => {\n${expression}\n})()`;
      return this.playwrightPage.evaluate((expr) => (0, eval)(expr), wrapped);
    }
    if (this.cdp) {
      return this.cdp.evaluate(expression);
    }
    throw new Error('evaluate() is only available in Playwright or CDP mode');
  }

  async waitForCondition(jsExpr, timeoutMs = 5000) {
    if (this.isHttpFallback()) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const val = await this.evaluate(jsExpr);
        if (val) return val;
      } catch {}
      await sleep(80);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for browser condition`);
  }

  async waitForSelector(selector, timeoutMs = 5000) {
    if (this.isHttpFallback()) return true;
    const selJson = JSON.stringify(selector);
    return this.waitForCondition(`return Boolean(document.querySelector(${selJson}));`, timeoutMs);
  }

  async waitForText(textOrRegex, timeoutMs = 5000) {
    if (this.isHttpFallback()) return true;
    const deadline = Date.now() + timeoutMs;
    const regex = textOrRegex instanceof RegExp ? textOrRegex : null;
    const needle = regex ? null : String(textOrRegex);
    while (Date.now() < deadline) {
      const text = await this.evaluate('return (document.body ? document.body.innerText : "") || "";');
      if (regex ? regex.test(text) : text.includes(needle)) {
        return true;
      }
      await sleep(80);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for text: ${String(textOrRegex)}`);
  }

  async click(selector) {
    if (this.isHttpFallback()) throw new Error('click() requires Playwright or CDP mode');
    if (this.mode === 'playwright' && this.playwrightPage) {
      await this.playwrightPage.click(selector);
      return;
    }
    const selJson = JSON.stringify(selector);
    const clicked = await this.evaluate(`
      const el = document.querySelector(${selJson});
      if (!el) return false;
      el.click();
      return true;
    `);
    if (!clicked) throw new Error(`Element not found for click(): ${selector}`);
  }

  async fill(selector, value) {
    if (this.isHttpFallback()) throw new Error('fill() requires Playwright or CDP mode');
    if (this.mode === 'playwright' && this.playwrightPage) {
      await this.playwrightPage.fill(selector, String(value));
      return;
    }
    const selJson = JSON.stringify(selector);
    const valJson = JSON.stringify(String(value));
    const ok = await this.evaluate(`
      const el = document.querySelector(${selJson});
      if (!el) return false;
      el.focus();
      el.value = ${valJson};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `);
    if (!ok) throw new Error(`Element not found for fill(): ${selector}`);
  }

  async getHtml() {
    if (this.mode === 'playwright' && this.playwrightPage) {
      return this.playwrightPage.content();
    }
    if (this.cdp) {
      return this.cdp.evaluate('return document.documentElement.outerHTML;');
    }
    return this.currentHtml;
  }

  async queryDomSummary() {
    const html = await this.getHtml();
    const summary = extractHtmlSummary(html, this.currentUrl, this.getConsoleErrors());
    if (this.cdp) {
      const live = await this.cdp.evaluate(`
        const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
        const navIds = ids.filter(id => id.startsWith('v2NavBtn'));
        const viewIds = ids.filter(id => id.startsWith('v2View_'));
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(el => el.getAttribute('src'));
        const links = Array.from(document.querySelectorAll('link[href]')).map(el => el.getAttribute('href'));
        const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map(el => el.getAttribute('href'));
        const text = (document.body ? document.body.innerText : '') || '';
        return { title: document.title, ids, navIds, viewIds, scripts, links, stylesheets, text };
      `);
      if (live) {
        summary.title = live.title || summary.title;
        summary.elementIds = live.ids;
        summary.navTabIds = live.navIds;
        summary.viewIds = live.viewIds;
        summary.scriptSrcs = live.scripts;
        summary.linkHrefs = live.links;
        if (Array.isArray(live.stylesheets)) summary.stylesheetHrefs = live.stylesheets;
        if (live.text) summary.textContent = live.text.replace(/\s+/g, ' ').trim();
      }
    }
    return summary;
  }

  async fetchLinkedAssets() {
    const html = await this.getHtml();
    const summary = extractHtmlSummary(html, this.currentUrl, []);
    const refs = new Set([...summary.scriptSrcs, ...summary.stylesheetHrefs]);
    const assets = [];
    for (const ref of refs) {
      if (!ref || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('data:')) continue;
      const cleanPath = ref.split('?')[0].split('#')[0].toLowerCase();
      if (!cleanPath.endsWith('.js') && !cleanPath.endsWith('.css')) continue;
      const res = await this.httpClient.get(ref);
      assets.push({
        ref,
        kind: cleanPath.endsWith('.css') ? 'css' : 'js',
        status: res.status,
        text: res.text
      });
    }
    return assets;
  }

  async close() {
    if (this.cdp) {
      this.cdp.close();
      this.cdp = null;
    }
    if (this.playwrightBrowser) {
      try { await this.playwrightBrowser.close(); } catch {}
      this.playwrightBrowser = null;
      this.playwrightPage = null;
    }
    if (this.proc) {
      const pid = this.proc.pid;
      try { this.proc.kill('SIGTERM'); } catch {}
      if (process.platform === 'win32' && pid) {
        try {
          spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } catch {}
      }
      this.proc = null;
    }
    if (this.userDataDir) {
      const dir = this.userDataDir;
      this.userDataDir = null;
      for (let i = 0; i < 5; i += 1) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          break;
        } catch {
          await sleep(100);
        }
      }
    }
  }
}

module.exports = {
  BrowserDriver,
  extractHtmlSummary
};
