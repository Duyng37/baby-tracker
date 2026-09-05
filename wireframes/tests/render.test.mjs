// Render / event-handler smoke tests with DOM doubles, NOT browser or layout tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as model from '../model.mjs';
import * as workspaceModel from '../workspace.mjs';

const source = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function boot() {
  const elements = new Map();
  const handlers = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', textContent: '', dataset: {}, attributes: {}, hidden: false,
      scrollTop: 0, open: false, isConnected: true, listeners: {},
      classList: { toggle() {} }, focus() {},
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      showModal() { this.open = true; },
      close() { this.open = false; this.listeners.close?.(); },
    });
    return elements.get(selector);
  };
  const maps = ['today', 'journal', 'insights', 'family'].map(screen => {
    const node = element(`map-${screen}`);
    node.dataset.screen = screen;
    return node;
  });
  const document = {
    activeElement: element('initial-focus'),
    querySelector: element,
    querySelectorAll: selector => selector === '.map-item' ? maps : [],
    addEventListener(name, handler) { handlers.set(name, handler); },
  };
  const context = vm.createContext({
    __model: model, __workspace: workspaceModel, document, Date, Intl, structuredClone,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    FormData: class { constructor(form) { return new Map(Object.entries(form.values)); } },
  });
  const script = source.replace(/import\s*\{([^}]+)\}\s*from '\.\/(model|workspace)\.mjs';/g,
    (_, names, module) => `const {${names}} = __${module};`);
  vm.runInContext(script, context, { filename: 'app.mjs' });
  const api = vm.runInContext('({ get state() { return state; }, get workspace() { return workspace; }, get ui() { return ui; }, now, render, eventRows })', context);
  const click = (action, data = {}, detail = 1) => {
    const button = { dataset: { action, ...data }, disabled: false };
    handlers.get('click')({ target: { closest: () => button }, detail });
  };
  const submit = (kind, values) => {
    const error = { hidden: true, textContent: '' };
    const form = { dataset: { form: kind }, matches: () => true, values, querySelector: () => error };
    handlers.get('submit')({ target: form, preventDefault() {} });
    return error;
  };
  return { element, api, click, submit };
}

