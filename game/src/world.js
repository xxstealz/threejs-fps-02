// Sector 7: an original desert yard. Attackers spawn south, defenders north; Site A
// east, Site B west, a mid connector between them. Three lanes (A-long, mid, B-long),
// crates and containers for cover, sightlines that reward stopping to aim. Bots walk a
// waypoint graph laid over the same floor the player runs on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';

function sandTexture() {
  // Seeded, so the same page always paints the same ground — captures are
  // reproducible down to the byte.
  const random = mulberry32(20261115);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a6f4b';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i += 1) {
    const shade = random();
    ctx.fillStyle = shade < 0.5 ? 'rgba(60,44,28,0.16)' : 'rgba(214,178,120,0.14)';
    const size = 1 + random() * 3;
    ctx.fillRect(random() * 512, random() * 512, size, size);
  }
  // Faint tyre tracks, two pairs crossing the yard.
  ctx.strokeStyle = 'rgba(52,38,24,0.20)';
  ctx.lineWidth = 9;
  for (const x of [120, 392]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 26, 170, x - 22, 340, x + 8, 512);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,16,12,0.85)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.fillStyle = color;
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Waypoint graph: nodes the bots walk, edges they may use. Routes are node lists.
const NODES = {
  tSpawn: [0, 17], tMid: [0, 9], tALong1: [13, 15], tALong2: [21, 7], tALong3: [21, -2],
  tBLong1: [-13, 15], tBLong2: [-21, 7], tBLong3: [-21, -2],
  midDoor: [0, 0], midN: [0, -8], aConn: [11, -8], bConn: [-11, -8],
  siteA: [19, -9], siteB: [-19, -9], ctSpawn: [0, -17], ctA: [10, -14], ctB: [-10, -14],
  aHold1: [16, -3], aHold2: [22, -13], bHold1: [-16, -3], bHold2: [-22, -13],
  midHold: [4, -4], tYard: [0, 13],
};
const EDGES = {
  tSpawn: ['tMid', 'tALong1', 'tBLong1', 'tYard'],
  tYard: ['tSpawn', 'tMid', 'tALong1', 'tBLong1'],
  tMid: ['tSpawn', 'tYard', 'midDoor'],
  tALong1: ['tSpawn', 'tYard', 'tALong2'],
  tALong2: ['tALong1', 'tALong3'],
  tALong3: ['tALong2', 'siteA', 'aHold1'],
  tBLong1: ['tSpawn', 'tYard', 'tBLong2'],
  tBLong2: ['tBLong1', 'tBLong3'],
  tBLong3: ['tBLong2', 'siteB', 'bHold1'],
  midDoor: ['tMid', 'midN', 'aConn', 'bConn'],
  midN: ['midDoor', 'ctSpawn', 'aConn', 'bConn', 'midHold'],
  aConn: ['midN', 'midDoor', 'siteA', 'ctA', 'aHold1'],
  bConn: ['midN', 'midDoor', 'siteB', 'ctB', 'bHold1'],
  siteA: ['tALong3', 'aConn', 'aHold1', 'aHold2', 'ctA'],
  siteB: ['tBLong3', 'bConn', 'bHold1', 'bHold2', 'ctB'],
  ctSpawn: ['midN', 'ctA', 'ctB'],
  ctA: ['ctSpawn', 'siteA', 'aConn'],
  ctB: ['ctSpawn', 'siteB', 'bConn'],
  aHold1: ['tALong3', 'aConn', 'siteA'],
  aHold2: ['siteA'],
  bHold1: ['tBLong3', 'bConn', 'siteB'],
  bHold2: ['siteB'],
  midHold: ['midN'],
};
const ROUTES = {
  toA_long: ['tSpawn', 'tALong1', 'tALong2', 'tALong3', 'siteA'],
  toB_long: ['tSpawn', 'tBLong1', 'tBLong2', 'tBLong3', 'siteB'],
  toA_mid: ['tSpawn', 'tMid', 'midDoor', 'aConn', 'siteA'],
  toB_mid: ['tSpawn', 'tMid', 'midDoor', 'bConn', 'siteB'],
  defA: ['ctSpawn', 'ctA', 'siteA'],
  defB: ['ctSpawn', 'ctB', 'siteB'],
  defMid: ['ctSpawn', 'midN', 'midHold'],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.94,
      metalness: 0.03,
    });
  }
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x8a4a28, roughness: 0.8, metalness: 0.25 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.5, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 0.95 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground: one big sand plane, then a slightly raised concrete apron at each site.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(56, 44),
    new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3(new THREE.Vector3(-28, -0.5, -22), new THREE.Vector3(28, 0, 22)));

  // Outer walls, 5 m high, open to the dusk sky.
  box(56.8, 5, 0.6, 0, 2.5, -22.3, materials.surface);
  box(56.8, 5, 0.6, 0, 2.5, 22.3, materials.surface);
  box(0.6, 5, 44.6, -28.3, 2.5, 0, materials.surface);
  box(0.6, 5, 44.6, 28.3, 2.5, 0, materials.surface);

  // Mid block: two containers leave a 3 m doorway at the centre of the map.
  box(10, 2.6, 2.6, -9.5, 1.3, 0, rustMat);
  box(10, 2.6, 2.6, 9.5, 1.3, 0, rustMat);
  box(4.4, 0.9, 2.2, -3.4, 0.45, 3.4, materials.hairline);
  box(4.4, 0.9, 2.2, 3.4, 0.45, -3.4, materials.hairline);

  // Site pads: flat concrete slabs with a painted letter board.
  for (const [letter, x, z] of [['A', 19, -9], ['B', -19, -9]]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 9), darkMat);
    pad.position.set(x, 0.07, z);
    pad.receiveShadow = true;
    group.add(pad);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, '#e8a33d') }),
    );
    sign.position.set(x, 3.4, -20.4);
    group.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), steelMat);
    post.position.set(x, 1.1, -20.4);
    group.add(post);
  }

  // Cover, A side: crates, a low wall, a container corner.
  box(1.4, 1.4, 1.4, 15.5, 0.7, -4.5, materials.sand);
  box(1.4, 1.4, 1.4, 16.9, 0.7, -4.5, materials.sand);
  box(1.4, 1.4, 1.4, 16.2, 0.7, -5.9, materials.sand);
  box(1.4, 2.8, 1.4, 16.2, 1.4, -5.2, materials.sand);
  box(5.4, 1.2, 0.9, 21.5, 0.6, -12.5, materials.hairline);
  box(2.6, 2.6, 2.6, 24.5, 1.3, -6.5, rustMat);
  box(1.2, 1.0, 3.4, 11.5, 0.5, -13.5, materials.hairline);
  // Cover, B side: mirrored in spirit, different in detail.
  box(1.4, 1.4, 1.4, -15.5, 0.7, -4.5, materials.sand);
  box(1.4, 2.8, 1.4, -16.9, 1.4, -5.2, materials.sand);
  box(5.4, 1.2, 0.9, -21.5, 0.6, -12.5, materials.hairline);
  box(2.6, 2.6, 2.6, -24.5, 1.3, -6.5, rustMat);
  box(3.2, 1.1, 1.2, -12.5, 0.55, -13.5, materials.hairline);
  // Mid cover: sandbag rows and a barrel cluster.
  box(2.8, 1.0, 1.0, -6.5, 0.5, 7.5, materials.hairline);
  box(2.8, 1.0, 1.0, 6.5, 0.5, -7.5, materials.hairline);
  box(1.1, 1.0, 1.1, -4.2, 0.5, -12.5, materials.sand);
  box(1.1, 1.0, 1.1, 4.2, 0.5, 12.5, materials.sand);
  // Spawn cover: low walls the teams start behind.
  box(4.0, 1.1, 0.8, -6, 0.55, 14.5, materials.hairline);
  box(4.0, 1.1, 0.8, 6, 0.55, 14.5, materials.hairline);
  box(4.0, 1.1, 0.8, -6, 0.55, -14.5, materials.hairline);
  box(4.0, 1.1, 0.8, 6, 0.55, -14.5, materials.hairline);

  // Barrels: cylinders, shootable and solid.
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.15, 14);
  for (const [x, z, mat] of [[-2.5, 5.5, rustMat], [-1.4, 5.9, steelMat], [8.5, -11.5, rustMat], [-8.5, -11.5, steelMat], [23.5, 2.5, rustMat], [-23.5, 2.5, steelMat]]) {
    const barrel = new THREE.Mesh(barrelGeo, mat);
    barrel.position.set(x, 0.58, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }

  // Light poles at the lanes: emissive tops, warm pools of light.
  const poleMat = steelMat;
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (const [x, z] of [[-14, 0], [14, 0], [0, 12], [0, -12], [19, 4], [-19, 4]]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), poleMat);
    pole.position.set(x, 2.2, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), lampMat);
    lamp.position.set(x, 4.45, z);
    group.add(lamp);
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 11, 1.6);
    glow.position.set(x, 4.2, z);
    scene.add(glow);
  }

  // Dusk light: a low warm sun, a cool sky fill, and the ground haze.
  const sky = new THREE.HemisphereLight(new THREE.Color('#7a6a8a'), new THREE.Color('#3a2a1c'), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.4);
  sun.position.set(-14, 18, 12);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5b7a99'), 0.5);
  fill.position.set(10, 12, -14);
  scene.add(fill);
  scene.fog = new THREE.Fog(new THREE.Color('#241a12'), 34, 78);

  return {
    colliders,
    shootables,
    group,
    spawnAtk: new THREE.Vector3(0, 0, 18.5),
    spawnDef: new THREE.Vector3(0, 0, -18.5),
    sites: {
      A: { center: new THREE.Vector3(19, 0, -9), radius: 4.6, letter: 'A' },
      B: { center: new THREE.Vector3(-19, 0, -9), radius: 4.6, letter: 'B' },
    },
    nodes: NODES,
    edges: EDGES,
    routes: ROUTES,
  };
}

// Breadth-first route on the waypoint graph, from one node to another.
export function findRoute(world, from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    for (const next of world.edges[current] ?? []) {
      if (prev[next] === undefined) {
        prev[next] = current;
        if (next === to) {
          const path = [to];
          let node = current;
          while (node !== null) {
            path.unshift(node);
            node = prev[node];
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [from, to];
}

// Nearest waypoint node to a world position.
export function nearestNode(world, x, z) {
  let best = 'tSpawn';
  let bestDist = Infinity;
  for (const [name, [nx, nz]] of Object.entries(world.nodes)) {
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}
