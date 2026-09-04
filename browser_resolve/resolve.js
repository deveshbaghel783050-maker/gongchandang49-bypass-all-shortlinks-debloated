const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const targets = [
  'https://vplink.in/7h7V2',
  'https://earnlinks.in/funT',
  'https://lksfy.com/xag8se',
];

const CLICK_SELECTORS = [
  'a.get-link',
  '.get-link',
  '.get-link.btn',
  '.btn-primary',
  'button.get-link',
  '#bottomButton',
  '.skip-button',
  '.continue-button',
  'button.skip',
  'button.continue',
];

function looksLikePrimaryAction(page, txt) {
  const t = (txt || '').toLowerCase();
  return t.includes('get link') || t.includes('continue') || t.includes('skip') ||
    t.includes('next') || t.includes('download') || t.includes('proceed') ||
    t.includes('click here') || t.includes('visit') || t.includes('open');
}

async function getMetaRefreshUrl(page) {
  try {
    return await page.evaluate(() => {
      const m = document.querySelector('meta[http-equiv="refresh"]');
      if (!m) return null;
      const c = (m.content || '').toLowerCase();
      const i = c.indexOf('url=');
      if (i < 0) return null;
      let u = c.slice(i + 4).trim().replace(/^['"]|['"]$/g, '');
      if (u.startsWith('http')) return u;
      // relative
      try { const a = document.createElement('a'); a.href = u; return a.href; } catch (e) {} return null;
    });
  } catch (e) { return null; }
}

async function resolveUrl(startUrl) {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-web-security', '--ignore-certificate-errors', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.open = (url, name, features) => {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
          window.location.href = url;
        }
        return window;
      };
    });
    // capture any popup that escapes window.open override
    page.on('popup', async p => {
      console.log('POPUP: ' + p.url());
      try { await p.close(); } catch {}
    });
    const log = (s) => console.log(`[${startUrl}] ${s}`);
    const events = [];
    page.on('load', () => events.push('load'));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) events.push('nav'); });
    page.on('request', r => {
      const u = r.url();
      if (!u.startsWith('data:') && !u.startsWith('blob:') && u !== startUrl) events.push('req:' + u);
    });

    log('goto start');
    let resp;
    try {
      resp = await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      log('initial HTTP ' + (resp ? resp.status() : 'none'));
    } catch (e) {
      log('goto error: ' + e.message.slice(0, 120));
    }

    await page.waitForTimeout(3500);

    let iterations = 0;
    let lastUrl = page.url();
    let stableSince = 0;

    while (iterations < 30) {
      iterations++;
      let moved = false;

      // 1) meta refresh handling
      const metaUrl = await getMetaRefreshUrl(page);
      if (metaUrl && metaUrl !== page.url()) {
        log('meta-refresh -> ' + metaUrl);
        try { await page.goto(metaUrl, { waitUntil: 'domcontentloaded', timeout: 40000 }); } catch (e) {}
        await page.waitForTimeout(1500);
        lastUrl = page.url();
        stableSince = 0;
        continue;
      }

      let clicked = false;
      for (const sel of CLICK_SELECTORS) {
        let els;
        try { els = await page.$$(sel); } catch { continue; }
        for (const el of els) {
          let box;
          try { box = await el.boundingBox(); } catch { continue; }
          if (!box || box.width <= 1 || box.height <= 1) continue;
          let txt;
          try { txt = await el.textContent(); } catch { txt = ''; }
          if (!looksLikePrimaryAction(null, txt)) continue;
          log(`click ${sel} " ${(txt||'').trim().slice(0,40)} }"`);
          try {
            await Promise.all([
              (page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})),
              el.click({ timeout: 8000 }),
            ]);
            clicked = true;
          } catch (e) {
            log('click failed: ' + e.message.slice(0, 80));
          }
          break;
        }
        if (clicked) break;
      }

      if (clicked) {
        await page.waitForTimeout(2000);
        lastUrl = page.url();
        stableSince = 0;
        continue;
      }

      // 2) detect any client-side URL change (JS redirect, pushState, location.assign)
      const curUrl = page.url();
      if (curUrl !== lastUrl) {
        log('url changed -> ' + curUrl);
        lastUrl = curUrl;
        stableSince = 0;
        await page.waitForTimeout(1500);
        continue;
      } else {
        stableSince += 2;
        if (stableSince >= 6) {
          log('stable URL reached');
          break;
        }
      }
      await page.waitForTimeout(2000);
    }

    let title = '';
    try { title = await page.title(); } catch { title = '(none)'; }
    log('FINAL TITLE: ' + title.slice(0, 120));
    log('FINAL URL: ' + page.url());
    const result = { start: startUrl, final: page.url(), title: title.slice(0, 120) };
    await context.close();
    return result;
  } finally {
    await browser.close();
  }
}

(async () => {
  const out = [];
  for (const u of targets) {
    try {
      console.log('==== ' + u + ' ====');
      out.push(await resolveUrl(u));
    } catch (e) {
      console.log('FAILED ' + u + ': ' + e.message);
      out.push({ start: u, final: 'ERROR', title: e.message.slice(0, 120) });
    }
  }
  console.log('\n==== SUMMARY ====');
  for (const r of out) {
    console.log(r.start + '\n   -> ' + r.final + (r.title ? '  [' + r.title + ']' : ''));
  }
})();
