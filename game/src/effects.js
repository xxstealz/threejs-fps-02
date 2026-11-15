// Small, cheap feedback: tracers, impact sparks and the bomb's glow. Everything is
// pooled and reused — no geometry is allocated while the game runs.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_IMPACTS = 24;

export function createEffects(scene, random) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const impacts = [];
  for (let i = 0; i < MAX_IMPACTS; i += 1) {
    const points = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3)),
      new THREE.PointsMaterial({ color: 0xd8c49a, size: 0.12, transparent: true, opacity: 0 }),
    );
    points.frustumCulled = false;
    scene.add(points);
    impacts.push({ points, life: 0 });
  }

  const bombLight = new THREE.PointLight(new THREE.Color('#d9573b'), 0, 9);
  scene.add(bombLight);
  const bombMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.24, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2b26'), roughness: 0.4, metalness: 0.6, emissive: new THREE.Color('#d9573b'), emissiveIntensity: 0 }),
  );
  bombMesh.visible = false;
  scene.add(bombMesh);

  function spawnTracer(from, to, color) {
    const tracer = tracers.find((t) => t.life <= 0) ?? tracers[0];
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.material.color.setHex(color);
    tracer.line.material.opacity = 0.9;
    tracer.life = 0.07;
  }

  function spawnImpact(point, normal) {
    const impact = impacts.find((t) => t.life <= 0) ?? impacts[0];
    const positions = impact.points.geometry.attributes.position.array;
    for (let i = 0; i < 10; i += 1) {
      positions[i * 3] = point.x + (random() - 0.5) * 0.3;
      positions[i * 3 + 1] = point.y + (random() - 0.5) * 0.3;
      positions[i * 3 + 2] = point.z + (random() - 0.5) * 0.3;
    }
    impact.points.geometry.attributes.position.needsUpdate = true;
    impact.points.material.opacity = 1;
    impact.life = 0.3;
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.9;
      }
    }
    for (const impact of impacts) {
      if (impact.life > 0) {
        impact.life -= dt;
        impact.points.material.opacity = Math.max(0, impact.life / 0.3);
      }
    }
  }

  return {
    spawnTracer, spawnImpact, step, bombMesh, bombLight,
    setBombVisible(visible, position, beeping) {
      bombMesh.visible = visible;
      bombLight.intensity = visible ? (beeping ? 4 : 1.2) : 0;
      if (visible && position) {
        bombMesh.position.copy(position).setY(0.12);
        bombLight.position.copy(position).setY(0.6);
        bombMesh.material.emissiveIntensity = beeping ? 1.4 : 0.3;
      }
    },
  };
}
