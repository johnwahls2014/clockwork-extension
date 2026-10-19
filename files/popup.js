const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hms = ms => { const s = Math.ceil(ms / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':'); };
const t12 = t => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const S = {
  world: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
  alarms: [], timers: [], tab: 'world',
  sw: { at: null, base: 0, laps: [] }
};
const save = k => chrome.storage.local.set({ [k]: S[k] });

// ---- World ----
const localFmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const city = tz => tz.split('/').pop().replace(/_/g, ' ');

function renderWorld() {
  $('#worldList').innerHTML = S.world.map(tz =>
    `<li data-tz="${tz}"><div class="grow"><div class="city">${esc(city(tz))}</div><div class="sub" data-d></div></div>
     <div class="t" data-t></div><button class="x" data-act="tz-del" data-id="${tz}" aria-label="Remove ${esc(city(tz))}">×</button></li>`
  ).join('') || '<li class="empty">Add a city to compare times</li>';
  tickWorld();
}

function tickWorld() {
  const now = new Date();
  const p = Object.fromEntries(localFmt.formatToParts(now).map(x => [x.type, x.value]));
  $('#fH').textContent = pad(p.hour); $('#fM').textContent = p.minute; $('#fS').textContent = p.second;
  $('#fP').textContent = p.dayPeriod || '';
  $('#localDate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $('#localTz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  const here = new Date(now.toLocaleString('en-US'));
  $$('#worldList li[data-tz]').forEach(li => {
    const tz = li.dataset.tz;
    $('[data-t]', li).textContent = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(now);
    const there = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const dd = Math.round((Date.UTC(there.getFullYear(), there.getMonth(), there.getDate()) - Date.UTC(here.getFullYear(), here.getMonth(), here.getDate())) / 864e5);
    const h = (there - here) / 36e5;
    const day = dd === 0 ? 'Today' : dd > 0 ? 'Tomorrow' : 'Yesterday';
    $('[data-d]', li).textContent = h === 0 ? `${day}, same time` : `${day}, ${Math.abs(h)} hours ${h > 0 ? 'ahead' : 'behind'}`;
  });
}

// ---- Alarms ----
function daysText(d) {
  if (!d.length) return 'Once';
  const s = [...d].sort().join();
  if (d.length === 7) return 'Every day';
  if (s === '1,2,3,4,5') return 'Weekdays';
  if (s === '0,6') return 'Weekends';
  return [...d].sort().map(i => DAYS[i]).join(' ');
}

function renderAlarms() {
  $('#alarmList').innerHTML = S.alarms.map(a =>
    `<li class="${a.on ? '' : 'off'}"><div class="grow"><div class="t">${t12(a.time)}</div>
     <div class="sub">${daysText(a.days)}${a.label ? ', ' + esc(a.label) : ''}</div></div>
     <label class="sw"><input type="checkbox" data-alarm="${a.id}" ${a.on ? 'checked' : ''} aria-label="Alarm on"><span></span></label>
     <button class="x" data-act="alarm-del" data-id="${a.id}" aria-label="Delete alarm">×</button></li>`
  ).join('') || '<li class="empty">No alarms yet. Set one below.</li>';
}

// ---- Timers ----
const left = t => t.running ? t.endsAt - Date.now() : t.left;
const saveTimers = () => { save('timers'); renderTimers(); };

function addTimer(sec, label) {
  const ms = sec * 1000;
  S.timers.push({ id: uid(), label, total: ms, left: ms, endsAt: Date.now() + ms, running: true });
  saveTimers();
}

function renderTimers() {
  $('#timerList').innerHTML = S.timers.map(t =>
    `<li data-id="${t.id}"><div class="grow"><div class="sub">${esc(t.label) || 'Timer'}</div>
     <div class="t" data-left></div><div class="bar"><i data-bar></i></div></div>
     <div class="btns"><button class="btn ghost sm" data-act="timer-reset" data-id="${t.id}">Reset</button>
     <button class="btn sm" data-act="timer-toggle" data-id="${t.id}">${t.running ? 'Pause' : t.left < t.total ? 'Resume' : 'Start'}</button>
     <button class="x" data-act="timer-del" data-id="${t.id}" aria-label="Delete timer">×</button></div></li>`
  ).join('') || '<li class="empty">No timers yet. Pick a preset or set your own.</li>';
  tickTimers();
}

function tickTimers() {
  S.timers.forEach(t => {
    const li = $(`#timerList li[data-id="${t.id}"]`);
    if (!li) return;
    const l = Math.max(0, left(t));
    $('[data-left]', li).textContent = hms(l);
    $('[data-bar]', li).style.width = (l / t.total * 100) + '%';
  });
}

// ---- Stopwatch ----
const swElapsed = () => S.sw.base + (S.sw.at ? Date.now() - S.sw.at : 0);
const fmtSw = ms => {
  const c = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 36e5);
  return `${h ? h + ':' + pad(m) : pad(m)}:${pad(s)}.${pad(c)}`;
};

