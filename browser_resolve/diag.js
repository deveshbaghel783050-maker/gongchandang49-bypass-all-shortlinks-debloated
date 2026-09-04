const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const target = process.argv[2] || 'https://lksfy.com/xag8se';

const STEALTH = `
if (navigator.webdriver !== undefined) { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch(e){} }
try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] }); } catch(e){}
try { Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] }); } catch(e){}
try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); } catch(e){}
window.open = (url) => { if (typeof url === 'string' && /^https?:\\/\\/i.test(url)) { window.location.href = url; } return window; };
document.addEventListener('click', (e) => { const t=e.target; if (t && t.tagName==='A' && (t.getAttribute('target')==='_blank'||t.target==='_blank')) { e.preventDefault(); window.location.href=t.href; } }, true);
`;

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu']});
  try {
    const context = await browser.newContext({ userAgent:UA, viewport:{width:1280,height:800}, ignoreHTTPSErrors:true });
    const page = await context.newPage();
    await page.addInitScript(STEALTH);
    console.log('LOAD '+target);
    await page.goto(target, { waitUntil:'domcontentloaded', timeout:60000 }).catch(e=>console.log('goto err '+e.message.slice(0,80)));
    await page.waitForTimeout(18000);
    const info = await page.evaluate(() => {
      const sel = '#open-link, #wpsafe-link, .pro_btn, .rewarded-continue-button, .button-9, a.get-link, .get-link, button';
      const els = Array.from(document.querySelectorAll(sel));
      return {
        url: location.href,
        title: document.title,
        metaRefresh: (()=>{const m=document.querySelector('meta[http-equiv="refresh"]')||null;return m?m.content:'';})(),
        actionable: els.filter(e=>{const b=e.getBoundingClientRect();return b.width>1&&b.height>1;}).map(e=>({
          tag: e.tagName, cls: e.className||'', id: e.id||'', txt: (e.textContent||'').trim().slice(0,40),
          href: e.getAttribute('href')||'', onclick: (e.getAttribute('onclick')||'').slice(0,120),
          disabled: e.disabled,
          outer: e.outerHTML.slice(0,400),
        })),
      };
    });
    console.log('URL: '+info.url);
    console.log('TITLE: '+info.title);
    console.log('META-REFRESH: '+info.metaRefresh);
    console.log('ACTIONABLE COUNT: '+info.actionable.length);
    for (const e of info.actionable) console.log('  <'+e.tag+'> cls="'+e.cls+'" id="'+e.id+'" txt="'+e.txt+'" href="'+e.href+'" dis='+e.disabled+' onclick="'+e.onclick+'"');
    console.log('--- sample outerHTML ---');
    for (const e of info.actionable.slice(0,4)) console.log(e.outer.replace(/\n/g,' '));
    await context.close();
  } finally { await browser.close(); }
})();
