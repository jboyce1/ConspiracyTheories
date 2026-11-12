#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { SITE, safeUrl, youtubeId, isCoursePage, canonicalPage, kind, embeddedUrls, slug, downloadTarget, escapeHtml, compare } from './lib.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
function option(flag, fallback) { const i = args.indexOf(flag); if (i < 0) return fallback; if (!args[i+1] || args[i+1].startsWith('--')) throw Error(`Missing value for ${flag}`); return args[i+1]; }
if (has('--help')) {
  console.log(`SharePoint course audit (read-only)\n\nnode audit.mjs [options]\n  --login-only        Open the dedicated browser, wait for SharePoint sign-in, then save session\n  --headless          Reuse an existing signed-in session without a visible window\n  --discover          Also visit course pages linked from the 12 known lessons and homepage\n  --download          Download same-site documents and images (max 100 MB each)\n  --download-media    Also download same-site audio/video; requires --download\n  --screenshots       Capture each rendered lesson locally\n  --snapshots         Save rendered HTML and stored SharePoint page content locally\n  --browser PATH      Chromium/Chrome executable (otherwise auto-detected)\n  --profile PATH      Dedicated browser profile (default: .sharepoint-audit/profile)\n  --out PATH          Audit output directory (default: .sharepoint-audit/latest)\n  --pages PATH        Seed JSON file (default: pages.json)\n  --max-pages N       Maximum pages, including discovered pages (default: 40)\n  --login-timeout N   Seconds to wait for manual sign-in (default: 600)\n\nNo passwords are accepted or stored by this script. Sign in directly in the browser.\nSession, snapshots, and reports are private local files; do not publish them.`);
  process.exit(0);
}
const allowed = new Set(['--help','--login-only','--headless','--discover','--download','--download-media','--screenshots','--snapshots','--browser','--profile','--out','--pages','--max-pages','--login-timeout']);
const valueFlags = new Set(['--browser','--profile','--out','--pages','--max-pages','--login-timeout']);
for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error(`Unknown option: ${args[i]}`);if(valueFlags.has(args[i]))i++;}
const maxPages = Number(option('--max-pages','40')), loginMs = Number(option('--login-timeout','600'))*1000;
if(!Number.isInteger(maxPages)||maxPages<1||!Number.isFinite(loginMs)||loginMs<1000)throw Error('Invalid page limit or login timeout');
if(has('--download-media')&&!has('--download'))throw Error('--download-media requires --download');
const profile = path.resolve(option('--profile',path.join(ROOT,'.sharepoint-audit/profile')));
const output = path.resolve(option('--out',path.join(ROOT,'.sharepoint-audit/latest')));
if(profile===output || profile.startsWith(output+path.sep) || output.startsWith(profile+path.sep))throw Error('Keep the browser profile and audit output in separate directories');
process.umask(0o077);
await fs.mkdir(profile,{recursive:true,mode:0o700});await fs.mkdir(output,{recursive:true,mode:0o700});
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
async function browserPath(){
 if(option('--browser'))return path.resolve(option('--browser'));
 const base=path.join(os.homedir(),'.cache/ms-playwright');
 for(const name of (await fs.readdir(base).catch(()=>[])).filter(n=>/^chromium-\d+$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))){
  for(const inner of ['chrome-linux64/chrome','chrome-linux/chrome']){const p=path.join(base,name,inner);if(await exists(p))return p;}
 }
 for(const p of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(await exists(p))return p;
 throw Error('No Chromium browser found. Run: npx playwright-core install chromium');
}
const seeds=JSON.parse(await fs.readFile(path.resolve(option('--pages',path.join(HERE,'pages.json'))),'utf8'));
if(!Array.isArray(seeds)||!seeds.length||seeds.some(s=>!isCoursePage(s.url)))throw Error('Seed pages must be lesson .aspx pages inside this SharePoint course');
const queue=[...seeds];if(has('--discover'))queue.push({title:'Course homepage',url:SITE});
const results=[],downloads=[],visited=new Set();
const summary={started:new Date().toISOString(),site:SITE,pages:results,downloads,complete:false};
async function localFiles(dir){const entries=await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]);const out=[];for(const e of entries){if(e.isDirectory())out.push(...await localFiles(path.join(dir,e.name)));else out.push(e.name);}return out;}
const media=JSON.parse(await fs.readFile(path.join(ROOT,'scripts/media.json'),'utf8'));
const files=await localFiles(path.join(ROOT,'assets'));
async function writeReports(){
 const data=JSON.stringify(summary,null,2);await fs.writeFile(path.join(output,'inventory.json'),data);
 const rows=results.flatMap(p=>p.items.map(i=>`<tr><td>${escapeHtml(p.title)}</td><td>${escapeHtml(i.kind)}</td><td>${escapeHtml(i.status)}</td><td><a href="${escapeHtml(i.url)}" rel="noreferrer">${escapeHtml(i.label||i.url)}</a><br><small>${escapeHtml(i.source)}</small></td></tr>`)).join('');
 const errors=results.filter(p=>p.warnings.length||p.error).map(p=>`<li><strong>${escapeHtml(p.title)}</strong>: ${escapeHtml([p.error,...p.warnings].filter(Boolean).join('; '))}</li>`).join('');
 await fs.writeFile(path.join(output,'report.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>SharePoint course audit</title><style>body{font:16px system-ui;max-width:1200px;margin:32px auto;padding:16px;line-height:1.6}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ccc;text-align:left;vertical-align:top;overflow-wrap:anywhere}small{color:#555}</style><h1>SharePoint course audit</h1><p>${escapeHtml(summary.started)} · ${results.length} pages · ${summary.complete?'Run finished':'Partial run'}</p><p>This local report may contain private course links. “Review” means the resource needs checking, not that it is necessarily missing. No-match filename comparisons are approximate.</p><h2>Coverage and warnings</h2><ul>${errors||'<li>No page errors recorded.</li>'}</ul><h2>Media and links</h2><table><thead><tr><th>Page</th><th>Type</th><th>Comparison</th><th>Resource</th></tr></thead><tbody>${rows}</tbody></table>`);
 const videos=results.flatMap(p=>p.items.filter(i=>i.kind==='video').map(i=>({page:p.title,...i})));
 await fs.writeFile(path.join(output,'videos.json'),JSON.stringify(videos,null,2));
}
async function signedIn(page){
 try{return new URL(page.url()).origin===new URL(SITE).origin && new URL(page.url()).pathname.toLowerCase().startsWith(new URL(SITE).pathname.toLowerCase()) && await page.locator('#spPageCanvasContent, [data-automation-id="Canvas"], .CanvasComponent').count()>0;}catch{return false;}
}
async function waitForLogin(page){
 const start=Date.now();while(Date.now()-start<loginMs){if(await signedIn(page))return;if(page.isClosed())throw Error('Browser closed before sign-in finished');await page.waitForTimeout(1000);}
 throw Error('Sign-in timed out. Re-run and finish Microsoft sign-in in the browser.');
}
async function storedPage(page,url){
 const file=new URL(url).pathname;
 if(!isCoursePage(url))return {ok:false,error:'Homepage has no Site Pages file selected'};
 const endpoint=SITE+"/_api/web/GetFileByServerRelativeUrl('"+decodeURIComponent(file).replaceAll("'","''")+"')/ListItemAllFields?$select=Title,CanvasContent1,LayoutWebpartsContent";
 return page.evaluate(async endpoint=>{
  try{const r=await fetch(endpoint,{credentials:'same-origin',headers:{Accept:'application/json;odata=nometadata'}});if(!r.ok)return {ok:false,status:r.status,error:'Stored page content was unavailable'};return {ok:true,data:await r.json()};}
  catch{return {ok:false,error:'Stored page request failed'};}
 },endpoint);
}
async function renderAndExpand(page){
 await page.locator('#spPageCanvasContent,[data-automation-id="Canvas"]').first().waitFor({timeout:30000});
 // Open native details and explicitly labelled collapsed content sections, never edit/submit buttons.
 await page.evaluate(()=>document.querySelectorAll('main details,[role="main"] details').forEach(d=>d.open=true));
 for(const b of await page.locator('[data-automation-id="CanvasZone"] button[aria-expanded="false"], #spPageCanvasContent button[aria-expanded="false"]').all()){
  const name=await b.getAttribute('aria-label')||await b.innerText().catch(()=>'');
  if(/expand|show more/i.test(name))await b.click({timeout:1500}).catch(()=>{});
 }
 let stable=0,oldHeight=0;
 for(let n=0;n<45;n++){
  const h=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight));
  await page.evaluate(()=>window.scrollBy(0,Math.max(500,innerHeight*.8)));
  // SharePoint sometimes scrolls an inner canvas container instead of the window.
  await page.evaluate(()=>{for(const e of document.querySelectorAll('[data-is-scrollable="true"],main,[role="main"],#spPageCanvasContent'))if(e.scrollHeight>e.clientHeight+200)e.scrollTop+=Math.max(500,e.clientHeight*.8);});
  await page.waitForTimeout(400);
  const bottom=await page.evaluate(()=>{const nodes=[...document.querySelectorAll('[data-is-scrollable="true"],main,[role="main"],#spPageCanvasContent')].filter(e=>e.scrollHeight>e.clientHeight+200);return scrollY+innerHeight>=document.documentElement.scrollHeight-10&&nodes.every(e=>e.scrollTop+e.clientHeight>=e.scrollHeight-10);});
  stable=bottom&&h===oldHeight?stable+1:0;oldHeight=h;if(stable>=3)break;
 }
 await page.waitForTimeout(1800);
}
async function captureFrame(frame){
 return frame.evaluate(()=>{
  const root=document.querySelector('#spPageCanvasContent')||document.querySelector('main,[role="main"]')||document.body;
  const items=[];
  for(const e of root.querySelectorAll('a[href],iframe[src],video[src],audio[src],source[src],img[src],[data-sp-originalimgsrc]')){
   const raw=e.getAttribute('data-sp-originalimgsrc')||e.getAttribute('href')||e.getAttribute('src');
   if(raw)items.push({url:new URL(raw,location.href).href,label:e.getAttribute('title')||e.getAttribute('alt')||e.textContent?.trim().slice(0,200)||'',tag:e.tagName.toLowerCase()});
  }
  const controls=[...root.querySelectorAll('[data-sp-controldata],[data-sp-webpartdata]')].map(e=>[e.getAttribute('data-sp-controldata'),e.getAttribute('data-sp-webpartdata')]).flat().filter(Boolean);
  const empty=[...root.querySelectorAll('[data-viewport-id]')].filter(e=>/Embed|Video|Stream/.test(e.getAttribute('data-viewport-id'))&&!e.querySelector('iframe,video,audio,a[href]')).map(e=>({id:e.getAttribute('data-viewport-id'),text:e.textContent?.trim().slice(0,100)}));
  return {items,controls,empty};
 });
}
async function download(context,item){
 const t=downloadTarget(item.url);if(!t)return;
 if(['video','audio'].includes(t.kind)&&!has('--download-media'))return;
 if(downloads.some(d=>d.filename===t.filename))return;
 const record={url:item.url,filename:t.filename};downloads.push(record);
 try{
  const response=await context.request.get(t.api,{timeout:60000,maxRedirects:0});
  if(!response.ok())throw Error('HTTP '+response.status());
  const h=response.headers();if(/text\/html|application\/json/.test(h['content-type']||''))throw Error('Received a login or API response instead of a file');
  if(Number(h['content-length'])>100*1024*1024)throw Error('File exceeds 100 MB limit');
  const body=await response.body();if(body.length>100*1024*1024)throw Error('File exceeds 100 MB limit');
  await fs.mkdir(path.join(output,'downloads'),{recursive:true});await fs.writeFile(path.join(output,'downloads',t.filename),body);record.bytes=body.length;record.status='downloaded';
  await response.dispose();
 }catch(e){record.status='failed';record.error=String(e.message).replace(/https?:\/\/\S+/g,'[URL]');}
}
let context;
try{
 const executablePath=await browserPath();
 console.log('Opening dedicated audit browser. Sign in to Microsoft/SharePoint yourself, including MFA.');
 console.log('Your normal browser profile is not used. Audit output: '+output);
 context=await chromium.launchPersistentContext(profile,{executablePath,headless:has('--headless'),viewport:{width:1440,height:1000},acceptDownloads:false});
 const page=context.pages()[0]||await context.newPage();
 await page.goto(seeds[0].url,{waitUntil:'domcontentloaded',timeout:60000});
 if(!await signedIn(page)){
  if(has('--headless'))throw Error('The saved session is not signed in. Run once without --headless.');
  console.log('Waiting for sign-in (up to '+loginMs/1000+' seconds)…');await waitForLogin(page);
 }
 if(has('--login-only')){console.log('Sign-in saved in the dedicated local profile.');}
 else{
  while(queue.length&&results.length<maxPages){
   const seed=queue.shift(),key=canonicalPage(seed.url).toLowerCase();if(visited.has(key))continue;visited.add(key);
   const record={title:seed.title,url:canonicalPage(seed.url),items:[],warnings:[],frames:[],emptyEmbeds:[]};results.push(record);
   console.log(`[${results.length}] ${seed.title}`);
   const found=new Map();
   function add(url,label,source,forced){const clean=safeUrl(url);if(!clean)return;const k=youtubeId(clean)?'youtube:'+youtubeId(clean):clean;const type=forced||kind(clean);if(!found.has(k))found.set(k,{url:clean,label:label||'',source,kind:type});else if(type==='video')found.get(k).kind='video';}
   const listener=response=>{const u=response.url();if(kind(u)==='video'||kind(u)==='audio')add(u,'Media request','network');};
   page.on('response',listener);
   try{
    const response=await page.goto(seed.url,{waitUntil:'domcontentloaded',timeout:60000});
    if(response&&response.status()>=400)throw Error('Page returned HTTP '+response.status());
    if(!await signedIn(page)){
     if(has('--headless'))throw Error('Session expired or access denied');
     console.log('SharePoint requires sign-in again; waiting…');await waitForLogin(page);
    }
    await renderAndExpand(page);
    for(const frame of page.frames()){
     const fu=safeUrl(frame.url());if(fu){record.frames.push(fu);if(frame!==page.mainFrame()&&!/login|tokenfactory|resources\.html|about:blank/i.test(fu))add(fu,'Embedded frame','frame',kind(fu)==='link'?'embed':kind(fu));}
     if(frame!==page.mainFrame()&&/login\.microsoft|tokenfactory|resources\.html/i.test(frame.url()))continue;
     try{
      const data=await captureFrame(frame);
      for(const item of data.items){add(item.url,item.label,'rendered '+item.tag,item.tag==='iframe'&&kind(item.url)==='link'?'embed':undefined);if(has('--discover')&&isCoursePage(item.url))queue.push({title:item.label||new URL(item.url).pathname.split('/').pop(),url:canonicalPage(item.url)});}
      for(const u of embeddedUrls(data.controls))add(u,'Web-part property','rendered web-part data');
      record.emptyEmbeds.push(...data.empty);
     }catch{record.warnings.push('An embedded frame could not be inspected: '+(fu||'unavailable URL'));}
    }
    const stored=await storedPage(page,seed.url);record.storedContentAvailable=stored.ok;
    if(stored.ok)for(const u of embeddedUrls(stored.data))add(u,'Stored SharePoint page property','SharePoint page fields');
    else record.warnings.push(stored.error+(stored.status?' (HTTP '+stored.status+')':''));
    if(record.emptyEmbeds.length)record.warnings.push(record.emptyEmbeds.length+' embed containers had no visible player/link; inspect stored properties and the original page.');
    record.items=compare([...found.values()],media,files);
    const name=slug(seed.title);
    if(has('--snapshots')){await fs.writeFile(path.join(output,name+'.html'),await page.content());await fs.writeFile(path.join(output,name+'-stored.json'),JSON.stringify(stored,null,2));}
    if(has('--screenshots'))await page.screenshot({path:path.join(output,name+'.png'),fullPage:true}).catch(()=>record.warnings.push('Screenshot failed'));
    if(has('--download'))for(const item of record.items)await download(context,item);
   }catch(e){record.error=String(e.message).replace(/https?:\/\/\S+/g,'[URL]');console.log('  Page incomplete: '+record.error);}
   finally{page.off('response',listener);await writeReports();}
  }
  if(queue.length)summary.limitReached=true;
  summary.complete=true;summary.finished=new Date().toISOString();await writeReports();
  console.log('Audit finished. Open '+path.join(output,'report.html'));
  console.log('Video candidates: '+results.reduce((n,p)=>n+p.items.filter(i=>i.kind==='video'&&i.status!=='already-embedded').length,0));
  if(results.some(p=>p.error)||summary.limitReached)process.exitCode=2;
 }
}catch(e){summary.error=String(e.message).split('\n')[0].replace(/https?:\/\/\S+/g,'[URL]');await writeReports();console.error('Audit stopped: '+summary.error);process.exitCode=1;}
finally{if(context)await context.close();}
