const API_BASE = window.TANK_RIVALS_API || '';
const STORAGE_KEY = 'tank-rivals-player-v3';
const BATCH_MS = 10_000;
const SYNC_SECONDS = BATCH_MS / 1000;
const defaults = { side: 'thailand', pending: { thailand: 0, cambodia: 0 }, cachedScores: { thailand: 0, cambodia: 0 }, sessionId: crypto.randomUUID() };
let state = loadState();
let sessionShots = 0;
let secondsLeft = SYNC_SECONDS;
let sending = false;
let displayedScores = { ...state.cachedScores };

const $ = id => document.getElementById(id);
const format = number => Number(number || 0).toLocaleString('en-US');
const leaders = {
  thailand: [['Sarawut',24531],['Somchai',18223],['TH_TankMaster',12456],['BangkokHero',9876],['111y',7654]],
  cambodia: [['Sokha',21433],['KhmerTank',17892],['Dara',11987],['HERO_KH',9001],['Vannak',7321]]
};

function loadState(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaults, ...saved, pending: { ...defaults.pending, ...(saved?.pending || {}) }, cachedScores: { ...defaults.cachedScores, ...(saved?.cachedScores || {}) }, sessionId: saved?.sessionId || crypto.randomUUID() };
  } catch { return { ...defaults, pending: { ...defaults.pending } }; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function pendingTotal(){ return state.pending.thailand + state.pending.cambodia; }
function renderPlayer(){
  $('totalScore').textContent = format(sessionShots);
  $('pendingShots').textContent = format(pendingTotal());
  const thai = state.side === 'thailand';
  $('sideLabel').innerHTML = `<i class="mini-flag ${thai ? 'flag-th' : 'flag-mm'}"></i> ${thai ? 'THAILAND' : 'CAMBODIA'}`;
}
function renderGlobal(){
  const total = displayedScores.thailand + displayedScores.cambodia;
  $('thScore').textContent = format(displayedScores.thailand);
  $('mmScore').textContent = format(displayedScores.cambodia);
  $('statsTotal').textContent = format(total);
}
function popScore(id){
  const element = $(id); element.classList.remove('score-pop'); void element.offsetWidth; element.classList.add('score-pop');
}
function renderLeaders(){
  $('thLeaders').innerHTML = leaders.thailand.map(([n,s]) => `<li>${n}<span>${format(s)}</span></li>`).join('');
  $('mmLeaders').innerHTML = leaders.cambodia.map(([n,s]) => `<li>${n}<span>${format(s)}</span></li>`).join('');
}
function fire(){
  sessionShots += 1; state.pending[state.side] += 1; displayedScores[state.side] += 1; state.cachedScores = { ...displayedScores }; saveState(); renderPlayer(); renderGlobal();
  popScore('totalScore'); popScore(state.side === 'thailand' ? 'thScore' : 'mmScore');
  $('game').classList.remove('arena-hit'); void $('game').offsetWidth; $('game').classList.add('arena-hit');
  $('fireButton').classList.add('firing'); setTimeout(() => $('fireButton').classList.remove('firing'), 90);
  const plus = document.createElement('span'); plus.className = 'plus-one'; plus.textContent = '+1'; plus.style.marginLeft = `${Math.random()*80-40}px`;
  const flash = document.createElement('span'); flash.className = 'muzzle';
  const tracer = document.createElement('span'); tracer.className = `tracer tracer-${state.side}`;
  const attacker = document.createElement('span'); attacker.className = `tank-fx attacker-fx attacker-${state.side}`;
  const barrelBlast = document.createElement('span'); barrelBlast.className = `barrel-blast blast-${state.side}`;
  const targetSide = state.side === 'thailand' ? 'cambodia' : 'thailand';
  const impact = document.createElement('span'); impact.className = `tank-fx impact-fx impact-${targetSide}`;
  const smoke = document.createElement('span'); smoke.className = `tank-fx smoke-fx smoke-${targetSide}`;
  const particles = Array.from({ length: 8 }, (_, index) => { const spark = document.createElement('span'); spark.className = 'spark'; spark.style.setProperty('--angle', `${index * 45 + Math.random()*18}deg`); spark.style.setProperty('--distance', `${55 + Math.random()*55}px`); return spark; });
  $('effects').append(plus, flash, tracer, attacker, barrelBlast, impact, smoke, ...particles); setTimeout(() => { plus.remove(); flash.remove(); tracer.remove(); attacker.remove(); barrelBlast.remove(); impact.remove(); smoke.remove(); particles.forEach(p => p.remove()); }, 900);
}
async function refreshScores(){
  try {
    const response = await fetch(`${API_BASE}/api/scores`, { cache: 'no-store' });
    if (!response.ok) throw new Error('score fetch failed');
    const data = await response.json();
    displayedScores = { thailand:Number(data.thailand || 0) + state.pending.thailand, cambodia:Number(data.cambodia || 0) + state.pending.cambodia };
    state.cachedScores = { ...displayedScores }; saveState(); renderGlobal();
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
function tick(){ secondsLeft -= 1; if (secondsLeft <= 0) { secondsLeft = SYNC_SECONDS; flushShots(); } }

$('fireButton').addEventListener('click', fire);
$('changeSide').addEventListener('click', () => { state.side = state.side === 'thailand' ? 'cambodia' : 'thailand'; saveState(); renderPlayer(); });
document.addEventListener('keydown', event => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat && event.target === document.body) { event.preventDefault(); fire(); } });
$('howButton').addEventListener('click', () => $('howDialog').showModal());
$('howDialog').querySelector('.close').addEventListener('click', () => $('howDialog').close());
$('howDialog').querySelector('.got-it').addEventListener('click', () => $('howDialog').close());
window.addEventListener('online', () => { $('syncStatus').textContent = 'กลับมาออนไลน์แล้ว'; flushShots(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveState(); });
window.addEventListener('pagehide', saveState);
renderPlayer(); renderGlobal(); renderLeaders(); refreshScores(); setInterval(tick, 1000); setInterval(refreshScores, BATCH_MS);

