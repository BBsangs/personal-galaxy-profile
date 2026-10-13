import { Mesh, MeshStandardMaterial } from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import glyphs from './assets/timeline-glyphs.js';

const font = new Font(glyphs);

export function createDateText(text, width, color) {
  const geometry = new TextGeometry(text, { font, size: 1.8, depth: .3, curveSegments: 4, bevelEnabled: true, bevelThickness: .02, bevelSize: .018, bevelSegments: 1 });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const fit = Math.min(1, width / (max.x - min.x));
  geometry.translate(-(min.x + max.x) / 2, -min.y, -min.z);
  geometry.scale(fit, fit, 1);
  geometry.computeBoundingBox();
  const textMesh = new Mesh(geometry, new MeshStandardMaterial({ color, metalness: .18, roughness: .55, emissive: color, emissiveIntensity: .06 }));
  textMesh.name = 'date-sculpture'; textMesh.userData.text = text;
  textMesh.castShadow = true; textMesh.receiveShadow = true;
  return textMesh;
}
