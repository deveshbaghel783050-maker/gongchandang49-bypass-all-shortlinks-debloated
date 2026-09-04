const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const target = process.argv[2] || 'https://lksfy.com/xag8se';
const AD_OR_SELF = /googlesyndication|pagead|doubleclick|rtmark|my\.rtmark|ldrws|255md|n6wxm|omg10|cloudfront|facebook\.com|twitter\.com|x\.com|whatsapp|telegram|t\.me|reddit|google\.com|gstatic|googleapis|fonts\.|recruitmentaim\.in|jobustecher\.letest25\.co|lksfy\.com|earnlinks\.in|w3\.org|schema\.org/;
(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu','--disable-blink-features=AutomationControlled']});
  try {
    const context = await browser.newContext({ userAgent:UA, viewport:{width:1280,height:880}, ignoreHTTPSErrors:true });
    const page = await context.newPage();
    console.log('LOAD '+target);
    await page.goto(target, { waitUntil:'networkidle', timeout:60000 }).catch(e=>console.log('goto err '+e.message.slice(0,80)));
    await page.waitForTimeout(6000);
    const data = await page.evaluate(() => {
      const self = location.hostname;
      const out=[];
      document.querySelectorAll('a[href], [data-url], [data-href], [data-link], [data-destination]').forEach(el=>{
        const h=(el.getAttribute('href')||el.getAttribute('data-url')||el.getAttribute('data-href')||el.getAttribute('data-link')||el.getAttribute('data-destination'))||'';
        if(/^https?:\/\//i.test(h)) out.push(h+'  [via <'+el.tagName+'>.'+(el.className||'')+']');
      });
      document.querySelectorAll('meta[http-equiv="refresh"]').forEach(m=>out.push('META-REFRESH: '+(m.content||'')));
      const scripts = Array.from(document.querySelectorAll('script')).map(s=>s.textContent||'');
      const blob = scripts.join('\n');
      const urls=[]; const re=/https?:\/\/[A-Za-z0-9._~:/?#'%&@\-+=,;,%]+\.[A-Za-z]{2,}(?![^\s"'\x27<>]*\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|mp4|webp))[\w\-\/._?=&%#]*/g;
      let m; while((m=re.exec(blob)) && urls.length<40){ urls.push(m[0]); }
      return {hrefs: out.slice(0,60), scriptUrls: urls, htmlLen: document.documentElement.outerHTML.length};
    }).catch(e=>({error:e.message}));
    console.log('PAGE HTML LEN: '+(data.htmlLen||'?'));
    console.log('--- HREF / data-* attributes ---');
    (data.hrefs||[]).forEach(h=>console.log('  '+h.slice(0,160)));
    console.log('--- URLs inside <script> (filtered) ---');
    (data.scriptUrls||[]).filter(u=>!AD_OR_SELF.test(u)).slice(0,30).forEach(u=>console.log('  '+u.slice(0,160)));
    if(data.error) console.log('EVAL ERR '+data.error.slice(0,120));
    console.log('FINAL URL: '+page.url());
    await context.close();
  } finally { await browser.close();}
})();
