// In-memory prototype model. No production storage or cloud synchronization.
export const EVENT_TYPES = ['breast', 'bottle', 'sleep', 'diaper'];
export const DIAPER_LABELS = { wet: 'Tã ướt', dirty: 'Tã bẩn', both: 'Ướt & bẩn' };
export const MILK_LABELS = { formula: 'Sữa công thức', expressed: 'Sữa mẹ vắt' };

export function atTime(day, hours, minutes = 0) {
  const value = new Date(day);
  value.setHours(hours, minutes, 0, 0);
  return value.getTime();
}

export function dayBounds(time) {
  const start = new Date(time);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()];
}

export function formatTime(time) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(time);
}

export function durationLabel(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (minutes < 60) return `${minutes} phút`;
  return `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`;
}

export function elapsedLabel(time, now) {
  return now - time < 60000 ? 'Vừa xong' : `${durationLabel(now - time)} trước`;
}

export function activeSession(state, type) {
  return state.events.find(event => event.type === type && event.status === 'running');
}

export function validateEvent(input, now) {
  if (!EVENT_TYPES.includes(input.type)) throw new Error('Hãy chọn loại hoạt động.');
  if (!Number.isFinite(input.startedAt)) throw new Error('Ngày hoặc giờ chưa hợp lệ.');
  if (input.startedAt > now) throw new Error('Không thể ghi hoạt động trong tương lai.');
  if (input.status !== 'running' && ['sleep', 'breast'].includes(input.type)) {
    if (!Number.isFinite(input.endedAt) || input.endedAt <= input.startedAt) {
      throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
    }
    if (input.endedAt > now) throw new Error('Giờ kết thúc không thể ở tương lai.');
  }
  if (input.type === 'bottle') {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Lượng sữa phải lớn hơn 0 ml.');
    if (!MILK_LABELS[input.milk]) throw new Error('Hãy chọn loại sữa.');
  }
  if (input.type === 'diaper' && !DIAPER_LABELS[input.diaper]) throw new Error('Hãy chọn loại tã.');
  if (input.type === 'breast' && !['left', 'right'].includes(input.side)) throw new Error('Hãy chọn bên bú.');
}

export function addEvent(state, input, now) {
  const event = { status: 'completed', note: '', caregiver: 'Bạn', ...input };
  validateEvent(event, now);
  if (event.status === 'running' && activeSession(state, event.type)) {
    throw new Error('Hoạt động này đã có timer đang chạy.');
  }
  event.id = `${state.idPrefix ?? 'demo'}-${++state.sequence}`;
  state.events.unshift(event);
  return event;
}

export function startSession(state, type, now, side = 'left') {
  if (!['sleep', 'breast'].includes(type)) throw new Error('Loại hoạt động này không có timer.');
  return addEvent(state, {
    type, startedAt: now, endedAt: null, status: 'running',
    ...(type === 'breast' ? { side, segments: [{ side, startedAt: now, endedAt: null }] } : {}),
  }, now);
}

export function switchSide(state, now) {
  const event = activeSession(state, 'breast');
  if (!event) throw new Error('Chưa có cữ bú đang chạy.');
  const current = event.segments.at(-1);
  const boundary = Math.max(now, current.startedAt);
  current.endedAt = boundary;
  event.side = event.side === 'left' ? 'right' : 'left';
  event.segments.push({ side: event.side, startedAt: boundary, endedAt: null });
  return event;
}

export function stopSession(state, type, now) {
  const event = activeSession(state, type);
  if (!event) throw new Error('Không có timer đang chạy.');
  event.endedAt = Math.max(now, event.startedAt);
  if (event.segments) {
    const last = event.segments.at(-1);
    event.endedAt = Math.max(event.endedAt, last.startedAt);
    last.endedAt = event.endedAt;
  }
  event.status = 'completed';
  return event;
}