function renderSw() {
  const w = S.sw, run = !!w.at;
  $('#swGo').textContent = run ? 'Stop' : 'Start';
  $('#swGo').classList.toggle('stop', run);
  $('#swLap').textContent = !run && w.base ? 'Reset' : 'Lap';
  $('#swLap').disabled = !run && !w.base;
  $('#lapList').innerHTML = w.laps.map((t, i) =>
    `<li><span class="sub">Lap ${w.laps.length - i}</span><span class="num">${fmtSw(t - (w.laps[i + 1] || 0))}</span><span class="num sub">${fmtSw(t)}</span></li>`
  ).join('');
  tickSw();
}
const tickSw = () => { $('#swDisp').textContent = fmtSw(swElapsed()); };

// ---- Tabs & events ----
function showTab(id) {
  S.tab = id;
  $$('.pane').forEach(p => p.hidden = p.id !== id);
  $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset, now = Date.now();
  const t = S.timers.find(x => x.id === id);
  switch (act) {
    case 'tab': showTab(id); save('tab'); break;
    case 'tz-del': S.world = S.world.filter(z => z !== id); save('world'); renderWorld(); break;
    case 'alarm-del': S.alarms = S.alarms.filter(a => a.id !== id); save('alarms'); renderAlarms(); break;
    case 'preset': addTimer(+b.dataset.min * 60, ''); break;
    case 'timer-toggle':
      if (t.running) { t.left = t.endsAt - now; t.running = false; t.endsAt = null; }
      else { if (t.left <= 0) t.left = t.total; t.endsAt = now + t.left; t.running = true; }
      saveTimers(); break;
    case 'timer-reset': Object.assign(t, { running: false, endsAt: null, left: t.total }); saveTimers(); break;
    case 'timer-del': S.timers = S.timers.filter(x => x !== t); saveTimers(); break;
    case 'sw-start':
      if (S.sw.at) { S.sw.base = swElapsed(); S.sw.at = null; } else S.sw.at = now;
      save('sw'); renderSw(); break;
    case 'sw-lap':
      if (S.sw.at) S.sw.laps.unshift(swElapsed()); else S.sw = { at: null, base: 0, laps: [] };
      save('sw'); renderSw(); break;
  }
});

document.addEventListener('change', e => {
  const i = e.target.closest('[data-alarm]');
  if (!i) return;
  S.alarms.find(a => a.id === i.dataset.alarm).on = i.checked;
  save('alarms'); renderAlarms();
});

$('#tzForm').addEventListener('submit', e => {
  e.preventDefault();
  const tz = $('#tzSelect').value;
  if (!S.world.includes(tz)) { S.world.push(tz); save('world'); renderWorld(); }
});

$('#alarmForm').addEventListener('submit', e => {
  e.preventDefault();
  S.alarms.push({ id: uid(), time: $('#aTime').value, label: $('#aLabel').value.trim(), days: $$('#aDays input:checked').map(i => +i.value), on: true });
  S.alarms.sort((a, b) => a.time.localeCompare(b.time));
  save('alarms'); renderAlarms(); e.target.reset();
});

$('#timerForm').addEventListener('submit', e => {
  e.preventDefault();
  const sec = (+$('#tH').value || 0) * 3600 + (+$('#tM').value || 0) * 60 + (+$('#tS').value || 0);
  if (sec > 0) { addTimer(sec, $('#tLabel').value.trim()); e.target.reset(); }
});

// The background worker edits timers/alarms when they ring; keep the popup in sync.
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'local') return;
  if (c.timers) { S.timers = c.timers.newValue || []; renderTimers(); }
  if (c.alarms) { S.alarms = c.alarms.newValue || []; renderAlarms(); }
});

(async () => {
  Object.assign(S, await chrome.storage.local.get(Object.keys(S)));
  $('#tzSelect').innerHTML = Intl.supportedValuesOf('timeZone').map(z => `<option value="${z}">${z.replace(/_/g, ' ')}</option>`).join('');
  $('#aDays').innerHTML = DAYS.map((d, i) => `<label class="chip"><input type="checkbox" value="${i}" aria-label="${d}"><span>${d[0]}</span></label>`).join('');
  renderWorld(); renderAlarms(); renderTimers(); renderSw(); showTab(S.tab);
  setInterval(() => ({ world: tickWorld, timers: tickTimers, stopwatch: tickSw })[S.tab]?.(), 50);
})();
