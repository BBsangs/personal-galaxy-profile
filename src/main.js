import { stations, sections, mapSize, galaxies, portals, billboardMarkup, stationTimeline, profile, profileSummary, portraitMarkup } from './content.js';

const $ = selector => document.querySelector(selector);
const world = $('#world');
const billboard = $('#billboard');
const visited = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const input = { up: false, down: false, left: false, right: false, brake: false, boost: false };
const joystick = $('#joystick');
const fireButton = $('#fire-laser');
const guide = $('#flight-guide');
const compactScreen = matchMedia('(max-width: 767px)');
const compactMenu = matchMedia('(max-width: 767px), (max-height: 600px)');
const menuToggle = $('#flight-menu-toggle');
function setMenuOpen(open = false) {
  const expanded = compactMenu.matches && open;
  menuToggle.hidden = !compactMenu.matches || expanded;
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? '收起飞行菜单' : '展开飞行菜单');
  $('.flight-toolbar').hidden = compactMenu.matches && !expanded;
  if (expanded) $('#overview').focus({ preventScroll: true });
}
menuToggle.addEventListener('click', () => { noteControl(); setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'); });
$('.flight-toolbar').addEventListener('click', e => { if (e.target.closest('button')) setMenuOpen(); });
compactMenu.addEventListener('change', () => setMenuOpen());
setMenuOpen();
const pressedKeys = new Set();
const stickAxes = { up: 0, down: 0, left: 0, right: 0 };
let joystickPointer = null;
let firePointer = null;
let controlMode = '';
let viewportWidth = window.innerWidth;
let firstGuide = true;
try { firstGuide = localStorage.getItem('galaxy-guide-seen') !== '1'; } catch { /* Storage can be unavailable inside embedded browsers. */ }
let guideUntil = 0, nextGuideAt = 0, guideIndex = -1;
let flightIdle = false;
let weaponState = '';
let worldApi;
let worldPromise;
let nearby = null;
let toastTimer;
let inTransit = false;
let building = true;

$('#profile-summary').innerHTML = profileSummary;
$('#profile-portrait').innerHTML = portraitMarkup;

$('#resume-content').innerHTML = Object.entries(sections).map(([id, section]) => `<section id="resume-${id}" class="resume-section"><h2>${section.heading}</h2>${section.body}</section>`).join('');
$('.station-labels').innerHTML = stations.map(s => `<button data-station="${s.id}" aria-label="前往${s.title}，${stationTimeline(s).join('，')}">${s.title}</button>`).join('');
$('#destination').innerHTML += galaxies.map(g => `<optgroup label="${g.title}">${stations.filter(s => s.galaxy === g.id).map(s => `<option value="${s.id}">${s.title}</option>`).join('')}</optgroup>`).join('');
$('#map-stations').innerHTML = galaxies.map(g => `<button class="atlas-galaxy" data-station="${g.destination}" style="left:${(g.x / mapSize.width + .5) * 100}%;top:${((g.z - g.radius - 13) / mapSize.depth + .5) * 100}%;--sector-color:${g.color}">${g.title}<small>${g.english}</small></button>`).join('') + stations.map((s,i) => `<button class="map-station ${s.kind}" data-station="${s.id}" style="left:${(s.x / mapSize.width + .5) * 100}%;top:${(s.z / mapSize.depth + .5) * 100}%;--sector-color:${galaxies.find(g=>g.id===s.galaxy).color}" aria-label="前往${s.title}" title="${s.title}"><span>${String(i+1).padStart(2,'0')}</span></button>`).join('') + portals.map(p=>`<button class="map-portal" data-station="${p.destination}" style="left:${(p.x / mapSize.width + .5) * 100}%;top:${(p.z / mapSize.depth + .5) * 100}%" aria-label="传送至${p.title}" title="传送至${p.title}"></button>`).join('');
$('.map-panel').open = matchMedia('(min-width: 768px)').matches;
$('#visited-count').textContent = `0 / ${stations.length}`;
$('.warp-stars').innerHTML=Array.from({length:48},(_,i)=>`<i style="--angle:${i*137.508}deg;--delay:${(i%7)*-.13}s;--reach:${20+i%5*10}vw"></i>`).join('');
$('#build-star-chart').innerHTML = galaxies.map((g, i) => `<span class="build-sector" style="left:${(g.x / mapSize.width + .5) * 100}%;top:${(g.z / mapSize.depth + .5) * 100}%" data-reveal="${28 + i * 4}"><i></i><b>${g.title}</b><small>${g.english}</small></span>`).join('') + stations.map((s, i) => `<i class="build-station" style="left:${(s.x / mapSize.width + .5) * 100}%;top:${(s.z / mapSize.depth + .5) * 100}%" data-reveal="${42 + Math.round((i + 1) / stations.length * 32)}"></i>`).join('');

function setBuilding(value) {
  building = value;
  document.body.classList.toggle('is-building', value);
  $('#destination').disabled = value;
  document.querySelectorAll('.station-labels,.map-panel,.flight-menu,.touch-controls,.weapon-control').forEach(node => { node.inert = value; });
  if (value) clearInput();
  syncGuide();
}
let buildPercent = -1;
function updateBuild(percent, message) {
  if (percent !== buildPercent) {
    buildPercent = percent;
    $('#build-percent').innerHTML = `${percent}<small>%</small>`;
    $('#build-progress').value = percent;
    document.querySelectorAll('[data-reveal]').forEach(node => node.classList.toggle('charted', percent >= Number(node.dataset.reveal)));
    let current = true;
    document.querySelectorAll('[data-phase]').forEach(node => {
      const done = percent >= Number(node.dataset.phase);
      node.classList.toggle('complete', done); node.classList.toggle('current', !done && current);
      node.querySelector('span').textContent = done ? '完成' : current ? '进行中' : '等待';
      if (!done) current = false;
    });
  }
  if ($('#build-status').textContent !== message) $('#build-status').textContent = message;
}
setBuilding(true);

function drawMap() {
  const canvas = $('.minimap canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();ctx.scale(canvas.width / mapSize.width, canvas.height / mapSize.depth);ctx.translate(mapSize.width / 2, mapSize.depth / 2);
  let seed=79;
  for(let i=0;i<460;i++){
    seed=(seed*16807)%2147483647;const x=(seed/2147483647-.5)*mapSize.width;
    seed=(seed*16807)%2147483647;const z=(seed/2147483647-.5)*mapSize.depth;
    ctx.fillStyle=i%9?'#7184a850':'#dcecffaa';ctx.fillRect(x,z,i%9?.5:1.2,i%9?.5:1.2);
  }
  ctx.strokeStyle='#607fa31a';ctx.lineWidth=.6;
  for(let x=-350;x<=350;x+=50){ctx.beginPath();ctx.moveTo(x,-325);ctx.lineTo(x,325);ctx.stroke();}
  for(let z=-300;z<=300;z+=50){ctx.beginPath();ctx.moveTo(-380,z);ctx.lineTo(380,z);ctx.stroke();}
  galaxies.forEach(g=>{
    const glow=ctx.createRadialGradient(g.x,g.z,0,g.x,g.z,g.radius*1.2);glow.addColorStop(0,g.color+'28');glow.addColorStop(.45,g.color+'12');glow.addColorStop(1,g.color+'00');
    ctx.fillStyle=glow;ctx.fillRect(g.x-g.radius*1.2,g.z-g.radius*1.2,g.radius*2.4,g.radius*2.4);
    ctx.strokeStyle=g.color+'55';ctx.setLineDash([2,5]);ctx.beginPath();ctx.ellipse(g.x,g.z,g.radius,g.radius*.82,-.25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle=g.color+'22';ctx.beginPath();ctx.arc(g.x,g.z,g.radius*.5,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<24;i++){const a=i*Math.PI/12,r=g.radius+5;ctx.beginPath();ctx.moveTo(g.x+Math.cos(a)*r,g.z+Math.sin(a)*r*.82);ctx.lineTo(g.x+Math.cos(a)*(r+3),g.z+Math.sin(a)*(r+3)*.82);ctx.stroke();}
  });
  ctx.strokeStyle='#7ca0b943';ctx.setLineDash([3,7]);
  portals.forEach(p=>{const target=stations.find(s=>s.id===p.destination);ctx.beginPath();ctx.moveTo(p.x,p.z);ctx.quadraticCurveTo((p.x+target.x)/2+35,(p.z+target.z)/2-35,target.x,target.z);ctx.stroke();});ctx.setLineDash([]);
  stations.forEach(s=>{ctx.strokeStyle=galaxies.find(g=>g.id===s.galaxy).color+'88';ctx.fillStyle=visited.has(s.id)?'#9be4c831':'#18263c80';ctx.beginPath();ctx.arc(s.x,s.z,s.radius,0,Math.PI*2);ctx.fill();ctx.stroke();});
  ctx.restore();
}
drawMap();
$('#expand-map').addEventListener('click',()=>{
  const expanded=$('.map-panel').classList.toggle('expanded');$('#expand-map').setAttribute('aria-pressed',String(expanded));$('#expand-map').textContent=expanded?'收起星图':'展开星图';
});
$('#map-stations').addEventListener('pointerover',event=>{
  const station=stations.find(s=>s.id===event.target.closest('[data-station]')?.dataset.station);
  if(station){$('#map-selection').textContent=station.title;$('#map-date').textContent=station.project?.date||station.job?.date||galaxies.find(g=>g.id===station.galaxy).title;}
});
$('#map-stations').addEventListener('focusin',event=>event.target.dispatchEvent(new PointerEvent('pointerover',{bubbles:true})));

function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2500);
}
function syncInput() {
  Object.keys(input).forEach(key => { input[key] = stickAxes[key] || false; });
  for (const code of pressedKeys) input[keys[code]] = true;
}
function resetJoystick() {
  joystickPointer = null;
  Object.keys(stickAxes).forEach(key => { stickAxes[key] = 0; });
  joystick.classList.remove('active');
  joystick.style.setProperty('--stick-x', '0px');
  joystick.style.setProperty('--stick-y', '0px');
  syncInput();
}
function clearInput() {
  pressedKeys.clear();
  resetJoystick();
  firePointer = null;
  worldApi?.cancelFire();
}
function renderGuide() {
  const touch = controlMode === 'touch';
  const tips = [
    ['试着驾驶飞船', touch ? '拖动右下摇杆飞行，横向拖动可原地转向。' : '<kbd>W / S</kbd> 前进、后退 · <kbd>A / D</kbd> 原地转向<br><kbd>Shift</kbd> 加速 · <kbd>空格</kbd> 刹车'],
    ['来一发蓄力激光', (touch ? '轻点场景开火，按住场景或左下开火键' : '按住<kbd>鼠标左键 / J</kbd>') + '蓄力，5 秒满功率；继续按住会变红，8 秒过热告警，10 秒自动发射。随时松手可发射，冷却 3 秒。'],
    ['去下一座岛屿看看', '靠近岛屿会自动展开履历。点击站点或使用「快速到达」，近处自动飞行，远处跃迁。'],
  ];
  if (guideIndex < 0) return;
  $('#guide-title').textContent = tips[guideIndex][0];
  $('#guide-copy').innerHTML = tips[guideIndex][1];
}
function syncGuide() {
  if (building || inTransit || nearby || $('#explore').hidden || document.hidden || document.body.classList.contains('is-overview') || world.classList.contains('error')) {
    guideUntil = 0; guide.hidden = true; return;
  }
  const now = performance.now();
  if (guideUntil && now >= guideUntil) guideUntil = 0;
  if (!guideUntil && now >= nextGuideAt && (firstGuide || flightIdle)) {
    guideIndex = (guideIndex + 1) % 3;
    renderGuide();
    guideUntil = now + 6000;
    nextGuideAt = now + 30000;
    if (firstGuide) {
      firstGuide = false;
      try { localStorage.setItem('galaxy-guide-seen', '1'); } catch { /* The current visit still works without persistence. */ }
    }
  }
  guide.hidden = !guideUntil;
}
function noteControl() {
  flightIdle = false;
  guideUntil = 0;
  guide.hidden = true;
}
function setControlMode(mode) {
  if (controlMode === mode) return;
  controlMode = mode;
  clearInput();
  document.body.dataset.controls = mode;
  if (mode === 'touch') $('.map-panel').open = false;
  renderGuide();
}
function updateFlightStatus({ charge, chargeLimit = 5, overcharge = 0, autoFireIn = 10, cooldown, charging, idle, piloting, heading }) {
  if (piloting) noteControl();
  flightIdle = idle;
  syncGuide();
  const state = cooldown > 0 ? 'cooldown' : !charging ? 'ready' : overcharge >= .6 ? 'warning' : overcharge > 0 ? 'overcharging' : charge >= 1 ? 'charged' : 'charging';
  const label = state === 'cooldown' ? `冷却 ${cooldown.toFixed(1)}s` : state === 'warning' ? '过热警告' : state === 'overcharging' ? '能量过载' : charging ? (charge >= 1 ? '已蓄满' : `蓄力 ${Math.round(charge * 100)}%`) : '激光就绪';
  if ($('#weapon-label').textContent !== label) $('#weapon-label').textContent = label;
  const hint = cooldown > 0 ? '等待冷却' : charging ? (charge >= 1 ? `自动 ${autoFireIn.toFixed(1)}s` : `${(charge * chargeLimit).toFixed(1)} / ${chargeLimit}s`) : `长按 · ${chargeLimit}秒满`;
  if ($('#weapon-hint').textContent !== hint) $('#weapon-hint').textContent = hint;
  const level = cooldown > 0 ? cooldown / 3 : charge;
  $('#weapon-progress').value = level;
  const fill = `${Math.round(level * 100)}%`;
  if ($('.weapon-control').style.getPropertyValue('--weapon-fill') !== fill) $('.weapon-control').style.setProperty('--weapon-fill', fill);
  const heatColor = `rgb(${Math.round(201 + overcharge * 54)}, ${Math.round(182 - overcharge * 108)}, ${Math.round(255 - overcharge * 205)})`;
  if ($('.weapon-control').style.getPropertyValue('--overheat-color') !== heatColor) $('.weapon-control').style.setProperty('--overheat-color', heatColor);
  if (Number.isFinite(heading)) {
    const degrees = ((Math.round(heading * 180 / Math.PI) % 360) + 360) % 360;
    const direction = `${String(degrees).padStart(3, '0')}°`;
    if ($('#heading-value').textContent !== direction) $('#heading-value').textContent = direction;
  }
  fireButton.setAttribute('aria-disabled', String(cooldown > 0));
  if (state !== weaponState) {
    weaponState = state;
    $('.weapon-control').dataset.state = state;
    $('#weapon-announcement').textContent = state === 'cooldown' ? '激光炮冷却中' : state === 'warning' ? '过热警告，即将自动发射；松手可立即发射' : state === 'overcharging' ? '已满功率，继续蓄力正在过载' : state === 'charged' ? '蓄力完成，松开发射' : state === 'charging' ? '正在蓄力' : '激光就绪';
  }
}
$('#dismiss-guide').addEventListener('click', () => { guideUntil = 0; nextGuideAt = performance.now() + 30000; syncGuide(); world.focus({ preventScroll: true }); });
function syncActivity() {
  const active = !$('#explore').hidden && !document.hidden;
  worldApi?.setActive(active);
  if (!active) clearInput();
  syncGuide();
}
function setBillboardOpen(open) {
  $('.billboard-header').hidden = !open;
  $('.billboard-face').hidden = !open;
  $('#reopen-billboard').hidden = open;
  $('#reopen-billboard').setAttribute('aria-expanded', String(open));
  billboard.classList.toggle('is-collapsed', !open);
  document.body.classList.toggle('at-station', Boolean(nearby) && open);
}
function setNearby(station, reopen = false) {
  if (!reopen && nearby?.id === station?.id) return;
  nearby = station;
  syncGuide();
  billboard.hidden = !station;
  setBillboardOpen(Boolean(station));
  document.querySelectorAll('[data-station]').forEach(button => button.classList.toggle('nearby', button.dataset.station === station?.id));
  $('#location-status').textContent = station ? `已抵达：${station.title}` : '';
  if (!station) return;
  setMenuOpen();
  visited.add(station.id);
  drawMap();
  $('#visited-count').textContent = `${visited.size} / ${stations.length}`;
  $('#billboard-category').textContent = galaxies.find(g => g.id === station.galaxy).title;
  $('#billboard-title').textContent = station.title;
  $('#reopen-billboard-title').textContent = station.title;
  $('#billboard-content').innerHTML = billboardMarkup(station);
  $('.billboard-face').scrollTop = 0;
  billboard.dataset.station = station.id;
  document.querySelectorAll('[data-station]').forEach(button => button.classList.toggle('visited', visited.has(button.dataset.station)));
}
function dismissBillboard() {
  setBillboardOpen(false);
  world.focus({ preventScroll: true });
}
$('#close-billboard').addEventListener('click', dismissBillboard);
$('#reopen-billboard').addEventListener('click', () => {
  if (!nearby) return;
  setBillboardOpen(true);
  $('.billboard-face').focus({ preventScroll: true });
});
function sceneError() {
  clearInput();
  setBuilding(false);
  world.classList.add('error');
  syncGuide();
  $('.world-loading').hidden = false;
  $('.world-loading').classList.remove('is-revealing');
  $('#build-status').textContent = '3D 暂不可用，可用「快速到达」阅读站点，或阅读文字简历。';
  $('.build-fallback').hidden = false;
}
function syncOverview(value) {
  $('#overview').setAttribute('aria-pressed', String(value));
  $('#overview-label').textContent = value ? '飞船' : '全景';
  $('#flight-mode').textContent = value ? '星系导航' : '飞行控制';
  document.body.classList.toggle('is-overview', value);
  syncGuide();
}
async function loadWorld() {
  if (worldPromise) return worldPromise;
  updateBuild(4, '载入飞行系统…');
  worldPromise = import('./world.js').then(async ({ createWorld }) => {
    worldApi = await createWorld(world, input, setNearby, sceneError, travel, updateBuild, syncOverview, updateFlightStatus);
    $('.world-loading').classList.add('is-revealing');
    const reveal = worldApi.reveal();
    syncActivity();
    await reveal;
    if (!world.classList.contains('error')) $('.world-loading').hidden = true;
    setBuilding(false);
  }).catch(error => { console.warn('3D scene unavailable:', error.message); sceneError(); });
  return worldPromise;
}
function route() {
  setMenuOpen();
  const hash = location.hash;
  const resume = hash.startsWith('#resume');
  $('#explore').hidden = resume;
  $('#resume').hidden = !resume;
  if (!resume) loadWorld();
  syncActivity();
  if (hash.startsWith('#resume-')) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
  else window.scrollTo(0, 0);
}
async function travel(id) {
  const returning=id==='home';
  const station = stations.find(s => s.id === id);
  if ((!station&&!returning) || inTransit || building) return;
  if (station && nearby?.id === station.id) {
    if ($('#explore').hidden) location.hash = '#explore';
    setNearby(station, true);
    $('#destination').value = '';
    world.focus({ preventScroll: true });
    return;
  }
  setMenuOpen();
  inTransit = true;
  document.body.classList.add('is-navigating');
  try {
    if ($('#explore').hidden) location.hash = '#explore';
    clearInput();
    await loadWorld();
    syncOverview(false);
    $('.map-panel').classList.remove('expanded');
    $('#expand-map').setAttribute('aria-pressed','false');$('#expand-map').textContent='展开星图';
    if (matchMedia('(max-width: 767px)').matches) $('.map-panel').open = false;
    const onStart = mode => {
      $('#flight-mode').textContent = mode === 'flight' ? '自动靠近' : '正在跃迁';
      $('#location-status').textContent = returning ? '正在归航' : `正在${mode === 'flight' ? '飞往' : '跃迁至'}${station.title}`;
      if (mode !== 'warp') return;
      $('#warp-destination').textContent=returning?'返回起点':station.title;
      document.body.style.setProperty('--warp-duration',returning?'3.2s':'2.4s');
      document.body.classList.toggle('is-returning',returning);
      document.body.classList.add('is-warping');
    };
    if (worldApi && !world.classList.contains('error')) {
      if(returning)await worldApi.reset(onStart);
      else await worldApi.travel(station,onStart);
    } else setNearby(returning?null:station);
    world.focus({ preventScroll: true });
    if(returning)showToast('已返回出发地');
  } finally {
    document.body.classList.remove('is-warping','is-returning','is-navigating');
    syncOverview(false);
    $('#destination').value = '';
    inTransit = false;
    clearInput();
  }
}
$('#destination').addEventListener('change', e => travel(e.target.value));
document.querySelectorAll('[data-station]').forEach(button => button.addEventListener('click', () => travel(button.dataset.station)));
world.addEventListener('pointerdown', e => {
  if (e.target === world || e.target.tagName === 'CANVAS') world.focus({ preventScroll: true });
});
document.addEventListener('click', e => {
  const privacy = e.target.closest('[data-private-toggle]');
  if (privacy) {
    const field = privacy.closest('[data-private-field]');
    const reveal = privacy.getAttribute('aria-pressed') !== 'true';
    privacy.setAttribute('aria-pressed', String(reveal));
    privacy.setAttribute('aria-label', `${reveal ? '隐藏' : '显示'}${field.dataset.privateLabel}`);
    field.querySelector('[data-private-value]').textContent = reveal ? profile[field.dataset.privateField] : field.dataset.privateMask;
    return;
  }

});
$('#reset-car').addEventListener('click', () => travel('home'));
async function toggleOverview() {
  if (inTransit || building) return;
  await loadWorld();
  if (!worldApi || world.classList.contains('error')) return;
  const overview = $('#overview').getAttribute('aria-pressed') !== 'true';
  clearInput();
  worldApi?.setOverview(overview);
  syncOverview(overview);
  world.focus({ preventScroll: true });
}
$('#overview').addEventListener('click', toggleOverview);
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', async () => {
  if (inTransit || building) return;
  await loadWorld();
  worldApi?.zoomBy(Number(button.dataset.zoom));
  world.focus({ preventScroll: true });
}));
const keys = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost' };
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !$('#explore').hidden) {
    if (!billboard.hidden && !$('.billboard-face').hidden) dismissBillboard();
    else if (menuToggle.getAttribute('aria-expanded') === 'true') { setMenuOpen(); menuToggle.focus(); }
    return;
  }
  if (building || inTransit || e.metaKey || e.ctrlKey || e.altKey || $('#explore').hidden || world.classList.contains('error')) return;
  if (e.target !== joystick && e.target !== fireButton && e.target.closest('button,a,input,textarea,select,summary,.billboard-face,[contenteditable="true"]')) return;
  if (keys[e.code] || e.code === 'KeyJ' || e.code === 'KeyR' || e.code === 'KeyM') { setControlMode('keyboard'); noteControl(); }
  if (keys[e.code]) { e.preventDefault(); pressedKeys.add(e.code); syncInput(); }
  if (e.code === 'KeyJ') { e.preventDefault(); if (!e.repeat) worldApi?.beginFire('keyboard'); }
  if (e.target === fireButton && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); if (!e.repeat) worldApi?.beginFire('button-key'); pressedKeys.delete(e.code); syncInput(); }
  if (e.code === 'KeyR'&&!e.repeat) { e.preventDefault(); travel('home'); }
  if (e.code === 'KeyM'&&!e.repeat) { e.preventDefault(); toggleOverview(); }
});
window.addEventListener('keyup', e => {
  if (keys[e.code]) { pressedKeys.delete(e.code); syncInput(); }
  if (e.code === 'KeyJ') worldApi?.endFire('keyboard');
  if (e.code === 'Space' || e.code === 'Enter') worldApi?.endFire('button-key');
});
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', syncActivity);
function moveJoystick(e) {
  if (e.pointerId !== joystickPointer) return;
  const rect = joystick.getBoundingClientRect();
  const radius = rect.width / 2 - 23;
  let x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2;
  const scale = Math.min(1, radius / Math.max(1, Math.hypot(x, y)));
  x *= scale; y *= scale;
  joystick.style.setProperty('--stick-x', `${x}px`);
  joystick.style.setProperty('--stick-y', `${y}px`);
  const axis = value => Math.max(0, (value / radius - .12) / .88);
  stickAxes.left = axis(-x); stickAxes.right = axis(x);
  stickAxes.up = axis(-y); stickAxes.down = axis(y);
  syncInput();
  noteControl();
}
joystick.addEventListener('pointerdown', e => {
  if (e.button !== 0 || joystickPointer !== null || inTransit || building || $('#explore').hidden || world.classList.contains('error')) return;
  e.preventDefault();
  setControlMode('touch');
  joystickPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  joystick.classList.add('active');
  moveJoystick(e);
});
joystick.addEventListener('pointermove', moveJoystick);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(event, e => {
  if (e.pointerId === joystickPointer) resetJoystick();
});
fireButton.addEventListener('pointerdown', e => {
  if (e.button !== 0 || firePointer !== null || building || inTransit || $('#explore').hidden || world.classList.contains('error')) return;
  e.preventDefault();
  if (!worldApi?.beginFire('button')) return;
  firePointer = e.pointerId;
  fireButton.setPointerCapture(e.pointerId);
  noteControl();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) fireButton.addEventListener(event, e => {
  if (e.pointerId !== firePointer) return;
  firePointer = null;
  worldApi?.endFire('button', event !== 'pointerup');
});
fireButton.addEventListener('contextmenu', e => e.preventDefault());
fireButton.addEventListener('click', e => {
  // Assistive-technology activation has no pointer-down/up pair.
  if (e.detail === 0 && !building && !inTransit && !$('#explore').hidden && worldApi?.beginFire('assistive')) worldApi.endFire('assistive');
});
window.addEventListener('pointerdown', e => {
  if (menuToggle.getAttribute('aria-expanded') === 'true' && !e.target.closest('.flight-menu')) setMenuOpen();
  if ($('#explore').hidden || e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (e.pointerType === 'touch') setControlMode('touch');
  else if (e.pointerType === 'mouse' && e.target !== joystick && !joystick.contains(e.target)) setControlMode('keyboard');
}, { capture: true });
window.addEventListener('resize', () => {
  if (window.innerWidth === viewportWidth) return;
  viewportWidth = window.innerWidth;
  setControlMode(compactScreen.matches ? 'touch' : 'keyboard');
});
compactScreen.addEventListener('change', () => setControlMode(compactScreen.matches ? 'touch' : 'keyboard'));
window.addEventListener('hashchange', route);
reducedMotion.addEventListener('change', () => worldApi?.setReducedMotion(reducedMotion.matches));
if (import.meta.hot) import.meta.hot.dispose(() => worldApi?.dispose());
setControlMode(compactScreen.matches ? 'touch' : 'keyboard');
route();
