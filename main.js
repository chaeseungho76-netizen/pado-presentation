import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Sky } from "three/addons/objects/Sky.js";
import { content } from "./content.js";
import { loadPado } from "./pado.js";

// 글자와 색
const root = document.documentElement.style;
root.setProperty("--bg", content.theme.background);
root.setProperty("--text", content.theme.text);
root.setProperty("--accent", content.theme.accent);
root.setProperty("--font", content.theme.font);
document.title = content.title;
document.getElementById("title").textContent = content.title;
document.getElementById("subtitle").textContent = content.subtitle;
document.getElementById("author").textContent = content.author;
const refs = document.getElementById("refs");
if (refs) refs.textContent = content.refs || "";

const main = document.getElementById("scenes");
const dots = document.getElementById("dots");
for (const s of content.scenes) {
  const sec = document.createElement("section");
  sec.className = "scene";
  sec.id = sec.dataset.id = s.id;
  const dot = document.createElement("a");
  dot.href = "#" + s.id;
  dot.title = s.title;
  dots.appendChild(dot);
  if (s.parts) {
    // 설명 카드 여러 개를 한 장면에 나란히
    sec.classList.add("multi");
    sec.innerHTML = s.parts.map((p, i) => `<div class="card">${i === 0 ? `<div class="meta">${s.time}</div> <b class="scene-title">${s.title}</b>` : ""}
      <h2 class="part-title">${p.title}</h2><p>${p.text}</p>
      ${p.image ? `<img src="images/${p.image}" alt="${p.title}" onerror="this.remove()">` : ""}
      ${p.credit ? `<div class="credit">${p.credit}</div>` : ""}</div>`).join("");
    main.appendChild(sec);
    continue;
  }
  let html = `<div class="card"><div class="meta">${s.time}</div><h2>${s.title}</h2><p>${s.text}</p>`;
  if (s.id === "blocks") {
    html += "<table>" + content.blocks.map(b => `<tr><td><b>${b.name}</b> · ${b.role}</td><td>${b.count}개</td></tr>`).join("") + "</table>";
  }
  if (s.slider) {
    html += `<div class="dome">
      <div class="dome-row"><span>펼침 0</span><input id="dome" type="range" min="0" max="1" step="0.01" value="0"><span>1 돔</span></div>
      <div class="dome-val">곡률 <b id="dome-t">0.00</b></div>
      <div class="dome-counts"><span class="c1">막힘 <b id="n-closed">-</b></span><span class="c2">반투명 <b id="n-glass">-</b></span><span class="c3">열림 <b id="n-open">-</b></span></div>
    </div>`;
  }
  if (s.image) html += `<img src="images/${s.image}" alt="${s.title}" onerror="this.remove()">`;
  if (s.credit) html += `<div class="credit">${s.credit}</div>`;
  sec.innerHTML = html + "</div>";
  main.appendChild(sec);
}

// 3D 장면
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(content.theme.background);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
camera.position.set(14, 8, 14);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enableZoom = false;

scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xf3d9a8, 1.25));  // 위는 하늘빛, 아래는 모래 반사빛 (그림자는 또렷하게 남김)

