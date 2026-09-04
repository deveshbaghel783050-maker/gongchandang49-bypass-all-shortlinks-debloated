const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://vplink.in/7h7V2',
  'https://earnlinks.in/funT',
  'https://lksfy.com/xag8se',
];

const INIT = `
window.__pops=[];window.__navTargets=[];window.__allUrls=[];
window.open=(url,name,features)=>{try{window.__pops.push(String(url));window.__navTargets.push(url);}catch(e){} if(typeof url==='string'&&url.indexOf('http')===0){window.__navTargets.push(url);window.location.href=url;}return window;};
const _obs=new ((typeof URL==='function')?MutationObserver:function(){return{observe(){},disconnect(){}}});
if(navigator.webdriver!==undefined){try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined});}catch(e){}}
try{Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});}catch(e){}
try{Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});}catch(e){}
try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});}catch(e){}
document.addEventListener('click',(e)=>{const t=e.target;if(t&&t.tagName==='A'&&(t.getAttribute('target')==='_blank'||t.target==='_blank')){e.preventDefault();window.location.href=t.href;}},true);
`;

// actionable selectors, priority order
const ACTIONS = [
  'a.get-link', '.get-link', '.get-link.btn-primary', '.get-link.btn',
  'a#btn7', '#wpsafe-link > .bt-success', '#open-link > .pro_btn',
  'button#topButton.pro_btn', '#topButton.pro_btn',
  '.rewarded-continue-button', '.button-9',
  'button:has-text("Continue")', 'button:has-text("Continue ➜")',
  'button:has-text("Click To Continue")', 'a:has-text("Get Link")', 'a:has-text("Open Continue")',
];

async function vloc(page, sel){ try { const l=page.locator(sel).first(); const b=await l.boundingBox().catch(()=>null); if(!b||b.width<=1||b.height<=1) return null; const dis=await l.getAttribute('disabled').catch(()=>null); if(dis) return null; return l; }catch(e){return null;} }

async function resolveUrl(startUrl){
  const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu','--no-first-run']});
  const rec = {start:startUrl, urls:[], final:startUrl, title:'', popups:[], notes:[]};
  const urls = rec.urls;
  try {
    const context = await browser.newContext({userAgent:UA,viewport:{width:1280,height:880},ignoreHTTPSErrors:true,bypassCSP:true});
    const page = await context.newPage();
    await page.addInitScript(INIT);
    page.on('popup', p => { try { rec.popups.push(p.url()); }catch{} try{p.close();}catch{}; });
    page.on('pageerror', e => { if(!/ResizeObserver|Cannot set properties/.test(e.message)) rec.notes.push('pageerror: '+e.message.slice(0,80)); });
    const seen = new Set();
    const add = (u) => { if(!seen.has(u)){seen.add(u); urls.push(u);} };
    add(startUrl); console.log('  [url] '+startUrl);

    try { await page.goto(startUrl,{waitUntil:'domcontentloaded',timeout:50000}); } catch(e){ rec.notes.push('goto: '+e.message.slice(0,70)); }
    add(page.url());

    const T0=Date.now();
    while (Date.now()-T0 < 45000){
      const cur = page.url(); add(cur);
      await page.waitForTimeout(2000);
      try { await page.waitForLoadState('domcontentloaded',{timeout:3000}).catch(()=>{}); }catch{}
      // meta refresh
      let mu=null; try { mu=await page.evaluate(()=>{const m=document.querySelector('meta[http-equiv="refresh"]');if(!m)return null;const c=(m.content||'').toLowerCase();const i=c.indexOf('url=');if(i<0)return null;let u=c.slice(i+4).trim().replace(/^['"]|['"]$/g,'');if(/^https?:\/\//i.test(u))return u;try{const a=document.createElement('a');a.href=u;return a.href;}catch{return null;}}); }catch{}
      if(mu && mu!==cur){ console.log('  [meta-refresh] '+mu); add(mu); try{await page.goto(mu,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});}catch{}; continue; }

      // find highest-priority visible, non-disabled actionable button
      let clicked=false;
      for (const sel of ACTIONS){
        let l=null; try{ const loc=page.locator(sel).first(); const b=await loc.boundingBox().catch(()=>null); if(b&&b.width>1&&b.height>1){ const dis=await loc.getAttribute('disabled').catch(()=>null); const dp=await loc.getAttribute('data-processed').catch(()=>null); if(!dis){ l=loc; } } }catch{}
        if(!l) continue;
        console.log('  [click] '+sel+' url='+cur.slice(0,60));
        try {
          await Promise.all([ l.click({timeout:6000}).catch(()=>{}), page.waitForFunction(`document.location.href !== ${JSON.stringify(cur)} || document.location.hostname !== ${JSON.stringify(new URL(cur).hostname)}`,{timeout:9000}).catch(()=>{}) ]);
          clicked=true;
        } catch(e){ rec.notes.push('clickfail '+sel+': '+e.message.slice(0,50)); }
        break; // one click per iteration
      }
      const after = page.url(); add(after);
      if(after!==cur){ console.log('  [nav] '+after); }
      else {
        // no navigation after click; let the page sit for countdown
        if(!clicked){ add(cur); }
      }
    }
    // final capture
    try { rec.title=(await page.title()).slice(0,200); }catch{}
    rec.final=page.url();
    let recorded=[]; try{ recorded=await page.evaluate(()=>window.__navTargets||[]); }catch{}
    for(const u of recorded){ add('win.open:'+u); }
    await context.close();
  } catch(e){ rec.notes.push('FATAL: '+e.message.slice(0,120)); } finally { try{ await browser.close(); }catch{}; }
  return rec;
}

(async()=>{
  const results=[];
  for(const u of targets){ console.log('\n========== '+u+' =========='); const r=await resolveUrl(u); results.push(r); }
  console.log('\n\n========== FINAL ==========');
  for(const r of results){
    console.log('\n'+r.start);
    console.log('  FINAL: '+r.final+'   ['+(r.title||'')+']');
    if(r.popups.length) console.log('  popups: '+r.popups.join(' | '));
    if(r.notes.length) console.log('  notes: '+r.notes.slice(0,5).join(' | '));
    console.log('  full chain:');
    r.urls.forEach((h,i)=>console.log('     '+i+'. '+String(h).slice(0,158)));
  }
})();
