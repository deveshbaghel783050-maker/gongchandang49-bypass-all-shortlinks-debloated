const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://vplink.in/7h7V2',
  'https://earnlinks.in/funT',
  'https://lksfy.com/xag8se',
];

const INIT = `
window.__pops=[];window.__navTargets=[];
window.open=(url,name,features)=>{try{window.__pops.push(String(url));}catch(e){} if(typeof url==='string'&&url.indexOf('http')===0){window.__navTargets.push(url);window.location.href=url;}return window;};
if(navigator.webdriver!==undefined){try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined});}catch(e){}}
try{Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});}catch(e){}
try{Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});}catch(e){}
try{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});}catch(e){}
document.addEventListener('click',(e)=>{const t=e.target;if(t&&t.tagName==='A'&&(t.getAttribute('target')==='_blank'||t.target==='_blank')){e.preventDefault();window.location.href=t.href;}},true);
`;

const READY = [
  'a.get-link', '.get-link', '.get-link.btn-primary', '.get-link.btn',
  'a#btn7', '#wpsafe-link > .bt-success', '#wpsafe-link a',
  '#open-link > .pro_btn', 'button#topButton.pro_btn', '#topButton.pro_btn', '.pro_btn',
  '.rewarded-continue-button', '.button-9',
  'button:has-text("Continue")', 'button:has-text("Continue ➜")',
  'button:has-text("Click To Continue")', 'a:has-text("Get Link")',
];

async function firstVisibleLocator(page, sel){
  try { const l = page.locator(sel).first(); const b = await l.boundingBox().catch(()=>null); return (b&&b.width>1&&b.height>1)?l:null; } catch(e){ return null; }
}

async function resolveUrl(startUrl){
  const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled','--ignore-certificate-errors','--disable-dev-shm-usage','--disable-web-security','--disable-gpu','--no-first-run','--disable-extensions']});
  const out = {start:startUrl, chain:[], final:startUrl, title:'', notes:[]};
  try {
    const context = await browser.newContext({userAgent:UA,viewport:{width:1280,height:880},ignoreHTTPSErrors:true,bypassCSP:true});
    const page = await context.newPage();
    await page.addInitScript(INIT);
    page.on('popup', p => { try { const u=p.url(); out.chain.push('popup:'+u); }catch{}; try{p.close();}catch{}; });
    page.on('framenavigated', f => { if(f===page.mainFrame()){ try{ out.chain.push(f.url()); }catch{} } });
    page.on('pageerror', e => { if(!e.message.includes('ResizeObserver')) console.log('  [pageerror] '+e.message.slice(0,100)); });
    console.log('[goto] '+startUrl); out.chain.push(startUrl);
    try { await page.goto(startUrl,{waitUntil:'domcontentloaded',timeout:50000}); } catch(e){ out.notes.push('goto err: '+e.message.slice(0,80)); }
    let lastUrl = page.url(); let stable = 0;
    const T0 = Date.now();
    while (Date.now()-T0 < 55000){
      await page.waitForTimeout(1500);
      try { await page.waitForLoadState('domcontentloaded',{timeout:4000}).catch(()=>{}); }catch{}
      let mu=null; try { mu=await page.evaluate(()=>{const m=document.querySelector('meta[http-equiv="refresh"]');if(!m)return null;const c=(m.content||'').toLowerCase();const i=c.indexOf('url=');if(i<0)return null;let u=c.slice(i+4).trim().replace(/^['"]|['"]$/g,'');if(/^https?:\/\//i.test(u))return u;try{const a=document.createElement('a');a.href=u;return a.href;}catch{return null;}}); }catch{}
      if(mu && mu!==page.url()){ console.log('[meta-refresh] '+mu); try{await page.goto(mu,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});}catch{}; lastUrl=page.url(); stable=0; continue; }
      let clicked=false;
      for(const sel of READY){
        const l=await firstVisibleLocator(page,sel); if(!l) continue;
        console.log('[click] '+sel+' ('+startUrl+')');
        try { await Promise.all([ l.click({timeout:6000}).catch(()=>{}), page.waitForFunction(`document.location.href !== ${JSON.stringify(page.url())}`,{timeout:8000}).catch(()=>{}) ]); clicked=true; } catch(e){ out.notes.push('click fail '+e.message.slice(0,60)); }
        break;
      }
      const cur=page.url();
      if(cur!==lastUrl){ console.log('[nav] '+cur); out.chain.push(cur); lastUrl=cur; stable=0; continue; }
      if(!clicked){ stable+=1500; if(stable>=14000){ console.log('[stable] '+cur); break; } }
      else { stable=0; }
    }
    // captured window.open targets
    let recorded=[]; try{ recorded=await page.evaluate(()=>window.__navTargets||[]); }catch{}
    let pops=[]; try{ pops=await page.evaluate(()=>window.__pops||[]); }catch{}
    for(const u of recorded){ if(!out.chain.includes(u)){ out.chain.push('win.open:'+u); } }
    for(const p of pops){ if(!out.chain.includes('popup:'+p)&&!out.chain.includes('win.open:'+p)){ out.chain.push('popup:'+p); } }
    try{ out.title = (await page.title()).slice(0,150); }catch{}
    out.final = page.url();
    await context.close();
  } catch(e){ out.notes.push('FATAL: '+e.message.slice(0,100)); } finally { try{ await browser.close(); }catch{}; }
  return out;
}

(async()=>{
  const results=[];
  for(const u of targets){ console.log('\n========== '+u+' =========='); const r=await resolveUrl(u); results.push(r); }
  console.log('\n\n========== FINAL RESULTS ==========');
  for(const r of results){
    console.log('\n'+r.start);
    console.log('  final: '+r.final+'  ['+(r.title||'')+']');
    if(r.notes.length) console.log('  notes: '+(r.notes.join(' | ')));
    console.log('  hop-chain:');
    (r.chain||[]).forEach((h,i)=>console.log('     '+i+'. '+String(h).slice(0,155)));
  }
})();
