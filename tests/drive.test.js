import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawn, bounds, stepVehicle, nearestStation } from '../src/drive.js';
import { stations, mapSize, galaxies, portals, projects, experience, sections, billboardMarkup } from '../src/content.js';

const idle = { up: false, down: false, left: false, right: false, brake: false, boost: false };
test('opening the HTML file enters the local 3D preview without redirecting deployed sites', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script id="local-preview-entry">([\s\S]*?)<\/script>/)[1];
  for (const [protocol, hash, expected] of [
    ['file:', '', 'http://127.0.0.1:5173/#explore'],
    ['file:', '#resume-contact', 'http://127.0.0.1:5173/#resume-contact'],
    ['http:', '', null],
    ['https:', '#explore', null],
  ]) {
    let destination = null;
    runInNewContext(script, { location: { protocol, hash, replace: url => { destination = url; } } });
    assert.equal(destination, expected);
  }
});

test('flight, braking, reverse steering, collision and expanded boundaries', () => {
  const ship = { x: 0, z: 0, heading: 0, speed: 0 };
  for (let i = 0; i < 40; i++) stepVehicle(ship, { ...idle, up: true }, 1 / 60);
  assert.ok(ship.z > 1 && ship.speed > 0);
  const speed = ship.speed;
  for (let i = 0; i < 30; i++) stepVehicle(ship, { ...idle, brake: true }, 1 / 60);
  assert.ok(Math.abs(ship.speed) < speed / 100);
  const reverse = { x: 0, z: 0, heading: 0, speed: -3 };
  stepVehicle(reverse, { ...idle, left: true }, 1 / 60);
  assert.ok(reverse.heading > 0 && reverse.z < 0, 'reverse thrust keeps the same yaw direction');
  const stationary = { x: 0, z: 0, heading: 0, speed: 0 };
  for (let i = 0; i < 120; i++) stepVehicle(stationary, { ...idle, left: true }, 1 / 60);
  assert.ok(stationary.heading > 4.5, 'holding A keeps turning at zero speed');
  assert.equal(stationary.x, 0); assert.equal(stationary.z, 0);
  const heading = stationary.heading;
  stepVehicle(stationary, idle, 1 / 60);
  assert.equal(stationary.heading, heading, 'releasing steering stops rotation');
  const analog = { x: 0, z: 0, heading: 0, speed: 0 };
  stepVehicle(analog, { ...idle, right: .5 }, 1 / 60);
  assert.ok(Math.abs(analog.heading + .02) < 1e-9, 'joystick steering remains proportional');
  const collision = { x: 0, z: -1.71, heading: 0, speed: 5 };
  stepVehicle(collision, { ...idle, up: true }, 1 / 60, [{ x: 0, z: 0, radius: 1 }]);
  assert.equal(collision.z, -1.71);
  assert.ok(collision.speed < 0);
  const edge = { x: 0, z: bounds.z - .01, heading: 0, speed: 22 };
  stepVehicle(edge, { ...idle, up: true }, 5);
  assert.ok(edge.z < bounds.z && edge.speed < 0);
  const beyondOldMap = { x: 0, z: 20, heading: 0, speed: 22 };
  stepVehicle(beyondOldMap, { ...idle, up: true }, 1 / 60);
  assert.ok(beyondOldMap.z > 20 && beyondOldMap.speed > 0);
  const boosted = { x: 0, z: 0, heading: 0, speed: 22 };
  for (let i = 0; i < 30; i++) stepVehicle(boosted, { ...idle, up: true, boost: true }, 1 / 60);
  assert.ok(boosted.speed > 22 && boosted.speed <= 36);
  assert.deepEqual(stepVehicle({ ...spawn }, idle, 0), spawn);
});

