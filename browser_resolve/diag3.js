const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const target = process.argv[2] || 'https://lksfy.com/xag8se';
const opened = [];
const STEALTH = `
window._origOpen = window.open;
window.open = (url, name, features) => { try { opened.push({url:url, name:name||''}); } catch{}; if (typeof url === 'string' && /^https?:\\/\\/i.test(url)) { window.location.href = url; } return window; };
const _ol=window.location; try{Object.defineProperty(window,'location',{get:()=>_ol,configurable:true});const orig=window.location; Object.defineProperty(window.location,'__noop',{get:()=>{}}); }catch(e){}
`;
(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu']});
  try {
    const context = await browser.newContext({ userAgent:UA, viewport:{width:1280,height:880}, ignoreHTTPSErrors:true });
    const page = await context.newPage();
    await page.addInitScript(STEALTH);
    page.on('popup', p=>{ console.log('POPUP '+p.url()); });
    const nav = []; page.on('framenavigated', f=>{ if(f===page.mainFrame()) nav.push(f.url()); });
    console.log('LOAD '+target);
    await page.goto(target, { waitUntil:'domcontentloaded', timeout:60000 }).catch(e=>console.log('goto err '+e.message.slice(0,80)));
    // poll 25s
    const start=Date.now();
    let lastBtnText='';
    while (Date.now()-start < 25000) {
      const s = await page.evaluate(() => {
        const b = document.querySelector('#topButton');
        const timer = document.querySelector('#bottom-container-timer, .timer, [id*=\"count\"], [class*=\"count\" i], [class*=\"timer\" i]');
        let timerTxt='';try{timerTxt=timer?timer.textContent.trim().slice(0,40):'';}catch{}
        let btnTxt='';let btnDis=false;let btnHref='';
        if(b){btnTxt=(b.textContent||'').trim().slice(0,30);btnDis=b.disabled;btnHref=b.getAttribute('href')||'';}
        const bt2 = document.querySelector('#wpsafe-link > .bt-success, #wpsafe-link a, a#btn7');
        const bt2info = bt2?((bt2.textContent||'').trim().slice(0,20)+' | '+((bt2.getAttribute('href')||'').slice(0,80))):'none';
        const refresh = document.querySelector('#wpsafe-link');
        return {btnTxt, btnDis, btnHref, timerTxt, bt2: bt2info, url: location.href};
      }).catch(()=>({}));
      if (s.btnTxt !== lastBtnText) { console.log(`[${Math.round((Date.now()-start)/1000)}s] btn="${s.btnTxt}" dis=${s.btnDis} href="${s.btnHref}" timer="${s.timerTxt}" bt2="${s.bt2}" url=${s.url}`); lastBtnText=s.btnTxt; }
      await page.waitForTimeout(2000);
    }
    console.log('NAVX events: ' + nav.join(' | '));
    console.log('OPENED (window.open captured): ' + JSON.stringify(opened).slice(0,500));
    console.log('FINAL URL: '+page.url());
    let title='';try{title=await page.title();}catch{}
    console.log('FINAL TITLE: '+title.slice(0,120));
    await context.close();
  } finally { await browser.close(); }
})();
