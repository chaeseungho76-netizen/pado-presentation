// 파도: 라이노에서 내보낸 두 형태(펼침 · 돔)의 격자와 여름 태양 데이터로
// 곡률 t(0 ~ 1)에 따라 곡면 · 리브 · 다리 · 패널을 그리고, 일사로 패널 종류를 다시 정한다.
// 좌표는 라이노(Z 위) 그대로 계산하고, 그릴 때만 three.js(Y 위)로 바꾼다: (x, y, z) → (x, z, -y)
import * as THREE from "three";

const COLORS = { pipe: 0x464a50, closed: 0xede6da, glass: 0xa0cdf0, rib: 0xebebed, leg: 0x1c1e22 };

export async function loadPado(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Pado(await res.json());
}

class Pado {
  constructor(d) {
    this.d = d;
    this.nu = d.nu; this.nv = d.nv;
    this.n = (d.nu + 1) * (d.nv + 1);
    this.g0 = Float32Array.from(d.grid0);
    this.g1 = Float32Array.from(d.grid1);
    this.g = new Float32Array(this.g0.length);              // 지금 곡률의 격자 (라이노 좌표)
    this.suns = d.suns;
    this.group = new THREE.Group();
    this.counts = { closed: 0, glass: 0, open: 0 };
    this.onChange = null;
    this.#build();
    this.set(0);
  }

  idx(i, j) { return (i * (this.nv + 1) + j) * 3; }

