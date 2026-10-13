import { mapSize, stations } from './content.js';

export const spawn = { x: stations[0].stop.x, z: stations[0].stop.z + 13, heading: Math.PI, speed: 0 };
export const bounds = { x: mapSize.width / 2 - 3, z: mapSize.depth / 2 - 3 };

// shortcut: circle colliders approximate buildings; use rigid-body physics if precise impacts are needed.
export function stepVehicle(car, input, delta, obstacles = []) {
  const dt = Math.min(Math.max(delta, 0), 0.05);
  const throttle = Number(input.up) - Number(input.down);
  car.speed += throttle * 24 * dt;
  car.speed *= Math.exp(-(input.brake ? 12 : throttle ? 0.7 : 2.4) * dt);
  car.speed = Math.max(-12, Math.min(input.boost ? 36 : 22, car.speed));
  if (Math.abs(car.speed) < 0.015) car.speed = 0;
  const turn = Number(input.left) - Number(input.right);
  car.heading += turn * 2.4 * Math.min(Math.abs(car.speed) / 3, 1) * Math.sign(car.speed) * dt;
  const oldX = car.x;
  const oldZ = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const outside = Math.abs(car.x) > bounds.x || Math.abs(car.z) > bounds.z;
  if (outside || obstacles.some(o => Math.hypot(car.x - o.x, car.z - o.z) < o.radius + 0.7)) {
    car.x = oldX;
    car.z = oldZ;
    car.speed *= -0.25;
  }
  return car;
}

export function nearestStation(car, stations, currentId = null) {
  const current = stations.find(station => station.id === currentId);
  if (current && Math.hypot(car.x - current.stop.x, car.z - current.stop.z) < 10) return current;
  return stations.reduce((nearest, station) => {
    const nextDistance = Math.hypot(car.x - station.stop.x, car.z - station.stop.z);
    const nearestDistance = nearest ? Math.hypot(car.x - nearest.stop.x, car.z - nearest.stop.z) : 8;
    return nextDistance < nearestDistance ? station : nearest;
  }, null);
}
