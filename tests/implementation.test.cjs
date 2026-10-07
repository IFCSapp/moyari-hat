const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(repo, 'app.js'), 'utf8').replace("document.addEventListener('DOMContentLoaded'", "document.addEventListener('test-disabled-boot'");

function boot({ stored = null, readThrows = false, failWrites = false, sharedValues = null } = {}) {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:4179/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const values = sharedValues || new Map();
  if (stored !== null) values.set('MOYARIHAT_STATE_V1', stored);
  let blocked = failWrites;
  let readsBlocked = readThrows;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem(key) { if (readsBlocked) throw new window.DOMException('denied', 'SecurityError'); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (blocked) throw new window.DOMException('quota', 'QuotaExceededError'); values.set(String(key), String(value)); },
    key(i) { return [...values.keys()][i] ?? null; }, get length() { return values.size; },
    removeItem(key) { values.delete(key); }, clear() { values.clear(); },
  }});
  window.confirm = () => true;
  window.alert = () => {};
  window.scrollTo = () => {};
  window.console.error = () => {};
  window.console.warn = () => {};
  window.console.log = () => {};
  window.eval(`${appSource}\n;window.__runMoyariTest = (code) => eval(code);`);
  window.__runMoyariTest('initApp()');
  const call = (name, ...args) => window.__runMoyariTest(`${name}(...${JSON.stringify(args)})`);
  const get = (expr) => window.__runMoyariTest(expr);
  const click = (id) => window.document.getElementById(id)?.click();
  const setWritesBlocked = (value) => { blocked = value; };
  return { dom, window, values, call, get, click, setWritesBlocked, setReadsBlocked(value){readsBlocked=value} };
}

test('actual source: quota failure keeps the record draft, reports failure, and retries once', () => {
  const app = boot();
  app.click('btn-guide-agree');
  app.click('btn-home-start');
  app.get("currentRecord.behaviorSigns.push({itemId:'behavior_stop_screen'})");
  app.call('saveCurrentDraftNow');
  app.click('btn-step1-next');
  app.click('btn-step2-next');
  app.click('btn-step3-next');
  app.click('btn-step4-next');
  app.click('btn-step5-next');
  assert.equal(app.window.document.querySelector('#view-step6-save').hidden, false);
  app.setWritesBlocked(true);
  app.click('btn-save-record');
  assert.equal(app.get('appState.records.length'), 0);
  assert.equal(app.get('currentRecord.behaviorSigns.length'), 1);
  assert.equal(app.window.document.querySelector('#view-step6-save').hidden, false);
  assert.match(app.window.document.querySelector('#moyari-persistence-notice').textContent, /保存.*(?:できません|失敗)/);
  app.setWritesBlocked(false);
  assert.equal(app.get('saveCurrentRecord()'), true);
  assert.equal(app.get('appState.records.length'), 1);
  assert.equal(JSON.parse(app.values.get('MOYARIHAT_STATE_V1')).records.length, 1);
  app.dom.window.close();
});

test('corrupt canonical state is preserved when backup write fails', () => {
  const raw = '{broken-json';
  const app = boot({ stored: raw, failWrites: true });
  app.call('loadState');
  assert.equal(app.values.get('MOYARIHAT_STATE_V1'), raw);
  assert.equal(app.get('recoveryRequired'), true);
  assert.match(app.window.document.querySelector('#moyari-persistence-notice').textContent, /元データは変更せず保持/);
  app.dom.window.close();
});

test('storage read denial is not treated as empty writable first use', () => {
  const app = boot({ readThrows: true });
  app.call('loadState');
  assert.equal(app.get('storageAvailable'), false);
  assert.equal(app.values.has('MOYARIHAT_STATE_V1'), false);
  assert.match(app.window.document.querySelector('#moyari-persistence-notice').textContent, /読み取れません/);
  app.dom.window.close();
});

test('draft survives reload, resumes selection and view, and explicit discard removes only its draft', () => {
  const first = boot();
  first.click('btn-guide-agree');
  first.click('btn-home-start');
  first.get("currentRecord.behaviorSigns.push({itemId:'behavior_stop_screen'})");
  first.call('saveCurrentDraftNow');
  const drafts = [...first.values.entries()].filter(([key])=>key.startsWith('MOYARIHAT_CURRENT_DRAFT_V1:'));
  const preservedState = first.values.get('MOYARIHAT_STATE_V1');
  first.dom.window.close();
  const second = boot({ stored: preservedState });
  drafts.forEach(([key,value])=>second.values.set(key,value));
  second.call('loadState');
  assert.ok(second.window.document.querySelector('#moyari-draft-candidates'));
  second.window.document.querySelector('#moyari-draft-candidates button').click();
  assert.equal(second.get('currentRecord.behaviorSigns.length'), 1);
  assert.equal(second.window.document.querySelector('#view-step1-behavior').hidden, false);
  second.call('discardCurrentDraft');
  assert.equal(second.call('readCurrentDraftCandidates').length, 0);
  second.dom.window.close();
});

