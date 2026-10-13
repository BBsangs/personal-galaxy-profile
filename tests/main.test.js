import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profile } from '../src/content.js';

test('loading, navigation, privacy toggles and joystick release follow the real event wiring', async () => {
  const nodes = new Map();
  function node() {
    const classes = new Set(), listeners = new Map(), attributes = new Map(), styles = new Map();
    return {
      style: { setProperty: (key,value) => styles.set(key,value), getPropertyValue: key => styles.get(key) },
      dataset: {}, textContent: '', innerHTML: '', hidden: false,
      classList: { add: (...names) => names.forEach(n=>classes.add(n)), remove: (...names) => names.forEach(n=>classes.delete(n)), contains: n=>classes.has(n), toggle(n,v=!classes.has(n)) { if(v)classes.add(n);else classes.delete(n);return v; } },
      addEventListener: (name,callback) => listeners.set(name,callback),
      fire: (name,event={}) => listeners.get(name)?.(event),
      querySelector: () => node(), closest: () => null, contains() { return false; }, focus() {}, setPointerCapture() {},
      getBoundingClientRect: () => ({left:0,top:0,width:124,height:124}),
      setAttribute: (key,value) => attributes.set(key,value), getAttribute: key => attributes.get(key),
      getContext: () => new Proxy({}, {get: (_,key) => key==='createRadialGradient' ? () => ({addColorStop(){}}) : () => {}}),
    };
  }
  const select = selector => { if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector); };
  const controlSelector = '.station-labels,.map-panel,.flight-toolbar,.touch-controls,.weapon-control';
  const controls = controlSelector.split(',').map(select);
  const phases = [12,42,82,100].map(phase=>Object.assign(node(), {dataset:{phase}}));
  const doc = Object.assign(node(), {
    body: node(), hidden: false, querySelector: select,
    querySelectorAll: selector => selector==='[data-phase]' ? phases : selector===controlSelector ? controls : [],
  });
  const win = Object.assign(node(), {innerWidth:1280,scrollTo(){}});
  let finishReveal, input, contextLost, pilotStatus, active=false, travels=0, heldFire=null, shots=0;
  const views=[];
  const fakeWorld = {
    async createWorld(container, controls, onNearby, onLost, travel, onBuild, onOverview, onFlight) {
      input=controls;contextLost=onLost;pilotStatus=onFlight;onBuild(90,'首帧已生成');
      return {reveal:()=>new Promise(resolve=>{finishReveal=()=>{onBuild(100,'星域就绪');resolve();};}),setActive:value=>{active=value;},setOverview:value=>{views.push(value);onOverview(value);},travel:async()=>{travels++;},
        beginFire(source){if(heldFire)return false;heldFire=source;return true;},
        endFire(source,cancel=false){if(source!==heldFire)return;heldFire=null;if(!cancel)shots++;},
        cancelFire(){heldFire=null;},dispose(){}};
    },
  };
  const compact = {matches:false,addEventListener(){}};
  let now = 1000;
  const storage = new Map();
  const values = {document:doc,window:win,location:{hash:''},performance:{now:()=>now},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},matchMedia:query=>query==='(max-width: 767px)' ? compact : ({matches:query.includes('coarse'),addEventListener(){}}),__mainTestWorld:fakeWorld};
  const saved={};
  for(const [key,value] of Object.entries(values)){saved[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
  try {
    let source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    source=source.replace("'./content.js'",JSON.stringify(new URL('../src/content.js',import.meta.url).href));
    source=source.replace("import('./world.js')",'Promise.resolve(globalThis.__mainTestWorld)');
    await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    await new Promise(setImmediate);
    const stick=select('#joystick');
    const pointer=(id,x=62,y=62)=>({pointerId:id,clientX:x,clientY:y,button:0,preventDefault(){}});
    const key=code=>({code,target:node(),preventDefault(){}});
    assert.ok(select('#destination').disabled && controls.every(c=>c.inert));
    win.fire('keydown',key('KeyW'));stick.fire('pointerdown',pointer(1,62,0));assert.equal(input.up,false);
    await select('#destination').fire('change',{target:{value:'project-1'}});assert.equal(travels,0);
    finishReveal();await new Promise(setImmediate);
    assert.ok(!select('#destination').disabled && controls.every(c=>!c.inert));
    assert.ok(active && select('.world-loading').hidden);
    assert.equal(doc.body.dataset.controls,'keyboard','wide WeChat-like browsers use keyboard even if coarse capability is reported');
    assert.ok(!select('#flight-guide').hidden && select('#guide-copy').innerHTML.includes('W / S'));
    assert.equal(storage.get('galaxy-guide-seen'),'1','first-visit hint is remembered locally');
    const reportIdle = (idle=true,piloting=false) => pilotStatus({charge:0,cooldown:0,charging:false,idle,piloting});
    now=6999;reportIdle(false);assert.ok(!select('#flight-guide').hidden,'first hint remains visible for six seconds even before the idle threshold');
    now=7000;reportIdle();assert.ok(select('#flight-guide').hidden,'hint expires without requiring interaction');
    now=30999;reportIdle();assert.ok(select('#flight-guide').hidden,'reminders are spaced at least thirty seconds apart');
    now=31000;reportIdle();assert.ok(!select('#flight-guide').hidden);assert.match(select('#guide-copy').innerHTML,/鼠标左键 \/ J/,'idle reminder rotates to charging');
    reportIdle(false,true);assert.ok(select('#flight-guide').hidden,'active flight dismisses a visible hint immediately');
    now=61000;reportIdle(false);assert.ok(select('#flight-guide').hidden,'elapsed cooldown alone cannot show a hint while active');
    reportIdle();assert.ok(!select('#flight-guide').hidden);assert.match(select('#guide-title').textContent,/下一座岛屿/);
    select('#dismiss-guide').fire('click');
    now=90999;reportIdle();assert.ok(select('#flight-guide').hidden,'manual dismiss also gives thirty seconds of quiet');
    now=91000;reportIdle();assert.ok(!select('#flight-guide').hidden,'hints can recur even if the visitor stays idle');
    assert.match(select('#guide-title').textContent,/驾驶飞船/,'tips cycle back to movement');
    compact.matches=true;win.innerWidth=390;win.fire('resize');assert.equal(doc.body.dataset.controls,'touch');
    assert.match(select('#guide-copy').innerHTML,/右下摇杆/,'visible hint follows the current control mode');
    compact.matches=false;win.innerWidth=1280;win.fire('resize');assert.equal(doc.body.dataset.controls,'keyboard','widening the window removes the joystick');
    win.fire('pointerdown',{pointerType:'touch',target:node()});assert.equal(doc.body.dataset.controls,'touch','actual touch can use joystick on a wide tablet');
    win.fire('pointerdown',{pointerType:'mouse',target:node()});assert.equal(doc.body.dataset.controls,'keyboard');
    win.fire('keydown',key('KeyM'));await new Promise(setImmediate);assert.equal(views.at(-1),true);
    win.fire('keydown',key('KeyM'));await new Promise(setImmediate);assert.equal(views.at(-1),false);
    stick.fire('pointerdown',pointer(1,90,34));
    assert.ok(input.up>.5 && input.up<1 && input.right>.5 && input.right<1);
    stick.fire('pointermove',pointer(2,0,100));assert.ok(input.right>0,'a second finger does not take over');
    stick.fire('pointerup',pointer(2));assert.ok(input.up>0);
    stick.fire('pointermove',pointer(1,62,-500));assert.equal(input.up,1,'drag radius is clamped');
    stick.fire('pointerup',pointer(1));assert.ok(Object.values(input).every(v=>!v));
    assert.equal(stick.style.getPropertyValue('--stick-y'),'0px');
    for(const event of ['pointercancel','lostpointercapture']) {
      stick.fire('pointerdown',pointer(3,62,0));stick.fire(event,pointer(3));assert.ok(!input.up && !stick.classList.contains('active'));
    }
    stick.fire('pointerdown',pointer(4,62,0));win.fire('blur');stick.fire('pointermove',pointer(4,62,0));assert.equal(input.up,false);
    win.fire('keydown',{...key('KeyW'),target:stick});assert.equal(input.up,true,'keyboard fallback works with the joystick focused');
    assert.equal(doc.body.dataset.controls,'keyboard');
    doc.hidden=true;doc.fire('visibilitychange');assert.ok(!input.up && !active);doc.hidden=false;doc.fire('visibilitychange');
    const fire=select('#fire-laser');
    stick.fire('pointerdown',pointer(6,62,0));fire.fire('pointerdown',pointer(7));assert.equal(heldFire,'button');
    stick.fire('pointerup',pointer(6));assert.equal(heldFire,'button','releasing the joystick does not cancel the other finger charging');
    fire.fire('pointerup',pointer(8));assert.equal(heldFire,'button','an unrelated finger cannot fire');
    fire.fire('pointerup',pointer(7));assert.equal(shots,1);
    stick.fire('pointerdown',pointer(9,62,0));fire.fire('pointerdown',pointer(10));fire.fire('pointerup',pointer(10));assert.ok(input.up,'firing does not release the joystick');stick.fire('pointerup',pointer(9));
    fire.fire('pointerdown',pointer(11));fire.fire('pointercancel',pointer(11));assert.equal(shots,2,'cancel never fires');
    stick.fire('pointerdown',pointer(12,62,0));fire.fire('pointerdown',pointer(13));
    win.fire('resize');assert.equal(heldFire,'button','height-only changes such as browser chrome preserve touch input');
    win.innerWidth=1400;win.fire('resize');assert.equal(doc.body.dataset.controls,'keyboard');assert.ok(!input.up && heldFire===null,'width changes cancel held controls safely');
    fire.fire('pointerup',pointer(13));assert.equal(shots,2);
    win.fire('keydown',key('KeyJ'));assert.equal(heldFire,'keyboard');win.fire('keydown',{...key('KeyJ'),repeat:true});win.fire('keyup',key('KeyJ'));assert.equal(shots,3);
    win.fire('keydown',key('KeyJ'));win.fire('blur');win.fire('keyup',key('KeyJ'));assert.equal(shots,3,'blur cancels instead of discharging');
    pilotStatus({charge:.5,cooldown:0,charging:true,idle:false,heading:-Math.PI/2});
    assert.equal(select('.weapon-control').style.getPropertyValue('--weapon-fill'),'50%');
    assert.equal(select('#weapon-progress').value,.5);
    assert.equal(select('#heading-value').textContent,'270°');
    assert.equal(select('#weapon-hint').textContent,'2.5 / 5s');
    pilotStatus({charge:1,autoFireIn:5,cooldown:0,charging:true,idle:false,heading:4*Math.PI});assert.match(select('#weapon-label').textContent,/已蓄满/);
    assert.equal(select('.weapon-control').style.getPropertyValue('--weapon-fill'),'100%');
    assert.equal(select('#heading-value').textContent,'000°','heading wraps after multiple full rotations');
    assert.equal(select('#weapon-hint').textContent,'自动 5.0s');
    pilotStatus({charge:1,overcharge:.2,autoFireIn:4,cooldown:0,charging:true,idle:false});
    assert.equal(select('.weapon-control').dataset.state,'overcharging');
    const warmColor=select('.weapon-control').style.getPropertyValue('--overheat-color');
    pilotStatus({charge:1,overcharge:.58,autoFireIn:2.1,cooldown:0,charging:true,idle:false});
    assert.equal(select('.weapon-control').dataset.state,'overcharging','no warning before eight seconds');
    pilotStatus({charge:1,overcharge:.6,autoFireIn:2,cooldown:0,charging:true,idle:false});
    assert.equal(select('.weapon-control').dataset.state,'warning');
    assert.equal(select('#weapon-label').textContent,'过热警告');
    assert.equal(select('#weapon-hint').textContent,'自动 2.0s');
    assert.match(select('#weapon-announcement').textContent,/过热警告/);
    assert.notEqual(select('.weapon-control').style.getPropertyValue('--overheat-color'),warmColor);
    pilotStatus({charge:0,cooldown:2.5,charging:false,idle:false});assert.match(select('#weapon-label').textContent,/冷却 2.5s/);assert.equal(fire.getAttribute('aria-disabled'),'true');
    assert.equal(select('.weapon-control').style.getPropertyValue('--weapon-fill'),'83%');
    assert.equal(select('#weapon-hint').textContent,'等待冷却');
    pilotStatus({charge:0,cooldown:0,charging:false,idle:true});assert.equal(fire.getAttribute('aria-disabled'),'false');
    assert.equal(select('.weapon-control').style.getPropertyValue('--weapon-fill'),'0%');
    assert.equal(select('#weapon-hint').textContent,'长按 · 5秒满');
    const field=node(),value=node(),toggle=node();
    field.dataset={privateField:'phone',privateLabel:'电话',privateMask:'150****3205'};field.querySelector=()=>value;toggle.closest=()=>field;
    const click={target:{closest:()=>toggle}};
    doc.fire('click',click);assert.equal(value.textContent,profile.phone);assert.equal(toggle.getAttribute('aria-pressed'),'true');
    doc.fire('click',click);assert.equal(value.textContent,'150****3205');assert.equal(toggle.getAttribute('aria-label'),'显示电话');
    await select('#destination').fire('change',{target:{value:'project-1'}});assert.equal(travels,1);
    contextLost();assert.ok(select('#world').classList.contains('error') && !select('.build-fallback').hidden);
    now+=40000;reportIdle();assert.ok(select('#flight-guide').hidden,'WebGL fallback never shows game hints');
    stick.fire('pointerdown',pointer(5,62,0));assert.equal(input.up,false,'failed WebGL cannot accept joystick input');
    await select('#destination').fire('change',{target:{value:'about'}});assert.equal(select('#billboard-title').textContent,'关于我');
    nodes.clear();doc.body=node();doc.hidden=false;values.location.hash='';
    await import(`data:text/javascript;base64,${Buffer.from(source+'\n// returning visit').toString('base64')}`);
    await new Promise(setImmediate);finishReveal();await new Promise(setImmediate);
    assert.ok(select('#flight-guide').hidden,'returning visitors do not get an immediate first-visit hint');
    reportIdle(false);assert.ok(select('#flight-guide').hidden);
    reportIdle();assert.ok(!select('#flight-guide').hidden,'returning visitors still receive idle help');
  } finally {
    for(const key of Object.keys(values)){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
  }
});