export function updateEvent(state, id, changes, now) {
  const index = state.events.findIndex(event => event.id === id);
  if (index < 0) throw new Error('Không tìm thấy hoạt động.');
  const previous = state.events[index];
  if (previous.status === 'running') throw new Error('Hãy kết thúc timer trước khi sửa thời gian.');
  const event = { ...previous, ...changes, id, status: previous.status };
  validateEvent(event, now);
  if (event.type === 'breast') {
    const timingChanged = event.startedAt !== previous.startedAt || event.endedAt !== previous.endedAt;
    if (timingChanged && previous.segments?.length > 1) {
      throw new Error('Bản mẫu chưa hỗ trợ sửa thời gian cữ bú nhiều đoạn. Bạn vẫn có thể sửa ghi chú.');
    }
    if (timingChanged && previous.segments) {
      event.segments = [{ side: event.side, startedAt: event.startedAt, endedAt: event.endedAt }];
    }
  }
  state.events[index] = event;
  return event;
}

export function removeEvent(state, id) {
  if (!state.events.some(event => event.id === id)) throw new Error('Không tìm thấy hoạt động trong hồ sơ bé này.');
  state.events = state.events.filter(event => event.id !== id);
}

export function eventsOnDay(state, day, filter = 'all') {
  const [start, end] = dayBounds(day);
  return state.events.filter(event => event.startedAt >= start && event.startedAt < end
    && (filter === 'all' || event.type === filter)).sort((a, b) => b.startedAt - a.startedAt);
}

export function summarizeDay(state, day, now) {
  const [start, end] = dayBounds(day);
  const daily = eventsOnDay(state, day);
  const sleepMs = state.events.filter(event => event.type === 'sleep').reduce((total, event) => {
    const finish = event.status === 'running' ? now : event.endedAt;
    return total + Math.max(0, Math.min(finish, end, now) - Math.max(event.startedAt, start));
  }, 0);
  return {
    bottleMl: daily.filter(event => event.type === 'bottle').reduce((sum, event) => sum + event.amount, 0),
    bottleCount: daily.filter(event => event.type === 'bottle').length,
    breastCount: daily.filter(event => event.type === 'breast').length,
    diaperCount: daily.filter(event => event.type === 'diaper').length,
    sleepMs,
  };
}

export function createDemoState(now) {
  const state = { events: [], sequence: 0 };
  const add = (day, type, hour, minute, details = {}) => {
    const startedAt = atTime(day, hour, minute);
    const { minutes, ...rest } = details;
    addEvent(state, { type, startedAt, ...(minutes ? { endedAt: startedAt + minutes * 60000 } : {}), ...rest }, now);
  };
  for (let offset = 6; offset >= 1; offset--) {
    const day = new Date(now);
    day.setDate(day.getDate() - offset);
    add(day, 'sleep', 0, 15, { minutes: 180 + offset * 8 });
    add(day, 'sleep', 9, 20, { minutes: 55 + offset * 5 });
    add(day, 'sleep', 14, 0, { minutes: 60 + offset * 4 });
    add(day, 'sleep', 20, 10, { minutes: 95 + offset * 3 });
    for (const hour of [5, 8, 11, 15, 18, 22]) {
      add(day, 'bottle', hour, 0, { amount: 60 + ((hour + offset) % 3) * 15, milk: 'formula', caregiver: 'Bố' });
    }
    for (const hour of [6, 9, 12, 16, 19, 23]) add(day, 'diaper', hour, 10, { diaper: hour % 3 ? 'wet' : 'both' });
    add(day, 'breast', 7, 10, { minutes: 18, side: 'left' });
  }
  add(now, 'sleep', 0, 10, { minutes: 190 });
  add(now, 'breast', 7, 10, { minutes: 22, side: 'right', caregiver: 'Mẹ' });
  add(now, 'bottle', 8, 0, { amount: 60, milk: 'expressed', caregiver: 'Bố' });
  add(now, 'diaper', 8, 15, { diaper: 'wet' });
  add(now, 'sleep', 8, 25, { minutes: 55 });
  add(now, 'bottle', 10, 20, { amount: 90, milk: 'formula', caregiver: 'Bố' });
  add(now, 'diaper', 10, 35, { diaper: 'both', note: 'Đã thay bộ đồ mới.' });
  add(now, 'sleep', 11, 15, { minutes: 70 });
  add(now, 'breast', 12, 55, { minutes: 18, side: 'left', caregiver: 'Mẹ' });
  add(now, 'diaper', 13, 35, { diaper: 'wet' });
  startSession(state, 'sleep', atTime(now, 14, 8));
  return state;
}