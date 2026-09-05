import {
  DIAPER_LABELS, MILK_LABELS, activeSession, addEvent, atTime,
  dayBounds, durationLabel, eventsOnDay, formatTime, removeEvent,
  startSession, stopSession, summarizeDay, switchSide, updateEvent,
} from './model.mjs';
import {
  acceptDemoInvitation, accessibleFamilies, addBaby, addFamily, createWorkspaceDemo,
  currentBaby, currentFamily, exportBabySnapshot, familyTimers, isOwner, markPending,
  selectBaby, selectFamily, simulateCloudAck,
} from './workspace.mjs';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const paths = {
  today: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  journal: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M8 3v18M11 8h6M11 12h6M11 16h4M3 7h3M3 12h3M3 17h3"/>',
  insights: '<path d="M4 3v17h17M8 15v-4M13 15V6M18 15V9"/>',
  family: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3"/>',
  breast: '<path d="M4 9c-3 5 1 11 6 11h4c5 0 9-6 6-11M8 13c2 3 6 3 8 0M10 4a2 2 0 0 1 4 0v4h-4Z"/>',
  bottle: '<path d="M10 3h4v3h-4zM8 6h8v3H8zM8 9l-2 4v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6l-2-4M13 13h4M13 16h4"/>',
  sleep: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/><path d="M17 3v4M15 5h4"/>',
  diaper: '<path d="M3 6h18l-2 12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3ZM3 10h18M5 12c4 0 5 4 5 8M19 12c-4 0-5 4-5 8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  cloud: '<path d="M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 1 10h-2M9 16l3 3 4-5"/>',
  offline: '<path d="m3 3 18 18M8 18H6a4 4 0 0 1-2-7M9 5a7 7 0 0 1 9 3 5 5 0 0 1 3 8M12 12v6M10 16l2 2 2-2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  swap: '<path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4"/>',
  droplet: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}
const screens = {
  today: { label: 'Hôm nay', title: 'Mọi điều cần biết, trong một cái nhìn.', notes: [
    'Timer được ưu tiên ở đầu. Kết thúc ngủ hoặc bú chỉ cần 1 chạm, không mở thêm màn hình.',
    'Bốn nút lớn luôn cố định trên thanh điều hướng, trong tầm ngón tay cái. Không cần cuộn để ghi nhanh.',
    'Lưu xong có Hoàn tác. Không popup xác nhận, không ép nhập ghi chú.',
  ] },
  journal: { label: 'Nhật ký', title: 'Nhớ giúp bạn, không bắt bạn phải nhớ.', notes: [
    'Dòng thời gian mới nhất trước. Mỗi mục cho biết giờ, chi tiết và người ghi.',
    'Lọc theo hoạt động, chuyển ngày hoặc chọn ngày trực tiếp. Chạm một mục để xem / sửa.',
    '“Thêm trước đó” là luồng có chủ đích, tách khỏi ghi nhanh. Timer vẫn điều khiển được ở thanh dưới.',
  ] },
  insights: { label: 'Tổng quan', title: 'Nhìn nhịp sinh hoạt, không so với “chuẩn”.', notes: [
    'Bốn chỉ số mô tả: sữa bình, cữ bú mẹ, giấc ngủ và tã. Không quy đổi bú mẹ thành ml.',
    'Ngày đang diễn ra được ghi rõ. Thiếu nhật ký không có nghĩa là bé thiếu ăn hay thiếu ngủ.',
    'Không điểm số, streak hoặc cảnh báo y khoa. Biểu đồ có nhãn số để không phụ thuộc màu sắc.',
  ] },
  family: { label: 'Gia đình', title: 'Chăm bé cùng nhau. Dữ liệu là của bạn.', notes: [
    'Mỗi gia đình có nhiều bé. Bạn chỉ thấy các gia đình mình là thành viên; không có danh sách gia đình công khai.',
    'Cloud là lưu trữ chính từ MVP. Đăng nhập lần đầu có mạng, sau đó ghi offline và tự đồng bộ.',
    'Tên bé luôn đi cùng timer và bảng ghi nhận. Chuyển bé không dừng timer. Trạng thái cloud ở đây chỉ mô phỏng.',
  ] },
};
const baseTime = atTime(Date.now(), 14, 32);
const bootTime = Date.now();
const now = () => baseTime + Math.max(0, Date.now() - bootTime);
let workspace = createWorkspaceDemo(baseTime);
let state = currentBaby(workspace).tracking;
const ui = { screen: 'today', offline: false, dark: false, empty: false, day: baseTime, filter: 'all', range: 1, milk: 'formula' };
let undoState = null;
let toastTimer;
let returnFocus;
let sheetContext = null;