// 햇빛: 하늘에 해를 띄우고, 같은 방향에서 따뜻한 햇빛이 비친다 (남서쪽 오후, 고도 40°)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;                 // 밝고 포근한 만화풍
renderer.shadowMap.type = THREE.PCFSoftShadowMap;    // 그림자 가장자리를 부드럽게
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 40), THREE.MathUtils.degToRad(215));
const sky = new Sky();
sky.scale.setScalar(4500);   // 카메라가 보는 거리(5000) 안쪽이어야 잘리지 않음
sky.material.uniforms.turbidity.value = 4;
sky.material.uniforms.rayleigh.value = 3.0;          // 더 맑고 파란 하늘
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy(sunDir);
scene.add(sky);
const sun = new THREE.DirectionalLight(0xfff3dc, 3.0);
sun.position.set(10, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);
// 모래사장: 알갱이 + 바람에 생긴 물결 무늬를 캔버스로 그려 바닥에 깐다
function sandTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#f8dfa8";                           // 밝고 따뜻한 모래색
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 2) {                 // 물결 무늬 (사구 결)
    const k = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 3);
    g.fillStyle = `rgba(${k > 0 ? "255,250,235" : "200,165,110"},${0.06 * Math.abs(k)})`;
    g.fillRect(0, y, 512, 2);
  }
  for (let i = 0; i < 7000; i++) {                   // 모래 알갱이 (만화풍이라 적게)
    const l = 190 + Math.random() * 60;
    g.fillStyle = `rgba(${l},${l * 0.85},${l * 0.62},${0.2 + Math.random() * 0.3})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const sand = sandTexture();
sand.repeat.set(0.25, 0.25);                         // 섬 UV 는 m 단위 → 4 m 마다 모래 결 반복

// ---------- 섬 · 물가 · 출렁이는 바다 ----------
// 섬 윤곽: 둥글지만 울퉁불퉁 (반지름 R 의 극좌표 물결)
function islandShape(R) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const rr = R * (1 + 0.09 * Math.sin(3 * a + 0.4) + 0.05 * Math.sin(7 * a + 1.3) + 0.025 * Math.sin(13 * a));
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return s;
}
function flat(shape, mat, y) {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}
const island = new THREE.Group();                    // pivot 에 넣어 파빌리온과 함께 돈다 (아래에서 추가)
let foam = null, shallow = null, sea = null, seaBase = null;

// 나무: 동글동글한 활엽수와 휘어진 야자수 (높이 h m)
// 만화풍 음영: 밝기를 3 단계로만 끊어 칠한다
const toonSteps = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toon = color => new THREE.MeshToonMaterial({ color, gradientMap: toonSteps });
const trunkMat = toon(0x9a6a42);
const leafMats = [0x6cc551, 0x58b347, 0x86d460].map(toon);
function roundTree(h) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.06, h * 0.5, 8), trunkMat);
  trunk.position.y = h * 0.25;
  g.add(trunk);
  for (const [x, y, z, s] of [[0, 0.68, 0, 0.32], [0.15, 0.58, 0.08, 0.22], [-0.14, 0.6, -0.06, 0.24], [0.02, 0.86, -0.04, 0.2]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(h * s, 14, 10), leafMats[Math.floor(Math.random() * 3)]);
    leaf.position.set(x * h, y * h, z * h);
    g.add(leaf);
  }
  return g;
}
function palmTree(h) {
  const g = new THREE.Group();
  const bend = 0.12 + Math.random() * 0.12;
  const pts = [0, 0.25, 0.5, 0.75, 1].map(k => new THREE.Vector3(Math.sin(k * 1.4) * bend * h, k * h, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, h * 0.035, 7, false), trunkMat));
  const top = pts[4];
  for (let i = 0; i < 7; i++) {                     // 잎: 납작하게 늘인 원뿔이 사방으로 처진다
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(h * 0.08, h * 0.55, 4), leafMats[i % 3]);
    leaf.scale.z = 0.25;
    leaf.position.copy(top);
    leaf.rotation.set(0, (i / 7) * Math.PI * 2, 0);
    leaf.rotateX(Math.PI / 2 + 0.5);
    leaf.translateY(h * 0.25);
    g.add(leaf);
  }
  return g;
}
function plantTrees(R, half, r) {
  // 섬 가장자리 띠 위, 파빌리온(타원 반 폭 half.x · half.z) 밖에만 심는다
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let n = 0;
  for (let i = 0; i < 400 && n < 18; i++) {          // 나무를 드문드문
    const a = rand() * Math.PI * 2;
    const edge = R * (1 + 0.09 * Math.sin(3 * a + 0.4) + 0.05 * Math.sin(7 * a + 1.3) + 0.025 * Math.sin(13 * a));
    const d = edge * (0.62 + rand() * 0.3);          // 섬 바깥쪽 띠에
    const x = Math.cos(a) * d, z = -Math.sin(a) * d;
    if ((x / half.x) ** 2 + (z / half.z) ** 2 < 1.15) continue;      // 파빌리온 아래는 피함
    const h = 2.5 + rand() * 2.0;                    // 나무 높이 2.5 ~ 4.5 m (높이 4 m 파빌리온과 비슷)
    const t = rand() < 0.45 ? palmTree(h) : roundTree(h);
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI * 2;
    t.traverse(o => { if (o.isMesh) o.castShadow = true; });
    island.add(t);
    n++;
  }
}

function buildIsland(r, half) {
  island.clear();
  const R = r * 1.8;                                 // 섬 반지름: 파빌리온(반 폭 ≈ 0.8r)보다 넉넉하게
  island.add(flat(islandShape(R), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }), 0));
  const dz = r * 0.0012;                             // 물가 층 사이 높이 차 (모형 크기에 비례)
  // 물거품: 테두리가 동글동글 물결진 하얀 띠
  const foamShape = new THREE.Shape();
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const rr = R * (1 + 0.09 * Math.sin(3 * a + 0.4) + 0.05 * Math.sin(7 * a + 1.3) + 0.025 * Math.sin(13 * a)) * (1 + 0.018 * Math.abs(Math.sin(a * 40)));
    i ? foamShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : foamShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  foam = flat(foamShape, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: true }), -dz);
  foam.scale.setScalar(1.07);
  shallow = flat(islandShape(R), new THREE.MeshStandardMaterial({ color: 0x5fe3e8, roughness: 0.2, transparent: true, opacity: 0.95 }), -dz * 2);
  shallow.scale.setScalar(1.28);
  island.add(foam, shallow);
  // 바다: 촘촘한 평면을 매 프레임 물결 함수로 들썩인다
  const size = r * 12, seg = 160;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  seaBase = Float32Array.from(geo.attributes.position.array);
  sea = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1f9be8, roughness: 0.15, metalness: 0.05 }));
  sea.position.y = -dz * 12;                         // 물결이 가장 높아도 얕은 물 아래
  sea.receiveShadow = true;
  island.add(sea);
  plantTrees(R, half, r);
  scatterFlowers(R, half, r);
  addClouds(r);
}

// 모래 위 알록달록한 작은 꽃 (꽃잎 = 작은 공 5 개 + 노란 가운데)
function scatterFlowers(R, half, r) {
  const colors = [0xffffff, 0xff8fb1, 0xb59bff, 0xffd35a].map(toon);
  const heart = toon(0xffc93c);
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = r * 0.006;
  for (let i = 0, n = 0; i < 600 && n < 90; i++) {
    const a = rand() * Math.PI * 2, d = R * (0.3 + rand() * 0.75);
    const x = Math.cos(a) * d, z = -Math.sin(a) * d;
    if ((x / half.x) ** 2 + (z / half.z) ** 2 < 1.1) continue;
    const f = new THREE.Group(), mat = colors[Math.floor(rand() * colors.length)];
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
      p.position.set(Math.cos(k * 1.2566) * s * 1.2, s, Math.sin(k * 1.2566) * s * 1.2);
      f.add(p);
    }
    const c = new THREE.Mesh(new THREE.SphereGeometry(s * 0.8, 8, 6), heart);
    c.position.y = s * 1.4;
    f.add(c);
    f.position.set(x, 0, z);
    island.add(f);
    n++;
  }
}

// 하늘의 뭉게구름 (흰 공을 뭉친 덩어리, 천천히 흘러감)
const clouds = new THREE.Group();
scene.add(clouds);
function addClouds(r) {
  clouds.clear();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdde8f2, emissiveIntensity: 0.5, fog: false });
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r * (0.12 + rand() * 0.1), 16, 12), mat);
      b.position.set((k - 2) * r * 0.16, rand() * r * 0.06, rand() * r * 0.08);
      c.add(b);
    }
    const a = rand() * Math.PI * 2, d = r * (4 + rand() * 2.5);
    c.position.set(Math.cos(a) * d, r * (1.0 + rand() * 0.8), Math.sin(a) * d);
    c.scale.y = 0.6;
    clouds.add(c);
  }
}
function animateSea(t, r) {
  if (!sea) return;
  // 물거품과 얕은 물이 섬 쪽으로 밀려왔다 빠진다
  const w = Math.sin(t * 0.9);
  foam.scale.setScalar(1.11 + 0.03 * w);
  foam.material.opacity = 0.8 + 0.2 * Math.max(0, w);
  shallow.scale.setScalar(1.32 + 0.015 * Math.sin(t * 0.9 - 0.8));
  // 바다 표면: 방향이 다른 물결 세 겹
  const p = sea.geometry.attributes.position, a = p.array, A = r * 0.004;
  for (let i = 0; i < a.length; i += 3) {
    const x = seaBase[i], z = seaBase[i + 2];
    a[i + 1] = A * (Math.sin(x * 0.03 + t * 1.1) + 0.6 * Math.sin(z * 0.045 - t * 1.4) + 0.35 * Math.sin((x + z) * 0.08 + t * 2.0));
  }
  p.needsUpdate = true;
  sea.geometry.computeVertexNormals();
}

const material = new THREE.MeshStandardMaterial({
  color: content.theme.modelColor, metalness: content.theme.metalness, roughness: content.theme.roughness, side: THREE.DoubleSide,
});

// 모형은 pivot 안에 넣고 pivot 을 천천히 띄우고 돌립니다
const pivot = new THREE.Group();
scene.add(pivot);

function place(obj) {
  // 바닥에 앉히고 가운데로
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  obj.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  pivot.add(obj);
  // 모형 크기에 맞춰 카메라 거리 조절 (장면 camera 값은 반지름 8 m 기준)
  const r = box.getBoundingSphere(new THREE.Sphere()).radius;
  modelScale = r / 8;
  // 바닥 · 해 · 그림자 범위도 모형 크기에 맞춤
  const sz = box.getSize(new THREE.Vector3());
  buildIsland(r, { x: sz.x / 2, z: sz.z / 2 });      // 모형 크기에 맞춘 섬 · 물가 · 바다 · 나무
  if (!island.parent) pivot.add(island);
  seaR = r;
  scene.fog = new THREE.Fog(0xbfe3f7, r * 3.5, r * 8.5);   // 멀리 갈수록 수평선 빛으로 흐려짐
  sun.position.copy(sunDir).multiplyScalar(r * 1.8);   // 하늘의 해와 같은 방향
  const sr = r * 2.3;                                // 섬 전체(나무 포함)에 그림자가 지도록
  sun.shadow.mapSize.set(4096, 4096);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // 크기를 바꿨으니 그림자 지도를 새로 만듦
  sun.shadow.normalBias = r * 0.0004;                // 그림자 들뜸 보정도 모형 크기에 맞춤
  Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 0.1, far: r * 5 });
  sun.shadow.camera.updateProjectionMatrix();
  modelSize = box.getSize(new THREE.Vector3());
  outsideLook.set(0, modelSize.y * 0.35, 0);
  controls.target.copy(outsideLook);
  setTarget(current);
  camera.position.copy(target);   // 첫 화면은 날아오지 않고 바로 자리 잡기
}

let modelScale = 1;
let seaR = 0;
let modelSize = new THREE.Vector3(16, 8, 12);
let current = [14, 8, 14];
let inside = null;                       // 안으로 들어간 장면이면 { pos, look }
const outsideLook = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
function setTarget(pos, inner = null) {
  current = pos;
  inside = inner;
  if (inner) {
    const s = modelSize;
    target.set(inner.pos[0] * s.x, inner.pos[1], inner.pos[2] * s.z);
    lookTarget.set(inner.look[0] * s.x, inner.look[1], inner.look[2] * s.z);
    return;
  }
  const fit = modelScale * 0.8 * Math.max(1, 1.3 / camera.aspect);
  target.set(...pos).multiplyScalar(fit);
  lookTarget.copy(outsideLook);
}

function placeholder() {
  // glb 가 없을 때 보이는 임시 껍데기
  const geo = new THREE.PlaneGeometry(16, 12, 48, 36);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 8, y = p.getY(i) / 6;
    p.setZ(i, 4 * (1 - x * x) * (1 - y * y) + 0.6 * Math.sin(x * 3) * Math.cos(y * 2));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function loadGlb() {
  new GLTFLoader().load(
    content.model,
    gltf => {
      gltf.scene.traverse(o => { if (o.isMesh && !o.material?.map && !o.material?.color) o.material = material; });
      place(gltf.scene);
    },
    undefined,
    () => place(placeholder()),
  );
}

// 곡률 데이터가 있으면 곡률 슬라이더로 움직이는 파도를, 없으면 glb 를 띄운다
loadPado(content.data).then(pado => {
  if (!pado) return loadGlb();
  place(pado.group);
  const slider = document.getElementById("dome");
  const show = p => {
    document.getElementById("dome-t").textContent = p.t.toFixed(2);
    document.getElementById("n-closed").textContent = p.counts.closed;
    document.getElementById("n-glass").textContent = p.counts.glass;
    document.getElementById("n-open").textContent = p.counts.open;
  };
  pado.onChange = show;
  show(pado);
  let pending = null;
  slider?.addEventListener("input", () => {
    pending = +slider.value;
    requestAnimationFrame(() => { if (pending !== null) { pado.set(pending); pending = null; } });
  });
}).catch(loadGlb);

// 스크롤하면 장면마다 카메라 이동
const target = new THREE.Vector3().copy(camera.position);
const observer = new IntersectionObserver(entries => {
  for (const e of entries) {
    e.target.classList.toggle("on", e.isIntersecting);
    if (!e.isIntersecting) continue;
    const s = content.scenes.find(x => x.id === e.target.dataset.id);
    if (s) setTarget(s.camera, s.inside || null);
    dots.querySelectorAll("a").forEach(a => a.classList.toggle("on", a.hash === "#" + s.id));
  }
}, { rootMargin: "-45% 0px -45% 0px" });   // 장면이 화면 가운데 띠를 지나면 켜짐 (긴 장면도)
document.querySelectorAll(".scene").forEach(el => observer.observe(el));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  setTarget(current, inside);
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  animateSea(t, seaR);
  clouds.rotation.y = t * 0.004;                     // 구름은 아주 천천히 흘러감
  // 안에 들어가 있을 때는 모형을 멈추고(회전 · 떠오름 없이) 천천히 걸어 들어간다
  const k = inside ? 0 : 1;
  pivot.position.y = k * seaR * (0.002 + Math.sin(t * 0.8) * 0.001);   // 모형 크기에 비례해 살짝 떠오름
  if (!inside) pivot.rotation.y += 0.0008;
  else pivot.rotation.y += (0 - pivot.rotation.y) * 0.05;
  camera.position.lerp(target, inside ? 0.03 : 0.04);
  const fov = inside?.fov ?? 40;                     // 안에서는 화각을 넓혀 지붕 아래가 더 많이 보이게
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.05; camera.updateProjectionMatrix(); }
  controls.target.lerp(lookTarget, 0.05);
  controls.update();
  renderer.render(scene, camera);
});