  #build() {
    const { nu, nv } = this;
    // 파이프: 격자 선 (노드 위치를 그대로 씀)
    this.nodePos = new THREE.BufferAttribute(new Float32Array(this.n * 3), 3);
    const lines = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const k = i * (nv + 1) + j;
      if (i < nu) lines.push(k, k + nv + 1);
      if (j < nv) lines.push(k, k + 1);
    }
    const pipeGeo = new THREE.BufferGeometry();
    pipeGeo.setAttribute("position", this.nodePos);
    pipeGeo.setIndex(lines);
    this.group.add(new THREE.LineSegments(pipeGeo, new THREE.LineBasicMaterial({ color: COLORS.pipe })));

    // 패널: 칸마다 꼭짓점 4개, 막힘 · 반투명 메시가 같은 위치 버퍼를 나눠 씀
    this.cellPos = new THREE.BufferAttribute(new Float32Array(nu * nv * 4 * 3), 3);
    this.cellNor = new THREE.BufferAttribute(new Float32Array(nu * nv * 4 * 3), 3);
    const mk = (color, extra) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", this.cellPos);
      geo.setAttribute("normal", this.cellNor);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7, ...extra }));
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    this.closedMesh = mk(COLORS.closed, {});
    this.glassMesh = mk(COLORS.glass, { transparent: true, opacity: 0.45, roughness: 0.2, depthWrite: false });

    this.ribGroup = new THREE.Group();
    this.group.add(this.ribGroup);
    this.ribMat = new THREE.MeshStandardMaterial({ color: COLORS.rib, roughness: 0.4, metalness: 0.3 });
    this.legMat = new THREE.MeshStandardMaterial({ color: COLORS.leg, roughness: 0.5, metalness: 0.6 });
  }

  // 곡률 t: 0 = 펼침, 1 = 돔
  set(t) {
    this.t = t;
    const { g, g0, g1 } = this;
    for (let k = 0; k < g.length; k++) g[k] = g0[k] + (g1[k] - g0[k]) * t;
    this.#updateNodes();
    this.#updatePanels();
    this.#updateRibs();
    this.onChange?.(this);
  }

  #three(arr, o, x, y, z) { arr[o] = x; arr[o + 1] = z; arr[o + 2] = -y; }

  #updateNodes() {
    const a = this.nodePos.array, g = this.g;
    for (let k = 0; k < this.n; k++) this.#three(a, k * 3, g[k * 3], g[k * 3 + 1], g[k * 3 + 2]);
    this.nodePos.needsUpdate = true;
  }

  #updatePanels() {
    const { nu, nv, g, suns } = this, { t1, t2 } = this.d;
    const P = this.cellPos.array, N = this.cellNor.array, lift = this.d.ribs.lift ?? 0.05;
    const closed = [], glass = [];
    let open = 0, c = 0;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++, c++) {
      const q = [this.idx(i, j), this.idx(i + 1, j), this.idx(i + 1, j + 1), this.idx(i, j + 1)];
      // 칸의 법선 = 두 대각선의 외적, 하늘 쪽으로
      const ax = g[q[2]] - g[q[0]], ay = g[q[2] + 1] - g[q[0] + 1], az = g[q[2] + 2] - g[q[0] + 2];
      const bx = g[q[3]] - g[q[1]], by = g[q[3] + 1] - g[q[1] + 1], bz = g[q[3] + 2] - g[q[1] + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      // 여름 일사 (kWh/m²): 직달 × cos + 확산 × 하늘이 보이는 비율
      let wh = 0;
      for (const [sx, sy, sz, I, Id] of suns) wh += I * Math.max(0, nx * sx + ny * sy + nz * sz) + Id * (1 + nz) / 2;
      const kwh = wh / 1000;
      for (let v = 0; v < 4; v++) {
        const o = (c * 4 + v) * 3;
        this.#three(P, o, g[q[v]] + nx * lift, g[q[v] + 1] + ny * lift, g[q[v] + 2] + nz * lift);
        this.#three(N, o, nx, ny, nz);
      }
      const b = c * 4, tri = [b, b + 1, b + 2, b, b + 2, b + 3];
      if (kwh >= t2) closed.push(...tri);
      else if (kwh >= t1) glass.push(...tri);
      else open++;
    }
    this.cellPos.needsUpdate = this.cellNor.needsUpdate = true;
    this.closedMesh.geometry.setIndex(closed);
    this.glassMesh.geometry.setIndex(glass);
    this.counts = { closed: closed.length / 6, glass: glass.length / 6, open };
  }

  #nodeNormal(i, j) {
    const { nu, nv, g } = this;
    const a = this.idx(Math.min(i + 1, nu), j), b = this.idx(Math.max(i - 1, 0), j);
    const c = this.idx(i, Math.min(j + 1, nv)), d = this.idx(i, Math.max(j - 1, 0));
    const ux = g[a] - g[b], uy = g[a + 1] - g[b + 1], uz = g[a + 2] - g[b + 2];
    const vx = g[c] - g[d], vy = g[c + 1] - g[d + 1], vz = g[c + 2] - g[d + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const s = nz < 0 ? -1 / len : 1 / len;     // 하늘 쪽으로
    return [nx * s, ny * s, nz * s];
  }

  #updateRibs() {
    const { nv, g } = this, { cols, legRibs, legV } = this.d.ribs;
    const dBase = this.d.ribs.depthBase ?? 0.45, dAmp = this.d.ribs.depthAmp ?? 0.4;
    const ribR = this.d.ribs.ribR ?? 0.18, legR = this.d.ribs.legR ?? 0.14;
    const gap = this.d.ribs.gap ?? 0.15, lean0 = this.d.ribs.lean ?? 1.2, spread = this.d.ribs.spread ?? 0.6;
    for (const m of this.ribGroup.children) m.geometry.dispose();
    this.ribGroup.clear();
    cols.forEach((i, k) => {
      const depth = dBase + dAmp * Math.sin(k * 0.85 + 0.6);  // 리브 깊이도 파도처럼 오르내림
      const bot = [];
      for (let j = 0; j <= nv; j++) {
        const o = this.idx(i, j), n = this.#nodeNormal(i, j);
        const dd = gap + depth * Math.pow(Math.sin(Math.PI * j / nv), 0.7);
        bot.push(new THREE.Vector3(g[o] - n[0] * dd, g[o + 2] - n[2] * dd, -(g[o + 1] - n[1] * dd)));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bot), nv * 2, ribR, 6, false);
      this.ribGroup.add(new THREE.Mesh(tube, this.ribMat));
      if (legRibs.includes(k)) legV.forEach((v, side) => {
        const head = bot[Math.round(v * nv)];
        const lean = lean0 * (((k >> 1) + side) % 2 === 0 ? 1 : -1);
        const foot = new THREE.Vector3(head.x + lean, 0, head.z - (side ? spread : -spread));
        const len = head.distanceTo(foot);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(legR, legR, len, 10), this.legMat);
        leg.position.copy(head).add(foot).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), head.clone().sub(foot).normalize());
        leg.castShadow = true;
        this.ribGroup.add(leg);
      });
    });
  }
}
