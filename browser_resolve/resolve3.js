const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const targets = [
  'https://vplink.in/7h7V2',
  'https://earnlinks.in/funT',
  'https://lksfy.com/xag8se',
];

const log = (tag, s) => console.log(`[${tag}] ${s}`);

// Stealt: remove webdriver, spoof languages/plugins/hwc
const STEALTH = `
if (navigator.webdriver !== undefined) { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch(e){} }
try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }); } catch(e){}
try { Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] }); } catch(e){}
try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); } catch(e){}
try { Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }); } catch(e){}
try { Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' }); } catch(e){}
try { window.chrome = window.chrome || {}; window.chrome.runtime = window.chrome.runtime || {onConnect: {addListener(){}}, onMessage: {addListener(){}}}; } catch(e){}
const _origQuery = window.navigator.permissions && window.navigator.permissions.query;
if (_origQuery) { window.navigator.permissions.query = (p) => Promise.resolve({state:'granted'}).catch(()=>{}); }
window.open = (url, name, features) => { if (typeof url === 'string' && /^https?:\\/\\/i.test(url)) { window.location.href = url; } return window; };
document.addEventListener('click', (e) => { const t=e.target; if (t && t.tagName==='A' && (t.getAttribute('target')==='_blank'||t.target==='_blank')) { e.preventDefault(); window.location.href=t.href; } }, true);
`;

// Priority-ordered actionable selectors (from this repo's userscript + observed ad walls)
const SELECTORS = [
  'a.get-link',                          // vplink
  '.get-link.btn',                       // lksfy (decoded .get-link.btn-primary.btn)
  '.get-link',                           // generic
  '#wpsafe-link > .bt-success',          // WPSafeLink proceed (repo line 826/905)
  'a#btn7',                              // WP plugin (repo line 983)
  '#open-link > .pro_btn',               // WPSafeLink "Click To Continue" (repo)
  '#topButton.pro_btn',                  // repo line 905
  '.pro_btn',                            // Human Verification / Click To Continue (recruitmentaim)
  '.rewarded-continue-button',           // jobustecher "Continue ➜"
  '.button-9',                           // jobustecher "Continue"
  '.get-link.btn-primary',               //
  'button:has-text("Continue")',         // generic text fallbacks
  'button:has-text("Continue ➜")',
  'a:has-text("Get Link")',
  'a:has-text("Skip")',
  '.skip-button',
];

const textPriority = ['Get Link','Continue ➜','Continue','Click To Continue','Skip Ad','Skip','Next','Proceed','Open Link','I am not a robot','Verify you are human'];

async function visibleLocator(page, sel) {
  try {
    const loc = page.locator(sel).first();
    const count = await loc.count();
    if (count === 0) return null;
    const box = await loc.boundingBox();
    if (!box || box.width <= 1 || box.height <= 1) return null;
    return loc;
  } catch { return null; }
}

async function getMetaRefreshUrl(page) {
  return await page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="refresh"]');
    if (!m) return null;
    const c = (m.content||'').toLowerCase(); const i = c.indexOf('url=');
    if (i<0) return null;
    let u = c.slice(i+4).trim().replace(/^['"]|['"]$/g,'');
    if (/^https?:\/\//i.test(u)) return u;
    try { const a=document.createElement('a'); a.href=u; return a.href; } catch{return null;}
  }).catch(()=>null);
}

