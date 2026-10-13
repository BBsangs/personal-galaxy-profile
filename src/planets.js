import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

// Sample noise on a sphere so longitude seams stay invisible without downloaded textures.
export function createPlanet(radius, kind) {
  const noise = new ImprovedNoise();
  const surface = document.createElement('canvas'); surface.width = 512; surface.height = 256;
  const clouds = document.createElement('canvas'); clouds.width = 512; clouds.height = 256;
  const ctx = surface.getContext('2d'), cloudCtx = clouds.getContext('2d');
  const pixels = ctx.createImageData(512, 256), vapor = cloudCtx.createImageData(512, 256);
  const shades = kind === 'ocean' ? ['#122c4c', '#3c746e', '#c1d7d1'] : kind === 'gas' ? ['#614d40', '#b79472', '#e2c8a0'] : kind === 'ice' ? ['#283b5d', '#6588a4', '#d3e4e5'] : ['#59382e', '#a7674c', '#d6ac83'];
  const colors = shades.map(hex => new THREE.Color(hex).convertLinearToSRGB());
  const color = new THREE.Color();
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
    const lat = y / 255 * Math.PI, lon = x / 511 * Math.PI * 2;
    const px = Math.sin(lat) * Math.cos(lon), py = Math.cos(lat), pz = Math.sin(lat) * Math.sin(lon);
    const n = noise.noise(px * 3 + 17, py * 3, pz * 3) + noise.noise(px * 9, py * 9 + 8, pz * 9) * .28;
    let value = kind === 'gas' ? .5 + Math.sin(py * 42 + n * 5) * .23 + n * .25 : .5 + n * .85;
    if (kind === 'ocean') value = n < .08 ? .08 + n * .15 : .48 + n * .4;
    if (Math.abs(py) > .94 && kind !== 'gas') value = .82 + Math.abs(py) * .15;
    value = THREE.MathUtils.clamp(value, 0, 1);
    color.copy(colors[value < .5 ? 0 : 1]).lerp(colors[value < .5 ? 1 : 2], value < .5 ? value * 2 : value * 2 - 1);
    const i = (y * 512 + x) * 4;
    pixels.data.set([color.r * 255, color.g * 255, color.b * 255, 255], i);
    const cloud = noise.noise(px * 5 + 63, py * 7, pz * 5) + noise.noise(px * 12, py * 12, pz * 12) * .2;
    vapor.data.set([218, 234, 244, Math.max(0, cloud - .08) * 380], i);
  }
  ctx.putImageData(pixels, 0, 0); cloudCtx.putImageData(vapor, 0, 0);
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
  const cloudTexture = new THREE.CanvasTexture(clouds); cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Group(); planet.name = `planet-${kind}`;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: kind === 'gas' ? .04 : .45, roughness: kind === 'ocean' ? .6 : .95 }));
  globe.name = 'planet-surface'; planet.add(globe);
  const cloudShell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, 48, 32), new THREE.MeshStandardMaterial({ map: cloudTexture, transparent: true, opacity: kind === 'ocean' ? .75 : .22, depthWrite: false, roughness: 1 }));
  cloudShell.name = 'planet-clouds'; planet.add(cloudShell);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 40, 24), new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(kind === 'gas' || kind === 'rock' ? '#b99775' : '#86cce7') } },
    vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 tint; varying vec3 n; void main(){ float rim = pow(1.0 - abs(normalize(n).z), 3.0); gl_FragColor = vec4(tint, rim * 0.42); }',
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  atmosphere.name = 'planet-atmosphere'; planet.add(atmosphere);
  if (kind === 'gas' || kind === 'ice') {
    const rings = new THREE.Group(); rings.rotation.set(-1.12, .2, -.35); planet.add(rings);
    for (let i = 0; i < 7; i++) {
      const inner = radius * (1.3 + i * .09);
      rings.add(new THREE.Mesh(new THREE.RingGeometry(inner, inner + radius * (i === 3 ? .024 : .065), 96), new THREE.MeshBasicMaterial({ color: shades[i % 3], side: THREE.DoubleSide, transparent: true, opacity: .22 + (i % 3) * .12, depthWrite: false })));
    }
  }
  return planet;
}
