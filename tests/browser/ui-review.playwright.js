// Playwright MCP callback. Run against the dedicated local server described in docs/frontend.md.
// No credentials, real account, remote requests, or new package dependency. All API responses are fixtures.
async (hostPage) => {
  const context = await hostPage.context().browser().newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
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
    if (name === 'rename_family' || name === 'rename_baby') {
      const owner = workspace.memberships.some(member => member.family_id === args.p_family_id && member.user_id === user && member.role === 'owner');
      if (!owner) return json({ error: 'forbidden' }, 403);
      const target = name === 'rename_family' ? workspace.families.find(family => family.id === args.p_family_id)
        : workspace.babies.find(baby => baby.id === args.p_baby_id && baby.family_id === args.p_family_id);
      if (!target) return json({ error: 'invalid' }, 400);
      const field = name === 'rename_family' ? 'name' : 'nickname';
      const value = String(name === 'rename_family' ? args.p_name : args.p_nickname).trim();
      const expected = name === 'rename_family' ? args.p_expected_name : args.p_expected_nickname;
      if (target[field] !== expected && target[field] !== value) return json({ data: { status: 'conflict' } });
      target[field] = value; return json({ data: { status: 'updated' } });
    }
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
      for (const screen of ['Hôm nay', 'Nhật ký', 'Chăm con', 'Gia đình']) {
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
  const openers = [() => quick('Bình sữa'), () => quick('Thay tã'), () => quick('Bú mẹ'), () => quick('Đã thức'),
    () => page.getByRole('button', { name: 'Đổi tên gia đình', exact: true }),
    () => page.getByRole('button', { name: 'Đổi tên bé Mít', exact: true }),
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

  // Compact actions, backdrop dismissal, header sync, profile editing and the explicit theme switch.
  check(await page.locator('header .sync-button').count() === 1 && await page.locator('.sync-bar').count() === 0, 'sync is an icon in the header');
  for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Thu gọn Ghi nhận nhanh', exact: true }).click();
    check(await page.locator('.quick-actions .quick-button span').count() === 0, 'compact actions contain only icons');
    check(await quick('Bình sữa').isVisible(), 'compact action remains accessible');
    await page.reload(); await page.getByRole('navigation').waitFor();
    check(await page.getByRole('button', { name: 'Mở rộng Ghi nhận nhanh', exact: true }).getAttribute('aria-expanded') === 'false', 'compact preference survives reload');
    await page.getByRole('button', { name: 'Mở rộng Ghi nhận nhanh', exact: true }).click();
    const picker = page.getByRole('button', { name: 'Đổi bé, đang chọn Bông', exact: true });
    await picker.click(); await page.getByRole('dialog').waitFor();
    await page.getByRole('heading', { name: 'Chọn bé', exact: true }).click();
    check(await page.getByRole('dialog').isVisible(), 'inside click keeps picker open');
    const box = await page.getByRole('dialog').boundingBox();
    await page.mouse.click(box.x + box.width / 2, Math.max(1, box.y - 12));
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    check(await picker.evaluate(el => el === document.activeElement), 'backdrop closes picker and restores focus');
  }
  await page.setViewportSize({ width: 390, height: 844 }); await nav('Gia đình'); await theme('light');
  const nightSwitch = page.getByRole('switch', { name: 'Chế độ ban đêm', exact: true });
  check(await nightSwitch.getAttribute('aria-checked') === 'false', 'night switch initially off');
  await nightSwitch.click();
  check(await nightSwitch.getAttribute('aria-checked') === 'true', 'night switch turns on');
  check(await page.getByRole('button', { name: 'Bật chế độ sáng', exact: true }).isVisible(), 'header tracks switch state');
  await nightSwitch.focus(); await page.keyboard.press('Space');
  check(await nightSwitch.getAttribute('aria-checked') === 'false', 'keyboard toggles switch off');
  await page.getByRole('button', { name: 'Đổi tên gia đình', exact: true }).click();
  await page.getByLabel('Tên gia đình', { exact: true }).fill('Nhà kiểm thử');
  await page.getByRole('button', { name: 'Lưu tên mới', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(await page.locator('.baby-info small').textContent() === 'Nhà kiểm thử', 'family rename refreshes header');
  await page.getByRole('button', { name: 'Đổi tên bé Mít', exact: true }).click();
  await page.getByLabel('Tên gọi của bé', { exact: true }).fill('Mít mới');
  await page.getByRole('button', { name: 'Lưu tên mới', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(await page.getByRole('button', { name: 'Đổi tên bé Mít mới', exact: true }).isVisible(), 'sibling rename refreshes profile');

  // Record a complete overnight sleep once, then a running sleep without enabling wake fields.
  await page.getByRole('button', { name: 'Đổi bé, đang chọn Bông', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mít mới', exact: true }).click();
  await nav('Hôm nay'); await quick('Ngủ').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Chọn ngày ghi nhận', { exact: true }).fill('04/09/2026');
  await dialog.getByLabel('Giờ', { exact: true }).fill('2137');
  check(await dialog.getByLabel('Giờ', { exact: true }).inputValue() === '21:37', 'four digits normalize to HH:mm');
  await dialog.getByRole('button', { name: 'Mở bộ chọn giờ: Giờ', exact: true }).click();
  const clockPopup = page.getByRole('dialog', { name: 'Giờ', exact: true });
  await clockPopup.getByRole('button', { name: '22 giờ', exact: true }).click();
  await clockPopup.getByRole('button', { name: '00 phút', exact: true }).click();
  await clockPopup.getByRole('button', { name: 'Xong', exact: true }).click();
  check(await dialog.getByLabel('Giờ', { exact: true }).inputValue() === '22:00', 'themed picker commits hour and minute');
  await dialog.getByRole('button', { name: 'Mở bộ chọn giờ: Giờ', exact: true }).click();
  await page.keyboard.press('Escape');
  check(await clockPopup.count() === 0 && await dialog.isVisible(), 'Escape closes the clock, not the recording sheet');
  await dialog.getByLabel('Trạng thái giấc ngủ', { exact: true }).selectOption('awake');
  await dialog.getByLabel('Chọn ngày thức giấc', { exact: true }).fill('04/09/2026');
  await dialog.getByLabel('Giờ thức giấc', { exact: true }).fill('06:00');
  await page.getByRole('button', { name: 'Lưu giấc ngủ', exact: true }).click();
  check(await dialog.getByRole('alert').isVisible(), 'backwards wake time requires an explicit next day');
  await dialog.getByLabel('Chọn ngày thức giấc', { exact: true }).fill('05/09/2026');
  await tick(); await page.getByRole('button', { name: 'Lưu giấc ngủ', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  const sleepBodies = () => page.evaluate(async user => {
    const { TrackerDB } = await import('/src/data/database.ts');
    const db = new TrackerDB('ui-review.supabase.co', user);
    try { return (await db.events.toArray()).filter(event => event.baby_id === 'ui-sibling' && event.body.type === 'sleep').map(event => event.body); }
    finally { db.close(); }
  }, user);
  const completed = await sleepBodies();
  check(completed.length === 1 && completed[0].started_at === '2026-09-04T15:00:00.000Z' && completed[0].ended_at === '2026-09-04T23:00:00.000Z', 'completed sleep persists both timestamps in one entry');
  check(await quick('Ngủ').isVisible(), 'completed backfill does not start a timer');
  await quick('Ngủ').click(); await tick();
  check(await dialog.getByLabel('Giờ thức giấc', { exact: true }).isDisabled(), 'wake fields require explicit completed sleep selection');
  check((await dialog.getByLabel('Chọn ngày thức giấc', { exact: true }).inputValue()).length > 0, 'wake date is prefilled');
  check((await dialog.getByLabel('Giờ thức giấc', { exact: true }).inputValue()).length > 0, 'wake time is prefilled');
  await page.getByRole('button', { name: 'Lưu giấc ngủ', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  check((await sleepBodies()).filter(body => body.ended_at === null).length === 1, 'disabled prefilled wake fields keep sleep active');
  await quick('Đã thức').click(); await tick();
  await dialog.getByRole('button', { name: 'Đã thức', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  check((await sleepBodies()).every(body => body.ended_at !== null), 'active sleep can still be stopped later');
  await page.getByRole('button', { name: 'Đổi bé, đang chọn Mít mới', exact: true }).click();
  await dialog.getByRole('button', { name: 'Bông', exact: true }).click();

  // Long names, text enlargement and safe wrapping.
  workspace.babies[0].nickname = 'B'.repeat(80); await saveWorkspace();
  await page.waitForFunction(() => document.querySelector('.baby-info strong').textContent.length === 80);
  await page.setViewportSize({ width: 320, height: 568 });
  for (const screen of ['Hôm nay', 'Nhật ký', 'Chăm con', 'Gia đình']) {
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
  } catch (error) {
    return { failed: true, progress: page.uiReviewProgress, message: String(error.message).slice(0, 1800) };
  } finally { await context.close(); }
}