function localDate(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function localDateTime(time) {
  return `${localDate(time)}T${formatTime(time)}`;
}
function dateLabel(time) {
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' }).format(time);
}
function sideLabel(side) { return side === 'left' ? 'Trái' : 'Phải'; }
function eventTitle(event) {
  if (event.type === 'bottle') return `Bình sữa · ${event.amount} ml`;
  if (event.type === 'diaper') return DIAPER_LABELS[event.diaper];
  if (event.type === 'sleep') return event.status === 'running' ? 'Đang ngủ' : 'Giấc ngủ';
  return event.status === 'running' ? `Đang bú bên ${sideLabel(event.side).toLowerCase()}` : 'Bú mẹ';
}
function eventDescription(event) {
  if (event.type === 'bottle') return MILK_LABELS[event.milk];
  if (event.type === 'diaper') return 'Đã thay tã';
  const duration = durationLabel((event.endedAt ?? now()) - event.startedAt);
  if (event.type === 'sleep') return `${formatTime(event.startedAt)} → ${event.endedAt ? formatTime(event.endedAt) : 'hiện tại'} · ${duration}`;
  return `${event.segments?.length > 1 ? `${event.segments.length} đoạn, kết thúc bên ${sideLabel(event.side).toLowerCase()}` : `Bên ${sideLabel(event.side).toLowerCase()}`} · ${duration}`;
}
function eventRows(events) {
  return events.map(event => `<button type="button" class="event-row" data-action="event-detail" data-id="${event.id}">
    <span class="event-icon">${icon(event.type)}</span><span class="event-info"><strong>${escapeHtml(eventTitle(event))}</strong>
    <small>${escapeHtml(eventDescription(event))} · ${escapeHtml(event.caregiver)}</small>${event.note ? `<span class="event-note">${escapeHtml(event.note)}</span>` : ''}</span>
    <time class="event-time" datetime="${new Date(event.startedAt).toISOString()}">${formatTime(event.startedAt)}</time></button>`).join('');
}
function emptyState(title, message, button = '') {
  return `<div class="empty-state">${icon('journal')}<h3>${title}</h3><p>${message}</p>${button}</div>`;
}
function activeCard(event, baby = currentBaby(workspace)) {
  return `<article class="active-card"><div class="active-top"><span class="active-symbol">${icon(event.type)}</span><div><div class="active-title">${eventTitle(event)} · ${escapeHtml(baby.name)}</div><div class="active-meta">Bắt đầu lúc ${formatTime(event.startedAt)}</div></div><span class="running-pill">Đang ghi</span></div>
    <div class="timer-value" data-timer-start="${event.startedAt}">${durationLabel(now() - event.startedAt)}</div>
    <div class="active-actions">${event.type === 'breast' ? `<button type="button" class="secondary-button" data-action="switch-side" data-baby="${baby.id}">${icon('swap')} Đổi bên</button>` : ''}
    <button type="button" class="primary-button" data-action="stop-session" data-type="${event.type}" data-baby="${baby.id}">${icon(event.type === 'sleep' ? 'sun' : 'check')}${event.type === 'sleep' ? 'Đã thức' : 'Kết thúc'}</button></div></article>`;
}
function todayScreen() {
  const summary = summarizeDay(state, now(), now());
  const recent = [...state.events].sort((a, b) => b.startedAt - a.startedAt);
  const lastFeed = recent.find(event => ['bottle', 'breast'].includes(event.type) && event.status !== 'running');
  const lastDiaper = recent.find(event => event.type === 'diaper');
  return `<div class="screen-heading"><div><h2>Một ngày của ${escapeHtml(currentBaby(workspace).name)}</h2><p>Mỗi điều nhỏ, đều được nhớ giúp bạn.</p></div><span class="date-tag">${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(now())}</span></div>
    ${state.events.filter(event => event.status === 'running').map(event => activeCard(event)).join('')}
    ${state.events.length ? `<div class="summary-strip"><div><strong>${lastFeed ? formatTime(lastFeed.endedAt ?? lastFeed.startedAt) : '—'}</strong><small>${lastFeed?.type === 'breast' ? 'Kết thúc bú gần nhất' : 'Lần ăn gần nhất'}</small></div><div><strong>${lastDiaper ? durationLabel(now() - lastDiaper.startedAt) : '—'}</strong><small>Từ lần thay tã</small></div><div><strong data-sleep-total>${durationLabel(summary.sleepMs)}</strong><small>Ngủ đã ghi hôm nay</small></div></div>` : ''}
    <div class="section-label"><h3>Vừa diễn ra</h3><button type="button" class="text-button" data-action="navigate" data-screen="journal">Xem tất cả →</button></div>
    ${recent.some(event => event.status !== 'running') ? `<div class="timeline">${eventRows(recent.filter(event => event.status !== 'running').slice(0, 3))}</div>` : emptyState('Bắt đầu từ một điều nhỏ', 'Chạm một nút bên dưới để ghi hoạt động. Không cần điền đủ mọi thứ.')}
    <p class="muted-note">Không cần ghi hoàn hảo. App ở đây để đỡ bạn phải nhớ.</p>`;
}
function quickActions() {
  const sleeping = activeSession(state, 'sleep');
  const nursing = activeSession(state, 'breast');
  return `<div class="section-label"><h3>Ghi cho bé ${escapeHtml(currentBaby(workspace).name)}</h3><small>1–2 chạm</small></div><div class="quick-grid">
      <button type="button" class="quick-button" data-action="${nursing ? 'show-running' : 'quick-breast'}" data-type="breast">${icon('breast')}<span class="tap-count">${nursing ? 'Đang ghi' : '2 chạm'}</span><strong>Bú mẹ</strong><small>${nursing ? 'Xem cữ bú đang chạy' : 'Chọn trái hoặc phải'}</small></button>
      <button type="button" class="quick-button" data-action="quick-bottle">${icon('bottle')}<span class="tap-count">2 chạm</span><strong>Bình sữa</strong><small>Lượng bé đã uống</small></button>
      <button type="button" class="quick-button" data-action="${sleeping ? 'stop-session' : 'start-sleep'}" data-type="sleep">${icon('sleep')}<span class="tap-count">1 chạm</span><strong>${sleeping ? 'Đã thức' : 'Ngủ'}</strong><small>${sleeping ? 'Kết thúc giấc ngủ' : 'Bắt đầu tính giờ ngủ'}</small></button>
      <button type="button" class="quick-button" data-action="quick-diaper">${icon('diaper')}<span class="tap-count">2 chạm</span><strong>Thay tã</strong><small>Ướt, bẩn hoặc cả hai</small></button>
    </div>`;
}
function journalScreen() {
  const events = eventsOnDay(state, ui.day, ui.filter);
  const summary = summarizeDay(state, ui.day, now());
  const filters = [['all', 'Tất cả'], ['breast', 'Bú mẹ'], ['bottle', 'Bình sữa'], ['sleep', 'Ngủ'], ['diaper', 'Tã']];
  return `<div class="screen-heading"><div><h2>Nhật ký</h2><p>Của bé ${escapeHtml(currentBaby(workspace).name)} · không gộp các bé.</p></div><button type="button" class="secondary-button" data-action="manual">${icon('plus')} Thêm trước đó</button></div>
    <div class="date-navigation"><button type="button" class="icon-button" data-action="day-prev" aria-label="Ngày trước">‹</button><input class="date-picker" type="date" id="journal-date" aria-label="Chọn ngày xem nhật ký" value="${localDate(ui.day)}" max="${localDate(now())}"><button type="button" class="icon-button" data-action="day-next" aria-label="Ngày sau" ${localDate(ui.day) >= localDate(now()) ? 'disabled' : ''}>›</button></div>
    <div class="filter-row" role="group" aria-label="Lọc hoạt động">${filters.map(([value, label]) => `<button type="button" class="chip ${ui.filter === value ? 'active' : ''}" aria-pressed="${ui.filter === value}" data-action="filter" data-filter="${value}">${label}</button>`).join('')}</div>
    <div class="journal-summary">${summary.bottleMl} ml sữa bình · ${summary.breastCount} cữ bú mẹ · ${durationLabel(summary.sleepMs)} ngủ · ${summary.diaperCount} tã</div>
    <div class="section-label"><h3>${localDate(ui.day) === localDate(now()) ? 'Hôm nay' : dateLabel(ui.day)}</h3><small>${events.length} hoạt động · mới nhất trước</small></div>
    ${events.length ? `<div class="timeline">${eventRows(events)}</div>` : emptyState('Chưa có hoạt động', ui.filter === 'all' ? 'Ngày này chưa có ghi nhận. Bạn có thể bổ sung khi nhớ ra.' : 'Không có ghi nhận thuộc loại này trong ngày đã chọn.', '<button type="button" class="secondary-button" data-action="manual">Thêm trước đó</button>')}
    <p class="muted-note">Chạm một hoạt động để xem chi tiết hoặc chỉnh sửa. Giấc ngủ qua đêm nằm ở ngày bắt đầu.</p>`;
}
function periodDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(now());
    day.setDate(day.getDate() - count + index + 1);
    return day.getTime();
  });
}
function insightsScreen() {
  const days = periodDays(ui.range);
  const totals = days.map(day => summarizeDay(state, day, now())).reduce((all, item) => {
    for (const key of Object.keys(item)) all[key] = (all[key] || 0) + item[key];
    return all;
  }, {});
  const loggedDays = days.filter(day => eventsOnDay(state, day).length > 0).length;
  const chartDays = periodDays(7);
  const hours = chartDays.map(day => summarizeDay(state, day, now()).sleepMs / 3600000);
  const max = Math.max(1, ...hours);
  const cards = [
    ['bottle', 'Sữa bình', totals.bottleMl, 'ml', `${totals.bottleCount} bình đã ghi nhận`],
    ['breast', 'Bú mẹ', totals.breastCount, 'cữ', 'Không quy đổi thành lượng sữa'],
    ['sleep', 'Thời gian ngủ', Math.floor(totals.sleepMs / 3600000), `giờ ${Math.floor(totals.sleepMs / 60000) % 60} phút`, 'Gồm giấc đang diễn ra'],
    ['diaper', 'Thay tã', totals.diaperCount, 'lần', 'Tổng tã ướt, bẩn & cả hai'],
  ];
  return `<div class="screen-heading"><div><h2>Tổng quan</h2><p>Nhịp sinh hoạt của bé ${escapeHtml(currentBaby(workspace).name)}.</p></div>${icon('insights')}</div>
    <div class="segmented" role="group" aria-label="Khoảng thời gian thống kê">${[[1, 'Hôm nay'], [7, '7 ngày'], [30, '30 ngày']].map(([value, label]) => `<button type="button" data-action="range" data-range="${value}" aria-pressed="${ui.range === value}" class="${ui.range === value ? 'active' : ''}">${label}</button>`).join('')}</div>
    <p class="muted-note">${ui.range === 1 ? `Hôm nay đến ${formatTime(now())} · ngày chưa kết thúc` : `Tổng ${ui.range} ngày · ${loggedDays}/${ui.range} ngày có ghi nhận`}</p>
    <div class="metric-grid">${cards.map(([type, label, value, unit, caption]) => `<article class="metric-card"><div class="metric-label">${icon(type)}${label}</div><div class="metric-value">${value} <small>${unit}</small></div><div class="metric-caption">${caption}</div></article>`).join('')}</div>
    ${!state.events.length ? emptyState('Chưa đủ dữ liệu để nhìn lại', 'Các ghi nhận ăn, ngủ và thay tã sẽ xuất hiện ở đây. Không cần ghi bù để lấp đầy biểu đồ.') : `<section class="chart-card"><div class="chart-header"><h3>Giấc ngủ · 7 ngày gần nhất</h3><span>giờ / ngày</span></div>
    <div class="bar-chart" role="img" aria-label="${escapeHtml(chartDays.map((day, index) => `${localDate(day)}: ${hours[index].toFixed(1)} giờ`).join('; '))}">${chartDays.map((day, index) => `<div class="bar-column ${index === 6 ? 'current' : ''}" aria-hidden="true"><span>${hours[index].toFixed(1).replace('.', ',')}</span><div class="bar" style="height:${Math.round(hours[index] / max * 80)}px"></div><span>${index === 6 ? 'Nay*' : `${new Date(day).getDate()}/${new Date(day).getMonth() + 1}`}</span></div>`).join('')}</div><p class="muted-note">* Hôm nay chưa kết thúc. Biểu đồ chỉ phản ánh thời gian đã ghi, không phải tổng ngủ thực tế.</p></section>`}
    <div class="disclaimer">${icon('info')}<span>Mỗi bé có nhịp riêng. Đây là nhật ký mô tả, không phải đánh giá sức khỏe hay khuyến nghị y khoa.</span></div>
    <div class="section-label"><h3>Mang theo khi cần</h3></div><button type="button" class="secondary-button full-width" data-action="export-csv">${icon('download')} Xuất nhật ký minh họa (CSV)</button>
    <p class="muted-note">Chỉ xuất và thống kê bé đang chọn. Khoảng ngày thiếu dữ liệu không được tự điền thêm.</p>`;
}
function settingRow(iconName, title, subtitle, action, trailing = '') {
  return `<button type="button" class="setting-row" data-action="${action}">${icon(iconName)}<span class="setting-text"><strong>${title}</strong><small>${subtitle}</small></span>${trailing || icon('chevron')}</button>`;
}
function familyScreen() {
  const family = currentFamily(workspace);
  return `<div class="screen-heading"><div><h2>Gia đình</h2><p>Tách biệt dữ liệu, cùng nhau chăm con.</p></div><button type="button" class="text-button" data-action="choose-family">Đổi gia đình</button></div>
    <div class="profile-card"><span class="avatar">${icon('family')}</span><div><strong>${escapeHtml(family.name)}</strong><small>${isOwner(workspace) ? 'Bạn là chủ gia đình' : 'Bạn là người chăm sóc được mời'} · tài khoản demo</small></div></div>
    <div class="section-label"><h3>Các bé · ${family.babies.length}</h3>${isOwner(workspace) ? '<button type="button" class="text-button" data-action="new-baby">+ Thêm bé</button>' : '<small>Chủ gia đình quản lý hồ sơ</small>'}</div>
    <div class="settings-group">${family.babies.map(baby => babyOption(family, baby)).join('')}</div>
    <div class="section-label"><h3>Người chăm sóc</h3><span class="phase-pill">TRONG MVP</span></div>
    <div class="settings-group">${family.members.map(member => `<div class="setting-row">${icon('family')}<span class="setting-text"><strong>${escapeHtml(member.name)}</strong><small>${member.role === 'owner' ? 'Chủ gia đình · quản lý hồ sơ & thành viên' : 'Người chăm sóc · xem và ghi hoạt động'}</small></span></div>`).join('')}${isOwner(workspace) ? settingRow('plus', 'Mời người chăm sóc', 'Chỉ gia đình này · cần mạng', 'invite', '<span class="phase-pill">Xem luồng</span>') : ''}</div>
    <div class="section-label"><h3>Cloud & dữ liệu</h3></div>
    <div class="settings-group">${settingRow('cloud', 'Lưu trên cloud từ MVP', `${family.pending} thay đổi chờ gửi · mô phỏng`, 'sync-info')}${settingRow('shield', 'Riêng tư theo gia đình', 'Chỉ thành viên được cấp quyền mới truy cập', 'privacy')}</div>
    <div class="backup-callout"><strong>Cloud là lưu trữ chính. Offline vẫn ghi được.</strong><p>Chỉ báo đã đồng bộ khi server xác nhận. Prototype chưa kết nối backend; dữ liệu vẫn chỉ ở bộ nhớ.</p><button type="button" class="secondary-button full-width" data-action="export-json">${icon('download')} Xuất dữ liệu mẫu của bé ${escapeHtml(currentBaby(workspace).name)}</button></div>
    <div class="section-label"><h3>Thoải mái khi sử dụng</h3></div>
    <div class="settings-group">${settingRow('sleep', 'Chế độ ban đêm', 'Dịu mắt khi chăm bé lúc khuya', 'toggle-theme', `<span class="switch ${ui.dark ? 'on' : ''}" aria-hidden="true"></span><span class="setting-value">${ui.dark ? 'Bật' : 'Tắt'}</span>`)}${settingRow('bottle', 'Đơn vị đo', 'Lượng sữa · cân nặng', 'units', '<span class="setting-value">ml · kg</span>')}</div>
    <p class="muted-note">Nôi · Wireframe 02 · Cloud + nhiều gia đình<br>Chưa có auth/cloud thật. Đăng nhập và đồng bộ là yêu cầu của bản app, không phải chức năng đã hoàn thành.</p>`;
}
function babyOption(family, baby) {
  const running = baby.tracking.events.filter(event => event.status === 'running').length;
  return `<button type="button" class="setting-row" data-action="select-baby" data-family="${family.id}" data-baby="${baby.id}"><span class="avatar">${escapeHtml(baby.name.slice(0, 1))}</span><span class="setting-text"><strong>Bé ${escapeHtml(baby.name)}</strong><small>${escapeHtml(baby.ageLabel)}${running ? ` · ${running} timer đang chạy` : ''}</small></span>${workspace.babyId === baby.id ? '<span class="phase-pill">ĐANG CHỌN</span>' : icon('chevron')}</button>`;
}
function babyPicker() {
  openSheet('Bạn đang chăm bé nào?', `<p class="sheet-intro">Chọn bé để ghi nhận. Các gia đình dưới đây là những nơi tài khoản demo đã có quyền truy cập.</p>${accessibleFamilies(workspace).map(family => `<div class="section-label"><h3>${escapeHtml(family.name)}</h3></div><div class="settings-group">${family.babies.map(baby => babyOption(family, baby)).join('')}</div>`).join('')}`, 'CHỌN BÉ · KHÔNG TRỘN NHẬT KÝ', { unscoped: true });
}
function familyPicker() {
  openSheet('Gia đình của bạn', `<p class="sheet-intro">Không có danh sách gia đình công khai. Bạn chỉ thấy gia đình đã tạo hoặc đã nhận lời mời.</p><div class="settings-group">${accessibleFamilies(workspace).map(family => `<button type="button" class="setting-row" data-action="select-family" data-family="${family.id}">${icon('family')}<span class="setting-text"><strong>${escapeHtml(family.name)}</strong><small>${family.babies.length} bé · ${family.members.length} thành viên</small></span>${icon('chevron')}</button>`).join('')}</div><div class="sheet-actions"><button type="button" class="secondary-button" data-action="new-family">Tạo gia đình</button><button type="button" class="secondary-button" data-action="join-demo">Nhận lời mời mẫu</button></div>`, 'TÀI KHOẢN DEMO', { unscoped: true });
}
function requireOnline() {
  if (ui.offline) throw new Error('Cần mạng cho thao tác này. Nhật ký của các bé đã có vẫn ghi offline được.');
}
function profileForm(kind) {
  requireOnline();
  if (kind === 'new-baby' && !isOwner(workspace)) throw new Error('Chỉ chủ gia đình có thể thêm bé.');
  const creatingFamily = kind === 'new-family';
  openSheet(creatingFamily ? 'Một mái nhà mới' : 'Thêm một bé', `<form data-form="${kind}"><p class="sheet-intro">${creatingFamily ? 'Mỗi gia đình có vùng dữ liệu cloud riêng. Bạn sẽ là chủ gia đình.' : `Bé được thêm vào ${escapeHtml(currentFamily(workspace).name)}. Các bé có nhật ký riêng.`} Đây là tạo hồ sơ mô phỏng, không gửi lên cloud.</p>${creatingFamily ? '<label class="field">Tên gia đình<input name="familyName" maxlength="60" placeholder="Ví dụ: Nhà của Na" required></label>' : ''}<label class="field">Tên gọi của bé<input name="babyName" maxlength="60" placeholder="Ví dụ: Na" required></label><p class="muted-note">Ngày sinh có thể bổ sung sau. Không dùng thông tin thật trong wireframe.</p><p class="form-error" role="alert" hidden></p><button type="submit" class="primary-button full-width">${creatingFamily ? 'Tạo gia đình & bé' : 'Thêm bé'} · mô phỏng</button></form>`, 'KHỞI TẠO CLOUD · LUỒNG THIẾT KẾ', { unscoped: creatingFamily });
}
function onboardingSheet() {
  openSheet('Cùng con, từ ngày đầu tiên', '<p class="sheet-intro">Tài khoản giúp lưu nhật ký lên cloud và chia sẻ với người thân. Lần thiết lập đầu tiên cần mạng; sau đó việc ghi nhận vẫn hoạt động offline.</p><ol class="onboarding-steps"><li>Đăng nhập bằng tài khoản riêng</li><li>Tạo gia đình hoặc nhận lời mời</li><li>Chọn bé và bắt đầu ghi nhận</li></ol><button type="button" class="primary-button full-width" data-action="demo-auth">Tiếp tục với tài khoản demo</button><p class="muted-note">Không đăng nhập thật, không thu email/mật khẩu và không gửi dữ liệu trong bản mẫu.</p>', 'LẦN ĐẦU SỬ DỤNG · MÔ PHỎNG', { unscoped: true });
}
function joinDemoSheet() {
  requireOnline();
  openSheet('Lời mời chăm bé An', '<p class="sheet-intro">Kịch bản giả lập: Bố An mời bạn vào Nhà của An với quyền Người chăm sóc. Bạn được xem và ghi hoạt động; không quản lý thành viên.</p><button type="button" class="primary-button full-width" data-action="accept-demo-invite">Chấp nhận lời mời giả lập</button><p class="muted-note">Không có link hay token thật. App thật cần kiểm tra đăng nhập, hạn dùng và quyền lời mời trên server.</p>', 'NHẬN LỜI MỜI · MÔ PHỎNG', { unscoped: true });
}
function syncSheet() {
  const family = currentFamily(workspace);
  openSheet('Trạng thái đồng bộ', `<p class="sheet-intro">${escapeHtml(family.name)} · ${family.pending} thay đổi chờ cloud.<br>${ui.offline ? 'Đang offline. Ghi nhận vẫn hoạt động trên máy.' : family.lastSyncedAt ? `Lần xác nhận mẫu: ${formatTime(family.lastSyncedAt)}.` : 'Chưa có xác nhận mẫu từ cloud.'}</p><div class="disclaimer">Cloud thật chưa triển khai. Nút bên dưới chỉ thay đổi trạng thái mô phỏng, không upload dữ liệu.</div><button type="button" class="primary-button full-width" data-action="simulate-sync" ${ui.offline ? 'disabled' : ''}>Hoàn tất đồng bộ · mô phỏng</button><p class="muted-note">App thật: lưu local + outbox → server kiểm tra quyền → nhận ACK → mới đánh dấu đã đồng bộ. Offline không đồng nghĩa đã sao lưu.</p>`, 'CLOUD BẮT BUỘC TRONG MVP · BẢN MẪU');
}
function selectContext(familyId, babyId) {
  const target = currentFamily(workspace, familyId);
  if (babyId && !target.babies.some(baby => baby.id === babyId)) throw new Error('Bé không thuộc gia đình được chọn.');
  selectFamily(workspace, familyId);
  if (babyId) selectBaby(workspace, babyId);
  state = currentBaby(workspace).tracking;
  ui.milk = currentBaby(workspace).milk;
  ui.day = now();
  ui.filter = 'all';
  ui.range = 1;
  ui.empty = false;
  undoState = null;
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
  closeSheet();
  render();
  $('#app-scroll').scrollTop = 0;
}
function renderTimerDock() {
  const timers = familyTimers(workspace).filter(({ baby }) => ui.screen !== 'today' || baby.id !== workspace.babyId);
  return timers.slice(0, 2).map(({ baby, event }) => `<div class="dock-item">${icon(event.type)}<span><strong>${escapeHtml(baby.name)}</strong> · ${event.type === 'sleep' ? 'Ngủ' : `Bú ${sideLabel(event.side).toLowerCase()}`} · <b data-timer-start="${event.startedAt}">${durationLabel(now() - event.startedAt)}</b></span>${event.type === 'breast' ? `<button type="button" data-action="switch-side" data-baby="${baby.id}">Đổi bên</button>` : ''}<button type="button" data-action="stop-session" data-type="${event.type}" data-baby="${baby.id}">${event.type === 'sleep' ? 'Đã thức' : 'Kết thúc'}</button></div>`).join('') + (timers.length > 2 ? `<button type="button" class="text-button full-width" data-action="all-timers">Xem tất cả ${timers.length} timer khác</button>` : '');
}
function render() {
  const scroll = $('#app-scroll').scrollTop;
  $('.phone').dataset.theme = ui.dark ? 'dark' : 'light';
  $('#sheet').dataset.theme = ui.dark ? 'dark' : 'light';
  const baby = currentBaby(workspace);
  const family = currentFamily(workspace);
  $('#app-header').innerHTML = `<button type="button" class="baby-switcher" data-action="choose-baby" aria-label="Đổi bé, đang chọn ${escapeHtml(baby.name)}"><span class="avatar">${escapeHtml(baby.name.slice(0, 1))}</span><span><strong>Bé ${escapeHtml(baby.name)}</strong><small>${escapeHtml(family.name)}</small></span>${icon('down')}</button><button type="button" class="storage-badge" data-action="sync-info">${icon(ui.offline ? 'offline' : 'cloud')}<span>${ui.offline ? 'Offline' : family.pending ? `${family.pending} chờ cloud` : 'Cloud'}<small>Mô phỏng</small></span></button>`;
  $('#connection-banner').hidden = !ui.offline;
  $('#connection-banner').textContent = `Offline · ${family.pending} thay đổi chờ cloud · mô phỏng`;
  $('#screen-content').innerHTML = ({ today: todayScreen, journal: journalScreen, insights: insightsScreen, family: familyScreen })[ui.screen]();
  $('#quick-actions').hidden = ui.screen !== 'today';
  $('#quick-actions').innerHTML = ui.screen === 'today' ? quickActions() : '';
  $('#bottom-nav').innerHTML = Object.entries(screens).map(([key, screen]) => `<button type="button" data-action="navigate" data-screen="${key}" class="${key === ui.screen ? 'active' : ''}" ${key === ui.screen ? 'aria-current="page"' : ''}>${icon(key)}${screen.label}</button>`).join('');
  $('#active-dock').innerHTML = renderTimerDock();
  $('.design-note h2').textContent = screens[ui.screen].title;
  $('#screen-notes').innerHTML = screens[ui.screen].notes.map(note => `<li>${note}</li>`).join('');
  document.querySelectorAll('.map-item').forEach(button => {
    const selected = button.dataset.screen === ui.screen;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  for (const [action, value] of [['toggle-offline', ui.offline], ['toggle-theme', ui.dark], ['toggle-empty', ui.empty]]) {
    $(`.scenario-controls [data-action="${action}"]`).setAttribute('aria-pressed', String(value));
  }
  $('#app-scroll').scrollTop = scroll;
}
function notify(message, canUndo = false) {
  clearTimeout(toastTimer);
  $('#toast-message').textContent = message;
  $('#toast [data-action="undo"]').hidden = !canUndo;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoState = null; }, 12000);
}
function mutate(operation, message, babyId = workspace.babyId) {
  const baby = currentBaby(workspace, babyId);
  const before = structuredClone(baby.tracking);
  operation(baby.tracking);
  undoState = { familyId: workspace.familyId, babyId, tracking: before };
  markPending(workspace);
  state = currentBaby(workspace).tracking;
  render();
  closeSheet();
  notify(`${message} · ${baby.name} · chờ cloud (mô phỏng)`, true);
}
function openSheet(title, content, kicker = 'GHI NHẬN NHANH', context = null) {
  if (!$('#sheet').open) returnFocus = document.activeElement;
  sheetContext = { ...context, familyId: workspace.familyId, babyId: workspace.babyId };
  $('#sheet-title').textContent = title;
  $('#sheet-kicker').textContent = kicker;
  $('#sheet-feedback').hidden = true;
  $('#sheet-content').innerHTML = (context?.unscoped ? '' : `<p class="sheet-scope">${escapeHtml(currentFamily(workspace).name)} · Bé ${escapeHtml(currentBaby(workspace).name)}</p>`) + content;
  if (!$('#sheet').open) $('#sheet').showModal();
  $('#sheet [data-action="close-sheet"]').focus();
}
function closeSheet() { if ($('#sheet').open) $('#sheet').close(); }
function infoSheet(title, message) {
  openSheet(title, `<p class="sheet-intro">${message}</p><button type="button" class="primary-button full-width" data-action="close-sheet">Đã hiểu</button>`, 'PHẠM VI BẢN MẪU');
}
function breastSheet() {
  openSheet('Bé bú bên nào?', `<p class="sheet-intro">Chọn bên để bắt đầu tính giờ ngay. Bạn có thể đổi bên bất cứ lúc nào.</p><div class="choice-grid">${['left', 'right'].map(side => `<button type="button" class="choice-button" data-action="start-breast" data-side="${side}">${icon('breast')}<strong>Bên ${sideLabel(side).toLowerCase()}</strong><small>Chạm để bắt đầu</small></button>`).join('')}</div><p class="muted-note">Bắt đầu lúc ${formatTime(now())} · không cần nhập thời lượng.</p>`);
}
function bottleSheet() {
  openSheet('Bé đã uống bao nhiêu?', `<p class="sheet-intro">Ghi lượng bé thực sự uống, không phải lượng đã pha. Chạm một mức để lưu ngay.</p>
    <label class="field">Loại sữa<select id="quick-milk">${Object.entries(MILK_LABELS).map(([value, label]) => `<option value="${value}" ${ui.milk === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <div class="choice-grid three">${[60, 90, 120].map(amount => `<button type="button" class="choice-button" data-action="record-bottle" data-amount="${amount}"><strong>${amount}</strong><small>ml · lưu ngay</small></button>`).join('')}</div>
    <button type="button" class="secondary-button full-width" data-action="custom-bottle">Nhập lượng khác…</button><p class="muted-note">${MILK_LABELS[ui.milk]} đang được chọn. Đổi loại sữa hoặc nhập lượng khác sẽ cần thêm thao tác.</p>`);
}
function customBottleSheet() {
  openSheet('Lượng sữa khác', `<form data-form="custom-bottle"><p class="sheet-intro">${MILK_LABELS[ui.milk]} · ${formatTime(now())}</p><label class="field">Lượng bé đã uống (ml)<input name="amount" type="number" inputmode="decimal" min="0.1" step="0.1" placeholder="Ví dụ: 75" required></label><p class="form-error" role="alert" hidden></p><button type="submit" class="primary-button full-width">Lưu bình sữa</button></form>`, 'CHI TIẾT TÙY CHỌN');
}
function diaperSheet() {
  openSheet('Lần thay tã này…', `<p class="sheet-intro">Chọn một loại để ghi nhận lúc ${formatTime(now())}. Ghi chú có thể thêm sau.</p><div class="choice-grid three">${[['wet', 'Ướt', 'droplet'], ['dirty', 'Bẩn', 'diaper'], ['both', 'Cả hai', 'check']].map(([value, label, symbol]) => `<button type="button" class="choice-button" data-action="record-diaper" data-diaper="${value}">${icon(symbol)}<strong>${label}</strong></button>`).join('')}</div><p class="muted-note">Chọn nhầm? Dùng Hoàn tác sau khi lưu.</p>`);
}
function detailSheet(id) {
  const event = state.events.find(item => item.id === id);
  if (!event) return;
  if (event.status === 'running') {
    openSheet(eventTitle(event), activeCard(event), 'HOẠT ĐỘNG ĐANG DIỄN RA');
    return;
  }
  openSheet(eventTitle(event), `<dl class="detail-list"><div><dt>Ngày</dt><dd>${dateLabel(event.startedAt)}</dd></div><div><dt>Thời điểm</dt><dd>${formatTime(event.startedAt)}${event.endedAt ? ` → ${formatTime(event.endedAt)}` : ''}</dd></div><div><dt>Chi tiết</dt><dd>${escapeHtml(eventDescription(event))}</dd></div><div><dt>Người ghi</dt><dd>${escapeHtml(event.caregiver)}</dd></div></dl>${event.note ? `<p class="sheet-intro">${escapeHtml(event.note)}</p>` : ''}<button type="button" class="primary-button full-width" data-action="edit-event" data-id="${event.id}">${icon('edit')} Chỉnh sửa</button><button type="button" class="danger-button" data-action="delete-event" data-id="${event.id}">Xóa hoạt động · có thể hoàn tác</button>`, 'CHI TIẾT NHẬT KÝ');
}
function editorSheet(id = null, type = 'bottle') {
  const event = id ? state.events.find(item => item.id === id) : null;
  if (id && !event) return;
  type = event?.type ?? type;
  const defaultStart = localDate(ui.day) === localDate(now()) ? now() - 30 * 60000 : atTime(ui.day, 12);
  const startedAt = event?.startedAt ?? defaultStart;
  const endedAt = event?.endedAt ?? startedAt + 20 * 60000;
  const typeField = event ? '' : `<label class="field">Hoạt động<select id="manual-type" name="type">${[['bottle', 'Bình sữa'], ['breast', 'Bú mẹ'], ['sleep', 'Ngủ'], ['diaper', 'Thay tã']].map(([value, label]) => `<option value="${value}" ${type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  let fields = '';
  if (['breast', 'sleep'].includes(type)) fields += `<label class="field">Kết thúc<input name="endedAt" type="datetime-local" value="${localDateTime(endedAt)}" max="${localDateTime(now())}" required></label>`;
  if (type === 'bottle') fields += `<div class="form-grid"><label class="field">Lượng uống (ml)<input name="amount" type="number" inputmode="decimal" min="0.1" step="0.1" value="${event?.amount ?? 90}" required></label><label class="field">Loại sữa<select name="milk">${Object.entries(MILK_LABELS).map(([value, label]) => `<option value="${value}" ${(event?.milk ?? ui.milk) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>`;
  if (type === 'diaper') fields += `<label class="field">Loại tã<select name="diaper">${Object.entries(DIAPER_LABELS).map(([value, label]) => `<option value="${value}" ${event?.diaper === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  if (type === 'breast') fields += event ? `<p class="muted-note">Bên bú: ${event.segments?.length > 1 ? 'nhiều đoạn; bản mẫu chỉ cho sửa ghi chú' : sideLabel(event.side)}.</p>` : '<label class="field">Bên bú<select name="side"><option value="left">Trái</option><option value="right">Phải</option></select></label>';
  openSheet(event ? 'Chỉnh sửa hoạt động' : 'Thêm hoạt động trước đó', `<form data-form="event-editor"><p class="sheet-intro">${event ? 'Sửa để nhật ký đúng với thực tế.' : 'Không cần nhớ ngay mọi thứ. Bạn có thể ghi bù ở đây.'}</p>${typeField}<label class="field">${['sleep', 'breast'].includes(type) ? 'Bắt đầu' : 'Thời điểm'}<input name="startedAt" type="datetime-local" value="${localDateTime(startedAt)}" max="${localDateTime(now())}" required></label>${fields}<label class="field">Ghi chú <span class="muted-note">Không bắt buộc</span><textarea name="note" maxlength="500" placeholder="Có điều gì muốn nhớ thêm không?">${escapeHtml(event?.note ?? '')}</textarea></label><p class="form-error" role="alert" hidden></p><button type="submit" class="primary-button full-width">${event ? 'Lưu thay đổi' : 'Thêm vào nhật ký'}</button></form>`, 'GHI NHẬN CHI TIẾT', { id, type });
  if (event?.segments?.length > 1) {
    $('#sheet input[name="startedAt"]').disabled = true;
    $('#sheet input[name="endedAt"]').disabled = true;
  }
}
function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Đã tạo file từ dữ liệu giả lập.');
}
function exportCsv() {
  const safeCell = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [['Gia đình', 'Bé', 'Loại', 'Bắt đầu (UTC)', 'Kết thúc (UTC)', 'Lượng sữa (ml)', 'Ghi chú', 'Người ghi'], ...[...state.events].sort((a, b) => b.startedAt - a.startedAt).map(event => [currentFamily(workspace).name, currentBaby(workspace).name, eventTitle(event), new Date(event.startedAt).toISOString(), event.endedAt ? new Date(event.endedAt).toISOString() : '', event.amount ?? '', event.note, event.caregiver])];
  download('noi-nhat-ky-minh-hoa.csv', `\ufeff${rows.map(row => row.map(safeCell).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
}
function resetDemo(empty = false) {
  clearTimeout(toastTimer);
  workspace = createWorkspaceDemo(baseTime);
  if (empty) workspace.families.forEach(family => family.babies.forEach(baby => { baby.tracking = { idPrefix: baby.id, events: [], sequence: 0 }; }));
  state = currentBaby(workspace).tracking;
  ui.milk = currentBaby(workspace).milk;
  ui.empty = empty;
  ui.day = now();
  ui.filter = 'all';
  undoState = null;
  $('#toast').hidden = true;
  closeSheet();
  render();
}
function handleAction(button) {
  const { action, type, id } = button.dataset;
  switch (action) {
    case 'onboarding': onboardingSheet(); break;
    case 'demo-auth': requireOnline(); familyPicker(); break;
    case 'choose-baby': babyPicker(); break;
    case 'choose-family': familyPicker(); break;
    case 'select-family': selectContext(button.dataset.family); break;
    case 'select-baby': selectContext(button.dataset.family, button.dataset.baby); break;
    case 'new-family': profileForm('new-family'); break;
    case 'new-baby': profileForm('new-baby'); break;
    case 'join-demo': joinDemoSheet(); break;
    case 'accept-demo-invite': requireOnline(); acceptDemoInvitation(workspace); selectContext(workspace.familyId, workspace.babyId); notify('Đã nhận lời mời giả lập. Chưa có thay đổi trên cloud thật.'); break;
    case 'simulate-sync': simulateCloudAck(workspace, now(), ui.offline); render(); syncSheet(); break;
    case 'all-timers': openSheet('Timer của gia đình', familyTimers(workspace).map(({ baby, event }) => activeCard(event, baby)).join('') || '<p class="sheet-intro">Không có timer đang chạy.</p>', 'MỖI TIMER THUỘC MỘT BÉ', { unscoped: true }); break;
    case 'navigate':
      ui.screen = button.dataset.screen;
      render();
      $('#app-scroll').scrollTop = 0;
      $('#screen-content').focus({ preventScroll: true });
      break;
    case 'toggle-offline': ui.offline = !ui.offline; render(); break;
    case 'toggle-theme': ui.dark = !ui.dark; render(); break;
    case 'toggle-empty': resetDemo(!ui.empty); break;
    case 'reset': resetDemo(); notify('Đã đặt lại dữ liệu minh họa.'); break;
    case 'quick-breast': breastSheet(); break;
    case 'quick-bottle': bottleSheet(); break;
    case 'custom-bottle': customBottleSheet(); break;
    case 'quick-diaper': diaperSheet(); break;
    case 'start-sleep': mutate(() => startSession(state, 'sleep', now()), 'Đã bắt đầu giấc ngủ'); break;
    case 'start-breast': mutate(() => startSession(state, 'breast', now(), button.dataset.side), 'Đã bắt đầu cữ bú'); break;
    case 'switch-side': mutate(tracking => switchSide(tracking, now()), 'Đã đổi bên bú', button.dataset.baby ?? workspace.babyId); break;
    case 'stop-session': mutate(tracking => stopSession(tracking, type, now()), type === 'sleep' ? 'Đã kết thúc giấc ngủ' : 'Đã kết thúc cữ bú', button.dataset.baby ?? workspace.babyId); break;
    case 'show-running': { const event = activeSession(state, type); if (event) detailSheet(event.id); break; }
    case 'record-bottle': mutate(() => addEvent(state, { type: 'bottle', amount: Number(button.dataset.amount), milk: ui.milk, startedAt: now() }, now()), `Đã ghi ${button.dataset.amount} ml sữa`); break;
    case 'record-diaper': mutate(() => addEvent(state, { type: 'diaper', diaper: button.dataset.diaper, startedAt: now() }, now()), `Đã ghi ${DIAPER_LABELS[button.dataset.diaper].toLowerCase()}`); break;
    case 'event-detail': detailSheet(id); break;
    case 'edit-event': editorSheet(id); break;
    case 'delete-event': mutate(() => removeEvent(state, id), 'Đã xóa hoạt động'); break;
    case 'manual': editorSheet(); break;
    case 'close-sheet': closeSheet(); break;
    case 'dismiss-toast': $('#toast').hidden = true; undoState = null; break;
    case 'undo': if (undoState && undoState.familyId === workspace.familyId) { currentBaby(workspace, undoState.babyId).tracking = undoState.tracking; state = currentBaby(workspace).tracking; undoState = null; markPending(workspace); render(); notify('Đã hoàn tác đúng bé · thay đổi chờ cloud (mô phỏng).'); } break;
    case 'filter': ui.filter = button.dataset.filter; render(); break;
    case 'day-prev':
    case 'day-next': { const date = new Date(ui.day); date.setDate(date.getDate() + (action === 'day-prev' ? -1 : 1)); ui.day = date.getTime(); render(); break; }
    case 'range': ui.range = Number(button.dataset.range); render(); break;
    case 'export-json': download('noi-sao-luu-minh-hoa.json', JSON.stringify(exportBabySnapshot(workspace, now()), null, 2), 'application/json'); break;
    case 'export-csv': exportCsv(); break;
    case 'invite':
      requireOnline();
      if (!isOwner(workspace)) throw new Error('Chỉ chủ gia đình có thể mời thành viên.');
      openSheet('Cùng nhau chăm bé', '<p class="sheet-intro">Luồng trong MVP: chủ gia đình tạo lời mời Người chăm sóc → người nhận đăng nhập tài khoản riêng → server kiểm tra lời mời → tham gia đúng gia đình.</p><div class="disclaimer">Lời mời chưa được gửi. Bản mẫu không thu email và không kết nối tài khoản.</div><div class="detail-list"><div><span>Chủ gia đình</span><span>Quản lý bé & thành viên</span></div><div><span>Người chăm sóc</span><span>Xem & ghi hoạt động</span></div></div><button type="button" class="primary-button full-width" data-action="close-sheet">Đã hiểu luồng</button>', 'CLOUD TRONG MVP · MÔ PHỎNG');
      break;
    case 'sync-info': syncSheet(); break;
    case 'privacy': infoSheet('Dữ liệu của gia đình bạn', 'Prototype không gửi dữ liệu lên server và không có analytics. Không nhập thông tin thật hoặc nhạy cảm. Bản app hoàn chỉnh cần phân quyền, xuất/xóa dữ liệu và cơ chế sao lưu.'); break;
    case 'units': infoSheet('Đơn vị đo', 'Wireframe hiện dùng ml cho lượng sữa và kg cho cân nặng. App thật sẽ cho chọn ml/oz, kg/lb; dữ liệu gốc lưu bằng đơn vị chuẩn để tránh sai lệch chuyển đổi.'); break;
  }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  // Ignore the second click in a rapid double-click; prevent duplicate quick logs.
  if (event.detail > 1) return;
  try { handleAction(button); } catch (error) {
    if ($('#sheet').open) {
      $('#sheet-feedback').textContent = error.message;
      $('#sheet-feedback').hidden = false;
    } else notify(error.message);
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'quick-milk') { ui.milk = event.target.value; currentBaby(workspace).milk = ui.milk; bottleSheet(); }
  if (event.target.id === 'journal-date' && event.target.value) {
    const value = new Date(`${event.target.value}T12:00`).getTime();
    if (Number.isFinite(value) && dayBounds(value)[0] <= dayBounds(now())[0]) { ui.day = value; render(); }
  }
  if (event.target.id === 'manual-type') {
    const form = event.target.form;
    const draftStart = form.elements.startedAt.value;
    const draftNote = form.elements.note.value;
    editorSheet(null, event.target.value);
    $('#sheet input[name="startedAt"]').value = draftStart;
    $('#sheet textarea[name="note"]').value = draftNote;
  }
});
document.addEventListener('submit', event => {
  if (!event.target.matches('form[data-form]')) return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (sheetContext?.familyId !== workspace.familyId || sheetContext?.babyId !== workspace.babyId) {
      throw new Error('Gia đình hoặc bé đã thay đổi. Hãy mở lại form để tránh ghi nhầm bé.');
    }
    if (form.dataset.form === 'new-family' || form.dataset.form === 'new-baby') {
      requireOnline();
      if (form.dataset.form === 'new-family') addFamily(workspace, data.get('familyName'), data.get('babyName'));
      else { addBaby(workspace, data.get('babyName')); markPending(workspace); }
      selectContext(workspace.familyId, workspace.babyId);
      ui.screen = 'today';
      render();
      notify('Đã tạo hồ sơ mô phỏng · chưa lưu lên cloud thật.');
      return;
    }
    if (form.dataset.form === 'custom-bottle') {
      mutate(() => addEvent(state, { type: 'bottle', amount: Number(data.get('amount')), milk: ui.milk, startedAt: now() }, now()), 'Đã ghi bình sữa');
    } else {
      const { type, id } = sheetContext;
      const previous = state.events.find(item => item.id === id);
      const startedAt = data.has('startedAt') ? new Date(data.get('startedAt')).getTime() : previous.startedAt;
      const input = { type, startedAt, note: data.get('note').trim() };
      if (['sleep', 'breast'].includes(type)) input.endedAt = data.has('endedAt') ? new Date(data.get('endedAt')).getTime() : previous.endedAt;
      if (type === 'bottle') Object.assign(input, { amount: Number(data.get('amount')), milk: data.get('milk') });
      if (type === 'diaper') input.diaper = data.get('diaper');
      if (type === 'breast') input.side = previous?.side ?? data.get('side');
      mutate(() => id ? updateEvent(state, id, input, now()) : addEvent(state, input, now()), id ? 'Đã sửa hoạt động' : 'Đã thêm vào nhật ký');
    }
  } catch (error) {
    const message = form.querySelector('.form-error');
    message.textContent = error.message;
    message.hidden = false;
  }
});
$('#sheet').addEventListener('close', () => {
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else $('#screen-content').focus({ preventScroll: true });
});
$('#sheet').addEventListener('click', event => {
  if (event.target !== $('#sheet')) return;
  const bounds = $('#sheet').getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSheet();
});
setInterval(() => {
  $('#status-clock').textContent = formatTime(now());
  document.querySelectorAll('[data-timer-start]').forEach(element => { element.textContent = durationLabel(now() - Number(element.dataset.timerStart)); });
  const total = $('[data-sleep-total]');
  if (total) total.textContent = durationLabel(summarizeDay(state, now(), now()).sleepMs);
}, 1000);
render();