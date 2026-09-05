// Playwright MCP callback. Run against the dedicated local server described in docs/frontend.md.
// No credentials, real account, remote requests, or new package dependency. All API responses are fixtures.
async (page) => {
  const base = 'http://127.0.0.1:5174';
  const user = 'ui-review-' + Math.random().toString(36).slice(2);
  let moment = Date.parse('2026-09-05T08:32:00.000Z');
  let signedIn = false, cursor = 0, externalRequests = 0, runtimeErrors = 0, checks = 0;
  const workspace = {
    families: [{ id: 'ui-family', name: 'Nhà của Bông', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' },
      { id: 'ui-other-family', name: 'Gia đình thứ hai', timezone: 'Asia/Ho_Chi_Minh', sync_cursor: '0' }],
    babies: [{ id: 'ui-baby', family_id: 'ui-family', nickname: 'Bông', birth_date: null },
      { id: 'ui-sibling', family_id: 'ui-family', nickname: 'Mít', birth_date: null },
      { id: 'ui-other-baby', family_id: 'ui-other-family', nickname: 'Na', birth_date: null }],
    memberships: [{ family_id: 'ui-family', user_id: user, role: 'owner' },
      { family_id: 'ui-other-family', user_id: user, role: 'caregiver' }],
  };
  const check = (condition, name) => {
    checks++; page.uiReviewProgress = { checks, lastCheck: name };
    if (!condition) throw new Error('UI regression: ' + name);
  };
  const tick = async () => { moment += 1000; await page.clock.setFixedTime(new Date(moment)); };
  const quick = name => page.getByRole('group', { name: /^Ghi nhanh cho/ }).getByRole('button', { name: new RegExp('^' + name) });
  const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const theme = async value => {
    if (await page.evaluate(() => document.documentElement.dataset.theme) !== value)
      await page.getByRole('button', { name: value === 'dark' ? 'Bật chế độ tối' : 'Bật chế độ sáng', exact: true }).first().click();
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
  };
  const saveWorkspace = () => page.evaluate(async ({ workspace, user }) => {
    const { TrackerDB } = await import('/src/data/database.ts');
    const db = new TrackerDB('ui-review.supabase.co', user);
    await db.state.put({ key: 'workspace', value: workspace }); db.close();
  }, { workspace, user });
  await page.unroute('**/*');
  page.on('pageerror', () => runtimeErrors++); // Count only; never log user content or request headers.
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith(base + '/')) { externalRequests++; return route.abort(); }
    const path = url.slice(base.length).split('?')[0];
    if (!path.startsWith('/api/')) return route.continue();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/auth' && url.includes('action=session')) return json({ userId: signedIn ? user : null, projectId: 'ui-review.supabase.co' });
    if (path !== '/api/rpc') return json({ error: 'UI fixture only' }, 503);
    const { name, args, userId, projectId } = route.request().postDataJSON();
    if (userId !== user || projectId !== 'ui-review.supabase.co') return route.abort();
    if (name === 'get_workspace') return json({ data: workspace });
    if (name === 'pull_changes') return json({ data: { changes: [], next_cursor: args.p_after, has_more: false } });
    if (name === 'apply_event') return json({ data: { status: 'accepted', operation_id: args.p_operation_id, cursor: String(++cursor),
      event: { ...args.p_event, id: args.p_event_id, family_id: args.p_family_id, baby_id: args.p_baby_id,
        revision: String(BigInt(args.p_base_revision) + 1n), deleted_at: args.p_event.deleted ? new Date(moment).toISOString() : null } } });
    return json({ error: 'Simulated form failure' }, 503);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(moment));
  await page.goto(base);
  await page.getByRole('button', { name: 'Tiếp tục với Google' }).waitFor();
  await theme('dark'); await page.reload();
  await page.getByRole('button', { name: 'Bật chế độ sáng' }).waitFor();
  check(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'theme persists on reload');
  await saveWorkspace();
  await page.evaluate(async ({ user }) => {
    const { TrackerDB } = await import('/src/data/database.ts');
    const db = new TrackerDB('ui-review.supabase.co', user);
    const now = Date.now(), ago = minutes => new Date(now - minutes * 60000).toISOString();
    const body = (minutes, type, payload, note = '', end = null) => ({ started_at: ago(minutes), ended_at: end === null ? null : ago(end), type, payload, note, deleted: false });
    const events = [body(45, 'sleep', {}), body(80, 'bottle', { amount_ml: 120, milk: 'formula' }, 'Con bú ngoan.'),
      body(110, 'diaper', { kind: 'wet' }), body(160, 'breast', { segments: [{ side: 'left', started_at: ago(160), ended_at: ago(140) }] }, '', 140),
      body(250, 'sleep', {}, '', 180), body(290, 'bottle', { amount_ml: 90, milk: 'breast_milk' })];
    await db.events.bulkPut(events.map((body, index) => ({ id: 'ui-event-' + index, family_id: 'ui-family', baby_id: 'ui-baby', version: 1, server: null, body })));
    db.close();
  }, { user });
  signedIn = true; await page.reload();
  await page.getByRole('navigation').waitFor();

  // Main screens: four destinations, both themes, mobile through desktop + landscape.
  let screenCases = 0, sheetCases = 0, noticeCases = 0;
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 640, height: 960 }, { width: 1280, height: 900 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const appearance of ['light', 'dark']) {
      await theme(appearance);
      for (const screen of ['Hôm nay', 'Nhật ký', 'Tổng quan', 'Gia đình']) {
        await nav(screen);
        const valid = await page.evaluate(() => {
          const main = document.querySelector('main.content').getBoundingClientRect(), footer = document.querySelector('.footer').getBoundingClientRect();
          const overflow = [...document.querySelectorAll('main *, header *, footer *')].some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); });
          return !overflow && document.documentElement.scrollWidth <= innerWidth && main.bottom <= footer.top + 1
            && (innerHeight <= 500 || footer.bottom <= innerHeight + 1);
        });
        check(valid, `layout ${screen} ${appearance} ${viewport.width}x${viewport.height}`); screenCases++;
      }
    }
  }
  const openers = [() => quick('Bình sữa'), () => quick('Thay tã'), () => quick('Bú mẹ'),
    () => page.getByRole('button', { name: 'Đổi bé, đang chọn Bông' }),
    () => page.getByRole('button', { name: 'Thêm bé', exact: true }),
    () => page.getByRole('button', { name: /^Tạo gia đình khác/ }),
    () => page.getByRole('button', { name: 'Mời người chăm sóc', exact: true }),
    () => page.getByRole('button', { name: /^Nhận lời mời/ }),
    () => page.getByRole('button', { name: /^Đăng xuất Giữ/ })];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const appearance of ['light', 'dark']) {
      await theme(appearance); await nav('Gia đình');
      for (const opener of openers) {
        const trigger = opener(); await trigger.click(); await page.getByRole('dialog').waitFor();
        check(await page.evaluate(() => {
          const d = document.querySelector('dialog'), r = d.getBoundingClientRect();
          return d.matches(':modal') && d.contains(document.activeElement) && !!document.getElementById(d.getAttribute('aria-labelledby'))
            && d.scrollWidth <= d.clientWidth + 1 && r.width <= innerWidth + 1 && r.height <= innerHeight + 1;
        }), 'sheet fits and has initial focus');
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        check(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), 'Shift+Tab wraps inside sheet');
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
        check(await trigger.evaluate(el => el === document.activeElement), 'Escape restores trigger focus'); sheetCases++;
      }
    }
  }

  // Input validation, fractional volume, note editing, deletion and undo use real IndexedDB writes.
  await page.setViewportSize({ width: 390, height: 844 }); await nav('Hôm nay'); await quick('Bình sữa').click();
  await page.getByLabel('Lượng khác (ml)').fill('0'); await page.getByRole('button', { name: 'Ghi lại', exact: true }).click();
  check(await page.getByLabel('Lượng khác (ml)').evaluate(el => el.validity.rangeUnderflow), 'invalid volume stays in form');
  const field = await page.getByLabel('Lượng khác (ml)').evaluate(el => ({ font: getComputedStyle(el).fontSize, outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }));
  check(field.font === '16px' && field.outline === 'none' && field.shadow !== 'none', 'subtle input focus without iOS text zoom');
  await page.getByLabel('Loại sữa').selectOption('breast_milk'); await page.getByLabel('Lượng khác (ml)').fill('75.5');
  await tick(); await page.getByRole('button', { name: 'Ghi lại', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const recorded = page.getByRole('button', { name: /75.5 ml · Sữa mẹ vắt, xem/ }); await recorded.waitFor();
  await recorded.click(); await page.getByLabel('Ghi chú').fill('Ghi chú kiểm thử. '.repeat(20));
  await tick(); await page.getByRole('button', { name: 'Lưu trên máy', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForFunction(() => [...document.querySelectorAll('.event-note')].some(el => el.textContent.startsWith('Ghi chú kiểm thử.')));
  check(await recorded.evaluate(el => el === document.activeElement), 'saving notes restores row focus');
  await recorded.click(); await tick(); await page.getByRole('button', { name: 'Xóa ghi nhận', exact: true }).click();
  await recorded.waitFor({ state: 'detached' });
  check(await page.evaluate(() => document.activeElement.id === 'content'), 'deleting focused row restores main focus');
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 900 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const appearance of ['light', 'dark']) {
      await theme(appearance);
      const undo = page.getByRole('button', { name: 'Hoàn tác', exact: true });
      await undo.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      check(await page.evaluate(() => {
        const notice = document.querySelector('.notice'), rect = notice.getBoundingClientRect();
        const main = document.querySelector('main.content').getBoundingClientRect(), footer = document.querySelector('.footer').getBoundingClientRect();
        const button = notice.querySelector('button'), style = getComputedStyle(button), palette = getComputedStyle(document.documentElement);
        return notice.scrollWidth <= notice.clientWidth && rect.left >= 0 && rect.right <= innerWidth
          && main.bottom <= rect.top + 1 && rect.bottom <= footer.top + 1
          && document.activeElement === button && style.outlineStyle === 'solid'
          && style.outlineColor === style.color && style.backgroundColor === 'rgba(0, 0, 0, 0)'
          && palette.getPropertyValue('--toast-action').trim().length > 0;
      }), `undo notice layout and keyboard focus ${appearance} ${viewport.width}x${viewport.height}`);
      noticeCases++;
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await tick(); await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click(); await recorded.waitFor();
  check(await recorded.count() === 1, 'undo restores exactly one event');
  check(await page.evaluate(() => document.activeElement.id === 'content'), 'undo restores main focus after removing its button');
  await nav('Nhật ký'); await page.getByLabel('Hoạt động').selectOption('bottle');
  check(await page.locator('.journal .event-row').count() === 3, 'journal filter');
  await nav('Hôm nay'); check(await page.getByRole('main').getByRole('button', { name: /^Thay tã,/ }).count() === 1, 'today is not affected by journal filter');

  // Long names, text enlargement and safe wrapping.
  workspace.babies[0].nickname = 'B'.repeat(80); await saveWorkspace();
  await page.waitForFunction(() => document.querySelector('.baby-info strong').textContent.length === 80);
  await page.setViewportSize({ width: 320, height: 568 });
  for (const screen of ['Hôm nay', 'Nhật ký', 'Tổng quan', 'Gia đình']) {
    await nav(screen);
    check(await page.evaluate(() => document.querySelector('.content').scrollWidth <= document.querySelector('.content').clientWidth), '80-character name wraps in ' + screen);
  }
  workspace.babies[0].nickname = 'Bông'; await saveWorkspace();
  await page.setViewportSize({ width: 640, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await nav('Hôm nay');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.content').clientHeight > 100), '200% text remains scrollable');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

  // Error feedback stays inside the modal; this request is intercepted, never sent to a backend.
  await nav('Gia đình'); await page.getByRole('button', { name: 'Thêm bé', exact: true }).click();
  await page.getByLabel('Tên gọi của bé').fill('Bé kiểm thử'); await page.getByRole('button', { name: 'Tạo hồ sơ', exact: true }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  check(await page.getByRole('dialog').getByRole('alert').isVisible(), 'form failure visible inside modal');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 }); await nav('Hôm nay');
  check(runtimeErrors === 0, 'no browser runtime errors'); check(externalRequests === 0, 'no remote requests');
  return { checks, screenCases, sheetCases, noticeCases, runtimeErrors, externalRequests, backend: 'mocked; real React and IndexedDB' };
}