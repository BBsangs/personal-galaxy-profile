import * as THREE from 'three';
import { stations, mapSize, galaxies, portals, stationTimeline } from './content.js';
import { spawn, stepVehicle, nearestStation } from './drive.js';
import { createGalaxy } from './galaxy.js';
import { createPlanet } from './planets.js';
import { createDateText } from './date-text.js';

export async function createWorld(container, input, onNearby, onContextLost, onPortal, onBuild = () => {}, onOverviewChange = () => {}, onFlightStatus = () => {}) {
  const checkpoint = async (progress, message) => {
    onBuild(progress, message);
    await new Promise(resolve => setTimeout(resolve, 16));
  };
  await checkpoint(12, '深空信号已接入');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030612');
  const galaxyBackground = createGalaxy(); scene.add(galaxyBackground.mesh);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);

  const camera = new THREE.OrthographicCamera(-50, 50, 30, -30, .1, 2200);
  const cameraOffset = new THREE.Vector3(30, 55, 65);
  const cameraTarget = new THREE.Vector3(spawn.x, 0, spawn.z - 7);
  const ship = { ...spawn };
  let width = 1, height = 1, active = false, frame = 0, lastTime = 0, elapsed = 0;
  let reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let overview = false, current = null, contextLost = false;
  const viewScales = { flight: 1, overview: 1 };
  let viewScale = 1;
  let cameraSpan = 80;
  let transit = null, portalCooldown = 0, warp = 0, boostGlow = 0;
  let assembly = null;
  const islands = [], planets = [];
  const pointer = new THREE.Vector2(.5,.5);
  const movePointer = event => { const rect=container.getBoundingClientRect();pointer.set((event.clientX-rect.left)/width,1-(event.clientY-rect.top)/height); };
  container.addEventListener('pointermove',movePointer,{passive:true});
  const projected = new THREE.Vector3();
  const billboard = container.querySelector('#billboard');
  const labelNodes = stations.map(s => container.querySelector(`[data-station="${s.id}"]`));
  const exhibitLabels = [];
  const mapCar = document.querySelector('#map-car');

  function zoomBy(factor) {
    if (assembly || transit || contextLost || !Number.isFinite(factor) || factor <= 0) return;
    if (overview && factor < 1) setOverview(false);
    const mode = overview ? 'overview' : 'flight';
    viewScales[mode] = THREE.MathUtils.clamp(viewScales[mode] * factor, overview ? .5 : .45, overview ? 1.6 : 4);
    if (!active || reduce) { updateCamera(0, true); render(); }
  }
  const zoomWheel = event => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    zoomBy(Math.exp(THREE.MathUtils.clamp(event.deltaY * unit, -150, 150) * .002));
  };
  const touches = new Map();
  const overviewRay = new THREE.Raycaster(), navigationPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), navigationPoint = new THREE.Vector3();
  let pinchDistance = 0, weaponPointer = null;
  const touchDistance = () => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const startPinch = event => {
    if (event.pointerType !== 'touch') {
      if (event.button === 0 && overview && active && !assembly && !contextLost) {
        const rect = container.getBoundingClientRect();
        overviewRay.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / width * 2 - 1, 1 - (event.clientY - rect.top) / height * 2), camera);
        if (overviewRay.ray.intersectPlane(navigationPlane, navigationPoint)) {
          const galaxy = galaxies.find(g => Math.hypot(navigationPoint.x - g.x, navigationPoint.z - g.z) < g.radius);
          if (galaxy) onPortal(galaxy.destination);
        }
      } else if (event.button === 0 && beginFire('mouse')) {
        weaponPointer = event.pointerId;
        renderer.domElement.setPointerCapture(event.pointerId);
      }
      return;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture(event.pointerId);
    pinchDistance = touchDistance();
  };
  const movePinch = event => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const distance = touchDistance();
    if (pinchDistance > 0 && distance > 0) zoomBy(pinchDistance / distance);
    pinchDistance = distance;
  };
  const endPinch = (event, cancel = false) => {
    touches.delete(event.pointerId); pinchDistance = touchDistance();
    if (event.pointerId === weaponPointer) { weaponPointer = null; endFire('mouse', cancel); }
  };
  // Only the scene canvas captures zoom; resume panels retain their own scrolling.
  const zoomEvents = { wheel: zoomWheel, pointerdown: startPinch, pointermove: movePinch, pointerup: endPinch, pointercancel: e => endPinch(e, true), lostpointercapture: e => endPinch(e, true) };
  Object.entries(zoomEvents).forEach(([name, listener]) => renderer.domElement.addEventListener(name, listener, { passive: false }));

  const sun = new THREE.DirectionalLight(0xbfd4ff, 3.2);
  sun.position.set(-200, 400, 250);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -440, right: 440, top: 400, bottom: -400, near: 1, far: 1000 });
  sun.shadow.normalBias = .14;
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xc1daff, 0x151d34, 2.5);
  scene.add(sky);
  const rim = new THREE.DirectionalLight(0x80d8ed, 2);
  rim.position.set(80, 20, -100); scene.add(rim);

  const palettes = {
    garden: { rock: '#263e47', ground: '#588d7d', accent: '#a0e7bc', crystal: '#69bea0' },
    ice: { rock: '#3a536b', ground: '#a4d9e3', accent: '#bdeeff', crystal: '#82c9ef' },
    desert: { rock: '#66524a', ground: '#c7a57b', accent: '#ffd3a1', crystal: '#d99469' },
    moon: { rock: '#3e4259', ground: '#9098b0', accent: '#d7e0fa', crystal: '#b1bfe2' },
    water: { rock: '#24536a', ground: '#5b9aaf', accent: '#91e5ed', crystal: '#57c9cf' },
    lava: { rock: '#4a3942', ground: '#806064', accent: '#ffac7a', crystal: '#e99674' },
  };
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .78, ...extra });
  const m = {
    white: material('#dce3e5'), metal: material('#667387', { metalness: .45, roughness: .38 }),
    ink: material('#253147'), glass: material('#457b91', { metalness: .5, roughness: .16 }),
    gold: material('#d1a47a'), window: material('#c6eafa', { emissive: '#72cce7', emissiveIntensity: .7 }),
    engine: material('#b8eeff', { emissive: '#76daff', emissiveIntensity: 2.5 }),
  };
  const biomeMaterials = Object.fromEntries(Object.entries(palettes).map(([name, p]) => [name, {
    rock: material(p.rock, { flatShading: true }), ground: material(p.ground, { flatShading: true }),
    crystal: material(p.crystal, { flatShading: true, metalness: .12 }),
    accent: material(p.accent, { emissive: p.accent, emissiveIntensity: .35 }),
  }]));
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const geometries = new Map();
  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function box(w, h, d, mat, parent, x = 0, y = 0, z = 0) {
    const object = mesh(unitBox, mat, parent, x, y, z); object.scale.set(w, h, d); return object;
  }
  function cylinder(top, bottom, h, mat, parent, x = 0, y = 0, z = 0, sides = 12) {
    const key = `${top}/${bottom}/${h}/${sides}`;
    if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(top, bottom, h, sides));
    return mesh(geometries.get(key), mat, parent, x, y, z);
  }
  function group(parent, x = 0, y = 0, z = 0) {
    const object = new THREE.Group(); object.position.set(x, y, z); parent.add(object); return object;
  }
  function ring(radius, tube, mat, parent, x = 0, y = 0, z = 0) {
    return mesh(new THREE.TorusGeometry(radius, tube, 6, 48), mat, parent, x, y, z);
  }
  let seed = 71;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  // A local texture gives the stars soft edges without external assets or postprocessing.
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  const glowCtx = glowCanvas.getContext('2d');
  const glow = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(.12, '#ffffffdd'); glow.addColorStop(.45, '#ffffff33'); glow.addColorStop(1, '#ffffff00');
  glowCtx.fillStyle = glow; glowCtx.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const starLayers = [];
  for (const [count, spread, depth, size, opacity] of [[2000,1100,-140,2.3,.72],[650,900,-65,4,.9],[200,900,-24,6.5,1]]) {
    const positions = [], colors = [];
    for (let i = 0; i < count; i++) {
      positions.push((random() - .5) * spread + depth * .55, depth - random() * 35, (random() - .5) * spread + depth * 1.2);
      const color = new THREE.Color().setHSL(random() < .18 ? .1 : .59, .2, .75 + random() * .25);
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size, map: glowTexture, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    const points = new THREE.Points(geometry, mat);
    scene.add(points); starLayers.push({ points, opacity, baseOpacity: opacity });
  }
  const nebulaCanvas=document.createElement('canvas');nebulaCanvas.width=nebulaCanvas.height=512;
  const nebulaCtx=nebulaCanvas.getContext('2d');
  for(let i=0;i<1000;i++){
    const radius=Math.pow(random(),.65)*220,angle=radius*.021+(i%3)*Math.PI*2/3+(random()-.5)*.6;
    const x=256+Math.cos(angle)*radius,y=256+Math.sin(angle)*radius*.65,size=12+random()*25;
    const haze=nebulaCtx.createRadialGradient(x,y,0,x,y,size);
    haze.addColorStop(0,`rgba(190,205,255,${.025+random()*.04})`);haze.addColorStop(1,'rgba(90,120,200,0)');
    nebulaCtx.fillStyle=haze;nebulaCtx.fillRect(x-size,y-size,size*2,size*2);
  }
  const nebulaTexture=new THREE.CanvasTexture(nebulaCanvas);
  const galaxyLabels=galaxies.map((galaxy,i)=>{
    const cloud=new THREE.Sprite(new THREE.SpriteMaterial({map:nebulaTexture,color:galaxy.color,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
    cloud.position.set(galaxy.x,-20,galaxy.z);cloud.scale.set(galaxy.radius*3.5,galaxy.radius*2.8,1);cloud.material.rotation=i*.7;scene.add(cloud);
    const node=document.createElement('button');node.className='galaxy-label';node.type='button';node.style.color=galaxy.color;node.innerHTML=`<small>${galaxy.english}</small>${galaxy.title}`;
    node.setAttribute('aria-label', `前往${galaxy.title}`);node.addEventListener('click',()=>onPortal(galaxy.destination));
    container.querySelector('.station-labels').append(node);return {node,galaxy};
  });
  const floating = [];
  const animated = [];
  const landingPads = [];
  const obstacles = [];
  const portalLabels = [];
  function groundCaption(text, color, size) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = '500 34px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText(text, 384, 52, 716);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 80 / 768), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    sign.rotation.x = -Math.PI / 2; return sign;
  }
  await checkpoint(25, '星域测绘 · 四个星系已定位');
  // Fixed peripheral positions also stay clear in the camera's projected view, including rings.
  const planetPositions = [[-300,-50,25],[-330,-55,-280],[310,-70,-110],[300,-65,255]];
  for (const [i, galaxy] of galaxies.entries()) {
    const radius = [19, 23, 25, 15][i];
    const planet = createPlanet(radius, ['ocean', 'gas', 'rock', 'ice'][i]);
    planet.position.set(...planetPositions[i]); scene.add(planet); planets.push(planet);
    planet.userData.visualRadius = radius * (i === 1 || i === 3 ? 1.93 : 1.06);
    animated.push({ object: planet.getObjectByName('planet-surface'), axis: 'y', speed: .016 }, { object: planet.getObjectByName('planet-clouds'), axis: 'y', speed: .025 });
    await checkpoint(28 + i * 4, `行星成像 · ${galaxy.title}`);
  }
  portals.forEach(portal=>{
    const gate=group(scene,portal.x,4,portal.z);
    const glowMat=material(portal.color,{emissive:portal.color,emissiveIntensity:2.2});
    ring(4.9,.3,m.metal,gate);ring(4.55,.1,glowMat,gate);
    const inner=ring(4.15,.075,glowMat,gate);animated.push({object:inner,axis:'z',speed:.35});
    const surface=mesh(new THREE.CircleGeometry(4.05,48),new THREE.MeshBasicMaterial({map:nebulaTexture,color:portal.color,side:THREE.DoubleSide,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}),gate);
    animated.push({object:surface,axis:'z',speed:-.2});
    for(let i=0;i<8;i++){const a=i*Math.PI/4;box(.3,.7,.5,glowMat,gate,Math.cos(a)*4.9,Math.sin(a)*4.9,0).rotation.z=a-Math.PI/2;}
    const node=document.createElement('button');node.className='portal-label';node.textContent=`传送 · ${portal.title}`;node.addEventListener('click',()=>onPortal(portal.destination));container.querySelector('.station-labels').append(node);
    portalLabels.push({node,portal});
  });
  function crystal(parent, mat, x, z, scale) {
    const object = mesh(new THREE.OctahedronGeometry(1), mat, parent, x, .7 + scale * .65, z);
    object.scale.set(.65 * scale, 1.65 * scale, .65 * scale); object.rotation.z = (random() - .5) * .3;
  }
  function tree(parent, colors, x, z, scale) {
    cylinder(.16, .25, 2 * scale, m.gold, parent, x, 1.5 * scale, z, 6);
    const crown = mesh(new THREE.IcosahedronGeometry(1.65, 0), colors.crystal, parent, x, 3.1 * scale, z);
    crown.scale.set(scale, scale * 1.12, scale); crown.rotation.y = random() * Math.PI;
  }
  function solarPanel(parent, x, z, colors) {
    box(.22, 1.8, .22, m.metal, parent, x, 1.6, z);
    const panel = group(parent, x, 2.5, z); panel.rotation.x = -.35;
    box(3.7, .16, 2.3, m.ink, panel);
    for (let i = 0; i < 4; i++) box(.035, .02, 2.1, colors.accent, panel, -1.3 + i * .86, .1, 0);
    box(3.5, .02, .035, colors.accent, panel, 0, .1, 0);
  }
  function house(station, island, colors) {
    const g = group(island, 0, .8, -1);
    cylinder(5.5, 5.8, .4, m.metal, g, 0, 0, 0, 8);
    box(6.7, 3.7, 5.4, m.white, g, 0, 2.05, 0);
    box(7.1, .25, 5.8, m.ink, g, 0, 4, 0);
    if (station.id === 'about') {
      const shape = new THREE.Shape(); shape.moveTo(-3.8, 0); shape.lineTo(0, 2.5); shape.lineTo(3.8, 0); shape.closePath();
      mesh(new THREE.ExtrudeGeometry(shape, { depth: 6.1, bevelEnabled: false }), colors.crystal, g, 0, 4.1, -3.05);
      box(.8, 2, .8, m.white, g, 2.1, 5.6, -1);
      box(2.4, .25, 1.1, m.gold, g, -2, 1.3, 4);
      [-2.8,-1.2].forEach(x => box(.2, .8, .6, m.metal, g, x, .8, 4));
    } else if (station.id === 'skills') {
      mesh(new THREE.SphereGeometry(2.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, g, 0, 4.2, 0);
      const observatory = ring(2.9, .12, colors.accent, g, 0, 4.3, 0); observatory.rotation.x = Math.PI / 2;
      solarPanel(island, -7, 1, colors); solarPanel(island, 7, -1, colors);
      const radar = group(g, 0, 7.5, 0); cylinder(.08,.08,1.8,m.metal,radar,0,-.6,0);
      const hoop = ring(1.1,.08,colors.accent,radar); hoop.rotation.x = .5; animated.push({ object: radar, axis: 'y', speed: .4 });
    } else {
      box(7.5, .35, 6.1, colors.crystal, g, 0, 4.25, 0);
      cylinder(1.6, 1.8, 2.7, m.white, g, 1.2, 5.6, -.5, 10);
      const roof = cylinder(0, 2, 1.4, colors.crystal, g, 1.2, 7.5, -.5, 10);
      roof.rotation.y = .2;
      const beacon = ring(2.5, .06, colors.accent, g, 1.2, 6, -.5); beacon.rotation.x = Math.PI / 2;
      box(1.1, 1.5, .9, colors.crystal, g, -4.5, 1.65, 3);
      box(.85,.12,.05,m.ink,g,-4.5,1.9,3.5);
    }
    box(1.45, 2.6, .12, m.ink, g, .6, 1.65, 2.77);
    box(.85, 1.8, .14, m.window, g, .6, 1.8, 2.84);
    for (const x of [-2.2, 2.35]) {
      box(1.25, 1.35, .14, m.ink, g, x, 2.55, 2.76);
      box(1.05, 1.15, .17, m.window, g, x, 2.55, 2.81);
      box(.09,1.2,.18,m.white,g,x,2.55,2.9);
    }
    box(.15,1.4,2.8,m.window,g,3.4,2.5,-.3);
    box(2.2,.2,1.8,m.metal,g,.6,.4,3.8);
    box(2.8,.2,1,m.metal,g,.6,.2,4.8);
    obstacles.push({ x: station.x, z: station.z - 1, radius: 4.6 });
  }
  function projectSculpture(station, island, colors, index, x = 0, z = -1, scale = 1) {
    const g = group(island, x, .9, z); g.scale.setScalar(scale);
    cylinder(4.7, 5.2, .7, m.metal, g, 0, 0, 0, 10);
    cylinder(4.2, 4.2, .12, colors.ground, g, 0, .42, 0, 10);
    if (index === 0 || index === 9) {
      box(3.1, 6.3, .95, m.white, g, 0, 3.65, 0);
      box(2.6, 5.3, .08, m.glass, g, 0, 3.7, .53);
      box(1.6,.12,.1,m.ink,g,0,6.15,.6);
      [0,1,2].forEach(i => box(1.8 - i * .3, .22, .1, colors.accent, g, i % 2 ? .22 : -.15, 4.8 - i * 1.05, .6));
    } else if (index === 1) {
      [[-2,1,1.2],[1,1,1.2],[-.8,3.1,-.8],[2,1,-1.8]].forEach(([x,y,z],i) => {
        box(2.5,2,2, i % 2 ? m.white : colors.crystal,g,x,y+.5,z);
        for (let n=0;n<3;n++) box(.08,1.8,.08,m.metal,g,x-1+n, y+.5,z+1.02);
      });
      const loop=ring(5.6,.09,colors.accent,g,0,3,0);loop.rotation.x=.8;animated.push({object:loop,axis:'z',speed:.13});
    } else if (index === 2) {
      for (let i=0;i<3;i++) { const hoop=ring(1.9+i*.9,.18, i===1?m.white:colors.accent,g,0,3.5,-i*.5); animated.push({object:hoop,axis:'y',speed:(i+1)*.13}); }
      box(1.2,2,1.4,m.ink,g,-3,1.6,1); box(1.2,2,1.4,m.ink,g,3,1.6,1);
    } else if (index === 3) {
      box(4.5,.5,4.5,m.ink,g,0,1,0);
      const core=mesh(new THREE.OctahedronGeometry(1.7),colors.accent,g,0,3.7,0);animated.push({object:core,axis:'y',speed:.5});
      for(let i=0;i<8;i++) { const a=i*Math.PI/4; const x=Math.cos(a)*3,z=Math.sin(a)*3; cylinder(.09,.09,2,m.metal,g,x,1.5,z,6); mesh(new THREE.IcosahedronGeometry(.35),colors.accent,g,x,2.6,z); }
    } else if (index === 4) {
      cylinder(2.8,3.3,.7,m.white,g,0,1,0,24);
      cylinder(2.4,2.4,.12,m.glass,g,0,1.42,0,32);
      const droplet=mesh(new THREE.OctahedronGeometry(1.3),colors.accent,g,0,4,0);droplet.scale.y=1.7;animated.push({object:droplet,axis:'y',speed:.3});
    } else if (index === 5) {
      [[-2,2.5,0,4],[1,3.7,-1,6.5],[2.3,1.6,2,2.4]].forEach(([x,y,z,h])=>{
        box(2.3,h,2.3,m.white,g,x,y,z);
        for(let i=0;i<Math.floor(h/1.3);i++) box(1.8,.3,.04,m.window,g,x,y-h/2+.7+i*1.3,z+1.18);
      });
    } else if (index === 6) {
      box(1,2.1,.8,m.metal,g,0,1.5,0);box(6.9,4.5,.55,m.white,g,0,4,0);
      box(6.2,3.8,.1,m.glass,g,0,4,.32);box(4,.2,2,m.white,g,0,.6,0);
      const orbit=ring(1.1,.1,colors.accent,g,0,4,.5);animated.push({object:orbit,axis:'z',speed:.3});
    } else if (index === 7) {
      box(5,2.4,3.5,m.white,g,0,1.9,0);box(4.2,.55,2.9,m.ink,g,0,3.45,-.15);
      box(3.5,.15,1.7,m.white,g,0,2,2.1);box(2.6,.1,2.6,colors.accent,g,0,3.8,-1.8).rotation.x=-.45;
    } else {
      box(5,2.1,3.6,m.white,g,0,1.8,0);box(5.1,.25,3.7,m.ink,g,0,2.95,0);
      [-1.3,1.3].forEach(x=>{cylinder(.8,.8,.1,colors.accent,g,x,3.1,0,24);cylinder(.6,.7,.9,m.metal,g,x,3.65,0,16);});
      box(3.5,1.15,.09,m.glass,g,0,1.7,1.85);
    }
    obstacles.push({ x: station.x + x, z: station.z + z, radius: 4.8 * scale });
  }

  for (const [index, station] of stations.entries()) {
    const colors = biomeMaterials[station.biome];
    const island = group(scene, station.x, 0, station.z);
    island.name = `island-${station.id}`; islands.push(island);
    const radius = station.radius;
    const rock = cylinder(radius * .28, radius, 10, colors.rock, island, 0, -5, 0, 9);
    rock.rotation.z = Math.PI;
    cylinder(radius, radius * .94, 1, colors.ground, island, 0, .05, 0, 11);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + .2;
      const x = Math.cos(a) * (radius - 2), z = Math.sin(a) * (radius - 2);
      if (z > 5 && Math.abs(x) < 5) continue;
      if (station.biome === 'garden') tree(island, colors, x, z, .8 + random() * .55);
      else if (station.biome === 'moon') { const crater = cylinder(1.2,1.4,.12,colors.rock,island,x,.62,z,14); crater.scale.z=.7; }
      else if (station.biome === 'desert') { const stone=mesh(new THREE.DodecahedronGeometry(1.3),colors.crystal,island,x,1,z);stone.scale.y=.5+random()*1.2; }
      else crystal(island, colors.crystal, x, z, .9 + random() * 1.3);
    }
    if (station.biome === 'water') { const pond=cylinder(3.1,3.1,.08,m.glass,island,-4,.64,-4,30);pond.scale.z=.7; }
    if (station.biome === 'lava') for(let i=0;i<3;i++) { const vein=box(9,.045,.28,colors.accent,island,0,.58,-4+i*3);vein.rotation.y=.35+i*.45; }
    if (station.kind === 'house') house(station, island, colors);
    else if(station.kind==='career') {
      projectSculpture(station,island,colors,5);
      solarPanel(island,-8,1,colors);
    }
    else if (station.id === 'project-6') {
      // Five Mac applications share a larger island, each with its own exhibit.
      [[-9,-7,6],[8,-8,0],[-11,6,6],[10,6,2],[0,1,0]].forEach(([x,z,model]) => {
        projectSculpture(station,island,colors,model,x,z,.8);
        const walkway = box(.5,.05,Math.hypot(x,z),colors.accent,island,x/2,.62,z/2);
        walkway.rotation.y = Math.atan2(x,z);
      });
      const exhibits = [...station.project.text.matchAll(/(2016\/03 - 2016\/\d{2})\n([^\n]+)/g)];
      const positions = [[-9,-7],[8,-8],[-11,6],[10,6],[0,1]];
      exhibits.forEach(([, date, title],i) => {
        const node = document.createElement('span'); node.className = 'exhibit-label'; node.textContent = title;
        const dateText = createDateText(date, 7.3, palettes[station.biome].accent);
        dateText.position.set(positions[i][0], .56, positions[i][1] + 3.5); island.add(dateText);
        container.querySelector('.station-labels').append(node);
        exhibitLabels.push({node,station,x:station.x+positions[i][0],z:station.z+positions[i][1]});
      });
    } else projectSculpture(station, island, colors, [0,1,4,5,2,6,3,7,8,9][index - 3]);
    const lines = stationTimeline(station), letteringWidth = Math.min(18, radius * 1.25);
    const timeline = group(island, 0, .56, radius * .67);
    timeline.name = 'island-timeline'; timeline.userData.lines = lines;
    timeline.add(createDateText(lines[0], letteringWidth, palettes[station.biome].accent));
    const caption = groundCaption(lines[1], '#edf4fa', letteringWidth);
    caption.position.set(0, .015, -.9); timeline.add(caption);
    const dock = group(island, 0, .25, radius + .3);
    cylinder(2.8,2.4,.4,m.metal,dock,0,0,0,20);
    const dockRing = ring(2.15,.055,colors.accent,dock,0,.27,0);dockRing.rotation.x=-Math.PI/2;
    landingPads.push({ station, ring: dockRing });
    [-2,2].forEach(x=>{cylinder(.09,.12,.9,m.metal,dock,x,.6,0,6);mesh(new THREE.IcosahedronGeometry(.15),colors.accent,dock,x,1.15,0);});
    for(let i=0;i<3;i++){
      const asteroid=mesh(new THREE.IcosahedronGeometry(1.2+i*.45,0),colors.rock,scene,station.x+(i-1)*10,-8-i*4,station.z-5+i*3);
      asteroid.scale.set(1,.8,1.2);floating.push({object:asteroid,baseY:asteroid.position.y,phase:index+i});
    }
    if (index % 3 === 2 || index === stations.length - 1) await checkpoint(42 + Math.round((index + 1) / stations.length * 32), `群岛构建 · ${index + 1} / ${stations.length}`);
  }

  const vehicle = group(scene, spawn.x, 3.3, spawn.z);
  vehicle.name = 'x-wing';
  const hull = group(vehicle);
  const red = material('#b74635', { roughness: .6 });
  const alloy = material('#b1b5ba', { metalness: .65, roughness: .38 });
  const exhaust = material('#ffd1ed', { emissive: '#ff64bb', emissiveIntensity: 3 });
  box(1.15,.82,3.35,m.white,hull,0,0,-.75);
  const nose = cylinder(.12,.72,4.8,m.white,hull,0,-.05,2.55,4); nose.rotation.x=Math.PI/2;
  for(const side of [-1,1]) {
    box(.055,.21,2.45,red,hull,side*.59,.1,-.25);
    box(.25,.045,2.4,red,hull,side*.31,.43,-.7);
  }
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-.49,0);canopyShape.lineTo(-.32,.58);canopyShape.lineTo(.32,.58);canopyShape.lineTo(.49,0);canopyShape.closePath();
  mesh(new THREE.ExtrudeGeometry(canopyShape,{depth:1.75,bevelEnabled:false}),m.glass,hull,0,.38,-.25);
  [0,.85,1.5].forEach(z=>box(.72,.07,.065,alloy,hull,0,.96,z));
  box(.075,.08,1.75,alloy,hull,0,.98,.62);
  cylinder(.27,.27,.37,m.white,hull,0,.67,-1.16,12);
  mesh(new THREE.SphereGeometry(.28,12,8,0,Math.PI*2,0,Math.PI/2),m.glass,hull,0,.86,-1.16);
  for(let i=0;i<4;i++) box(.85,.06,.12,m.ink,hull,0,.45,-1.7+i*.21);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0,.55);wingShape.lineTo(3.75,-.1);wingShape.lineTo(3.85,-1.35);wingShape.lineTo(0,-1.35);wingShape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape,{depth:.12,bevelEnabled:false});
  const flames=[];
  const wingEmitters=[];
  const laserMuzzles=[];
  const engineHalos=[];
  const flameGeometry=new THREE.ConeGeometry(.23,1.7,12).translate(0,.85,0);
  const flameGlow=new THREE.MeshBasicMaterial({color:'#76cfff',transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending});
  const haloMaterial=new THREE.SpriteMaterial({map:glowTexture,color:'#a8dfff',transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending});
  for(const side of [-1,1]) for(const level of [-1,1]) {
    const foil=group(hull,side*.57,level*.18,-.55);foil.rotation.z=side*level*.32;
    const wing=mesh(wingGeometry,m.white,foil);wing.rotation.x=Math.PI/2;wing.scale.x=side;
    box(.47,.035,1.24,red,foil,side*2.92,level*.15,-.63);
    box(1.65,.04,.065,alloy,foil,side*2.25,level*.16,-.75);
    const nacelle=cylinder(.34,.4,2.4,m.white,foil,side*.72,0,-.75,16);nacelle.rotation.x=Math.PI/2;
    const intake=cylinder(.26,.26,.12,m.ink,foil,side*.72,0,.49,16);intake.rotation.x=Math.PI/2;
    ring(.29,.055,alloy,foil,side*.72,0,.57);
    const nozzle=cylinder(.31,.36,.55,m.metal,foil,side*.72,0,-2.17,16);nozzle.rotation.x=Math.PI/2;
    ring(.26,.075,exhaust,foil,side*.72,0,-2.47);
    const cannon=cylinder(.075,.11,4.6,alloy,foil,side*3.85,0,1.02,8);cannon.rotation.x=Math.PI/2;
    const muzzle=cylinder(.12,.12,.38,m.ink,foil,side*3.85,0,3.18,8);muzzle.rotation.x=Math.PI/2;
    laserMuzzles.push(muzzle);
    box(.45,.08,.22,m.white,foil,side*3.85,0,2.87);
    const flame=mesh(flameGeometry,exhaust,foil,side*.72,0,-2.5);flame.name='engine-flame';flame.rotation.x=-Math.PI/2;flames.push(flame);
    const sheath=mesh(flameGeometry,flameGlow,flame);sheath.scale.set(1.8,1.1,1.8);
    const halo=new THREE.Sprite(haloMaterial);halo.position.set(side*.72,0,-2.5);foil.add(halo);engineHalos.push(halo);
    if(level===1){
      const emitter=group(foil,side*3.85,0,-1.45);emitter.userData.side=side;wingEmitters.push(emitter);
    }
  }
  vehicle.traverse(object => { object.castShadow = false; });
  const returnBeacon=group(scene);returnBeacon.name='return-beacon';returnBeacon.visible=false;
  cylinder(.12,.17,1.4,m.white,returnBeacon);
  cylinder(0,.17,.55,m.gold,returnBeacon,0,.96,0,10);
  for(let i=0;i<4;i++)box(.07,.6,.65,m.metal,returnBeacon,0,-.48,0).rotation.y=i*Math.PI/2;
  const beaconExhaust=mesh(new THREE.ConeGeometry(.18,1.6,10),m.engine,returnBeacon,0,-1.45,0);beaconExhaust.rotation.z=Math.PI;
  const beaconGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:'#ffd3a1',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  beaconGlow.scale.setScalar(3);returnBeacon.add(beaconGlow);
  returnBeacon.traverse(object=>{object.castShadow=false;});
  const jumpRing=ring(1,.07,new THREE.MeshBasicMaterial({color:'#aadfff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}),scene);
  jumpRing.name='jump-ring';jumpRing.rotation.x=-Math.PI/2;jumpRing.visible=false;jumpRing.castShadow=false;
  const trailCount=640,trailPositions=new Float32Array(trailCount*3),trailColors=new Float32Array(trailCount*3),trailLife=new Float32Array(trailCount);
  const trailVelocity=new Float32Array(trailCount*3),trailHeat=new Float32Array(trailCount);
  const trailGeometry=new THREE.BufferGeometry();
  trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3));trailGeometry.setAttribute('color',new THREE.BufferAttribute(trailColors,3));
  const trailPoints=new THREE.Points(trailGeometry,new THREE.PointsMaterial({size:5,map:glowTexture,vertexColors:true,transparent:true,depthWrite:false,sizeAttenuation:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  trailPoints.name='engine-trail';trailPoints.frustumCulled=false;scene.add(trailPoints);
  const emitterPosition=new THREE.Vector3();
  let trailIndex=0,trailTime=0;
  const laserGroup = group(scene); laserGroup.name = 'laser-bolts';
  const laserCore = new THREE.MeshBasicMaterial({ color: '#fff0d2', toneMapped: false });
  const laserHalo = new THREE.MeshBasicMaterial({ color: '#ff573e', transparent: true, opacity: .38, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const laserGeometry = new THREE.CylinderGeometry(.065, .065, 3.2, 5);
  const lasers = Array.from({ length: 32 }, () => {
    const object = group(laserGroup); object.visible = false;
    const core = mesh(laserGeometry, laserCore, object); core.castShadow = core.receiveShadow = false;
    const halo = mesh(laserGeometry, laserHalo, object); halo.scale.set(3.2, 1.12, 3.2); halo.castShadow = halo.receiveShadow = false;
    return { object, life: 0, velocity: new THREE.Vector3() };
  });
  const laserDirection = new THREE.Vector3(), laserUp = new THREE.Vector3(0, 1, 0);
  const chargeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: '#8cefff', transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const chargeCold = chargeGlow.material.color.clone(), chargeHot = new THREE.Color('#ff4a32');
  chargeGlow.name = 'laser-charge'; chargeGlow.position.set(0, 0, 4.5); chargeGlow.visible = false; vehicle.add(chargeGlow);
  const chargedBeam = group(scene); chargedBeam.name = 'charged-laser'; chargedBeam.visible = false;
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const beamCore = mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: '#ecffff', transparent: true, opacity: 1, depthWrite: false, toneMapped: false }), chargedBeam);
  const beamHalo = mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: '#5bdcff', transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), chargedBeam);
  beamHalo.scale.set(2.4, 1.01, 2.4);
  chargedBeam.traverse(object => { object.castShadow = object.receiveShadow = false; });
  const maxChargeTime = 5, autoFireTime = 10;
  let laserIndex = 0, fireSource = null, chargeTime = 0, chargeStartedAt = 0, cooldown = 0, beamLife = 0, beamDuration = 0, beamWidth = 1, idleTime = 0;
  const heldSeconds = () => Math.min(autoFireTime, (performance.now() - chargeStartedAt) / 1000);
  const isPiloting = () => Object.values(input).some(Boolean) || Math.abs(ship.speed) > .15 || fireSource !== null || cooldown > 0;
  function reportFlightStatus() { onFlightStatus({ charge: Math.min(1, chargeTime / maxChargeTime), chargeLimit: maxChargeTime, overcharge: Math.max(0, (chargeTime - maxChargeTime) / (autoFireTime - maxChargeTime)), autoFireIn: autoFireTime - chargeTime, cooldown, charging: fireSource !== null, idle: idleTime >= 8, piloting: isPiloting(), heading: ship.heading }); }
  function cancelFire() { fireSource = null; weaponPointer = null; chargeTime = 0; chargeGlow.visible = false; reportFlightStatus(); }
  function clearLasers() { cancelFire(); chargedBeam.visible = false; beamLife = 0; lasers.forEach(laser => { laser.life = 0; laser.object.visible = false; }); }
  function beginFire(source) {
    if (!active || assembly || transit || overview || contextLost || cooldown > 0 || fireSource !== null) return false;
    fireSource = source; chargeStartedAt = performance.now(); chargeTime = 0; idleTime = 0; reportFlightStatus(); return true;
  }
  function endFire(source, cancel = false) {
    if (fireSource !== source) return;
    const duration = heldSeconds(), power = Math.min(1, duration / maxChargeTime), charged = duration >= .3;
    const heat = Math.max(0, (duration - maxChargeTime) / (autoFireTime - maxChargeTime));
    cancelFire();
    if (cancel || !active || assembly || transit || overview || contextLost) return;
    idleTime = 0; cooldown = charged ? 3 : .14;
    fireLaser(charged ? power : 0, heat); reportFlightStatus();
  }
  function fireLaser(power = 0, heat = 0) {
    updateVehicle(); vehicle.updateMatrixWorld(true);
    laserDirection.set(Math.sin(ship.heading), 0, Math.cos(ship.heading));
    if (power > 0) {
      const length = reduce ? 18 : 40 + power * 110;
      beamWidth = .3 + power * 2.2;
      chargeGlow.getWorldPosition(chargedBeam.position);
      chargedBeam.position.addScaledVector(laserDirection, length / 2);
      chargedBeam.quaternion.setFromUnitVectors(laserUp, laserDirection);
      chargedBeam.scale.set(beamWidth, length, beamWidth);
      beamCore.material.opacity = 1; beamHalo.material.opacity = .32;
      beamHalo.material.color.copy(chargeCold).lerp(chargeHot, heat);
      beamLife = beamDuration = reduce ? .1 : .2 + power * 1.3;
      chargedBeam.visible = true;
      return;
    }
    laserMuzzles.forEach(muzzle => {
      const laser = lasers[laserIndex++ % lasers.length];
      muzzle.getWorldPosition(laser.object.position);
      laser.object.position.addScaledVector(laserDirection, 1.7);
      laser.object.quaternion.setFromUnitVectors(laserUp, laserDirection);
      laser.object.scale.y = reduce ? .5 : 1;
      laser.object.visible = true; laser.life = reduce ? .1 : .42;
      laser.velocity.copy(laserDirection).multiplyScalar(reduce ? 0 : 125);
    });
  }

  function emitParticle(position,vx,vy,vz,life,heat=0) {
    const index=trailIndex++%trailCount;
    trailPositions.set([position.x,position.y,position.z],index*3);
    trailVelocity.set([vx,vy,vz],index*3);trailLife[index]=life;trailHeat[index]=heat;
  }
  function updateVehicle() {
    vehicle.position.set(ship.x,3.3+(reduce?0:Math.sin(elapsed*1.7)*.12),ship.z);
    vehicle.rotation.set(0,ship.heading,0);vehicle.scale.set(1,1,1);vehicle.visible=true;
    returnBeacon.visible=false;jumpRing.visible=false;
    if (assembly) { vehicle.position.y += (1 - assembly.progress) * 9; vehicle.rotation.z = reduce ? 0 : Math.sin(assembly.progress * Math.PI) * -.18; }
    if (transit?.local) {
      vehicle.position.y += transit.lift * THREE.MathUtils.smoothstep(transit.progress, 0, .15) * (1 - THREE.MathUtils.smoothstep(transit.progress, .85, 1));
      return;
    }
    if(!transit||reduce)return;
    const t=transit.progress,heading=ship.heading;
    let advance=0,lift=0,stretch=1;
    if(t<.22){
      const charge=THREE.MathUtils.clamp(t/.22,0,1);
      lift=charge*1.8;vehicle.rotation.z=Math.sin(charge*Math.PI)*.1;
    }else if(t<.5){
      const launch=THREE.MathUtils.clamp((t-.22)/.25,0,1);
      advance=65*launch**3;lift=1.8+launch*9;stretch=1+launch*2.5;
      vehicle.rotation.x=-launch*.2;
      vehicle.scale.x=vehicle.scale.y=1-launch*.72;
      vehicle.visible=t<.46;
    }else{
      const landing=THREE.MathUtils.clamp((t-.56)/.44,0,1),remaining=(1-landing)**3;
      advance=-32*remaining;lift=12*remaining;stretch=1+remaining*1.6;
      vehicle.rotation.z=Math.sin(landing*Math.PI)*-.45;
      vehicle.rotation.x=remaining*.15;vehicle.visible=t>.56;
      if(landing>0){jumpRing.visible=true;jumpRing.position.set(ship.x,.8,ship.z);jumpRing.scale.setScalar(2+landing*14);jumpRing.material.opacity=(1-landing)*.7;jumpRing.material.color.set('#9ddcff');}
    }
    vehicle.position.x+=Math.sin(heading)*advance;vehicle.position.z+=Math.cos(heading)*advance;vehicle.position.y+=lift;vehicle.scale.z=stretch;
    if(transit.returning&&transit.time<1.25){
      const launch=THREE.MathUtils.clamp(transit.time/.6,0,1);
      returnBeacon.visible=transit.time<.6;
      returnBeacon.position.set(transit.source.x+Math.sin(transit.source.heading)*launch*7,4+launch**2*18,transit.source.z+Math.cos(transit.source.heading)*launch*7);
      returnBeacon.rotation.z=Math.sin(launch*Math.PI)*-.16;
      if(transit.time>.5){
        const burst=(transit.time-.5)/.75;
        jumpRing.visible=true;jumpRing.position.set(transit.source.x,3,transit.source.z);jumpRing.scale.setScalar(2+burst*25);jumpRing.material.opacity=(1-burst)*.85;jumpRing.material.color.set('#ffc383');
        vehicle.position.y+=Math.sin(burst*Math.PI)*2;vehicle.rotation.z+=Math.sin(burst*Math.PI)*.35;
      }
    }
  }

  function updateCamera(dt = 0, snap = false) {
    const desired = overview ? new THREE.Vector3(0,0,0) : new THREE.Vector3(ship.x,0,ship.z-8);
    if (current && !overview) desired.lerp(new THREE.Vector3(current.x,0,current.z+4), .3);
    cameraTarget.lerp(desired,snap||reduce?1:1-Math.exp(-4.5*dt));
    const aspect=width/height;
    const desiredScale=viewScales[overview?'overview':'flight'];
    viewScale=snap||reduce?desiredScale:THREE.MathUtils.damp(viewScale,desiredScale,10,dt);
    const desiredHeight=(overview?Math.max(560,720/aspect):Math.max(80,58/aspect))*viewScale-warp*9+boostGlow*8+(assembly ? (1-assembly.progress)*65 : 0);
    cameraSpan = snap || reduce ? desiredHeight : THREE.MathUtils.damp(cameraSpan, desiredHeight, 7, dt);
    const viewHeight = cameraSpan;
    camera.position.copy(cameraTarget).addScaledVector(cameraOffset,Math.max(1,viewHeight/75));camera.lookAt(cameraTarget);
    camera.far=camera.position.distanceTo(cameraTarget)+1200;
    camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  function project(x,y,z) {
    projected.set(x,y,z).project(camera);
    return {x:(projected.x*.5+.5)*width,y:(-projected.y*.5+.5)*height,visible:projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.1&&Math.abs(projected.y)<1.1};
  }
  function render() {
    updateVehicle();
    const used=[];
    const order=stations.map((s,i)=>({s,i,d:Math.hypot(s.x-ship.x,s.z-ship.z)})).sort((a,b)=>a.d-b.d);
    for(const {s,i} of order){
      const node=labelNodes[i],p=project(s.x,s.labelY,s.z);
      const w=Math.min(210,s.title.length*12+24),h=34;
      const rect={left:p.x-w/2,right:p.x+w/2,top:p.y-h,bottom:p.y};
      const overlaps=used.some(r=>rect.left<r.right+8&&rect.right>r.left-8&&rect.top<r.bottom+6&&rect.bottom>r.top-6);
      const visible=!overview&&!transit&&p.visible&&!overlaps&&s.id!==current?.id&&p.x>w/2&&p.x<width-w/2&&p.y>80;
      node.hidden=!visible;
      if(visible){node.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;used.push(rect);}
    }
    exhibitLabels.forEach(({node,station,x,z})=>{
      const p=project(x,6,z);node.hidden=overview||transit||!p.visible||Math.hypot(ship.x-station.x,ship.z-station.z)>36;
      if(!node.hidden)node.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    });
    galaxyLabels.forEach(({node,galaxy})=>{const p=project(galaxy.x,15,galaxy.z);node.hidden=!overview||!p.visible;if(!node.hidden)node.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;});
    portalLabels.forEach(({node,portal})=>{const p=project(portal.x,11,portal.z);node.hidden=overview||transit||!p.visible;if(!node.hidden)node.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;});
    if(current&&!overview){
      const anchor=project(current.x,8,current.z);
      const panelWidth=billboard.offsetWidth||360,panelHeight=billboard.offsetHeight||320;
      const left=Math.max(12,Math.min(width-panelWidth-12,anchor.x+30));
      const top=Math.max(78,Math.min(height-panelHeight-95,anchor.y-panelHeight*.6));
      billboard.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;
    }
    mapCar.style.left=`${(ship.x/mapSize.width+.5)*100}%`;
    mapCar.style.top=`${(ship.z/mapSize.depth+.5)*100}%`;
    document.querySelector('#map-coordinates').textContent=`X ${ship.x.toFixed(1)} / Z ${ship.z.toFixed(1)}`;
    const region=galaxies.find(g=>Math.hypot(ship.x-g.x,ship.z-g.z)<g.radius+18);
    document.querySelector('#sector-name').textContent=overview?'全部星系':region?region.title:'星际空间';
    renderer.render(scene,camera);
  }
  function resize() {
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    width=w;height=h;renderer.setSize(width,height,false);galaxyBackground.resize(width*renderer.getPixelRatio(),height*renderer.getPixelRatio());updateCamera(0,true);render();
  }
  function updateStation() {
    const next=assembly||overview||transit?null:nearestStation(ship,stations,current?.id);
    if(current?.id!==next?.id){current=next;onNearby(current);}
  }
  function setOverview(value) {
    if (assembly || transit || contextLost || overview === value) return;
    overview = value; ship.speed = 0; clearLasers(); onOverviewChange(value);
    updateStation(); updateCamera(0, reduce); render();
  }
  function tick(time) {
    if(!active||contextLost)return;
    const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;elapsed+=dt;
    portalCooldown=Math.max(0,portalCooldown-dt);
    cooldown = Math.max(0, cooldown - dt);
    if (fireSource !== null) {
      chargeTime = heldSeconds();
      if (chargeTime >= autoFireTime) endFire(fireSource);
    }
    idleTime = isPiloting() || assembly || transit || overview ? 0 : idleTime + dt;
    if (overview && Object.values(input).some(Boolean)) setOverview(false);
    if(assembly){
      assembly.progress = Math.min(1, assembly.progress + dt / (reduce ? .01 : 1.8));
      islands.forEach((island, i) => {
        const t = THREE.MathUtils.smoothstep(assembly.progress, i / islands.length * .45, .55 + i / islands.length * .45);
        island.scale.setScalar(.015 + t * .985); island.position.y = -22 * (1 - t);
      });
      planets.forEach(planet => planet.scale.setScalar(.25 + assembly.progress * .75));
      renderer.shadowMap.needsUpdate = true;
      onBuild(90 + Math.floor(assembly.progress * 9), '航线校准 · 飞船离港');
    }else if(transit){
      transit.time+=dt;
      const lead=transit.returning&&transit.duration>.25?.8:0;
      const progress=Math.min(1,Math.max(transit.progress,reduce&&!transit.local?transit.time/.25:(transit.time-lead)/(transit.duration-lead)));
      transit.progress=progress;warp=reduce||transit.local?0:Math.sin(Math.max(0,progress)*Math.PI);
      if (transit.local) {
        const { source, target, heading, distance, duration } = transit;
        const u = THREE.MathUtils.clamp((progress - .15) / .7, 0, 1);
        const blend = u * u * (3 - 2 * u);
        ship.x = THREE.MathUtils.lerp(source.x, target.x, blend);
        ship.z = THREE.MathUtils.lerp(source.z, target.z, blend);
        ship.speed = distance * 6 * u * (1 - u) / (duration * .7);
        const turn = Math.atan2(Math.sin(heading - source.heading), Math.cos(heading - source.heading));
        const dockTurn = Math.atan2(Math.sin(target.heading - heading), Math.cos(target.heading - heading));
        ship.heading = source.heading + turn * THREE.MathUtils.smoothstep(progress, 0, .15) + dockTurn * THREE.MathUtils.smoothstep(progress, .85, 1);
      } else if(progress>=.5&&!transit.moved){Object.assign(ship,transit.target);transit.moved=true;updateCamera(0,true);trailLife.fill(0);}
      if(progress===1){const resolve=transit.resolve;transit=null;warp=0;portalCooldown=3;resolve();}
    }else if(!overview){
      stepVehicle(ship,input,dt,obstacles);
      if(portalCooldown===0){const gate=portals.find(p=>Math.hypot(ship.x-p.x,ship.z-p.z)<4.3);if(gate){portalCooldown=4;onPortal(gate.destination);}}
    }
    boostGlow=reduce?0:THREE.MathUtils.damp(boostGlow,!transit&&!overview&&input.boost&&Math.abs(ship.speed)>2?1:0,8,dt);
    galaxyBackground.update(dt,reduce,warp+boostGlow*.55,pointer);
    updateStation();updateCamera(dt);
    const turning=Number(input.left)-Number(input.right);
    hull.rotation.z=THREE.MathUtils.damp(hull.rotation.z,reduce?0:-turning*ship.speed*.011,6,dt);
    hull.rotation.x=THREE.MathUtils.damp(hull.rotation.x,reduce?0:Number(input.up)*.055,6,dt);
    const jumpThrust=transit&&!transit.local&&!reduce?Math.sin(THREE.MathUtils.clamp(transit.progress,0,1)*Math.PI):0;
    const enginePower=Math.max(boostGlow,jumpThrust);
    const flameLength=reduce?.8:.35+Math.abs(ship.speed)*.055+enginePower*3.4;
    flames.forEach((flame,i)=>{flame.scale.set(1+enginePower*.8,flameLength*(reduce?1:1+Math.sin(elapsed*35+i)*.08*enginePower),1+enginePower*.8);});
    engineHalos.forEach(halo=>halo.scale.setScalar(1+enginePower*2.7));
    exhaust.color.setRGB(1-enginePower*.3,.82+enginePower*.18,.93+enginePower*.07);exhaust.emissive.setRGB(1-enginePower*.8,.24+enginePower*.56,.62+enginePower*.38);exhaust.emissiveIntensity=3+enginePower*4;
    trailPoints.material.size=3+enginePower*4;
    updateVehicle();
    chargeGlow.visible = fireSource !== null;
    const heat = Math.max(0, (chargeTime - maxChargeTime) / (autoFireTime - maxChargeTime));
    chargeGlow.scale.setScalar((reduce ? .8 : 1.2) + Math.min(1, chargeTime / maxChargeTime) * 5);
    chargeGlow.material.color.copy(chargeCold).lerp(chargeHot, heat);
    chargeGlow.material.opacity = heat >= .6 && !reduce ? .7 + Math.sin(elapsed * 10) * .2 : .8;
    if (beamLife > 0) {
      beamLife = Math.max(0, beamLife - dt);
      const fade = beamLife / beamDuration;
      chargedBeam.visible = beamLife > 0;
      chargedBeam.scale.x = chargedBeam.scale.z = beamWidth * (.45 + fade * .55);
      beamCore.material.opacity = fade; beamHalo.material.opacity = fade * .32;
    }
    reportFlightStatus();
    if(!reduce){
      animated.forEach(({object,axis,speed})=>{object.rotation[axis]+=dt*speed;});
      floating.forEach(({object,baseY,phase})=>{object.position.y=baseY+Math.sin(elapsed*.35+phase)*.6;object.rotation.y+=dt*.035;});
      trailTime=Math.min(trailTime+dt,.06);
      if((Math.abs(ship.speed)>1||transit)&&vehicle.visible){
        vehicle.updateMatrixWorld(true);
        const interval=enginePower>.3?.01:.03;
        while(trailTime>=interval){
          for(const emitter of wingEmitters){
            emitter.getWorldPosition(emitterPosition);
            const count=enginePower>.3?3:1;
            for(let i=0;i<count;i++){
              const exhaustSpeed=3+enginePower*7,spread=.3+enginePower*3.6;
              const outward=emitter.userData.side*(.15+random()*spread);
              emitParticle(emitterPosition,-Math.sin(ship.heading)*exhaustSpeed+Math.cos(ship.heading)*outward,(random()-.5)*.35,-Math.cos(ship.heading)*exhaustSpeed-Math.sin(ship.heading)*outward,.18+enginePower*.1);
            }
          }
          trailTime-=interval;
        }
      }
      if(returnBeacon.visible)emitParticle(returnBeacon.position,(random()-.5)*2,-10,(random()-.5)*2,.9,1);
      if(transit?.returning&&transit.time>=.6&&!transit.burst){
        transit.burst=true;
        emitterPosition.set(transit.source.x+Math.sin(transit.source.heading)*7,22,transit.source.z+Math.cos(transit.source.heading)*7);
        for(let i=0;i<150;i++){const angle=random()*Math.PI*2,speed=5+random()*14;emitParticle(emitterPosition,Math.cos(angle)*speed,(random()-.5)*20,Math.sin(angle)*speed,.7+random()*.7,1);}
      }
    }
    for(let i=0;i<trailCount;i++){
      trailLife[i]=reduce?0:Math.max(0,trailLife[i]-dt);
      if(trailLife[i]>0){const n=i*3;trailPositions[n]+=trailVelocity[n]*dt;trailPositions[n+1]+=trailVelocity[n+1]*dt;trailPositions[n+2]+=trailVelocity[n+2]*dt;}
      const heat=trailHeat[i],life=Math.min(1,trailLife[i]/(heat?.7:.22));trailColors.set([life*(heat?1.5:.55),life*(heat?.65:.85),life*(heat?.15:1.35)],i*3);
    }
    trailGeometry.attributes.position.needsUpdate=true;trailGeometry.attributes.color.needsUpdate=true;
    lasers.forEach(laser => {
      if (laser.life <= 0) return;
      laser.life = Math.max(0, laser.life - dt);
      laser.object.visible = laser.life > 0;
      laser.object.position.addScaledVector(laser.velocity, dt);
    });
    landingPads.forEach(({station,ring})=>{ring.scale.setScalar(station.id===current?.id?1.1:1);});
    render();
    if (assembly?.progress === 1) { const resolve = assembly.resolve; assembly = null; onBuild(100, '星域就绪'); resolve(); }
    frame=requestAnimationFrame(tick);
  }
  const observer=new ResizeObserver(resize);
  const loseContext=e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(frame);transit?.resolve();transit=null;assembly?.resolve();assembly=null;warp=0;boostGlow=0;clearLasers();updateVehicle();onContextLost();};
  renderer.domElement.addEventListener('webglcontextlost',loseContext);
  function startTransit(target,returning=false,onStart=()=>{}) {
    if(transit)return transit.promise;
    if(contextLost)return Promise.resolve();
    const dx=target.x-ship.x,dz=target.z-ship.z,distance=Math.hypot(dx,dz);
    const local=!returning&&distance<=100;
    if(local&&distance<.5){ship.speed=0;setOverview(false);updateStation();render();return Promise.resolve();}
    // Fly above building footprints on short routes instead of passing through them.
    const lift=local&&obstacles.some(obstacle=>{
      const t=THREE.MathUtils.clamp(((obstacle.x-ship.x)*dx+(obstacle.z-ship.z)*dz)/(distance*distance),0,1);
      return Math.hypot(ship.x+dx*t-obstacle.x,ship.z+dz*t-obstacle.z)<obstacle.radius+5;
    })?16:0;
    let resolve;
    const promise=new Promise(done=>{resolve=done;});
    transit={target,returning,local,lift,distance,heading:Math.atan2(dx,dz),source:{...ship},time:0,progress:returning&&!reduce?-.8/2.4:0,duration:local?1+distance/14:reduce?.25:returning?3.2:2.4,moved:false,burst:false,resolve,promise};
    overview=false;onOverviewChange(false);clearLasers();ship.speed=0;boostGlow=0;current=null;trailLife.fill(0);onNearby(null);
    onStart(local?'flight':'warp');
    updateCamera(0,!local);render();return promise;
  }
  renderer.toneMappingExposure=1.1;renderer.shadowMap.needsUpdate=true;
  const api = {
    reveal(){
      if (assembly) return assembly.promise;
      if (contextLost) return Promise.resolve();
      let resolve; const promise = new Promise(done => { resolve = done; });
      assembly = { progress: 0, resolve, promise };
      islands.forEach(island => { island.scale.setScalar(.015); island.position.y = -22; });
      planets.forEach(planet => planet.scale.setScalar(.25));
      updateCamera(0, true); render(); return promise;
    },
    zoomBy,
    beginFire, endFire, cancelFire,
    reset(onStart){return startTransit({...spawn},true,onStart);},
    travel(station,onStart){return startTransit({x:station.stop.x,z:station.stop.z,heading:Math.PI,speed:0},false,onStart);},
    setOverview,
    setActive(value){if(active===value)return;active=value;cancelAnimationFrame(frame);lastTime=0;if(!active){touches.clear();pinchDistance=0;clearLasers();}if(active&&!contextLost){resize();frame=requestAnimationFrame(tick);}},
    setReducedMotion(value){reduce=value;},
    dispose(){
      active=false;cancelAnimationFrame(frame);clearLasers();observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',loseContext);container.removeEventListener('pointermove',movePointer);transit?.resolve();assembly?.resolve();
      Object.entries(zoomEvents).forEach(([name, listener])=>renderer.domElement.removeEventListener(name,listener));touches.clear();
      [...exhibitLabels,...galaxyLabels,...portalLabels].forEach(({node})=>node.remove());
      const geos=new Set(),mats=new Set(),textures=new Set();
      scene.traverse(object=>{if(object.geometry)geos.add(object.geometry);if(object.material)mats.add(object.material);});
      mats.forEach(mat=>{if(mat.map)textures.add(mat.map);if(mat.bumpMap)textures.add(mat.bumpMap);mat.dispose();});geos.forEach(geo=>geo.dispose());textures.forEach(texture=>texture.dispose());renderer.dispose();renderer.domElement.remove();
    },
  };
  try {
    await checkpoint(82, '飞行系统已连接');
    await checkpoint(86, '准备着色器与光照');
    await renderer.compileAsync(scene, camera);
    if (contextLost) throw new Error('WebGL context lost during initialization');
    resize();
    observer.observe(container);
    await checkpoint(90, '首帧已生成 · 准备离港');
    return api;
  } catch (error) { api.dispose(); throw error; }
}
