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
      querySelector: () => node(), closest: () => null, focus() {}, setPointerCapture() {},
      getBoundingClientRect: () => ({left:0,top:0,width:124,height:124}),
      setAttribute: (key,value) => attributes.set(key,value), getAttribute: key => attributes.get(key),
      getContext: () => new Proxy({}, {get: (_,key) => key==='createRadialGradient' ? () => ({addColorStop(){}}) : () => {}}),
    };
  }
  const select = selector => { if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector); };
  const controls = ['.station-labels','.map-panel','.flight-toolbar','.touch-controls'].map(select);
  const phases = [12,42,82,100].map(phase=>Object.assign(node(), {dataset:{phase}}));
  const doc = Object.assign(node(), {
    body: node(), hidden: false, querySelector: select,
    querySelectorAll: selector => selector==='[data-phase]' ? phases : selector==='.station-labels,.map-panel,.flight-toolbar,.touch-controls' ? controls : [],
  });
  const win = Object.assign(node(), {scrollTo(){}});
  let finishReveal, input, contextLost, active=false, travels=0;
  const views=[];
  const fakeWorld = {
    async createWorld(container, controls, onNearby, onLost, travel, onBuild, onOverview) {
      input=controls;contextLost=onLost;onBuild(90,'首帧已生成');
      return {reveal:()=>new Promise(resolve=>{finishReveal=()=>{onBuild(100,'星域就绪');resolve();};}),setActive:value=>{active=value;},setOverview:value=>{views.push(value);onOverview(value);},travel:async()=>{travels++;},dispose(){}};
    },
  };
  const values = {document:doc,window:win,location:{hash:''},matchMedia:()=>({matches:false,addEventListener(){}}),__mainTestWorld:fakeWorld};
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
    doc.hidden=true;doc.fire('visibilitychange');assert.ok(!input.up && !active);doc.hidden=false;doc.fire('visibilitychange');
    const field=node(),value=node(),toggle=node();
    field.dataset={privateField:'phone',privateLabel:'电话',privateMask:'150****3205'};field.querySelector=()=>value;toggle.closest=()=>field;
    const click={target:{closest:()=>toggle}};
    doc.fire('click',click);assert.equal(value.textContent,profile.phone);assert.equal(toggle.getAttribute('aria-pressed'),'true');
    doc.fire('click',click);assert.equal(value.textContent,'150****3205');assert.equal(toggle.getAttribute('aria-label'),'显示电话');
    await select('#destination').fire('change',{target:{value:'project-1'}});assert.equal(travels,1);
    contextLost();assert.ok(select('#world').classList.contains('error') && !select('.build-fallback').hidden);
    stick.fire('pointerdown',pointer(5,62,0));assert.equal(input.up,false,'failed WebGL cannot accept joystick input');
    await select('#destination').fire('change',{target:{value:'about'}});assert.equal(select('#billboard-title').textContent,'关于我');
  } finally {
    for(const key of Object.keys(values)){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
  }
});
