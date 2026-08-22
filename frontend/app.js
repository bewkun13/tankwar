const API_BASE = window.TANK_RIVALS_API || '';
const STORAGE_KEY = 'tank-rivals-player-v1';
const BATCH_MS = 30_000;
const defaults = { side: 'thailand', totalShots: 0, pending: { thailand: 0, myanmar: 0 }, sessionId: crypto.randomUUID() };
let state = loadState();
let secondsLeft = 30;
let sending = false;

const $ = id => document.getElementById(id);
const format = number => Number(number || 0).toLocaleString('en-US');
const leaders = {
  thailand: [['Sarawut',24531],['Somchai',18223],['TH_TankMaster',12456],['BangkokHero',9876],['111y',7654]],
  myanmar: [['KaungSat',21433],['MyanmarTank',17892],['NayLin',11987],['HERO_MM',9001],['MinKhant',7321]]
};

function loadState(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaults, ...saved, pending: { ...defaults.pending, ...(saved?.pending || {}) }, sessionId: saved?.sessionId || crypto.randomUUID() };
  } catch { return { ...defaults, pending: { ...defaults.pending } }; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function pendingTotal(){ return state.pending.thailand + state.pending.myanmar; }
function renderPlayer(){
  $('yourShots').textContent = format(state.totalShots);
  $('pendingShots').textContent = format(pendingTotal());
  const thai = state.side === 'thailand';
  $('sideLabel').innerHTML = `<i class="mini-flag ${thai ? 'flag-th' : 'flag-mm'}"></i> ${thai ? 'THAILAND' : 'MYANMAR'}`;
}
function renderLeaders(){
  $('thLeaders').innerHTML = leaders.thailand.map(([n,s]) => `<li>${n}<span>${format(s)}</span></li>`).join('');
  $('mmLeaders').innerHTML = leaders.myanmar.map(([n,s]) => `<li>${n}<span>${format(s)}</span></li>`).join('');
}
function fire(){
  state.totalShots += 1; state.pending[state.side] += 1; saveState(); renderPlayer();
  $('fireButton').classList.add('firing'); setTimeout(() => $('fireButton').classList.remove('firing'), 90);
  const plus = document.createElement('span'); plus.className = 'plus-one'; plus.textContent = '+1'; plus.style.marginLeft = `${Math.random()*80-40}px`;
  const flash = document.createElement('span'); flash.className = 'muzzle';
  $('effects').append(plus, flash); setTimeout(() => { plus.remove(); flash.remove(); }, 750);
}
async function refreshScores(){
  try {
    const response = await fetch(`${API_BASE}/api/scores`, { cache: 'no-store' });
    if (!response.ok) throw new Error('score fetch failed');
    const data = await response.json();
    $('thScore').textContent = format(data.thailand); $('mmScore').textContent = format(data.myanmar);
    $('totalScore').textContent = $('statsTotal').textContent = format(data.total ?? data.thailand + data.myanmar);
    if (Number.isInteger(data.playersOnline)) $('online').textContent = format(data.playersOnline);
  } catch { $('syncStatus').textContent = navigator.onLine ? 'ยังเชื่อมต่อไม่ได้' : 'ออฟไลน์ — เก็บแต้มไว้แล้ว'; }
}
async function flushShots(){
  if (sending || !navigator.onLine || pendingTotal() === 0) return;
  sending = true; $('syncStatus').textContent = 'กำลังส่งคะแนน…';
  const batches = Object.entries(state.pending).filter(([,shots]) => shots > 0);
  for (const [side, shots] of batches) {
    try {
      const response = await fetch(`${API_BASE}/api/shots`, { method:'POST', headers:{'content-type':'application/json','x-session-id':state.sessionId}, body:JSON.stringify({side,shots}) });
      if (!response.ok) throw new Error('batch rejected');
      state.pending[side] = Math.max(0, state.pending[side] - shots); saveState(); renderPlayer();
    } catch { $('syncStatus').textContent = 'ส่งไม่สำเร็จ — จะลองใหม่'; sending = false; return; }
  }
  $('syncStatus').textContent = 'ส่งคะแนนแล้ว ✓'; sending = false; refreshScores();
}
function tick(){ secondsLeft -= 1; if (secondsLeft <= 0) { secondsLeft = 30; flushShots(); } $('countdown').textContent = `00:${String(secondsLeft).padStart(2,'0')}`; }

$('fireButton').addEventListener('click', fire);
$('changeSide').addEventListener('click', () => { state.side = state.side === 'thailand' ? 'myanmar' : 'thailand'; saveState(); renderPlayer(); });
document.addEventListener('keydown', event => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat && event.target === document.body) { event.preventDefault(); fire(); } });
$('howButton').addEventListener('click', () => $('howDialog').showModal());
$('howDialog').querySelector('.close').addEventListener('click', () => $('howDialog').close());
$('howDialog').querySelector('.got-it').addEventListener('click', () => $('howDialog').close());
window.addEventListener('online', () => { $('syncStatus').textContent = 'กลับมาออนไลน์แล้ว'; flushShots(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveState(); });
window.addEventListener('pagehide', saveState);
renderPlayer(); renderLeaders(); refreshScores(); setInterval(tick, 1000); setInterval(refreshScores, 30_000);