test('HTML exposes all app mounts and an accessible native dialog', () => {
  for (const id of ['screen-content', 'app-header', 'quick-actions', 'bottom-nav', 'active-dock', 'sheet', 'toast']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<html lang="vi">/);
  assert.match(html, /<dialog[^>]+aria-labelledby="sheet-title"/);
  assert.match(html, /aria-live="polite"/);
  assert.ok(!/https?:\/\//.test(html), 'no remote fonts, CDN scripts or image dependencies');
  assert.match(css, /#quick-actions\s*\{[^}]*flex-shrink: 0/);
});

test('all four screens render and preserve access to an active timer', () => {
  const app = boot();
  for (const [screen, title] of [['today', 'Một ngày của Mây'], ['journal', 'Nhật ký'], ['insights', 'Tổng quan'], ['family', 'Gia đình']]) {
    app.click('navigate', { screen });
    assert.match(app.element('#screen-content').innerHTML, new RegExp(title));
    assert.match(app.element('#bottom-nav').innerHTML, /aria-current="page"/);
    assert.equal(app.element('#quick-actions').hidden, screen !== 'today');
    if (screen !== 'today') assert.match(app.element('#active-dock').innerHTML, /Đã thức/);
  }
});

test('bottle default: two actions record a preset, then undo restores count', () => {
  const app = boot();
  const count = app.api.state.events.length;
  app.click('quick-bottle');
  assert.equal(app.element('#sheet').open, true);
  assert.match(app.element('#sheet-content').innerHTML, /data-amount="90"/);
  app.click('record-bottle', { amount: '90' });
  assert.equal(app.api.state.events.length, count + 1);
  assert.equal(app.api.state.events[0].amount, 90);
  assert.equal(app.element('#sheet').open, false);
  assert.equal(app.element('#toast [data-action="undo"]').hidden, false);
  app.click('undo');
  assert.equal(app.api.state.events.length, count);
});

test('diaper default: two actions record the chosen type', () => {
  const app = boot();
  app.click('quick-diaper');
  app.click('record-diaper', { diaper: 'both' });
  assert.equal(app.api.state.events[0].diaper, 'both');
  assert.match(app.element('#toast-message').textContent, /ướt & bẩn/);
});

test('nursing default: choose a side, switch, finish from another screen', () => {
  const app = boot();
  app.click('quick-breast');
  app.click('start-breast', { side: 'left' });
  assert.equal(model.activeSession(app.api.state, 'breast').side, 'left');
  app.click('navigate', { screen: 'journal' });
  assert.match(app.element('#active-dock').innerHTML, /Đổi bên/);
  app.click('switch-side');
  app.click('stop-session', { type: 'breast' });
  assert.equal(model.activeSession(app.api.state, 'breast'), undefined);
  assert.equal(app.api.state.events[0].segments.length, 2);
});

test('sleep default: one action finishes, one action starts a new timer', () => {
  const app = boot();
  app.click('stop-session', { type: 'sleep' });
  assert.equal(model.activeSession(app.api.state, 'sleep'), undefined);
  assert.match(app.element('#quick-actions').innerHTML, /data-action="start-sleep"/);
  app.click('start-sleep');
  assert.ok(model.activeSession(app.api.state, 'sleep'));
});

test('rapid double clicks do not duplicate quick log actions', () => {
  const app = boot();
  const before = app.api.state.events.length;
  app.click('record-bottle', { amount: '90' }, 1);
  app.click('record-bottle', { amount: '90' }, 2);
  assert.equal(app.api.state.events.length, before + 1);
});

test('offline, dark and empty scenarios are explicit and navigable', () => {
  const app = boot();
  app.click('toggle-offline');
  assert.equal(app.element('#connection-banner').hidden, false);
  app.click('toggle-theme');
  assert.equal(app.element('.phone').dataset.theme, 'dark');
  app.click('toggle-empty');
  assert.equal(app.api.state.events.length, 0);
  for (const screen of ['today', 'journal', 'insights', 'family']) app.click('navigate', { screen });
  app.click('navigate', { screen: 'insights' });
  assert.match(app.element('#screen-content').innerHTML, /Chưa đủ dữ liệu/);
  app.click('reset');
  assert.ok(app.api.state.events.length > 0);
});

test('manual form validates amount, supports edits, and keeps notes escaped', () => {
  const app = boot();
  app.click('manual');
  const startedAt = new Date(app.api.now() - 60 * 60000).toISOString();
  const invalid = app.submit('event-editor', { startedAt, amount: '0', milk: 'formula', note: '' });
  assert.equal(invalid.hidden, false);
  assert.match(invalid.textContent, /lớn hơn 0/);
  app.submit('event-editor', { startedAt, amount: '75', milk: 'formula', note: '<img src=x onerror=alert(1)>' });
  const created = app.api.state.events[0];
  assert.equal(created.amount, 75);
  assert.match(app.api.eventRows([created]), /&lt;img/);
  assert.ok(!app.api.eventRows([created]).includes('<img'));
  app.click('edit-event', { id: created.id });
  app.submit('event-editor', { startedAt, amount: '85', milk: 'expressed', note: 'Đã sửa' });
  assert.equal(app.api.state.events.find(event => event.id === created.id).amount, 85);
});

test('30-day summary discloses limited demo data; range does not fabricate events', () => {
  const app = boot();
  const before = app.api.state.events.length;
  app.click('navigate', { screen: 'insights' });
  app.click('range', { range: '30' });
  assert.match(app.element('#screen-content').innerHTML, /7\/30 ngày có ghi nhận/);
  assert.equal(app.api.state.events.length, before);
});

test('sharing and sync explain their scope instead of claiming success', () => {
  const app = boot();
  app.click('invite');
  assert.match(app.element('#sheet-content').innerHTML, /Lời mời chưa được gửi/);
  app.click('sync-info');
  assert.match(app.element('#sheet-content').innerHTML, /chưa triển khai/);
});

test('baby switcher offers scoped profiles and two-tap selection', () => {
  const app = boot();
  app.click('choose-baby');
  assert.match(app.element('#sheet-content').innerHTML, /Bé Bông/);
  app.click('select-baby', { family: 'family-may', baby: 'baby-bong' });
  assert.match(app.element('#screen-content').innerHTML, /Một ngày của Bông/);
  assert.equal(app.api.state.events.length, 1);
  assert.equal(app.api.ui.milk, 'expressed');
  assert.match(app.element('#active-dock').innerHTML, /Mây/);
  assert.match(app.element('#active-dock').innerHTML, /data-baby="baby-may"/);
  app.click('quick-bottle');
  assert.match(app.element('#sheet-content').innerHTML, /Nhà của Mây · Bé Bông/);
  app.click('record-bottle', { amount: '60' });
  app.click('select-baby', { family: 'family-may', baby: 'baby-may' });
  assert.equal(app.api.state.events.length, 11 + 6 * 17);
  app.click('select-baby', { family: 'family-may', baby: 'baby-bong' });
  assert.equal(app.api.state.events.length, 2);
});

test('stopping another baby timer and undo never target the visible baby', () => {
  const app = boot();
  app.click('select-baby', { family: 'family-may', baby: 'baby-bong' });
  app.click('start-sleep');
  app.click('stop-session', { baby: 'baby-may', type: 'sleep' });
  assert.ok(model.activeSession(app.api.state, 'sleep'), 'Bông keeps sleeping');
  const may = workspaceModel.currentBaby(app.api.workspace, 'baby-may');
  assert.equal(model.activeSession(may.tracking, 'sleep'), undefined);
  app.click('undo');
  assert.ok(model.activeSession(may.tracking, 'sleep'));
  assert.ok(model.activeSession(app.api.state, 'sleep'));
});

test('changing family scopes all screens and hides unrelated timers', () => {
  const app = boot();
  app.click('select-family', { family: 'family-bin' });
  for (const screen of ['today', 'journal', 'insights', 'family']) {
    app.click('navigate', { screen });
    assert.ok(!app.element('#screen-content').innerHTML.includes('Mây'));
    assert.ok(!app.element('#screen-content').innerHTML.includes('Bông'));
  }
  assert.equal(app.element('#active-dock').innerHTML, '');
  assert.equal(app.api.state.events.length, 1);
  assert.ok(!app.element('#screen-content').innerHTML.includes('data-action="new-baby"'));
  app.click('select-family', { family: 'family-may' });
  assert.ok(model.activeSession(app.api.state, 'sleep'));
});

test('cloud badge stays pending until explicit simulated ACK, never while offline', () => {
  const app = boot();
  app.click('record-diaper', { diaper: 'wet' });
  assert.match(app.element('#app-header').innerHTML, /1 chờ cloud/);
  app.click('toggle-offline');
  app.click('simulate-sync');
  assert.equal(workspaceModel.currentFamily(app.api.workspace).pending, 1);
  app.click('toggle-offline');
  app.click('simulate-sync');
  assert.equal(workspaceModel.currentFamily(app.api.workspace).pending, 0);
  assert.match(app.element('#sheet-content').innerHTML, /không upload dữ liệu/);
});

test('creating family and first baby is isolated from pre-existing families', () => {
  const app = boot();
  app.click('onboarding');
  assert.match(app.element('#sheet-content').innerHTML, /Đăng nhập bằng tài khoản riêng/);
  app.click('demo-auth');
  app.click('new-family');
  const count = app.api.workspace.families.length;
  const invalid = app.submit('new-family', { familyName: 'Nhà của Na', babyName: '  ' });
  assert.equal(invalid.hidden, false);
  assert.equal(app.api.workspace.families.length, count);
  app.submit('new-family', { familyName: 'Nhà của Na', babyName: 'Na' });
  assert.equal(app.api.workspace.families.length, count + 1);
  assert.equal(app.api.state.events.length, 0);
  assert.match(app.element('#screen-content').innerHTML, /Một ngày của Na/);
  assert.match(app.element('#app-header').innerHTML, /Nhà của Na/);
  app.click('new-baby');
  app.submit('new-baby', { babyName: '<Bé & Em>' });
  assert.equal(workspaceModel.currentFamily(app.api.workspace).babies.length, 2);
  assert.match(app.element('#screen-content').innerHTML, /&lt;Bé &amp; Em&gt;/);
});

test('offline onboarding is blocked but existing baby can still be logged', () => {
  const app = boot();
  app.click('toggle-offline');
  const count = app.api.workspace.families.length;
  app.click('onboarding');
  app.click('demo-auth');
  assert.equal(app.element('#sheet-feedback').hidden, false);
  assert.match(app.element('#sheet-feedback').textContent, /Cần mạng/);
  assert.equal(app.api.workspace.families.length, count);
  app.click('close-sheet');
  const events = app.api.state.events.length;
  app.click('record-diaper', { diaper: 'wet' });
  assert.equal(app.api.state.events.length, events + 1);
});

test('demo invitation does not promote a caregiver to owner', () => {
  const app = boot();
  app.click('join-demo');
  app.click('accept-demo-invite');
  assert.equal(app.api.workspace.familyId, 'family-an');
  assert.equal(workspaceModel.isOwner(app.api.workspace), false);
  app.click('new-baby');
  assert.match(app.element('#toast-message').textContent, /Chỉ chủ gia đình/);
  assert.equal(workspaceModel.currentFamily(app.api.workspace).babies.length, 1);
});

test('cross-scope stale event IDs cannot delete another baby record', () => {
  const app = boot();
  const mayId = app.api.state.events[0].id;
  app.click('select-family', { family: 'family-bin' });
  app.click('delete-event', { id: mayId });
  assert.match(app.element('#toast-message').textContent, /Không tìm thấy hoạt động/);
  assert.equal(app.api.state.events.length, 1);
  assert.equal(workspaceModel.currentFamily(app.api.workspace).pending, 0);
});

test('a stale form cannot submit into the newly selected family or baby', () => {
  const app = boot();
  app.click('manual');
  const startedAt = new Date(app.api.now() - 60 * 60000).toISOString();
  app.click('select-family', { family: 'family-bin' });
  const error = app.submit('event-editor', { startedAt, amount: '60', milk: 'formula', note: 'Old draft' });
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /tránh ghi nhầm bé/);
  assert.equal(app.api.state.events.length, 1);
  assert.equal(workspaceModel.currentFamily(app.api.workspace).pending, 0);
});

test('switching context discards stale undo rather than rewinding another baby', () => {
  const app = boot();
  const originalCount = app.api.state.events.length;
  app.click('record-diaper', { diaper: 'wet' });
  app.click('select-baby', { family: 'family-may', baby: 'baby-bong' });
  app.click('undo');
  assert.equal(app.api.state.events.length, 1);
  app.click('select-baby', { family: 'family-may', baby: 'baby-may' });
  assert.equal(app.api.state.events.length, originalCount + 1);
});