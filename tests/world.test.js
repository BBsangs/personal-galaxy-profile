import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stations, portals, galaxies } from '../src/content.js';
import { spawn } from '../src/drive.js';

// No browser or GPU: exercise scene construction and flight lifecycle with a renderer stub.
test('scene initializes, traverses portals, finishes warp, resets and disposes', async () => {
  const nodes = new Map();
  const node = () => ({
    style: {}, className: '', textContent: '', children: [], hidden: false, listeners: new Map(),
    clientWidth: 1280, clientHeight: 800, offsetWidth: 430, offsetHeight: 500,
    setAttribute() {}, setPointerCapture() {}, remove() {},
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    removeEventListener(name, listener) { if(this.listeners.get(name)===listener)this.listeners.delete(name); },
    prepend(child) { this.children.unshift(child); }, append(child) { this.children.push(child); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); },
    getContext() { return { createRadialGradient() { return { addColorStop() {} }; }, fillRect() {}, fillText() {}, createImageData(w,h) { return { data: new Uint8ClampedArray(w*h*4) }; }, putImageData() {} }; },
  });
  const saved = {};
  let nextFrame, scene, camera, disposed = false, compiled = false, time = 0;
  const globals = {
    document: { querySelector: selector => root.querySelector(selector), createElement: node },
    devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
    performance: { now: () => time },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: callback => { nextFrame = callback; return 1; },
    cancelAnimationFrame: () => { nextFrame = null; },
    __sceneTestThree: { ...THREE, WebGLRenderer: class {
      constructor() { this.domElement = node(); this.shadowMap = {}; }
      setPixelRatio() {} getPixelRatio() { return 1; } setSize() {}
      render(s, c) { scene = s; camera = c; }
      async compileAsync() { compiled = true; }
      dispose() { disposed = true; }
    } },
  };
  const root = node();
  for (const [key, value] of Object.entries(globals)) { saved[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis,key,{value,writable:true,configurable:true}); }
  let api;
  try {
    let source=readFileSync(new URL('../src/world.js',import.meta.url),'utf8');
    source=source.replace("import * as THREE from 'three';",'const THREE = globalThis.__sceneTestThree;');
    for (const file of ['content.js','drive.js','galaxy.js','planets.js','date-text.js']) source=source.replace(`'./${file}'`,JSON.stringify(new URL(`../src/${file}`,import.meta.url).href));
    const { createWorld }=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const arrivals=[],gates=[];let contextLosses=0;
    const idle={up:false,down:false,left:false,right:false,boost:false,brake:false};
    const progress=[],views=[];let flightStatus;
    api=await createWorld(root,idle,s=>arrivals.push(s?.id||null),()=>{contextLosses++;},id=>gates.push(id),p=>progress.push(p),v=>views.push(v),status=>{flightStatus=status;});
    assert.ok(compiled);
    assert.equal(progress.at(-1),90,'construction waits for the visible reveal before reporting completion');
    const plaques=[];scene.traverse(o=>{if(o.name==='island-timeline')plaques.push(o);});
    const fixedLettering=()=>plaques.map(p=>p.getObjectByName('date-sculpture').scale.toArray());
    const originalLettering=fixedLettering();
    assert.equal(plaques.length,17);
    for(const plaque of plaques) {
      const text=plaque.getObjectByName('date-sculpture');
      assert.equal(text.geometry.type,'TextGeometry');
      assert.ok(text.castShadow && text.receiveShadow);
      assert.ok(text.geometry.boundingBox.max.z-text.geometry.boundingBox.min.z>.3);
      assert.equal(text.userData.text,plaque.userData.lines[0]);
      assert.equal(plaque.position.y,.56,'lettering sits directly on the island ground');
    }
    for (const station of stations.filter(s=>s.job||s.project)) assert.ok(plaques.some(p=>p.userData.lines[0]===(station.job||station.project).date));
    for (const kind of ['ocean','gas','rock','ice']) {
      const planet=scene.getObjectByName(`planet-${kind}`);
      assert.ok(planet.getObjectByName('planet-surface').material.map);
      assert.ok(planet.getObjectByName('planet-clouds').material.transparent);
      assert.ok(planet.getObjectByName('planet-atmosphere').material.isShaderMaterial);
      assert.equal(planet.getObjectByName('planet-timeline'),undefined,'background planets have no labels');
      const center=planet.position.clone().applyMatrix4(camera.matrixWorldInverse);
      for(const station of stations) {
        const island=new THREE.Vector3(station.x,3,station.z).applyMatrix4(camera.matrixWorldInverse);
        assert.ok(Math.hypot(center.x-island.x,center.y-island.y)>planet.userData.visualRadius+station.radius+7,`${kind} overlaps ${station.id} in the projected view`);
      }
    }
    const frames=(count,step=1000/60)=>{for(let i=0;i<count;i++){const callback=nextFrame;nextFrame=null;assert.ok(callback);time+=step;callback(time);}};
    const reveal=api.reveal();
    assert.equal(api.reveal(),reveal);
    assert.equal(scene.getObjectByName('island-about').scale.x,.015);
    idle.up=true;api.setActive(true);frames(30);
    assert.ok(scene.getObjectByName('island-about').position.y<0);
    assert.ok(progress.at(-1)<100);
    api.setActive(false);assert.equal(nextFrame,null,'hidden tab pauses construction');
    api.setActive(true);frames(60);idle.up=false;frames(40);await reveal;
    assert.equal(progress.at(-1),100);
    assert.ok(progress.every((p,i)=>!i||p>=progress[i-1]));
    assert.equal(Math.abs(scene.getObjectByName('island-about').position.y),0);
    assert.equal(scene.getObjectByName('island-about').scale.x,1);
    assert.equal(scene.getObjectByName('planet-ocean').scale.x,1);
    assert.equal(scene.getObjectByName('x-wing').position.x,spawn.x);
    assert.equal(scene.getObjectByName('x-wing').position.z,spawn.z);
    frames(90);
    {
      const ship=scene.getObjectByName('x-wing'),origin=ship.position.clone(),modes=[];
      const background=scene.children.find(o=>o.material?.isRawShaderMaterial);
      const nearby=stations.find(s=>s.id==='about');
      const approach=api.travel(nearby,mode=>modes.push(mode));
      assert.deepEqual(modes,['flight'],'nearby station selects flight rather than warp');
      assert.equal(ship.position.x,origin.x);assert.equal(ship.position.z,origin.z);
      frames(30);
      assert.ok(ship.position.z<origin.z && ship.position.z>nearby.stop.z,'nearby flight moves continuously between source and destination');
      assert.ok(ship.visible && ship.scale.equals(new THREE.Vector3(1,1,1)));
      assert.equal(background.material.uniforms.uWarp.value,0);
      api.setActive(false);assert.equal(nextFrame,null,'backgrounding pauses the nearby flight');
      const paused=ship.position.clone();api.setActive(true);frames(1);assert.ok(ship.position.distanceTo(paused)<.01);
      frames(180);await approach;
      assert.equal(arrivals.at(-1),nearby.id,'arrival still opens the station');
      assert.ok(Math.hypot(ship.position.x-nearby.stop.x,ship.position.z-nearby.stop.z)<.01);
      await api.travel(nearby,mode=>modes.push(mode));frames(20);
      assert.deepEqual(modes,['flight'],'clicking the docked station does not relaunch');
      assert.equal(ship.position.z,nearby.stop.z,'docked ship does not drift');
      const across=api.travel({stop:{x:nearby.x,z:nearby.z-20}},mode=>modes.push(mode));
      let previous=ship.position.clone(),crossed=false;
      for(let i=0;i<280;i++){
        frames(1);
        assert.ok(ship.visible && ship.position.distanceTo(previous)<1,'local approach has no disappearance or teleport');
        if(Math.abs(ship.position.z-(nearby.z-1))<9.6){crossed=true;assert.ok(ship.position.y>15,'flight clears buildings instead of crossing through them');}
        assert.equal(background.material.uniforms.uWarp.value,0);
        previous.copy(ship.position);
      }
      await across;assert.ok(crossed);
      const boundary={stop:{x:ship.position.x+100,z:ship.position.z}};
      const boundaryTrip=api.travel(boundary,mode=>modes.push(mode));assert.equal(modes.at(-1),'flight');
      frames(520);await boundaryTrip;
      const far={stop:{x:ship.position.x+100.1,z:ship.position.z}};
      const farTrip=api.travel(far,mode=>modes.push(mode));assert.equal(modes.at(-1),'warp','only distances beyond the cutoff warp');
      frames(160);await farTrip;
      api.setReducedMotion(true);
      const quiet={stop:{x:ship.position.x+20,z:ship.position.z}};
      const quietTrip=api.travel(quiet,mode=>modes.push(mode));frames(30);
      assert.ok(ship.position.x<quiet.stop.x && ship.visible,'reduced motion keeps nearby flight continuous');
      frames(160);await quietTrip;api.setReducedMotion(false);
      const home=api.reset();frames(210);await home;frames(90);
    }
    const canvas=root.children[0];
    const visibleHeight=()=>camera.top-camera.bottom;
    assert.ok(Math.abs(visibleHeight()-80)<.01);
    const lasers=scene.getObjectByName('laser-bolts');
    const mouse={button:0,pointerType:'mouse',pointerId:20};
    const press=()=>canvas.listeners.get('pointerdown')(mouse);
    const release=()=>canvas.listeners.get('pointerup')(mouse);
    const shoot=()=>{press();release();};
    canvas.listeners.get('pointerdown')({button:2,pointerType:'mouse'});assert.equal(lasers.children.filter(o=>o.visible).length,0);
    shoot();assert.equal(lasers.children.filter(o=>o.visible).length,4);
    shoot();assert.equal(lasers.children.filter(o=>o.visible).length,4,'duplicate clicks are rate limited');
    const bolt=lasers.children.find(o=>o.visible),boltStart=bolt.position.clone();
    frames(8);assert.ok(bolt.position.distanceTo(boltStart)>10,'bolts travel away from the four cannons');
    frames(30);assert.ok(lasers.children.every(o=>!o.visible),'bolts expire instead of leaving long streaks');
    const beam=scene.getObjectByName('charged-laser'),charge=scene.getObjectByName('laser-charge');
    const strengths=[];
    for (const hold of [500,2500,5000,7500]) {
      press();frames(1,hold);
      assert.ok(Math.abs(flightStatus.charge-Math.min(1,hold/5000))<1e-8,'charge follows held time even with a delayed frame');
      release();
      const size=beam.scale.clone();let duration=0;
      while(beam.visible && duration<120){frames(1);duration++;}
      strengths.push({size,duration});frames(190);
    }
    for(let i=1;i<3;i++) {
      assert.ok(strengths[i].size.x>strengths[i-1].size.x && strengths[i].size.y>strengths[i-1].size.y,'longer holds produce a wider, longer beam');
      assert.ok(strengths[i].duration>strengths[i-1].duration,'longer holds produce a longer discharge');
    }
    assert.ok(strengths[3].size.distanceTo(strengths[2].size)<1e-8,'power stops increasing at five seconds');
    assert.ok(Math.abs(strengths[3].duration-strengths[2].duration)<=1,'maximum discharge duration is stable within one animation frame');
    press();frames(1,5001);
    assert.ok(charge.visible && flightStatus.charging && flightStatus.charge===1);
    assert.ok(!beam.visible && lasers.children.every(o=>!o.visible),'holding charges without firing');
    assert.equal(api.beginFire('keyboard'),false,'a second source cannot steal a held trigger');
    release();assert.ok(beam.visible && beam.scale.x>1 && beam.scale.y>=100,'mouse long press fires a broad beam on release');
    assert.equal(flightStatus.cooldown,3);assert.ok(!charge.visible);
    assert.equal(api.beginFire('keyboard'),false,'charged beam locks every trigger during cooldown');
    shoot();assert.ok(lasers.children.every(o=>!o.visible));
    frames(50);assert.ok(beam.visible && flightStatus.cooldown>2);
    frames(50);assert.ok(!beam.visible);
    frames(90);assert.equal(flightStatus.cooldown,0);
    press();frames(1,8500);canvas.listeners.get('pointercancel')(mouse);release();frames(1,5000);
    assert.ok(!beam.visible && !charge.visible && flightStatus.cooldown===0,'pointer cancellation never discharges');
    press();frames(30);canvas.listeners.get('lostpointercapture')(mouse);release();assert.ok(!beam.visible);
    api.beginFire('keyboard');frames(80);api.endFire('button');assert.ok(flightStatus.charging,'release belongs to its initiating control');
    api.endFire('keyboard');assert.ok(beam.visible && flightStatus.cooldown===3,'keyboard uses the same charged cannon');
    frames(190);
    for (const source of ['mouse','button','keyboard']) {
      if(source==='mouse')press();else api.beginFire(source);
      frames(1,5000);
      const coldColor=charge.material.color.clone();
      assert.ok(flightStatus.charging && !beam.visible);
      frames(1,2999);assert.ok(flightStatus.overcharge<.6,'no overheating warning before eight seconds');
      frames(1,2);
      assert.ok(flightStatus.overcharge>=.6 && flightStatus.autoFireIn<2,'overheating warns after eight seconds');
      assert.ok(charge.material.color.r>coldColor.r && charge.material.color.g<coldColor.g,'charge progressively turns red');
      frames(1,1998);assert.ok(flightStatus.charging && !beam.visible,'holding does not fire before ten seconds');
      frames(1,2);
      assert.ok(beam.visible && !flightStatus.charging && !charge.visible,'ten seconds automatically discharges every input source');
      assert.ok(flightStatus.cooldown>2.9);
      frames(190);const remainingLasers=lasers.children.filter(o=>o.visible).length;
      if(source==='mouse')release();else api.endFire(source);
      assert.ok(!beam.visible && flightStatus.cooldown===0,'releasing an auto-fired trigger never fires a second time');
      assert.equal(lasers.children.filter(o=>o.visible).length,remainingLasers);
    }
    press();time+=2500;release();
    assert.ok(beam.scale.distanceTo(strengths[1].size)<1e-8,'release between frames uses the actual held duration');
    frames(190);
    press();frames(50);api.setActive(false);release();assert.ok(!beam.visible && !charge.visible);api.setActive(true);
    frames(1);assert.equal(flightStatus.idle,false,'resuming does not count hidden-tab time as idle flight');
    frames(400);assert.equal(flightStatus.idle,false,'no hint before eight seconds of stopped flight');
    frames(100);assert.equal(flightStatus.idle,true,'stopped flight surfaces an idle hint after eight seconds');
    const previousHeading = flightStatus.heading;
    idle.left=true;frames(2);assert.equal(flightStatus.idle,false);idle.left=false;
    assert.notEqual(flightStatus.heading,previousHeading,'HUD heading responds to stationary steering');
    assert.equal(flightStatus.heading,scene.getObjectByName('x-wing').rotation.y,'HUD reports the actual ship heading');
    api.setActive(false);shoot();assert.ok(lasers.children.every(o=>!o.visible));api.setActive(true);
    let prevented=false;
    canvas.listeners.get('wheel')({deltaY:100,deltaMode:0,preventDefault(){prevented=true;}});
    frames(60);
    assert.ok(prevented && visibleHeight()>95 && visibleHeight()<100);
    api.zoomBy(1e6);frames(120);assert.ok(Math.abs(visibleHeight()-320)<.01);
    assert.deepEqual(fixedLettering(),originalLettering,'island decoration never compensates its size for the camera');
    api.zoomBy(1e-6);frames(120);assert.ok(Math.abs(visibleHeight()-36)<.01);
    api.zoomBy(NaN);frames(1);assert.ok(Number.isFinite(visibleHeight()));
    api.zoomBy(1/.45);frames(120);
    const touch=(pointerId,clientX)=>({pointerId,clientX,clientY:100,pointerType:'touch',preventDefault(){}});
    canvas.listeners.get('pointerdown')(touch(10,100));
    assert.ok(flightStatus.charging,'single-finger canvas press starts charging');
    canvas.listeners.get('pointerup')(touch(10,100));
    assert.equal(lasers.children.filter(o=>o.visible).length,4,'a screen tap fires the ordinary bolts');frames(40);
    canvas.listeners.get('pointerdown')(touch(10,100));frames(1,5001);
    assert.equal(flightStatus.charge,1,'holding the screen uses the same five-second charge');
    canvas.listeners.get('pointerup')(touch(10,100));assert.ok(beam.visible);frames(190);
    for(const event of ['pointercancel','lostpointercapture']){
      canvas.listeners.get('pointerdown')(touch(10,100));frames(30);
      canvas.listeners.get(event)(touch(10,100));canvas.listeners.get('pointerup')(touch(10,100));
      assert.ok(!beam.visible && !flightStatus.charging && flightStatus.cooldown===0,'canceled touch never fires');
    }
    canvas.listeners.get('pointerdown')(touch(10,100));frames(30);
    canvas.listeners.get('pointermove')(touch(10,125));canvas.listeners.get('pointerup')(touch(10,125));
    assert.ok(!beam.visible && flightStatus.cooldown===0,'a screen drag cancels the pending shot');
    canvas.listeners.get('pointerdown')(touch(10,100));
    canvas.listeners.get('pointerup')(touch(10,125));assert.equal(flightStatus.cooldown,0,'release displacement is checked even without a move event');
    canvas.listeners.get('pointerdown')(touch(1,100));
    canvas.listeners.get('pointerdown')(touch(2,200));
    assert.ok(!flightStatus.charging,'a second canvas finger cancels shooting before pinch zoom');
    canvas.listeners.get('pointermove')(touch(2,300));frames(120);
    assert.ok(Math.abs(visibleHeight()-40)<.01,'spreading fingers zooms in');
    canvas.listeners.get('pointercancel')(touch(2,300));
    canvas.listeners.get('pointermove')(touch(1,60));frames(30);
    assert.ok(Math.abs(visibleHeight()-40)<.01,'one remaining touch cannot zoom');
    canvas.listeners.get('pointerup')(touch(1,60));
    assert.ok(!beam.visible && lasers.children.every(o=>!o.visible),'finishing a pinch never fires');
    api.zoomBy(2);frames(120);
    const background=scene.children.find(o=>o.material?.isRawShaderMaterial);
    assert.ok(background && background.frustumCulled===false && background.material.depthWrite===false);
    api.setOverview(true);frames(150);
    const overviewHeight=visibleHeight();
    api.zoomBy(1.25);frames(120);
    assert.ok(Math.abs(visibleHeight()-overviewHeight*1.25)<.01);
    api.setOverview(false);
    assert.ok(visibleHeight()>overviewHeight,'returning to the ship does not snap the camera');
    frames(150);assert.ok(Math.abs(visibleHeight()-80)<.01);
    api.setOverview(true);frames(150);
    assert.ok(Math.abs(visibleHeight()-overviewHeight*1.25)<.01);
    for (const station of stations) {
      const point=new THREE.Vector3(station.x,0,station.z).project(camera);
      assert.ok(Math.abs(point.x)<1 && Math.abs(point.y)<1 && Math.abs(point.z)<1,`${station.title} excluded from overview`);
    }
    const galaxyButtons=root.querySelector('.station-labels').children.filter(n=>n.className==='galaxy-label');
    assert.equal(galaxyButtons.length,4);
    galaxyButtons[0].listeners.get('click')();assert.equal(gates.at(-1),'about');
    const galaxy=galaxies[2],hit=new THREE.Vector3(galaxy.x,0,galaxy.z).project(camera);
    canvas.listeners.get('pointerdown')({button:0,pointerType:'mouse',clientX:(hit.x*.5+.5)*1280,clientY:(-hit.y*.5+.5)*800});
    assert.equal(gates.at(-1),galaxy.destination,'clicking a galaxy region also selects its destination');
    const tapGalaxy={...touch(30,(hit.x*.5+.5)*1280),clientY:(-hit.y*.5+.5)*800};
    const beforeTouchNavigation=gates.length;
    canvas.listeners.get('pointerdown')(tapGalaxy);canvas.listeners.get('pointerup')(tapGalaxy);
    assert.equal(gates.length,beforeTouchNavigation+1,'tapping a galaxy in overview navigates instead of firing');
    canvas.listeners.get('pointerdown')(tapGalaxy);canvas.listeners.get('pointermove')({...tapGalaxy,clientX:tapGalaxy.clientX+20});canvas.listeners.get('pointerup')(tapGalaxy);
    assert.equal(gates.length,beforeTouchNavigation+1,'dragging in overview does not accidentally navigate');
    assert.ok(lasers.children.every(o=>!o.visible),'overview selects navigation instead of firing');
    api.zoomBy(.8);assert.equal(views.at(-1),false);
    const startReturn=visibleHeight();frames(15);assert.ok(visibleHeight()<startReturn && visibleHeight()>80,'zoom-in glides toward the ship');
    frames(150);assert.ok(Math.abs(visibleHeight()-64)<.01);
    const shipInView=new THREE.Vector3(spawn.x,3.3,spawn.z).project(camera);
    assert.ok(Math.abs(shipInView.x)<.25 && Math.abs(shipInView.y)<.25,'zoom-in centers the camera on the current ship');
    api.zoomBy(1.25);frames(150);
    api.setOverview(true);frames(150);idle.left=true;frames(1);idle.left=false;
    assert.equal(views.at(-1),false,'flight controls exit overview');
    frames(150);assert.ok(Math.abs(visibleHeight()-80)<.01);
    const vehicle=scene.getObjectByName('x-wing');
    const flame=scene.getObjectByName('engine-flame');
    const trail=scene.getObjectByName('engine-trail');
    const beacon=scene.getObjectByName('return-beacon');
    const jumpRing=scene.getObjectByName('jump-ring');
    const destination=stations.find(s=>s.id==='project-6');
    press();frames(30);
    const jump=api.travel(destination);release();
    assert.ok(!charge.visible && !beam.visible,'navigation cancels pending charge');
    shoot();assert.ok(lasers.children.every(o=>!o.visible),'warping blocks weapon fire');
    assert.equal(api.travel(stations[0]),jump,'repeated navigation shares the running transition');
    api.zoomBy(4);
    frames(27);assert.ok(vehicle.visible&&vehicle.position.y>4,'ship charges and lifts');
    frames(25);assert.ok(vehicle.visible&&vehicle.scale.z>1.3,'ship stretches during launch');
    frames(20);assert.equal(vehicle.visible,false,'ship disappears inside the jump');
    frames(24);assert.ok(vehicle.visible&&vehicle.position.y>5,'ship reenters above the destination');
    frames(60);await jump;
    assert.ok(Math.abs(vehicle.position.x-destination.stop.x)<.01&&Math.abs(vehicle.position.z-destination.stop.z)<.01);
    assert.deepEqual(vehicle.scale.toArray(),[1,1,1]);assert.equal(jumpRing.visible,false);
    frames(60);assert.ok(Math.abs(visibleHeight()-80)<.01,'warp preserves the flight zoom after camera settling');
    assert.equal(arrivals.at(-1),'project-6');
    assert.equal(background.material.uniforms.uWarp.value,0);
    const gate=portals[0];
    const approach=api.travel({ stop: { x:gate.x, z:gate.z } });
    frames(150); await approach;
    frames(200);
    assert.ok(gates.includes(gate.destination));
    idle.up=true;frames(90);
    const normalFlame=flame.scale.y;
    const litParticles=()=>trail.geometry.attributes.color.array.filter((v,i)=>i%3===2&&v>0).length;
    const lateralTrail=()=>{
      const positions=trail.geometry.attributes.position.array,colors=trail.geometry.attributes.color.array,result=[];
      for(let i=0;i<positions.length;i+=3)if(colors[i+2]>0)result.push((positions[i]-vehicle.position.x)*Math.cos(vehicle.rotation.y)-(positions[i+2]-vehicle.position.z)*Math.sin(vehicle.rotation.y));
      return result;
    };
    const normalTrail=lateralTrail(),normalSize=trail.material.size;
    assert.ok(normalTrail.some(x=>x<-3.5) && normalTrail.some(x=>x>3.5),'particle trails emerge on both outer wings');
    assert.ok(normalTrail.every(x=>Math.abs(x)>3.5),'normal particles stay away from the inner engine flames');
    const normalParticles=litParticles();
    idle.boost=true;frames(90);
    assert.ok(flame.scale.y>normalFlame*3,'boost creates a much longer flame');
    assert.ok(litParticles()>normalParticles*3,'boost creates denser persistent particles');
    const boostedTrail=lateralTrail();
    assert.ok(Math.max(...boostedTrail)-Math.min(...boostedTrail)>Math.max(...normalTrail)-Math.min(...normalTrail)+.5,'boost widens the trails outward');
    assert.ok(boostedTrail.every(x=>Math.abs(x)>3.5) && trail.material.size>normalSize,'wider boost particles remain outside the engine flames');
    assert.ok(background.material.uniforms.uWarp.value>.4,'boost stretches background stars');
    const positions=trail.geometry.attributes.position.array,colors=trail.geometry.attributes.color.array;
    for(let i=0;i<positions.length;i+=3)if(colors[i+2]>0)assert.ok(Math.hypot(positions[i]-vehicle.position.x,positions[i+2]-vehicle.position.z)<22,'boost trail stays close to the ship');
    idle.up=false;idle.boost=false;frames(180);
    assert.ok(flame.scale.y<normalFlame,'flames settle after releasing boost');
    idle.left=true;frames(40);idle.left=false;idle.up=true;frames(90);
    const turnedTrail=lateralTrail();
    assert.ok(turnedTrail.some(x=>x<-3.5) && turnedTrail.some(x=>x>3.5) && turnedTrail.every(x=>Math.abs(x)>3.5),'wing trails follow the ship after turning');
    idle.up=false;frames(180);
    const home=api.reset();assert.equal(api.reset(),home);
    frames(18);assert.ok(beacon.visible&&beacon.position.y>7,'return launches a beacon');
    frames(24);assert.ok(!beacon.visible&&jumpRing.visible&&jumpRing.scale.x>6,'beacon blooms into an expanding ring');
    assert.ok(trail.geometry.attributes.color.array.some(value=>value>0));
    frames(165);await home;
    assert.ok(Math.abs(vehicle.position.x-spawn.x)<.01&&Math.abs(vehicle.position.z-spawn.z)<.01);
    assert.ok(vehicle.visible&&!beacon.visible&&!jumpRing.visible);
    assert.deepEqual(vehicle.scale.toArray(),[1,1,1]);
    assert.equal(arrivals.at(-1),null);
    api.setReducedMotion(true);frames(2);
    shoot();const quietBolt=lasers.children.find(o=>o.visible),quietPosition=quietBolt.position.clone();
    frames(3);assert.deepEqual(quietBolt.position.toArray(),quietPosition.toArray(),'reduced motion uses a short stationary cannon flash');
    frames(8);assert.ok(lasers.children.every(o=>!o.visible));
    frames(10);press();frames(80);release();assert.ok(beam.visible && beam.scale.y===18,'reduced motion keeps the charged flash short');
    frames(8);assert.ok(!beam.visible);
    const quietBuild=api.reveal();frames(2);await quietBuild;
    assert.equal(scene.getObjectByName('island-about').scale.x,1);
    assert.ok(trail.geometry.attributes.color.array.every(value=>value===0));
    const quietReturn=api.reset();frames(20);await quietReturn;
    assert.ok(vehicle.visible&&!beacon.visible&&!jumpRing.visible);
    assert.equal(arrivals.at(-1),null);
    api.setReducedMotion(false);
    const interrupted=api.travel(destination);frames(25);
    canvas.listeners.get('webglcontextlost')({preventDefault(){}});await interrupted;
    assert.equal(contextLosses,1);
    assert.ok(vehicle.visible&&!beacon.visible&&!jumpRing.visible);
    assert.deepEqual(vehicle.scale.toArray(),[1,1,1]);
    api.dispose();api=null;assert.ok(disposed);
    assert.equal(canvas.listeners.size,0,'scene event handlers are removed');
  } finally {
    api?.dispose();
    for(const key of Object.keys(globals)){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
  }
});
