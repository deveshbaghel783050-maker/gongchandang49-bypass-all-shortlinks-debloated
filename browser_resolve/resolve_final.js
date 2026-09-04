const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://vplink.in/7h7V2',
  'https://earnlinks.in/funT',
  'https://lksfy.com/xag8se',
];

const INIT = `
window.__chain = [];
window.__pops = [];
window.__navTargets = [];
window.open = (url, name, features) => { try { window.__pops.push(String(url)); } catch(e){} if (typeof url === 'string' && url.indexOf('http')===0) { window.__navTargets.push(url); window.location.href = url; } return window; };
if (navigator.webdriver !== undefined) { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch(e){} }
try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] }); } catch(e){}
try { Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] }); } catch(e){}
try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); } catch(e){}
document.addEventListener('click', (e) => { const t=e.target; if (t && t.tagName==='A' && (t.getAttribute('target')==='_blank'||t.target==='_blank')) { e.preventDefault(); window.location.href=t.href; } }, true);
`;

const READY = [
  'a.get-link', '.get-link.btn', '.get-link',
  '#wpsafe-link > .bt-success', 'a#btn7', '#open-link > .pro_btn',
  'button#topButton.pro_btn', '#topButton.pro_btn', '.pro_btn',
  '.rewarded-continue-button', '.button-9', '.get-link.btn-primary',
  'button:innerText("Continue")', 'button:innerText("Continue ➜")',
  'a:innerText("Click To Continue")', 'button:innerText("Click To Continue")',
  'a:innerText("Get Link")', 'a:innerText("Open Continue")',
];

async function visCount(page, sel){ try { const l=page.locator(sel); const n=await l.count(); if(!n) return 0; let v=0; for(let i=0;i<n;i++){const b=await l.nth(i).boundingBox().catch(()=>null); if(b&&b.width>1&&b.height>1) v++;} return v;} catch(e){ return 0; } }
async function firstVisible(page, sel){ try { const l=page.locator(sel).first(); const b=await l.boundingBox().catch(()=>null); return (b&&b.width>1&&b.height>1)?l:null; } catch(e){ return null; } }

async function resolveUrl(startUrl){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu','--disable-extensions','--no-first-run']});
  try {
    const context=await browser.newContext({userAgent:UA,viewport:{width:1280,height:880},javaScriptEnabled:true,ignoreHTTPSErrors:true,bypassCSP:true});
    const page=await context.newPage();
    await page.addInitScript(INIT);
    const chain=[]; const pops=[];
    page.on('popup',async p=>{ try { const u=p.url(); pops.push(u); console.log('[popup] '+u); if(u && u.indexOf('http')===0) { await p.close(); await page.goto(u,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{}); } }catch{} });
    console.log('[chain] '+startUrl); chain.push(startUrl);
    try { await page.goto(startUrl,{waitUntil:'domcontentloaded',timeout:60000}); } catch(e){ console.log('[goto err] '+e.message.slice(0,80)); }
    let lastUrl=page.url(); let stable=0;
    for (let i=0;i<24;i++){
      await page.waitForTimeout(2000);
      try { await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{}); } catch{}
      // meta refresh
      let mu; try { mu=await page.evaluate(()=>{const m=document.querySelector('meta[http-equiv="refresh"]');if(!m)return null;const c=(m.content||'').toLowerCase();const i=c.indexOf('url=');if(i<0)return null;let u=c.slice(i+4).trim().replace(/^['"]|['"]$/g,'');if(/^https?:\/\//i.test(u))return u;try{const a=document.createElement('a');a.href=u;return a.href;}catch{return null;}}); } catch{}
      if (mu && mu!==page.url()){ console.log('[meta-refresh] '+mu); chain.push(mu); try{await page.goto(mu,{waitUntil:'domcontentloaded',timeout:50000}).catch(()=>{});}catch{} lastUrl=page.url(); stable=0; continue; }
      // click any visible ready button (priority order)
      let clicked=false;
      for (const sel of READY){
        const l=await firstVisible(page, sel);
        if (!l) continue;
        console.log('[click] '+sel);
        try { await Promise.all([ page.waitForFunction(`document.location.href !== ${JSON.stringify(page.url())}`,{timeout:9000}).catch(()=>{}), l.click({timeout:7000}) ]); clicked=true; }
        catch(e){ console.log('[click fail] '+e.message.slice(0,70)); }
        break;
      }
      if (clicked){
        // wait/observe nav
        const before=page.url();
        try { await page.waitForFunction(`document.location.href !== ${JSON.stringify(before)}`,{timeout:10000}).catch(()=>{}); } catch(e){}
        await page.waitForTimeout(1500);
        const cur=page.url();
        if (cur!==lastUrl){ console.log('[nav] '+cur); chain.push(cur); lastUrl=cur; stable=0; } else { stable+=2000; if(stable>=8000){ console.log('[stable]'); break; } }
        continue;
      }
      const cur=page.url();
      if (cur!==lastUrl){ console.log('[nav] '+cur); chain.push(cur); lastUrl=cur; stable=0; continue; }
      else { stable+=2000; if (stable>=10000){ console.log('[stable at] '+cur); break; } }
    }
    // capture recorded window.open / location targets from page context
    let recorded=[]; try { recorded = await page.evaluate(()=>window.__navTargets||[]); }catch{}
    try { const p2=await page.evaluate(()=>window.__pops||[]); if(p2.length) console.log('[pops] '+(p2.join(' | ')||'(none)')); }catch{}
    console.log('[FINAL] '+page.url());
    let title=''; try{title=await page.title();}catch{}
    console.log('[TITLE] '+(title||'').slice(0,140));
    for (const u of recorded) { if(!chain.includes(u)) { console.log('[recorded-target] '+u); chain.push(u); } }
    await context.close();
    return {start:startUrl, chain, final:page.url(), title:(title||'').slice(0,140)};
  } finally { await browser.close(); }
}

(async()=>{
  const out=[];
  for (const u of targets){ console.log('\n========== '+u+' ==========');
    try { out.push(await resolveUrl(u)); } catch(e){ console.log('[FAIL] '+e.message.slice(0,120)); out.push({start:u,chain:[],final:'ERROR',title:e.message.slice(0,120)}); }
  }
  console.log('\n========== CHAINS ==========');
  for (const r of out){
    console.log('\n'+r.start+'\n  final: '+r.final+'   ['+(r.title)+']');
    console.log('  hops:');
    (r.chain||[]).forEach((h,i)=>console.log('     '+i+'. '+h.slice(0,150)));
  }
})();
