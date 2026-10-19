// Keeps timers and alarms ringing while the popup is closed.
const pad = n => String(n).padStart(2, '0');
const hms = ms => { const s = Math.ceil(ms / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad).join(':'); };

// Next time an alarm should ring (ms timestamp), or undefined.
function nextTime(a) {
  const [h, m] = a.time.split(':').map(Number);
  const now = new Date();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d > now && (!a.days.length || a.days.includes(d.getDay()))) return d.getTime();
  }
}

// Make chrome.alarms match what's saved in storage.
async function sync() {
  const { timers = [], alarms = [] } = await chrome.storage.local.get(['timers', 'alarms']);
  const want = {};
  timers.forEach(t => { if (t.running) want['timer:' + t.id] = t.endsAt; });
  alarms.forEach(a => { if (a.on) { const w = nextTime(a); if (w) want['alarm:' + a.id] = w; } });
  for (const x of await chrome.alarms.getAll()) if (!(x.name in want)) chrome.alarms.clear(x.name);
  for (const [name, when] of Object.entries(want)) {
    const cur = await chrome.alarms.get(name);
    if (!cur || cur.scheduledTime !== when) chrome.alarms.create(name, { when });
  }
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.timers || c.alarms)) sync(); });
chrome.notifications.onClicked.addListener(id => chrome.notifications.clear(id));

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  const [kind, id] = name.split(':');
  const key = kind + 's';
  const list = (await chrome.storage.local.get(key))[key] || [];
  const item = list.find(x => x.id === id);
  if (!item) return;
  let title, message;
  if (kind === 'timer') {
    Object.assign(item, { running: false, endsAt: null, left: item.total });
    title = 'Timer done';
    message = item.label || hms(item.total) + ' is up';
  } else {
    if (!item.days.length) item.on = false; // one-time alarms switch themselves off
    const [h, m] = item.time.split(':').map(Number);
    title = item.label || 'Alarm';
    message = new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  await chrome.storage.local.set({ [key]: list });
  chrome.notifications.create(name + ':' + Date.now(), {
    type: 'basic', iconUrl: 'icons/icon128.png', title, message,
    priority: 2, requireInteraction: true
  });
});