async function resolveUrl(startUrl) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu','--no-first-run','--no-default-browser-check'] });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport:{width:1280,height:800}, javaScriptEnabled:true, ignoreHTTPSErrors:true });
    const page = await context.newPage();
    const tag = startUrl.replace(/^https?:\/\//,'').replace(/\/.*$/,'');
    const log = (s)=>console.log(`[${startUrl}] ${s}`);

    await page.addInitScript(STEALTH);
    page.on('popup', async p => { log('POPUP ' + p.url()); try { await p.close(); }catch{} });

    log('goto');
    try { await page.goto(startUrl, { waitUntil:'domcontentloaded', timeout:60000 }); } catch(e){ log('goto err: '+e.message.slice(0,90)); }
    log('url=' + page.url() + ' title="' + (await page.title().catch(()=>'')) + '"');

    let lastUrl = page.url();
    let stableSince = 0;
    for (let i=0;i<18;i++){
      await page.waitForTimeout(1500);
      try { await page.waitForLoadState('domcontentloaded',{timeout:6000}); }catch{}
      try { await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{}); }catch{}

      // meta refresh
      const mu = await getMetaRefreshUrl(page);
      if (mu && mu !== page.url()) { log('meta-refresh -> '+mu); try{await page.goto(mu,{waitUntil:'domcontentloaded',timeout:50000});}catch{}; lastUrl=page.url(); stableSince=0; log('now '+page.url()); continue; }

      let clicked = false;
      // Priority click loop
      for (const sel of SELECTORS) {
        const loc = await visibleLocator(page, sel);
        if (!loc) continue;
        log('click candidate: ' + sel);
        try {
          await Promise.all([
            page.waitForFunction('true', {timeout: 12000}).catch(()=>{}),
            loc.click({timeout:8000}),
          ]);
          clicked = true;
          break;
        } catch(e){ log('click fail '+sel+': '+e.message.slice(0,70)); }
      }
      // text-based fallback: click visible button whose text starts with a keyword that isn't a consent/close
      if (!clicked) {
        const txtSel = await page.evaluate(() => {
          const kw = ['get link','continue ➜','continue','click to continue','skip ad','skip','next','proceed','open link'];
          const cands = Array.from(document.querySelectorAll('button,a')).filter(el=>{
            const b=el.getBoundingClientRect(); if(b.width<2||b.height<2) return false;
            const t=(el.textContent||'').toLowerCase().trim(); if(!t) return false;
            return kw.some(k=>t.includes(k));
          }).map(el=>({tag:el.tagName, txt:(el.textContent||'').trim().slice(0,30), cls:el.className||''}));
          return cands.length ? cands[0] : null;
        }).catch(()=>null);
        if (txtSel) {
          log('text-click: '+txtSel.tag+' "'+txtSel.txt+'" .'+txtSel.cls);
          try { await page.evaluate((data) => { const els=document.querySelectorAll(data.tag); const kw=['get link','continue ➜','continue','click to continue','skip ad','skip','next','proceed','open link']; for (const e of els){const b=e.getBoundingClientRect(); if(b.width<2||b.height<2) continue; const et=(e.textContent||"").toLowerCase().trim(); if(!et) continue; if(kw.some(k=>et.includes(k))){e.click();return;}}}, {tag: txtSel.tag.toLowerCase()}); clicked=true; } catch(e){log('text-click fail: '+e.message.slice(0,70));}
        }
      }

      if (clicked) {
        const before = page.url();
        try { await page.waitForFunction(`document.location.href !== ${JSON.stringify(before)}`, {timeout:10000}).catch(()=>{}); } catch{}
        await page.waitForTimeout(2500);
        log('after-click url=' + page.url());
        lastUrl = page.url(); stableSince = 0;
        continue;
      }

      const cur = page.url();
      if (cur !== lastUrl) { log('url changed -> '+cur); lastUrl=cur; stableSince=0; continue; }
      else { stableSince += 1500; if (stableSince >= 12000) { log('stable; stopping'); break; } }
    }

    let title = ''; try { title = await page.title(); } catch{}
    log('FINAL TITLE: ' + title.slice(0,150));
    log('FINAL URL: ' + page.url());
    await context.close();
    return { start: startUrl, final: page.url(), title: title.slice(0,150) };
  } finally { await browser.close(); }
}

(async () => {
  const out=[];
  for (const u of targets){ log('LOG','==== '+u+' ===='); try { out.push(await resolveUrl(u)); } catch(e){ log('LOG','FAILED: '+e.message); out.push({start:u,final:'ERROR',title:e.message.slice(0,150)}); } }
  console.log('\n==== FULL SUMMARY ====');
  for (const r of out) console.log('\n'+r.start+'\n   -> '+r.final+'   ['+(r.title||'')+']');
})();
