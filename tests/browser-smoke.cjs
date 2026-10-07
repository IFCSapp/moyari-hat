const {chromium}=require('playwright-core');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');
async function changelogRegression(browser,url,viewport){
 const context=await browser.newContext({viewport,serviceWorkers:'block'});
 const page=await context.newPage();
 try{
  await page.goto(url);
  await page.click('#btn-guide-agree');
  await page.click('#btn-home-settings');
  await page.click('#btn-show-changelog');
  const after=await page.evaluate(()=>{
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
   const button=rect('#btn-changelog-close'),content=document.querySelector('#changelog-content');
   return {viewport:{width:innerWidth,height:innerHeight},button,hit:document.elementFromPoint(button.x+button.width/2,button.y+button.height/2)?.id||null,content:{scrollHeight:content.scrollHeight,clientHeight:content.clientHeight}};
  });
  assert.ok(after.button.y>=0&&after.button.bottom<=viewport.height,'source CSS close stays in viewport');
  assert.equal(after.hit,'btn-changelog-close','source CSS close center is hit-testable');
  const content=page.locator('#changelog-content');
  await content.evaluate(element=>element.scrollTop=element.scrollHeight);
  const end=await content.evaluate(element=>({top:element.scrollTop,height:element.scrollHeight,client:element.clientHeight,text:element.innerText}));
  assert.ok(end.top>0&&end.top+end.client>=end.height-1,'source CSS changelog scrolls to end');
  assert.match(end.text,/1\.3\.0/,'last release text is reachable');
  const buttonAfterScroll=await page.locator('#btn-changelog-close').boundingBox();
  assert.ok(buttonAfterScroll.y>=0&&buttonAfterScroll.y+buttonAfterScroll.height<=viewport.height,'close stays visible after scrolling');
  await page.locator('#btn-changelog-close').click();
  assert.equal(await page.locator('#modal-changelog').isVisible(),false,'actual close click closes changelog');
  return {viewport,after,scroll:{top:end.top,height:end.height,client:end.client,lastRelease:end.text.includes('1.3.0')},close:'clicked'};
 }finally{await context.close();}
}
(async()=>{const root=path.resolve(__dirname,'..');const server=http.createServer(async(req,res)=>{try{const rel=req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,'.'+rel);if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;let browser;const checks=[];
try{browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'google-chrome',headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({serviceWorkers:'block'});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());const wait=()=>p.waitForTimeout(160);const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('MOYARIHAT_STATE_V1')));const drafts=()=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('MOYARIHAT_CURRENT_DRAFT_V1:')).map(k=>JSON.parse(localStorage.getItem(k))));
await p.goto(url);await p.click('#btn-guide-agree');await p.click('#btn-home-start');await p.locator('#container-behavior-options .option-chip').first().click();await p.waitForTimeout(450);assert.equal((await drafts())[0].currentRecord.behaviorSigns.length,1);checks.push('actual selection autosaves');
await p.click('#btn-add-behavior');await p.fill('#input-add-item-name','Synthetic custom sign');await p.click('#btn-modal-add');await p.waitForTimeout(450);assert.ok((await state()).items.some(i=>i.label==='Synthetic custom sign'));assert.equal((await drafts())[0].currentRecord.behaviorSigns.length,2);checks.push('custom input persisted in draft');
await p.click('#btn-step1-next');await p.click('#card-body');await p.locator('#container-body-parts .option-chip').first().click();await p.locator('#container-body-parts .option-chip').nth(1).click();assert.equal(await p.locator('#container-selected-body-parts button button').count(),0);await p.locator('.body-part-pill-remove').first().focus();await p.keyboard.press('Enter');assert.equal(await p.locator('.body-part-pill').count(),1);checks.push('body sibling keyboard removal');
await p.click('#btn-body-done');await p.click('#btn-step2-next');await p.locator('#input-moyari-level').fill('4');await p.waitForTimeout(450);await p.reload();await p.waitForSelector('#moyari-draft-candidates');await p.locator('#moyari-draft-candidates button').first().click();assert.equal(await p.inputValue('#input-moyari-level'),'4');assert.equal(await p.locator('#view-step3-level').isVisible(),true);checks.push('reload resumes level selections and step');
await p.click('#btn-step3-next');await p.click('#btn-step4-next');await p.click('#btn-step5-next');assert.match(await p.textContent('#view-step6-save .moyari-step-progress'),/6 \/ 6/);
await p.evaluate(()=>{window._setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('synthetic quota','QuotaExceededError')}});await p.click('#btn-save-record');assert.equal(await p.locator('#view-step6-save').isVisible(),true);assert.equal((await state()).records.length,0);assert.doesNotMatch(await p.textContent('#toast-message'),/記録を保存しました/);await p.evaluate(()=>Storage.prototype.setItem=window._setItem);await p.click('#btn-save-record');assert.equal((await state()).records.length,1);assert.equal((await drafts()).length,0);checks.push('quota keeps input and retry saves once cleanup');
await p.click('#btn-home-records');await p.reload();await p.click('#btn-home-records');assert.equal((await state()).records.length,1);checks.push('normal record persists across reload');
await p.click('#btn-records-home');await p.click('#btn-home-start');await p.locator('#container-behavior-options .option-chip').first().click();await p.locator('#view-step1-behavior .btn-draft-pause').click();assert.equal(await p.locator('#view-home').isVisible(),true);assert.ok((await drafts()).length);await p.locator('#moyari-draft-candidates button').first().click();await p.click('#btn-step1-back');await p.waitForTimeout(450);assert.equal((await drafts()).length,0);checks.push('pause resume explicit discard no resurrection');
const second=await ctx.newPage();second.on('dialog',d=>d.accept());await p.click('#btn-home-start');await p.locator('#container-behavior-options .option-chip').first().click();await p.waitForTimeout(450);await second.goto(url);await second.click('#btn-home-start');await second.locator('#container-behavior-options .option-chip').nth(1).click();await second.waitForTimeout(450);assert.ok((await drafts()).length>=2);checks.push('independent actual tabs keep drafts');await second.close();
const corruption=await browser.newContext({serviceWorkers:'block'});const c=await corruption.newPage();await c.addInitScript(()=>{localStorage.setItem('MOYARIHAT_STATE_V1','{broken');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('MOYARIHAT_STATE_CORRUPTED_'))throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v)}});await c.goto(url);assert.equal(await c.evaluate(()=>localStorage.getItem('MOYARIHAT_STATE_V1')),'{broken');assert.match(await c.textContent('#moyari-persistence-notice'),/元データ/);checks.push('corrupt backup failure preserves raw');await corruption.close();
assert.deepEqual(errors,[]);const mobile=await changelogRegression(browser,url,{width:375,height:667});const desktop=await changelogRegression(browser,url,{width:1024,height:768});checks.push('changelog mobile pre-fix reproduction, close hit-test, scroll-to-end and close');checks.push('changelog desktop close and scroll regression');console.log(JSON.stringify({status:'pass',checks,changelog:{mobile,desktop},page_errors:errors},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
