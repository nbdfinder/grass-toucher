// Grass Toucher background worker.
// Counts active browsing minutes (alarms + idle detection) and redraws the
// toolbar icon so the grass grows shaggier the longer you go without touching
// it. Touching the grass in the popup "mows" the icon back to fresh.

const TICK = 'tick';

// minutes since last mow → icon level
function levelFor(minutes) {
  if (minutes >= 180) return 3; // jungle
  if (minutes >= 90) return 2;  // shaggy
  if (minutes >= 30) return 1;  // getting long
  return 0;                     // fresh cut
}

const TITLES = [
  'Grass Toucher — lawn is looking fresh',
  'Grass Toucher — grass is getting long…',
  'Grass Toucher — your lawn needs you',
  'Grass Toucher — it’s a jungle in there. Touch grass.',
];

// Deterministic PRNG so each level always draws the same clump.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREENS = ['#2c7d3a', '#3aa04a', '#4fbe58'];

function drawIcon(size, level) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d');
  const rnd = mulberry32(level * 7 + 3);
  const baseY = size * 0.98;
  const heightFactor = [0.5, 0.66, 0.82, 0.98][level];
  const messiness = 0.15 + level * 0.3;
  const count = 7 + level * 2;

  for (let i = 0; i < count; i++) {
    const x = size * (0.12 + (0.76 * i) / (count - 1)) + (rnd() - 0.5) * size * 0.06;
    const len = size * heightFactor * (0.62 + rnd() * 0.38);
    const bend = (rnd() - 0.5) * 2 * messiness;
    const w = Math.max(1, size * 0.045);

    const tipX = x + bend * len * 0.65;
    const tipY = baseY - len * (1 - 0.18 * bend * bend);
    const cx = x + bend * len * 0.22;
    const cy = baseY - len * 0.5;

    g.fillStyle = GREENS[(rnd() * GREENS.length) | 0];
    g.beginPath();
    g.moveTo(x - w, baseY);
    g.quadraticCurveTo(cx - w * 0.4, cy, tipX, tipY);
    g.quadraticCurveTo(cx + w * 0.4, cy, x + w, baseY);
    g.closePath();
    g.fill();
  }

  // a dandelion sneaks in when the lawn is a jungle
  if (level === 3) {
    const dx = size * 0.72;
    const dy = size * 0.22;
    g.strokeStyle = '#3aa04a';
    g.lineWidth = Math.max(1, size * 0.04);
    g.beginPath();
    g.moveTo(dx - size * 0.06, baseY);
    g.quadraticCurveTo(dx, size * 0.55, dx, dy + size * 0.08);
    g.stroke();
    g.fillStyle = '#ffd93d';
    g.beginPath();
    g.arc(dx, dy, size * 0.1, 0, Math.PI * 2);
    g.fill();
  }

  return g.getImageData(0, 0, size, size);
}

async function updateIcon(level) {
  try {
    await chrome.action.setIcon({
      imageData: {
        16: drawIcon(16, level),
        32: drawIcon(32, level),
        64: drawIcon(64, level),
      },
    });
    await chrome.action.setTitle({ title: TITLES[level] });
  } catch (e) {
    // icon drawing should never take the worker down
  }
}

async function refreshIcon() {
  const { minutesSinceMow } = await chrome.storage.local.get({ minutesSinceMow: 0 });
  await updateIcon(levelFor(minutesSinceMow));
}

function ensureAlarm() {
  chrome.alarms.create(TICK, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  refreshIcon();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  refreshIcon();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK) return;

  const state = await chrome.idle.queryState(60);
  if (state !== 'active') return;

  const data = await chrome.storage.local.get({
    minutesSinceMow: 0,
    minutesToday: 0,
    todayKey: '',
  });

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
  const minutesToday = data.todayKey === today ? data.minutesToday + 1 : 1;
  const minutesSinceMow = data.minutesSinceMow + 1;

  await chrome.storage.local.set({ minutesSinceMow, minutesToday, todayKey: today });

  const level = levelFor(minutesSinceMow);
  if (level !== levelFor(data.minutesSinceMow)) {
    await updateIcon(level);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'mowed') {
    chrome.storage.local.set({ minutesSinceMow: 0 }).then(() => updateIcon(0));
  }
});