test('body selected pill uses sibling keyboard buttons, preserves other entries and moves focus after removal', () => {
  const app = boot();
  app.get("currentRecord.body.entries.push({partId:'body_part_head',sensations:[]},{partId:'body_part_chest',sensations:[]})");
  app.get("currentBodyPartId='body_part_head'");
  app.call('renderSelectedBodyPartsBar');
  const container = app.window.document.getElementById('container-selected-body-parts');
  const first = container.querySelector('.body-part-pill');
  assert.equal(first.tagName, 'DIV');
  assert.equal(first.querySelectorAll('button').length, 2);
  assert.equal(first.querySelectorAll('button button').length, 0);
  const [select, remove] = first.querySelectorAll('button');
  assert.equal(select.getAttribute('aria-pressed'), 'true');
  assert.match(remove.getAttribute('aria-label'), /削除/);
  remove.focus();
  remove.click();
  assert.equal(app.get('currentRecord.body.entries.length'), 1);
  assert.equal(app.get('currentBodyPartId'), 'body_part_chest');
  app.dom.window.close();
});

test('actual clicks automatically save choices and strength, pause and discard cancel timers', async()=>{
 const a=boot(); a.click('btn-guide-agree');a.click('btn-home-start');
 a.window.document.querySelector('#container-behavior-options .option-chip').click();
 const level=a.window.document.getElementById('input-moyari-level');level.value='4';level.dispatchEvent(new a.window.Event('input'));
 await new Promise(r=>setTimeout(r,450));let drafts=a.call('readCurrentDraftCandidates');assert.equal(drafts.length,1);assert.equal(drafts[0].currentRecord.moyariLevel,4);assert.equal(drafts[0].currentRecord.behaviorSigns.length,1);
 a.window.document.querySelector('#view-step1-behavior .btn-draft-pause').click();assert.equal(a.window.document.getElementById('view-home').hidden,false);a.window.document.querySelector('#moyari-draft-candidates button').click();assert.equal(level.value,'4');
 a.click('btn-step1-back');await new Promise(r=>setTimeout(r,450));assert.equal(a.call('readCurrentDraftCandidates').length,0);a.dom.window.close();
});

test('separate tab drafts and stale canonical state are not overwritten',()=>{
 const values=new Map();const a=boot({sharedValues:values});a.click('btn-guide-agree');const b=boot({sharedValues:values});a.click('btn-home-start');b.click('btn-home-start');
 a.get("currentRecord.behaviorSigns.push({itemId:'behavior_stop_screen',strength:'some'})");a.call('saveCurrentDraftNow');b.get('currentRecord.moyariLevel=7');b.call('saveCurrentDraftNow');assert.equal(a.call('readCurrentDraftCandidates').length,2);
 assert.equal(b.call('saveCurrentRecord'),true);assert.equal(a.call('saveCurrentRecord'),false);assert.equal(JSON.parse(values.get('MOYARIHAT_STATE_V1')).records.length,1);assert.equal(a.get('currentRecord.behaviorSigns.length'),1);a.dom.window.close();b.dom.window.close();
});

test('schema versions 1 to 3 retain records and snapshots',()=>{
 for(const version of [1,2,3]){const record={id:'old',createdAt:'2026-01-01',behaviorSigns:[{itemId:'custom'}],itemSnapshot:{custom:{label:'old label'}}};const a=boot({stored:JSON.stringify({schemaVersion:version,hasSeenGuide:true,items:[],records:[record]})});assert.equal(a.get('appState.records.length'),1);assert.equal(a.get('appState.records[0].itemSnapshot.custom.label'),'old label');a.dom.window.close();}
});

test('item and deletion failures rollback without losing canonical records',()=>{
 const a=boot();a.click('btn-guide-agree');a.click('btn-home-start');assert.equal(a.call('saveCurrentRecord'),true);const before=a.values.get('MOYARIHAT_STATE_V1');a.setWritesBlocked(true);
 const id=a.get('appState.records[0].id');assert.equal(a.call('deleteRecord',id),false);assert.equal(a.get('appState.records.length'),1);a.call('clearRecordsFromSettings');assert.equal(a.get('appState.records.length'),1);
 a.call('addCustomItem','behavior','test','unsaved');assert.equal(a.call('saveState'),false);assert.equal(a.get("appState.items.some(i=>i.label==='unsaved')"),false);assert.equal(a.values.get('MOYARIHAT_STATE_V1'),before);a.dom.window.close();
});