test('every project has its own reachable island and enters/exits automatically', () => {
  assert.equal(projects.length, 10);
  assert.equal(experience.length, 4);
  assert.equal(stations.length, 17);
  assert.equal(new Set(stations.map(s => s.id)).size, 17);
  assert.equal(stations.filter(s => s.kind === 'house').length, 3);
  assert.equal(new Set(stations.map(s => s.biome)).size, 6);
  assert.ok(mapSize.width * mapSize.depth > 39 * 28 * 100);
  assert.equal(nearestStation(spawn, stations), null);
  for (const station of stations) {
    const { x, z } = station.stop;
    assert.ok(Math.abs(x) + 12 < bounds.x && Math.abs(z) + 12 < bounds.z);
    assert.equal(nearestStation(station.stop, stations)?.id, station.id);
    assert.equal(nearestStation({ x, z: z + 7.9 }, stations)?.id, station.id);
    assert.equal(nearestStation({ x, z: z + 8.5 }, stations), null);
    assert.equal(nearestStation({ x, z: z + 8.5 }, stations, station.id)?.id, station.id);
    assert.equal(nearestStation({ x, z: z + 10.1 }, stations, station.id), null);
    assert.ok(billboardMarkup(station).length > 50);
    for (const other of stations) {
      if (other === station) continue;
      assert.ok(Math.hypot(x - other.x, z - other.z) > 16, `${station.id} has a blocked approach`);
    }
    if (station.project) assert.ok(projects.includes(station.project));
    else if (station.job) assert.ok(experience.includes(station.job));
    else assert.ok(sections[station.id]?.body);
  }
  assert.deepEqual(stations.filter(s => s.project).map(s => s.project), projects);
});

test('stations stay inline without publishing a PDF reader', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /car-tag|不想开车|继续飞行|[↑↓←→↗]/);
  assert.doesNotMatch(html + main + JSON.stringify(sections), /resume\.pdf|pdf-reader|data-pdf-open/);
  assert.doesNotMatch(html + JSON.stringify(sections), /\bdownload=/);
  assert.doesNotMatch(main, /station-number|s\.symbol/);
  assert.doesNotMatch(html + main, /role="switch"|theme-toggle|setTheme/);
  for (const station of stations) assert.doesNotMatch(billboardMarkup(station), /[↑↓←→↗]/);
});

test('four distinct galaxies, compact local islands, chronological projects and clear portals', () => {
  assert.deepEqual(galaxies.map(g => g.title), ['基本资料','公司经历','项目经历','联系方式']);
  for (const station of stations) {
    const galaxy = galaxies.find(g => g.id === station.galaxy);
    assert.ok(galaxy);
    assert.ok(Math.hypot(station.x-galaxy.x,station.z-galaxy.z)+station.radius < galaxy.radius);
    for (const other of stations) if (station !== other) {
      assert.ok(Math.hypot(station.x-other.x,station.z-other.z) > station.radius+other.radius+3);
    }
    const neighbors=stations.filter(s=>s!==station&&s.galaxy===station.galaxy);
    if(neighbors.length) assert.ok(Math.min(...neighbors.map(s=>Math.hypot(s.x-station.x,s.z-station.z))) < 60);
  }
  const projectGalaxy=galaxies.find(g=>g.id==='projects');
  const chronological=stations.filter(s=>s.project).sort((a,b)=>b.project.date.localeCompare(a.project.date));
  const distances=chronological.map(s=>Math.hypot(s.x-projectGalaxy.x,s.z-projectGalaxy.z));
  assert.ok(distances.every((d,i)=>!i||d>distances[i-1]));
  const sony=stations.find(s=>s.title==='Sony Applications For Mac');
  assert.ok(sony.radius**2 > stations.find(s=>s.id==='project-1').radius**2*4);
  assert.equal(portals.length,4);
  const reached = new Set();
  let galaxyId='profile';
  for(let i=0;i<galaxies.length;i++) {
    reached.add(galaxyId);
    const portal=portals.find(p=>p.galaxy===galaxyId);
    const target=stations.find(s=>s.id===portal.destination);
    assert.ok(target && target.galaxy!==galaxyId);
    assert.ok(Math.abs(portal.x)+8<bounds.x && Math.abs(portal.z)+8<bounds.z);
    for(const station of stations) assert.ok(Math.hypot(portal.x-station.x,portal.z-station.z)>station.radius+8);
    galaxyId=target.galaxy;
  }
  assert.equal(reached.size,4);
  assert.equal(galaxyId,'profile');
});
