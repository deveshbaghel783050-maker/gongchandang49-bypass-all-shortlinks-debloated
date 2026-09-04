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
    const context = await browser.newContext({ userAgent:UA, viewport:{width:1280,height:880}, ignoreHTTPSErrors:true });
    const page = await context.newPage();
    await page.addInitScript(STEALTH);
    const reqs=[]; page.on('request', r=>{ if(!r.url().startsWith('data:')) reqs.push(r.method()+' '+r.url().slice(0,110)); });
    page.on('popup', p=>{ console.log('POPUP '+p.url()); });
    page.on('framenavigated', f=>{ if(f===page.mainFrame()) console.log('NAV '+f.url()); });
    page.on('pageerror', e=>console.log('PAGEERR '+e.message.slice(0,120)));

    console.log('LOAD '+target);
    await page.goto(target, { waitUntil:'domcontentloaded', timeout:60000 }).catch(e=>console.log('goto err '+e.message.slice(0,80)));
    await page.waitForTimeout(3000);

    const dump = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe')).map(i=>i.src||i.getAttribute('src')||'#inline').slice(0,15);
      const captcha = Array.from(document.querySelectorAll('[class*="captcha"],[class*="hcaptcha"],[class*="turnstile"],[class*="cf-challenge"],[id*="captcha"],[id*="turnstile"],iframe[src*="turnstile"],iframe[src*="hcaptcha"],iframe[src*="recaptcha"]')).map(e=>e.tagName+'#'+e.id+' .'+e.className||'').slice(0,10);
      const timer = Array.from(document.querySelectorAll('[class*="count"],[class*="timer"],[id*="count"],[class*="cd"],[id*="time"]')).map(e=>e.tagName+'#'+e.id+' .'+e.className+' >> '+(e.textContent||'').trim().slice(0,30)).slice(0,10);
      const btn = document.querySelector('#topButton, .pro_btn');
      let parent = '';
      if (btn && btn.parentElement) { let n=btn.parentElement; for(let i=0;i<3&&n;i++){parent+=n.outerHTML.slice(0,300);n=n.parentElement;} }
      return { iframes, captcha, timer, btnOuter: btn?btn.outerHTML.slice(0,500):'none', parent };
    });
    console.log('IFRAMES: '+JSON.stringify(dump.iframes));
    console.log('CAPTCHA-ELS: '+JSON.stringify(dump.captcha));
    console.log('TIMER-ELS: '+JSON.stringify(dump.timer));
    console.log('BTN-OUTER: '+dump.btnOuter.slice(0,400));
    console.log('--- capturing requests 6s ---'); const t0=Date.now();
    while(Date.now()-t0<6000){ await page.waitForTimeout(1500); }
    console.log('PRE-CLICK REQS: '+(reqs.slice(-12).join(' | ')||'(none)'));

    // click topButton
    try {
      const b = await page.$('#topButton');
      if (b){ await b.click().catch(e=>console.log('click err '+e.message.slice(0,60))); console.log('CLICKED #topButton'); }
      else console.log('#topButton not found');
    } catch(e){ console.log('click exc '+e.message.slice(0,80)); }

    reqs.length=0;
    await page.waitForTimeout(12000);
    console.log('POST-CLICK URL: '+page.url());
    console.log('POST-CLICK TITLE: '+ (await page.title().catch(()=>'')));
    console.log('POST-CLICK REQS: '+(reqs.slice(-20).join(' | ')||'(none)'));
    const after = await page.evaluate(()=>{const iframes=Array.from(document.querySelectorAll('iframe')).map(i=>i.src||'#inline');const btn=document.querySelector('#topButton, .rewarded-continue-button, a.get-link, .bt-success');return {iframes: iframes.slice(0,10), urlAfter: location.href, btnTxt: btn?((btn.textContent||'').trim().slice(0,40)):'none', btnCls: btn?btn.className:''};});
    console.log('AFTER iframes: '+JSON.stringify(after.iframes));
    console.log('AFTER url: '+after.urlAfter+' btn='+after.btnTxt+' .'+after.btnCls);
    await context.close();
  } finally { await browser.close(); }
})();
