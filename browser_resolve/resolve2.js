const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const targets = [
  'https://vplink.in/7h7V2',
  'https://earnlinks.in/funT',
  'https://lksfy.com/xag8se',
];

const log = (tag, s) => console.log(`[${tag}] ${s}`);

function isPrimaryButtonCandidate(txt) {
  const t = (txt || '').toLowerCase().trim();
  if (!t) return false;
  return t.includes('get link') || t.includes('getlink') || t.includes('continue') ||
    t.includes('skip') || t.includes('next') || t.includes('download') ||
    t.includes('proceed') || t.includes('visit') || t.includes('open link') ||
    t.includes('click') || t.includes('bypass') || t.includes('access') ||
    t.includes('unlock') || t.includes('reveal');
}

async function candidateButtons(page) {
  const found = await page.evaluate(() => {
    const out = [];
    const roots = [];
    const add = (sel) => document.querySelectorAll(sel);
    const sels = [
      'a.get-link', '.get-link', 'a[href*="getlink"]',
      '.btn-primary', '.btn', 'button', 'a.button',
      '.skip-link', '.skip-button', '.continue-button', 'a.skip', 'button.skip', 'button.continue',
      '.next-btn', '.next-button',
      'a[target]', 'a[onclick]',
    ];
    const seen = new WeakSet();
    for (const sel of sels) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const tag = el.tagName.toLowerCase();
          const href = el.getAttribute('href') || '';
          const onclick = el.getAttribute('onclick') || '';
          const cls = el.className || '';
          const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          out.push({ sel, tag, txt, href, onclick, cls: String(cls).slice(0, 60) });
        }
      } catch {}
    }
    return out;
  });
  // filter visible
  const visible = [];
  for (const c of found) {
    let visibleFlag = true;
    // approximate: skip if href/javascript:void and has no useful text? keep
    visible.push(c);
  }
  return visible;
}

async function pickAndClick(page, tag) {
  const cands = await candidateButtons(page);
  // log all
  for (const c of cands) log(tag, `candidate: <${c.tag}> txt="${c.txt}" href="${c.href}" onclick="${c.onclick.slice(0,40)}" cls="${c.cls}"`);

  // Priority 1: .get-link family (visible)
  for (const c of cands) {
    if (c.sel.includes('get-link') || c.sel.includes('getlink')) {
      const el = await page.$(c.sel);
      if (!el) continue;
      const box = await el.boundingBox().catch(()=>null);
      if (box && box.width > 1 && box.height > 1) {
        log(tag, `clicking get-link: <${c.tag}> "${c.txt}"`);
        return await safeClick(page, el, tag);
      }
    }
  }
  // Priority 2: primary-looking button/link by text
  for (const c of cands) {
    if (isPrimaryButtonCandidate(c.txt)) {
      const el = await page.$(c.tag === 'a' ? `a[href="${c.href}"]` : 'button');
      // fallback: use the selector index via evaluate
      const clicked = await clickByMatchingText(page, c, tag);
      if (clicked) return true;
    }
  }
  // Priority 3: any .btn-primary visible
  for (const c of cands) {
    if (c.cls.includes('btn-primary')) {
      const clicked = await clickByMatchingText(page, c, tag);
      if (clicked) return true;
    }
  }
  // Priority 4: any visible button/a with onclick location
  for (const c of cands) {
    if (c.onclick && /location|window\.open|href/i.test(c.onclick)) {
      const clicked = await clickByMatchingText(page, c, tag);
      if (clicked) return true;
    }
  }
  return false;
}

async function clickByMatchingText(page, c, tag) {
  try {
    const el = await page.evaluateHandle((sel, txt) => {
      const nodes = document.querySelectorAll(sel);
      for (const n of nodes) {
        if ((n.textContent || '').trim().toLowerCase().includes(txt.toLowerCase())) {
          const b = n.getBoundingClientRect();
          if (b.width > 1 && b.height > 1) return n;
        }
      }
      // fallback: first visible
      for (const n of nodes) {
        const b = n.getBoundingClientRect();
        if (b.width > 1 && b.height > 1) return n;
      }
      return null;
    }, c.tag + (c.href ? `[href]` : ''), c.txt);
    const obj = await el.value;
    if (!obj) { log(tag, `no visible element for <${c.tag}> "${c.txt}"`); return false; }
    const box = await obj.boundingBox().catch(()=>null);
    if (!box || box.width <= 1 || box.height <= 1) { log(tag, 'element not visible'); return false; }
    log(tag, `clicking <${c.tag}> "${c.txt}"`);
    await safeClick(page, obj, tag);
    return true;
  } catch (e) { log(tag, 'clickByMatchingText err: ' + e.message.slice(0,80)); return false; }
}