test('custom name/hide changes do not alter prior record snapshot',()=>{
 const a=boot();a.click('btn-guide-agree');const item=a.call('addCustomItem','behavior','test','Original');a.call('saveState');a.click('btn-home-start');a.get(`currentRecord.behaviorSigns.push({itemId:${JSON.stringify(item.id)}})`);a.call('saveCurrentRecord');
 a.get(`appState.items.find(i=>i.id===${JSON.stringify(item.id)}).label='Renamed'`);a.call('saveState');a.get(`appState.items.find(i=>i.id===${JSON.stringify(item.id)}).isHidden=true`);a.call('saveState');assert.equal(a.get(`appState.records[0].itemSnapshot[${JSON.stringify(item.id)}].label`),'Original');a.dom.window.close();
});

test('resuming a draft replaces its source only after a successful durable write',()=>{
 const a=boot();a.click('btn-guide-agree');a.click('btn-home-start');a.get('currentRecord.moyariLevel=4');a.call('saveCurrentDraftNow');const original=a.call('readCurrentDraftCandidates')[0];
 a.setWritesBlocked(true);a.call('resumeCurrentDraft',original.id);assert.equal(a.call('readCurrentDraftCandidates').length,1);assert.equal(a.values.has('MOYARIHAT_CURRENT_DRAFT_V1:'+original.id),true);
 a.setWritesBlocked(false);a.call('saveCurrentDraftNow');assert.equal(a.call('readCurrentDraftCandidates').length,1);assert.equal(a.values.has('MOYARIHAT_CURRENT_DRAFT_V1:'+original.id),false);a.dom.window.close();
});

test('a source draft changed by another tab is preserved during recovery cleanup',()=>{
 const a=boot();a.click('btn-guide-agree');a.click('btn-home-start');a.get('currentRecord.moyariLevel=4');a.call('saveCurrentDraftNow');const original=a.call('readCurrentDraftCandidates')[0];a.setWritesBlocked(true);a.call('resumeCurrentDraft',original.id);
 original.updatedAt='2099-01-01T00:00:00Z';original.currentRecord.moyariLevel=9;a.values.set('MOYARIHAT_CURRENT_DRAFT_V1:'+original.id,JSON.stringify(original));a.setWritesBlocked(false);a.call('saveCurrentDraftNow');assert.equal(a.call('readCurrentDraftCandidates').length,2);assert.equal(JSON.parse(a.values.get('MOYARIHAT_CURRENT_DRAFT_V1:'+original.id)).currentRecord.moyariLevel,9);a.dom.window.close();
});

test('restore errors leave current state and canonical bytes unchanged; retry succeeds',()=>{
 const a=boot();a.click('btn-guide-agree');a.click('btn-home-start');a.call('saveCurrentRecord');const before=a.values.get('MOYARIHAT_STATE_V1');const memory=JSON.stringify(a.get('appState'));
 a.get("pendingRestoreData={schemaVersion:3,hasSeenGuide:true,items:[],records:[{id:'restored',createdAt:'2026-01-01'}]}");a.setWritesBlocked(true);a.call('restoreFromSelectedBackup');assert.equal(a.values.get('MOYARIHAT_STATE_V1'),before);assert.equal(JSON.stringify(a.get('appState')),memory);
 a.setWritesBlocked(false);a.setReadsBlocked(true);a.call('restoreFromSelectedBackup');assert.equal(JSON.stringify(a.get('appState')),memory);a.setReadsBlocked(false);a.call('restoreFromSelectedBackup');assert.equal(a.get('appState.records[0].id'),'restored');a.dom.window.close();
});

test('failed explicit reset preserves current input and corrupt raw; confirmed retry can recover',()=>{
 const a=boot({stored:'{broken',failWrites:true});a.click('btn-guide-agree');a.click('btn-home-start');a.get('currentRecord.moyariLevel=6');const memory=JSON.stringify(a.get('appState'));a.call('resetAllFromSettings');assert.equal(a.values.get('MOYARIHAT_STATE_V1'),'{broken');assert.equal(JSON.stringify(a.get('appState')),memory);assert.equal(a.get('currentRecord.moyariLevel'),6);assert.equal(a.get('recoveryRequired'),true);
 a.setWritesBlocked(false);a.call('resetAllFromSettings');assert.equal(a.get('recoveryRequired'),false);assert.equal(JSON.parse(a.values.get('MOYARIHAT_STATE_V1')).records.length,0);assert.equal(a.get('currentRecord.moyariLevel'),0);a.dom.window.close();
});