async function safeClick(page, el, tag) {
  try {
    await el.click({ timeout: 8000 });
    return true;
  } catch (e) {
    log(tag, 'direct click failed: ' + e.message.slice(0, 80));
    try { await page.evaluate((n)=>{n.click();}, el); return true; } catch(e2){ log(tag,'eval click err: '+e2.message.slice(0,80)); return false;}
  }
}

async function waitForStableUrl(page, tag, maxMs = 14000) {
  const start = Date.now();
  let last = page.url();
  let sameSince = 0;
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(500);
    const cur = page.url();
    if (cur !== last) { sameSince = 0; last = cur; log(tag, 'url -> ' + cur); }
    else { sameSince += 500; if (sameSince >= 4000) return cur; }
  }
  return page.url();
}

async function waitForLoad(page, tag) {
  try { await page.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch {}
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(()=>{}); } catch {}
  await page.waitForTimeout(1200);
}

async function resolveUrl(startUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled',
           '--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security',
           '--lang=en-US,en'],
  });
  try {
    const context = await browser.newContext({
      userAgent: UA, viewport: { width: 1280, height: 800 },
      javaScriptEnabled: true, ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.open = (url) => { if (typeof url === 'string' && /^https?:\/\//i.test(url)) { window.location.href = url; } return window; };
      document.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.tagName === 'A' && (t.getAttribute('target') === '_blank' || t.target === '_blank')) {
          e.preventDefault(); window.location.href = t.href;
        }
      }, true);
    });
    // strip target later via periodic eval done in loop
    log('RESOLVE', 'goto ' + startUrl);
    try {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      log('RESOLVE', 'initial HTTP 200, url=' + page.url());
    } catch (e) { log('RESOLVE', 'goto err: ' + e.message.slice(0,100)); }

    let iterations = 0;
    let lastUrl = page.url();
    let stableSince = 0;
    while (iterations < 28) {
      iterations++;
      await page.waitForTimeout(1200);
      await waitForLoad(page, 'RESOLVE');

      // meta refresh
      let metaUrl;
      try {
        metaUrl = await page.evaluate(() => {
          const m = document.querySelector('meta[http-equiv="refresh"]');
          if (!m) return null;
          const c = (m.content||'').toLowerCase(); const i = c.indexOf('url=');
          if (i<0) return null;
          let u = c.slice(i+4).trim().replace(/^['"]|['"]$/g,'');
          if (/^https?:\/\//i.test(u)) return u;
          try { const a=document.createElement('a'); a.href=u; return a.href; } catch{return null;}
        });
      } catch {}
      if (metaUrl && metaUrl !== page.url()) {
        log('RESOLVE', 'meta-refresh -> ' + metaUrl);
        try { await page.goto(metaUrl, { waitUntil: 'domcontentloaded', timeout: 50000 }); } catch(e){}
        await page.waitForTimeout(1500);
        lastUrl = page.url(); stableSince = 0;
        continue;
      }

      const clicked = await pickAndClick(page, 'RESOLVE');
      if (clicked) {
        await waitForStableUrl(page, 'RESOLVE', 16000);
        lastUrl = page.url(); stableSince = 0;
        continue;
      }

      const cur = page.url();
      if (cur !== lastUrl) { log('RESOLVE','url changed -> '+cur); lastUrl = cur; stableSince=0; await page.waitForTimeout(800); continue; }
      else { stableSince += 2000; if (stableSince >= 10000) { log('RESOLVE','stable; stopping'); break; } }
    }

    let title = '';
    try { title = await page.title(); } catch { title = '(none)'; }
    log('RESOLVE', 'FINAL TITLE: ' + title.slice(0,140));
    log('RESOLVE', 'FINAL URL: ' + page.url());
    await context.close();
    return { start: startUrl, final: page.url(), title: title.slice(0,140) };
  } finally {
    await browser.close();
  }
}

(async () => {
  const out = [];
  for (const u of targets) {
    log('LOG', '==== ' + u + ' ====');
    try { out.push(await resolveUrl(u)); }
    catch (e) { log('LOG', 'FAILED ' + u + ': ' + e.message); out.push({ start: u, final: 'ERROR', title: e.message.slice(0,140) }); }
  }
  console.log('\n==== FULL SUMMARY ====');
  for (const r of out) console.log('\n' + r.start + '\n   -> ' + r.final + (r.title ? '   [' + r.title + ']' : ''));
})();
