// 職員室のくわしいモデル（シークレットページ）
// 座標はメートル。x：西の柱（X7）から東へ、z：北の壁（Y3）から南へ（南の窓の壁 Y1 が z = 7.4）。
// 北へのびた共用スペースは x 14.4〜24、z -2.5〜0（北の壁 Y5）。配置図の寸法をそのまま使う
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { STAFF_ITEMS } from "./staffroom-items.js";

const CEIL = 2.9; // 天井の高さ
const view = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
// 画面のきめ細かさ。動きが重い端末では、あとで自動で少し下げる（maxDpr〜minDpr）
const maxDpr = Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.5 : 1.75), minDpr = Math.min(maxDpr, 0.75);
let dpr = maxDpr;
renderer.setPixelRatio(dpr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
view.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.position = "absolute"; labels.domElement.style.inset = "0";
view.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe0ec);
// まわりの光の映りこみ（床のつや・金属）に、部屋の中の光を使う
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
const controls = new OrbitControls(camera, labels.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.3; controls.maxDistance = 45;

// ---------- 光 ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ab95, 0.35));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.9); // 南の窓から入る日の光
sun.position.set(6, 9, 18); sun.target.position.set(12, 0, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 2048); sun.shadow.radius = 4;
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// 天井の蛍光灯のやわらかい光（面の光）。部屋のならびにそって帯で置く
RectAreaLightUniformsLib.init();
// 面の光は1つごとに全部の点で計算するので重い。2列分を1枚にまとめて3枚にする
for (const [x, z, w, d] of [[6, 4, 11, 4], [18.5, 4, 10, 4], [19.2, -1.25, 9, 1.0]]) {
  const l = new THREE.RectAreaLight(0xfff6e8, 1.3 * (d > 2 ? 0.6 : 1), w, d); l.position.set(x, 2.84, z); l.lookAt(x, 0, z); scene.add(l);
}

// ---------- 道具 ----------
// 同じ色・同じ設定の材質は使い回す（材質が多いと描く回数が増えて重くなる）。模様（map）などをもつものは別に作る
const MCACHE = new Map();
const M = (color, o = {}) => {
  if (Object.values(o).some((v) => v && typeof v === "object")) return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const k = color + JSON.stringify(o);
  if (!MCACHE.has(k)) MCACHE.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));
  return MCACHE.get(k);
};
const B = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); // y は下の面
// 角の丸い箱（家具のふちをやわらかく見せる）
const R = (w, h, d, x = 0, y = 0, z = 0, r = 0.012) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).translate(x, y + h / 2, z);
const C = (r, h, x = 0, y = 0, z = 0, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const tex = (w, h, draw, rx = 1, ry = 1) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
};
// 部品の一覧 [材質, 形][] を、材質ごとに1つの形にまとめる
const kit = (parts) => { const by = new Map(); for (const [m, g] of parts) { if (!by.has(m)) by.set(m, []); by.get(m).push(g.index ? g.toNonIndexed() : g); } return [...by].map(([m, gs]) => [m, mergeGeometries(gs)]); };
// まとめた部品を、たくさんの場所に置く（同じ形を一度に描く）
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function place(k, list) {
  if (!list.length) return;
  for (const [mat, geo] of k) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot || 0); m4.compose(v3.set(p.x, p.y || 0, p.z), q, new THREE.Vector3(p.sx || 1, p.sy || 1, p.sz || 1)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }
}
const add = (geos, mat, shadow = true) => { const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- 材質 ----------
const woodTop = M(0xe9d7b4, { roughness: 0.5, map: tex(256, 64, (g, w, h) => { g.fillStyle = "#ead9b7"; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${190 + rnd() * 30},${160 + rnd() * 30},${115 + rnd() * 25},${0.1 + rnd() * 0.12})`; g.lineWidth = 0.5 + rnd() * 0.8; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 4 - 2, w * 0.7, y + rnd() * 4 - 2, w, y + rnd() * 3 - 1.5); g.stroke(); } }) }); // 写真：明るい木目（淡いオーク）
const steelW = M(0xeeeeea, { roughness: 0.35, metalness: 0.15 });
const steelG = M(0xd9dbdc, { roughness: 0.4, metalness: 0.2 });
const steelD = M(0x8b9096, { roughness: 0.35, metalness: 0.6 });
const black = M(0x22252a, { roughness: 0.5 });
const chairFab = M(0x141c44, { roughness: 0.95 }); // 写真：紺色のひじかけいす
const plastic = M(0x3a3d42, { roughness: 0.55 });
const chrome = M(0xc8ccd0, { roughness: 0.2, metalness: 0.9 });
const greenCable = M(0x1e8a4c, { roughness: 0.45 });
const screen = M(0x10161d, { roughness: 0.15, metalness: 0.3, emissive: 0x0b1a2a, emissiveIntensity: 0.6 });
const paper = M(0xf7f6f1, { roughness: 0.9 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6f2, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.22, depthWrite: false });
const alu = M(0xb7bdc2, { roughness: 0.3, metalness: 0.7 });
const wallUp = M(0xece6d8, { roughness: 0.9 });
const wallLow = M(0xbfae93, { roughness: 0.85 });
const curtain = M(0xe9dfa6, { roughness: 0.95, side: THREE.DoubleSide }); // 写真：うすい黄色の厚いカーテン

// ---------- 床・天井・壁・柱 ----------
// 床：つやのあるベージュの長尺シート（うすい目地）
const floorTex = tex(256, 256, (g, w, h) => { g.fillStyle = "#cdbfa8"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "120,100,80"},${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } g.fillStyle = "rgba(120,105,85,0.25)"; g.fillRect(0, 0, w, 1.5); }, 24 / 1.8, 10 / 1.8);
let mirror = null;
const floorMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: floorTex, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 }); // ワックスのかかったつや
{
  const s = new THREE.Shape([new THREE.Vector2(0, -7.4), new THREE.Vector2(24, -7.4), new THREE.Vector2(24, 2.5), new THREE.Vector2(14.4, 2.5), new THREE.Vector2(14.4, 0), new THREE.Vector2(0, 0)]);
  const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.8, p.getZ(i) / 1.8);
  floorTex.repeat.set(1, 1);
  const f = new THREE.Mesh(g, floorMat); f.receiveShadow = true; scene.add(f);
  // 写真：つやのある床に、蛍光灯や机がぼんやり映る。鏡の板を床のすぐ下に置き、床を少しすけさせて重ねる（止まったときだけ）
  floorMat.transparent = true; floorMat.opacity = 0.8;
  mirror = new Reflector(new THREE.PlaneGeometry(26, 12), { textureWidth: 1024, textureHeight: 512, color: 0x8f8a82 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.set(12, -0.002, 2.45); mirror.visible = false;
  scene.add(mirror);
}
// 天井（上から見るときは消す）：白い化粧板と、蛍光灯、梁
const ceiling = new THREE.Group();
{
  const ct = tex(128, 128, (g, w, h) => { g.fillStyle = "#f3f2ee"; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = "rgba(150,145,135,0.35)"; g.fillRect(rnd() * w, rnd() * h, 1.2, 1.2); } g.fillStyle = "rgba(160,155,145,0.5)"; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); });
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(24, 0), new THREE.Vector2(24, -2.5 - 7.4 + 7.4), new THREE.Vector2(0, 0)]);
  const plane = (x0, x1, z0, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2).translate((x0 + x1) / 2, CEIL, (z0 + z1) / 2); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.6, p.getZ(i) / 0.6); return g; };
  const cm = new THREE.Mesh(mergeGeometries([plane(0, 24, 0, 7.4), plane(14.4, 24, -2.5, 0)]), M(0xffffff, { map: ct, roughness: 0.95, emissive: 0xffffff, emissiveMap: ct, emissiveIntensity: 0.5 })); // 天井は蛍光灯の光で明るい
  ceiling.add(cm);
  const beams = [];
  for (const x of [4.8, 9.6, 14.4, 19.2]) beams.push(B(0.45, 0.5, x === 14.4 || x === 19.2 ? 9.9 : 7.4, x, CEIL - 0.5, x === 14.4 || x === 19.2 ? 2.45 : 3.7));
  beams.push(B(24, 0.5, 0.4, 12, CEIL - 0.5, 0.2));
  ceiling.add(new THREE.Mesh(mergeGeometries(beams.map((g) => g.toNonIndexed())), M(0xece6d8, { roughness: 0.9, emissive: 0xece6d8, emissiveIntensity: 0.32 })));
  // 蛍光灯（2本入りのうすい器具）
  const lampBody = [], lampTube = [];
  for (let x = 1.6; x < 24; x += 2.4) for (const z of [1.6, 3.7, 5.8]) { lampBody.push(B(1.3, 0.06, 0.3, x, CEIL - 0.07, z)); lampTube.push(B(1.22, 0.025, 0.05, x, CEIL - 0.095, z - 0.07), B(1.22, 0.025, 0.05, x, CEIL - 0.095, z + 0.07)); }
  for (let x = 16; x < 24; x += 2.4) { lampBody.push(B(1.3, 0.06, 0.3, x, CEIL - 0.07, -1.25)); lampTube.push(B(1.22, 0.025, 0.05, x, CEIL - 0.095, -1.32), B(1.22, 0.025, 0.05, x, CEIL - 0.095, -1.18)); }
  ceiling.add(new THREE.Mesh(mergeGeometries(lampBody.map((g) => g.toNonIndexed())), M(0xf4f4f2)));
  ceiling.add(new THREE.Mesh(mergeGeometries(lampTube.map((g) => g.toNonIndexed())), M(0xffffff, { emissive: 0xfffbf0, emissiveIntensity: 1.4 })));
  scene.add(ceiling);
}
// 壁：下の 1.0m は茶色っぽいベージュ、上はクリーム色（写真）。開口部（窓・ドア）はあけて作る
// o：{ H：腰壁の高さ, lo：下の色, hi：上の色 }
// 外から見るとき、手前の壁を消すために、壁ごとに覚えておく（下の「壁の透過」）
const WALLS = [], WALL_EXTRAS = [], DOOR_PARTS = []; // DOOR_PARTS：[材質, 形]。外から見るときは、うっすら残す
function wall(ax, az, bx, bz, holes = [], t = 0.15, o = {}) {
  const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), H = o.H ?? 1.0;
  const lo = [], hi = [];
  const seg = (u0, u1, y0, y1) => { if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return; const g = B(u1 - u0, y1 - y0, t, (u0 + u1) / 2, y0, 0); (y1 <= H ? lo : hi).push(g); };
  const cuts = [...holes].sort((a, b) => a[0] - b[0]);
  let u = 0;
  for (const [h0, h1, hy0, hy1] of cuts) { seg(u, h0, 0, H); seg(u, h0, H, CEIL); if (hy0 > 0) { seg(h0, h1, 0, Math.min(H, hy0)); if (hy0 > H) seg(h0, h1, H, hy0); } seg(h0, h1, Math.max(H, hy1), CEIL); if (hy1 < H) seg(h0, h1, hy1, H); u = h1; }
  seg(u, L, 0, H); seg(u, L, H, CEIL);
  const tr = (g) => g.rotateY(-ang).translate(ax, 0, az);
  const ms = [];
  if (lo.length) ms.push(add(lo.map(tr), o.lo || wallLow));
  if (hi.length) ms.push(add(hi.map(tr), o.hi || wallUp));
  WALLS.push({ ax, az, bx, bz, ms });
  return { L, ang };
}
// 柱（配置図の黒い四角。0.76m 角）。下は茶色、上はクリーム
const pillar = (x, z, w = 0.76, d = 0.76) => { WALL_EXTRAS.push(add([B(w, 1.0, d, x, 0, z)], wallLow), add([B(w, CEIL - 1.0, d, x, 1.0, z)], wallUp)); };
for (const x of [0, 4.8, 9.6, 14.4, 19.2, 24]) pillar(x, 7.4 - 0.15, 0.76, 0.66); // 南の窓の柱
for (const x of [0, 4.8, 9.6, 14.4, 24]) pillar(x, 0.15, 0.76, 0.66);                  // 北の柱
pillar(19.2, 0.1);                                                               // 共用スペースの独立柱（空調）
for (const x of [14.4, 19.2, 24]) pillar(x, -2.35, 0.76, 0.5);                   // 共用スペースの北の柱

// 北の壁（廊下側）：西と東に引き戸（上に欄間の窓）、そのあいだに開き戸（配置図・写真）
wall(0, 0, 14.4, 0, [[0.9, 2.4, 0, 2.65], [7.9, 8.85, 0, 2.05], [12.0, 13.6, 0, 2.65]]);
// 共用スペースの北の壁（更衣室との境）：両はしに更衣室の入口
wall(14.4, -2.5, 24, -2.5, [[1.2, 2.1, 0, 2.05], [8.4, 9.3, 0, 2.05]]);
wall(14.4, -2.5, 14.4, 0, [[0.45, 1.35, 0, 2.05]]); // 西：廊下のつきあたりからの入口（窓つきの引き戸）
// 西の壁（写真）：下は水色、上は灰色がかった白。腰壁は 1.45m と高め
const wallBlue = M(0xc7dde0, { roughness: 0.8 }), wallGrey = M(0xe3dfdb, { roughness: 0.9 });
wall(0, 0, 0, 7.4, [[0.45, 1.35, 0, 2.05]], 0.15, { H: 1.45, lo: wallBlue, hi: wallGrey }); // 西：印刷室への入口（あけたまま）
wall(24, -2.5, 24, 7.4, [[0.15, 1.55, 0.05, 2.6]]); // 東（写真）：北のはしに床近くからの背の高い窓だけ。ほかは窓のない壁（洗面台・ロッカー・掲示物）
wall(0, 7.4, 24, 7.4, [[0.4, 4.4, 0.85, 2.55], [5.2, 9.2, 0.85, 2.55], [10.0, 14.0, 0.85, 2.55], [14.8, 18.8, 0.85, 2.55], [19.6, 23.6, 0.85, 2.55]]); // 南：窓

// 窓（南と東）：アルミの枠とガラス、真ん中の桟、両はしにまとめたカーテン
{
  const fr = [], gl = [], cu = [];
  const win = (x0, x1, z, y0, y1, alongX = true) => {
    const L = x1 - x0, n = Math.max(2, Math.round(L / 1.0));
    const P = (u, y, w, h, d) => (alongX ? B(w, h, d, x0 + u, y, z) : B(d, h, w, z, y, x0 + u));
    gl.push(P(L / 2, y0, L, y1 - y0, 0.01));
    fr.push(P(L / 2, y0 - 0.04, L + 0.04, 0.06, 0.12), P(L / 2, y1 - 0.02, L + 0.04, 0.05, 0.1), P(L / 2, y0 + (y1 - y0) * 0.72, L, 0.04, 0.08));
    for (let i = 0; i <= n; i++) fr.push(P((L * i) / n, y0, 0.045, y1 - y0, 0.08));
    // カーテン：両はしにまとめた、ひだのある布（波の形）
    for (const s of [0, 1]) {
      const W = 0.95, H = y1 - y0 + 0.25, g = new THREE.PlaneGeometry(W, H, 48, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / W) * Math.PI * 18) * 0.04);
      g.computeVertexNormals(); g.translate(W / 2, H / 2, 0);
      const u0 = s ? L - 0.05 - W : 0.05;
      if (alongX) g.translate(x0 + u0, y0 - 0.05, z - 0.16); else g.rotateY(Math.PI / 2).translate(z - 0.16, y0 - 0.05, x0 + u0 + W);
      cu.push(g);
    }
  };
  for (const [a, b] of [[0.4, 4.4], [5.2, 9.2], [10.0, 14.0], [14.8, 18.8], [19.6, 23.6]]) win(a, b, 7.4, 0.85, 2.55);
  const fm = add(fr, alu), gm = add(gl, glass, false), cm2 = add(cu, curtain, false); gm.receiveShadow = false; WALL_EXTRAS.push(fm, gm, cm2);
  // 窓台（白い板）
  WALL_EXTRAS.push(add([0.4, 5.2, 10.0, 14.8, 19.6].map((a) => B(4.0, 0.03, 0.22, a + 2.0, 0.84, 7.28)), M(0xf1efe9, { roughness: 0.5 })));
}
// 南の窓の外（明るい空と、遠くの木）。上から見るときは消す
const outside = new THREE.Group();
{
  const sky = tex(512, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#9cc3e4"); gr.addColorStop(0.65, "#dceaf3"); gr.addColorStop(1, "#7e9a6a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${50 + rnd() * 30},${90 + rnd() * 40},${40 + rnd() * 20},0.9)`; g.beginPath(); g.arc(rnd() * w, h * 0.78 + rnd() * 10, 8 + rnd() * 14, 0, Math.PI * 2); g.fill(); } });
  const m = new THREE.MeshBasicMaterial({ map: sky });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), m); p.position.set(12, 4, 22); p.rotation.y = Math.PI; outside.add(p);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), m); p2.position.set(40, 4, 3); p2.rotation.y = -Math.PI / 2; outside.add(p2);
  scene.add(outside);
}

// ---------- ドア ----------
{
  const door = M(0xc9b48f, { roughness: 0.6 }), frame = M(0x8f7a5a, { roughness: 0.6 });
  const g = [], f = [], w = [];
  const slide = (x0, x1, z) => { const L = x1 - x0; for (const k of [0, 1]) { g.push(B(L / 2 + 0.03, 1.98, 0.04, x0 + L / 4 + k * L / 2, 0.02, z + (k ? 0.03 : -0.03))); w.push(B(L / 2 - 0.22, 0.75, 0.045, x0 + L / 4 + k * L / 2, 1.0, z + (k ? 0.03 : -0.03))); } f.push(B(L + 0.1, 0.06, 0.18, (x0 + x1) / 2, 2.0, z)); };
  const swing = (x0, x1, z, alongX = true, open = 0.5) => { const L = x1 - x0; const leaf = B(L - 0.04, 1.98, 0.04, (L - 0.04) / 2, 0.02, 0).rotateY(-open).translate(x0, 0, z); if (!alongX) leaf.rotateY(Math.PI / 2).translate(0, 0, 0); g.push(leaf); };
  slide(0.9, 2.4, 0); slide(12.0, 13.6, 0); swing(7.9, 8.85, 0.02);
  // 写真：西の引き戸の上の欄間（ガラス2枚）と、まわりの木の枠
  for (const [a, b] of [[0.9, 2.4], [12.0, 13.6]]) { const c = (a + b) / 2, L = b - a; w.push(B(L, 0.5, 0.02, c, 2.15, 0)); f.push(B(L, 0.1, 0.16, c, 2.05, 0), B(L + 0.1, 0.05, 0.16, c, 2.65, 0), B(0.05, 0.6, 0.16, c, 2.08, 0), B(0.06, 2.65, 0.17, a - 0.03, 0, 0), B(0.06, 2.65, 0.17, b + 0.03, 0, 0)); }
  // 西の印刷室への入口は、戸をあけたまま（写真）。木の枠だけ。東の外への開き戸、共用スペースのドア（すこし開けておく）
  f.push(B(0.17, 0.06, 1.0, 0, 2.05, 0.9), B(0.17, 2.05, 0.05, 0, 0, 0.43), B(0.17, 2.05, 0.05, 0, 0, 1.37));
  // 更衣室の入口：西は引き戸をあけたまま（戸は奥にずらす。木の枠に2枚のすりガラス）、東はしめた戸
  g.push(B(0.9, 1.98, 0.04, 23.25, 0.02, -2.5), B(0.95, 1.98, 0.04, 16.95, 0.02, -2.6));
  f.push(B(0.06, 2.05, 0.17, 15.57, 0, -2.5), B(0.06, 2.05, 0.17, 16.53, 0, -2.5), B(1.0, 0.06, 0.17, 16.05, 2.02, -2.5));
  w.push(B(0.36, 0.55, 0.045, 16.75, 1.15, -2.6), B(0.36, 0.55, 0.045, 17.15, 1.15, -2.6));
  // 共用スペースの西の引き戸（窓と「ストーブの消火確認を」のはり紙）
  g.push(B(0.04, 1.98, 0.9, 14.4, 0.02, -1.6)); w.push(B(0.05, 0.5, 0.5, 14.4, 1.3, -1.72));
  f.push(B(0.05, 0.08, 0.56, 14.43, 1.27, -1.72), B(0.05, 0.08, 0.56, 14.43, 1.8, -1.72));
  DOOR_PARTS.push(...g.map((q) => [door, q]), ...f.map((q) => [frame, q]), ...w.map((q) => [glass, q])); // 壁ごとに分けて、あとで置く
}

// ---------- 家具 ----------
// 机（写真）：木の天板、白い鉄の脚と引き出し、うしろの幕板。座る人は +z 側（向きは rot でまわす）。天板のおくに緑のケーブル
const DW = 0.98, DD = 0.7, DH = 0.72;
const deskKit = kit([
  [woodTop, R(DW, 0.026, DD, 0, DH - 0.026, 0, 0.006)],
  [M(0xb89a72, { roughness: 0.5 }), B(DW - 0.002, 0.004, DD - 0.002, 0, DH - 0.03, 0)], // 天板の小口
  [steelW, B(0.03, DH - 0.03, DD - 0.06, -DW / 2 + 0.03, 0, 0)],                       // 左の脚の板
  [steelW, R(0.4, DH - 0.06, DD - 0.08, DW / 2 - 0.22, 0.03, 0.01, 0.01)],                     // 右の引き出しの箱
  [steelW, B(DW - 0.46, 0.32, 0.02, -0.18, 0.33, -DD / 2 + 0.05)],                      // うしろの幕板
  [steelG, B(0.38, 0.13, 0.012, DW / 2 - 0.22, 0.52, DD / 2 - 0.03)],                    // 引き出し（3段）
  [steelG, B(0.38, 0.15, 0.012, DW / 2 - 0.22, 0.35, DD / 2 - 0.03)],
  [steelG, B(0.38, 0.28, 0.012, DW / 2 - 0.22, 0.05, DD / 2 - 0.03)],
  [steelD, B(0.16, 0.015, 0.02, DW / 2 - 0.22, 0.6, DD / 2 - 0.02)], [steelD, B(0.16, 0.015, 0.02, DW / 2 - 0.22, 0.44, DD / 2 - 0.02)], [steelD, B(0.16, 0.015, 0.02, DW / 2 - 0.22, 0.3, DD / 2 - 0.02)],
  [steelW, B(0.6, 0.02, 0.4, -0.15, DH - 0.06, 0.08)],                                  // 天板の下のうすい引き出し
  [greenCable, new THREE.TorusGeometry(0.08, 0.012, 6, 18).rotateX(Math.PI / 2).translate(0.15, DH + 0.012, -DD / 2 + 0.14)],
  [steelD, B(0.25, 0.01, 0.03, -0.2, DH, -DD / 2 + 0.06)],                              // ケーブルの穴のふた
]);
// ノートパソコン（開いた状態）と、モニター
const laptopKit = kit([[M(0x9aa1a8, { roughness: 0.35, metalness: 0.5 }), B(0.33, 0.018, 0.23, 0, 0, 0)], [M(0x9aa1a8, { roughness: 0.35, metalness: 0.5 }), B(0.33, 0.22, 0.008, 0, 0, 0).rotateX(-0.25).translate(0, 0.015, -0.115)], [screen, B(0.3, 0.19, 0.002, 0, 0.018, 0).rotateX(-0.25).translate(0, 0.012, -0.107)], [black, B(0.27, 0.002, 0.1, 0, 0.018, 0.03)]]);
const monitorKit = kit([[black, B(0.55, 0.33, 0.03, 0, 0.12, 0)], [screen, B(0.52, 0.3, 0.002, 0, 0.135, 0.016)], [black, B(0.05, 0.14, 0.04, 0, 0, -0.03)], [black, B(0.22, 0.012, 0.16, 0, 0, -0.02)]]);
const papersKit = kit([[paper, B(0.21, 0.012, 0.3, 0, 0, 0)], [paper, B(0.21, 0.008, 0.3, 0.03, 0.012, 0.02).rotateY(0.15)]]);
const penKit = kit([[black, C(0.035, 0.1, 0, 0, 0, 10)], [M(0xd33), C(0.005, 0.14, 0.01, 0.02, 0, 6)], [M(0x25a), C(0.005, 0.13, -0.01, 0.02, 0.01, 6)]]);
// 事務いす：布の座面と背もたれ、ひじかけ、ガス柱、5本脚とキャスター。座る人は -z を向く
const chairParts = [
  [chairFab, R(0.48, 0.075, 0.46, 0, 0.43, 0, 0.03)],
  [chairFab, R(0.46, 0.5, 0.06, 0, 0.58, 0.25, 0.025).rotateX(0.1)],
  [plastic, B(0.44, 0.03, 0.05, 0, 0.55, 0.23)],
  [plastic, B(0.04, 0.2, 0.04, 0.27, 0.45, 0.05)], [plastic, B(0.04, 0.2, 0.04, -0.27, 0.45, 0.05)],
  [plastic, B(0.06, 0.025, 0.26, 0.27, 0.64, 0.02)], [plastic, B(0.06, 0.025, 0.26, -0.27, 0.64, 0.02)],
  [chrome, C(0.025, 0.3, 0, 0.1, 0, 10)], [plastic, C(0.035, 0.12, 0, 0.08, 0, 10)],
];
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; chairParts.push([plastic, B(0.04, 0.03, 0.3, 0, 0.07, 0.15).rotateY(a)]); chairParts.push([black, new THREE.SphereGeometry(0.028, 8, 6).translate(Math.sin(a) * 0.3, 0.028, Math.cos(a) * 0.3)]); }
const chairKit = kit(chairParts);
// 低い戸棚（引き違い戸。高さ 1.15m で、机より高い）。前は +z
const cabKit = kit([[steelG, R(0.9, 1.12, 0.45, 0, 0.03, 0, 0.008)], [steelW, B(0.44, 1.0, 0.012, -0.22, 0.08, 0.226)], [steelW, B(0.44, 1.0, 0.012, 0.22, 0.08, 0.235)], [steelD, B(0.015, 0.12, 0.02, -0.05, 0.55, 0.24)], [steelD, B(0.015, 0.12, 0.02, 0.05, 0.55, 0.245)], [steelD, B(0.9, 0.03, 0.42, 0, 0, 0)]]);
// 窓の下の低い棚（高さ 0.8m）と、背の高い保管庫
const lowKit = kit([[steelG, B(0.9, 0.78, 0.4, 0, 0.02, 0)], [steelW, B(0.44, 0.68, 0.012, -0.22, 0.06, 0.2)], [steelW, B(0.44, 0.68, 0.012, 0.22, 0.06, 0.21)], [steelD, B(0.9, 0.02, 0.38, 0, 0, 0)]]);
// 少し背の高いロッカー（高さ 1.5m。管理職の机のうしろ。窓の下の低い棚より高く、保管庫より低い）
const midKit = kit([[steelG, R(0.9, 1.5, 0.45, 0, 0, 0, 0.008)], [steelW, B(0.44, 1.4, 0.012, -0.22, 0.05, 0.226)], [steelW, B(0.44, 1.4, 0.012, 0.22, 0.05, 0.226)],
  [steelD, B(0.02, 0.2, 0.02, -0.03, 0.75, 0.24)], [steelD, B(0.02, 0.2, 0.02, 0.03, 0.75, 0.24)], [steelD, B(0.36, 0.02, 0.01, -0.22, 1.2, 0.234)], [steelD, B(0.36, 0.02, 0.01, 0.22, 1.2, 0.234)]]);
const tallKit = kit([[steelG, R(0.9, 1.8, 0.45, 0, 0, 0, 0.008)], [steelW, B(0.44, 1.7, 0.012, -0.22, 0.05, 0.226)], [steelW, B(0.44, 1.7, 0.012, 0.22, 0.05, 0.226)], [steelD, B(0.02, 0.2, 0.02, -0.03, 0.9, 0.24)], [steelD, B(0.02, 0.2, 0.02, 0.03, 0.9, 0.24)], [steelD, B(0.25, 0.08, 0.01, -0.22, 1.5, 0.235)], [steelD, B(0.25, 0.08, 0.01, 0.22, 1.5, 0.235)]]);

// 座る人の向き（face）→ 机の rot（座る人は机の +z 側。N：北を向く＝机の北に座る人ではなく、机の南に座って北を向く）
const ROT = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
const cushions = [], desks = [], chairs = [], laptops = [], monitors = [], papers = [], pens = [];
function desk(x, z, face, chairOut = 0.28) {
  const r = ROT[face], dx = -Math.sin(r), dz = -Math.cos(r); // 向いている方向
  desks.push({ x, z, rot: r });
  const out = chairOut + (rnd() < 0.3 ? 0.25 : 0); // ところどころ、いすを少し引いてある
  chairs.push({ x: x - dx * out, z: z - dz * out, rot: r + (rnd() - 0.5) * 0.3 });
  if (rnd() < 0.18) cushions.push({ x: x - dx * out, z: z - dz * out, y: 0.5, rot: r });
  const kx = Math.cos(r), kz = -Math.sin(r); // 机の横方向
  const onTop = (u, w) => ({ x: x + kx * u - dx * w, z: z + kz * u - dz * w, y: DH, rot: r + (rnd() - 0.5) * 0.2 });
  if (rnd() < 0.55) laptops.push(onTop(-0.05 + (rnd() - 0.5) * 0.1, 0.02));
  else monitors.push(onTop(-0.1, -0.15));
  if (rnd() < 0.7) papers.push(onTop(0.3, 0.1));
  if (rnd() < 0.5) pens.push(onTop(-0.38, -0.22));
}
// 背中合わせ（机がくっつく）の2列。zm：まん中の線
const pairNS = (xs, zm) => xs.forEach((x) => { desk(x, zm - DD / 2, "S"); desk(x, zm + DD / 2, "N"); });
const rowN = (xs, z) => xs.forEach((x) => desk(x, z, "N"));
// 1年
rowN([3.98, 4.99, 6.0, 7.02, 8.47], 2.53);
pairNS([3.98, 4.99, 6.0, 7.02, 8.47, 9.46], 5.0);
// 2年
rowN([9.58, 10.52, 11.5, 13.36, 14.4, 15.39, 16.4], 2.53);
pairNS([10.59, 11.58, 13.1, 14.1, 15.08], 5.0);
// 業務アシスタント
for (const z of [3.0, 4.1]) desk(18.28, z, "E");
// 3年
for (const z of [1.94, 2.88, 3.83]) desk(18.9, z, "W");
for (const z of [-0.71, 0.24, 1.18, 2.72, 3.66, 4.66, 5.63]) { desk(21.62 - DD / 2, z, "E"); desk(21.62 + DD / 2, z, "W"); }
desk(23.25, -1.6, "E"); // 写真：北のはしの窓の前の机（大きなモニター）
place(deskKit, desks); place(chairKit, chairs); place(kit([[M(0x9bb04a, { roughness: 1 }), R(0.4, 0.05, 0.38, 0, 0, 0.02, 0.02)]]), cushions); place(laptopKit, laptops); place(monitorKit, monitors); place(papersKit, papers); place(penKit, pens);

// 教頭と副校長の机（写真：業務アシスタントの南の、横に長い机。明るい木目の天板、白い引き出し、紺色のひじかけいす、黒いノートパソコンとモニター、
// クリーム色の引き出し式の整理ケース。ふつうの机より奥行きがある）。座る人は南側で北を向く
const VD = 0.85, VZ = 5.4; // 奥行きと、まん中の z
{
  const oak = M(0xe7d3ad, { roughness: 0.5 }), oakEdge = M(0xcdb68c, { roughness: 0.55 });
  const t = kit([[oak, R(1.3, 0.03, VD, 0, DH - 0.03, 0, 0.006)], [oakEdge, B(1.302, 0.012, VD + 0.002, 0, DH - 0.034, 0)],
    [steelW, R(0.42, DH - 0.06, VD - 0.1, 0.4, 0.03, 0, 0.01)], [steelW, B(0.03, DH - 0.03, VD - 0.06, -0.62, 0, 0)], [steelW, B(0.82, 0.4, 0.02, -0.17, 0.3, -VD / 2 + 0.04)],
    [steelG, B(0.38, 0.14, 0.012, 0.4, 0.52, VD / 2 - 0.04)], [steelG, B(0.38, 0.16, 0.012, 0.4, 0.34, VD / 2 - 0.04)], [steelG, B(0.38, 0.28, 0.012, 0.4, 0.04, VD / 2 - 0.04)],
    [steelD, B(0.14, 0.015, 0.02, 0.4, 0.6, VD / 2 - 0.03)], [steelD, B(0.14, 0.015, 0.02, 0.4, 0.44, VD / 2 - 0.03)], [steelD, B(0.14, 0.015, 0.02, 0.4, 0.3, VD / 2 - 0.03)]]);
  place(t, [{ x: 17.25, z: VZ }, { x: 18.55, z: VZ }, { x: 19.85, z: VZ }]);
  const navy = M(0x141c44, { roughness: 0.95 });
  const navyKit = kit(chairParts.map(([m, g]) => [m === chairFab ? navy : m, g.clone()]));
  place(navyKit, [{ x: 18.55, z: VZ + VD / 2 + 0.3, rot: 0.1 }, { x: 19.85, z: VZ + VD / 2 + 0.3, rot: -0.1 }]);
  place(monitorKit, [{ x: 18.45, z: VZ - 0.15, y: DH }, { x: 19.75, z: VZ - 0.15, y: DH }]);
  place(laptopKit, [{ x: 18.85, z: VZ + 0.12, y: DH, rot: Math.PI + 0.1 }, { x: 20.15, z: VZ + 0.1, y: DH, rot: Math.PI - 0.15 }, { x: 17.35, z: VZ - 0.05, y: DH, rot: Math.PI }]);
  // クリーム色の引き出し式の整理ケース、ペットボトルの水筒
  const organizer = kit([[M(0xf1e7c6, { roughness: 0.5 }), B(0.3, 0.34, 0.26, 0, 0, 0)], ...[0.04, 0.12, 0.2, 0.28].map((y) => [M(0xd9cfa8), B(0.26, 0.012, 0.005, 0, y, 0.133)])]);
  place(organizer, [{ x: 18.1, z: VZ - 0.1, y: DH, rot: 0.1 }, { x: 19.4, z: VZ - 0.15, y: DH, rot: -0.05 }]);
  place(kit([[M(0x2f6f86, { roughness: 0.4 }), C(0.04, 0.24, 0, 0, 0, 12)]]), [{ x: 19.1, z: VZ + 0.25, y: DH }, { x: 20.4, z: VZ + 0.2, y: DH }]);
  place(papersKit, [{ x: 17.3, z: VZ + 0.2, y: DH, rot: 0.3 }]);
}
// 北の壁ぎわの戸棚（引き違い）と、1年・2年の北の列のうしろの戸棚
const cabs = [], lows = [], talls = [], mids = [];
for (const x of [5.98, 6.9]) cabs.push({ x, z: 0.38, rot: 0 }); // X8の柱の東：白い引き違いの戸棚2台（写真）
for (const [a, b] of [[3.4, 7.5], [8.2, 11.9], [12.8, 16.9]]) for (let x = a + 0.45; x <= b - 0.4; x += 0.92) cabs.push({ x, z: 1.95, rot: Math.PI });
// 南の窓の下の低い棚（柱のところはあける）
// 教頭・副校長の机のうしろ（x 14.9〜18.7）は、写真の管理職のキャビネットの並び（下で作る）。その東の柱のむこうは少し背高めのロッカー
for (const [a, b] of [[2.5, 4.3], [5.3, 9.1], [10.1, 13.9], [19.7, 23.5]]) for (let x = a + 0.45; x <= b - 0.4; x += 0.92) (x > 16 && x < 20.5 ? mids : lows).push({ x, z: 7.05, rot: Math.PI });
// 東の壁ぎわの戸棚（窓の下）
for (let z = 5.8; z <= 6.3; z += 0.92) talls.push({ x: 23.7, z, rot: -Math.PI / 2 });
talls.push({ x: 23.7, z: 4.9, rot: -Math.PI / 2 }); // ロッカーのとなり：ホワイトボードがついた引き違い戸の棚
place(cabKit, cabs.concat(talls)); place(lowKit, lows); place(midKit, mids); // 東の壁ぎわも、窓の下にかくれる高さの戸棚
// 写真：3年側の東の壁ぞいの、白い郵便受けつきロッカー（4列×4段。扉の上に細い投入口、名札、ダイヤル錠。左はしに高い白い側板、右は引き違い戸の棚とホワイトボード）
{
  const lw = M(0xf1f1ee, { roughness: 0.35 }), slot = M(0x16181a), dial = M(0xe4e4e0, { roughness: 0.4 });
  const cols = 4, rows = 4, cw = 0.6, ch = 0.43, depth = 0.4, zc0 = 1.35; // zc0：北のはしの列の中心
  const parts = [[lw, B(depth, rows * ch + 0.1, 0.04, 0, 0, -cw / 2 - 0.02)], [lw, B(depth, 0.06, cols * cw, 0, 0, (cols - 1) * cw / 2)], [lw, B(depth, 0.05, cols * cw, 0, rows * ch + 0.05, (cols - 1) * cw / 2)]];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const y = 0.06 + r * ch, z = c * cw;
    parts.push([lw, B(0.02, ch - 0.015, cw - 0.015, -depth / 2 - 0.01, y, z)]);                     // 扉（手前は -x）
    parts.push([slot, B(0.012, 0.025, cw * 0.7, -depth / 2 - 0.02, y + ch - 0.09, z)]);            // 投入口
    parts.push([paper, B(0.012, 0.07, 0.05, -depth / 2 - 0.02, y + ch - 0.2, z - cw * 0.34)]);      // 名札
    parts.push([dial, B(0.02, 0.07, 0.035, -depth / 2 - 0.025, y + ch - 0.25, z - cw * 0.34 + 0.05)]); // ダイヤル錠
  }
  parts.push([lw, B(depth, rows * ch + 0.1, 0.04, 0, 0, cols * cw - cw / 2 + 0.02)]);
  parts.push([lw, B(depth, rows * ch + 0.1, 0.5, 0, 0, -cw / 2 - 0.27)]); // 左はしの高い側板（柱のように）
  // 東の壁（x = 24）に背を向け、正面は西（-x 向き）
  const g = kit(parts);
  for (const [m, geo] of g) { const im = new THREE.Mesh(geo, m); im.position.set(23.72, 0, zc0); im.castShadow = im.receiveShadow = true; scene.add(im); }
}
// 東の壁：棚の上のホワイトボード（アルミの枠、ペン置き、うすい文字）
{
  const zc = 4.9, w = 1.3, h = 0.85, y = 1.3, x = 23.93;
  const wb = tex(512, 336, (g, W, H) => { g.fillStyle = "#fbfbf9"; g.fillRect(0, 0, W, H); g.fillStyle = "#2a5db0"; g.font = "bold 30px sans-serif"; g.fillText("連絡", 24, 46); g.strokeStyle = "#999"; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(24, 92 + i * 52); g.lineTo(W - 24, 92 + i * 52); g.stroke(); } g.fillStyle = "#c0392b"; g.font = "22px sans-serif"; g.fillText("職員会議  16:00", 40, 82); });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(-Math.PI / 2), M(0xffffff, { map: wb, roughness: 0.3 })); pl.position.set(x, y + h / 2, zc); scene.add(pl);
  add([B(0.03, 0.03, w + 0.05, x, y - 0.03, zc), B(0.03, 0.03, w + 0.05, x, y + h, zc), B(0.03, h + 0.06, 0.03, x, y - 0.03, zc - w / 2 - 0.015), B(0.03, h + 0.06, 0.03, x, y - 0.03, zc + w / 2 + 0.015), B(0.06, 0.02, w * 0.8, x - 0.02, y - 0.05, zc)], alu);
}
// 写真：管理職（教頭・副校長）の席のうしろ、南の窓の下（柱と柱のあいだ x 14.9〜18.7）。西から
// （写真は南を向いて撮ったので、左が東）東から 白い引き違い戸のキャビネット2台（管理職）・ガラスの引き違い戸の棚（生徒カード・教務手帳）、その上にレターケース（起案・会計伝票・
// 管理職と事務長用の資料入れ・企画会議の資料）と小さな引き出し・シャッターの書類入れ。その西に台にのせたプリンター、いちばん西の木の机に教科別のレターケース
{
  const zb = 7.325, D = 0.45, H = 0.95, zc = zb - D / 2; // 正面は北（-z）
  const wcab = M(0xf0efe9, { roughness: 0.45 }), wdoor = M(0xf6f5f0, { roughness: 0.4 }), handle = M(0xb9bcbe, { roughness: 0.3, metalness: 0.6 });
  const label = M(0xffffff, { roughness: 0.6 }), red = M(0xe0483c, { roughness: 0.6 }), blue = M(0x2f6fb5, { roughness: 0.6 });
  const P = [];
  const x0 = 14.95, U = 0.9;
  for (let i = 0; i < 3; i++) {
    const cx = 18.65 - U * (i + 0.5), front = zc - D / 2; // 東から：白い戸2台、ガラス戸
    if (i < 2) P.push([wcab, B(U - 0.01, H, D, cx, 0, zc)]);
    else P.push([wcab, B(U - 0.01, 0.03, D, cx, H - 0.03, zc)], [wcab, B(U - 0.01, 0.07, D, cx, 0, zc)], [wcab, B(0.02, H, D, cx - U / 2 + 0.01, 0, zc)], [wcab, B(0.02, H, D, cx + U / 2 - 0.01, 0, zc)], [M(0xdad8d0), B(U - 0.01, H, 0.02, cx, 0, zc + D / 2 - 0.01)]); // ガラス戸の棚は中が見える
    P.push([steelD, B(U - 0.01, 0.05, D - 0.02, cx, 0, zc)]);
    if (i < 2) { // 白い引き違い戸
      P.push([wdoor, B(U / 2 + 0.01, H - 0.12, 0.012, cx - U / 4, 0.07, front - 0.008)], [wdoor, B(U / 2 + 0.01, H - 0.12, 0.012, cx + U / 4, 0.07, front - 0.022)]);
      P.push([handle, B(0.02, 0.18, 0.015, cx - 0.04, 0.5, front - 0.03)], [handle, B(0.02, 0.18, 0.015, cx + U / 2 - 0.05, 0.5, front - 0.03)]);
      P.push([label, B(0.12, 0.035, 0.004, cx + U / 2 - 0.12, H - 0.13, front - 0.016)]);
    } else { // ガラスの引き違い戸の棚（中に生徒カードと教務手帳）
      P.push([wdoor, B(U / 2, 0.06, 0.012, cx - U / 4, 0.07, front - 0.008)], [wdoor, B(U / 2, 0.06, 0.012, cx + U / 4, 0.07, front - 0.022)], [wdoor, B(U, 0.06, 0.012, cx, H - 0.11, front - 0.015)]);
      for (const s of [-1, 0, 1]) P.push([wdoor, B(0.05, H - 0.12, 0.014, cx + s * (U / 2 - 0.03), 0.07, front - 0.015)]);
      for (const y of [0.33, 0.6]) P.push([wcab, B(U - 0.06, 0.02, D - 0.06, cx, y, zc)]);
      for (let k = 0; k < 9; k++) P.push([M([0x2a2c30, 0x3c3f45, 0x2a3a2a][k % 3], { roughness: 0.7 }), B(0.03, 0.22, 0.24, cx - 0.36 + k * 0.035, 0.1, zc + 0.02)]); // 教務手帳（黒い背）
      for (let k = 0; k < 6; k++) P.push([M(k % 2 ? 0xe9763c : 0x7fbf8a, { roughness: 0.7 }), B(0.03, 0.24, 0.26, cx + 0.12 + k * 0.04, 0.36, zc + 0.02)]); // 生徒カードのファイル
      for (const [y, m] of [[0.75, blue], [0.5, red], [0.25, red]]) P.push([m, B(0.04, 0.025, 0.004, cx + U / 2 - 0.06, y, front - 0.03)]);
    }
  }
  for (const [m, g] of kit(P)) add([g], m);
  add([B(U - 0.06, H - 0.24, 0.006, 18.65 - U * 2.5, 0.13, zc - D / 2 - 0.02)], glass, false);
  // 上のレターケース（くもった灰色の引き出し。5段×2台、白い見出し）と、小さな引き出し・シャッターつきの書類入れ
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x5d5e5a, roughness: 0.3, transparent: true, opacity: 0.85 }), ivory = M(0xe4e0d2, { roughness: 0.5 });
  const L = [];
  for (const cx of [16.55, 17.17]) {
    L.push([ivory, B(0.6, 0.48, 0.38, cx, H, zc)]);
    for (let r = 0; r < 5; r++) { const y = H + 0.03 + r * 0.088; L.push([smoke, B(0.56, 0.078, 0.01, cx, y, zc - 0.19)], [label, B(0.16, 0.022, 0.004, cx + 0.05, y + 0.05, zc - 0.198)]); }
  }
  L.push([ivory, B(0.3, 0.3, 0.32, 17.65, H, zc)], ...[0, 1, 2, 3, 4].map((r) => [M(0xb9b6ac), B(0.26, 0.05, 0.01, 17.65, H + 0.02 + r * 0.055, zc - 0.165)]));
  L.push([M(0xc9c6bb), B(0.3, 0.42, 0.34, 18.05, H, zc)], ...[...Array(12)].map((_, r) => [M(0xa7a49a), B(0.26, 0.006, 0.006, 18.05, H + 0.05 + r * 0.03, zc - 0.171)]));
  L.push([M(0x9bd14a, { roughness: 0.6 }), B(0.42, 0.08, 0.3, 16.45, H + 0.48, zc)], [M(0xf0d9a0, { roughness: 0.9 }), B(0.4, 0.06, 0.3, 16.95, H + 0.48, zc)]); // 黄緑のかごと封筒
  for (const [m, g] of kit(L)) add([g], m, !m.transparent);
  // プリンター（白いレーザープリンター。増設トレイ2段）と、木の台
  const wood = M(0x9a6a40, { roughness: 0.6 });
  const pr = [[wood, B(0.56, 0.03, 0.5, 0, 0.62, 0)], [steelD, B(0.03, 0.62, 0.03, -0.25, 0, -0.22)], [steelD, B(0.03, 0.62, 0.03, 0.25, 0, -0.22)], [steelD, B(0.03, 0.62, 0.03, -0.25, 0, 0.22)], [steelD, B(0.03, 0.62, 0.03, 0.25, 0, 0.22)], [wood, B(0.5, 0.02, 0.44, 0, 0.2, 0)],
    [M(0xf3f3f1, { roughness: 0.4 }), R(0.48, 0.4, 0.46, 0, 0.65, 0, 0.02)], [M(0xf3f3f1, { roughness: 0.4 }), B(0.48, 0.13, 0.46, 0, 0.9, 0)], [black, B(0.3, 0.012, 0.25, 0, 1.03, 0.05)],
    [M(0xdedede), B(0.44, 0.005, 0.01, 0, 0.72, -0.235)], [M(0xdedede), B(0.44, 0.005, 0.01, 0, 0.83, -0.235)], [M(0x2a6dd2), B(0.06, 0.03, 0.005, 0.18, 0.98, -0.234)], [M(0x5d6f84), B(0.4, 0.1, 0.32, 0, 0.23, 0)]];
  place(kit(pr), [{ x: 15.73, z: zc + 0.02 }]);
  // 木の机と、教科別のレターケース（国語・社会・数学・理科・保体／芸家・英語・養他・講師）
  const desk2 = [[wood, B(0.55, 0.03, 0.45, 0, 0.7, 0)], [steelD, B(0.03, 0.7, 0.03, -0.25, 0, -0.2)], [steelD, B(0.03, 0.7, 0.03, 0.25, 0, -0.2)], [steelD, B(0.03, 0.7, 0.03, -0.25, 0, 0.2)], [steelD, B(0.03, 0.7, 0.03, 0.25, 0, 0.2)]];
  for (const y0 of [0.73, 1.03]) { desk2.push([ivory, B(0.5, 0.29, 0.34, 0, y0, 0)]); for (let r = 0; r < 5; r++) desk2.push([smoke, B(0.46, 0.048, 0.008, 0, y0 + 0.02 + r * 0.054, -0.172)], [M(0xf2c84a), B(0.08, 0.025, 0.004, -0.17, y0 + 0.035 + r * 0.054, -0.178)], [M(0xf2c84a), B(0.08, 0.025, 0.004, 0.17, y0 + 0.035 + r * 0.054, -0.178)]); }
  place(kit(desk2), [{ x: 15.2, z: zc + 0.02 }]);
}
// 東の壁（写真）：北のはしの背の高い窓（上に欄間、茶色い花がらのカーテン）、柱のパイプと小さな洗面台・鏡、
// 郵便受けロッカー、ホワイトボードの引き違い戸の棚（下は小さな郵便受け：一時保管・担任提出・進路など）、掲示物、上に時間割表3枚と時計
{
  const X = 23.925, alu2 = M(0xb7bdc2, { roughness: 0.3, metalness: 0.7 });
  // 背の高い窓（z -2.35〜-0.95）
  const fr = [B(0.1, 0.06, 1.4, X, 0.05, -1.65), B(0.1, 0.06, 1.4, X, 2.54, -1.65), B(0.1, 0.05, 1.4, X, 1.95, -1.65), B(0.1, 0.05, 1.4, X, 0.7, -1.65)];
  for (const z of [-2.35, -1.65, -0.95]) fr.push(B(0.1, 2.55, 0.05, X, 0.05, z));
  add(fr, alu2); add([B(0.01, 2.5, 1.38, X + 0.02, 0.07, -1.65)], glass, false);
  add([B(0.012, 0.6, 1.38, X + 0.01, 0.08, -1.65)], M(0xe9ebec, { roughness: 0.2, transparent: true, opacity: 0.6 }), false); // 下のすりガラス
  const brownCur = M(0x8a7766, { roughness: 0.95, side: THREE.DoubleSide });
  for (const z of [-2.25, -1.05]) { const gq = new THREE.PlaneGeometry(0.28, 2.3, 10, 1), pq = gq.attributes.position; for (let i = 0; i < pq.count; i++) pq.setZ(i, Math.sin(pq.getX(i) * 40) * 0.025); gq.computeVertexNormals(); gq.rotateY(Math.PI / 2).translate(X - 0.12, 0.25 + 1.15, z); add([gq], brownCur, false); }
  // 洗面台と鏡、手洗い石けん、上の小さな棚、柱の太いパイプ
  add([B(0.4, 0.16, 0.5, X - 0.2, 0.72, -0.5)], M(0xf6f6f2, { roughness: 0.2 }));
  add([C(0.012, 0.15, X - 0.08, 0.86, -0.5, 8), B(0.12, 0.02, 0.02, X - 0.12, 1.0, -0.5)], chrome);
  add([B(0.01, 0.42, 0.35, X - 0.005, 1.25, -0.5)], M(0xd9e2e6, { roughness: 0.05, metalness: 0.9 }), false);
  add([B(0.12, 0.02, 0.6, X - 0.06, 1.1, -0.5)], M(0xefe9dc));
  add([C(0.11, CEIL, X - 0.15, 0, -0.1, 14)], M(0xe7dfcf, { roughness: 0.6 }));
  // ホワイトボードの引き違い戸の棚（上）と、小さな郵便受けの棚（下）z 3.5〜4.9
  const z0 = 3.5, W = 1.4, mid = z0 + W / 2;
  const lw = M(0xf1f1ee, { roughness: 0.35 }), slot = M(0x16181a);
  const parts = [[lw, B(0.42, 0.95, W, X - 0.21, 0, mid)]];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) parts.push([lw, B(0.02, 0.3, W / 4 - 0.015, X - 0.43, 0.04 + r * 0.31, z0 + (c + 0.5) * W / 4)], [slot, B(0.012, 0.02, 0.14, X - 0.445, 0.27 + r * 0.31, z0 + (c + 0.5) * W / 4 - 0.05)], [paper, B(0.006, 0.05, 0.08, X - 0.445, 0.2 + r * 0.31, z0 + (c + 0.5) * W / 4 + 0.08)]);
  parts.push([alu2, B(0.4, 0.95, W + 0.04, X - 0.2, 0.95, mid)], [M(0xfbfbf9, { roughness: 0.2 }), B(0.012, 0.8, 0.52, X - 0.41, 1.03, z0 + 0.3)], [M(0xfbfbf9, { roughness: 0.2 }), B(0.012, 0.8, 0.52, X - 0.425, 1.03, z0 + 0.8)]);
  parts.push([M(0xd0453a), B(0.25, 0.25, 0.04, X - 0.2, 1.08, z0 + 1.2)], [M(0xd0453a), B(0.25, 0.25, 0.04, X - 0.2, 1.08, z0 + 1.25)], [M(0x9aa0a6), B(0.3, 0.02, 0.3, X - 0.2, 1.4, z0 + 1.2)]);
  for (const [m, g] of kit(parts)) add([g], m);
  // 写真：下の小さな郵便受け（進路関係）の見出し。北の列から 一時保管（〒）・担任提出・専門（1〜90）・大学（1〜60）、下の段に 進路⑤その他・GL管轄、入力前 など
  { const lb = (t) => M(0xffffff, { map: tex(128, 40, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; g.font = "bold 18px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, w / 2, h / 2); }), roughness: 0.6 });
    for (const [c, r, t] of [[0, 2, "一時保管"], [1, 2, "担任提出"], [2, 2, "専門 1〜90"], [3, 2, "大学 1〜60"], [0, 1, "その他・GL"], [1, 1, "入力前"], [3, 1, "大学"]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), lb(t)); m.position.set(X - 0.452, 0.16 + r * 0.31, z0 + (c + 0.5) * W / 4); m.rotation.y = -Math.PI / 2; scene.add(m); } }
  const posted = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper);
  for (const [z, y, w, h] of [[3.75, 1.45, 0.14, 0.2], [4.1, 1.5, 0.18, 0.13], [5.2, 1.5, 0.35, 0.3], [5.15, 1.15, 0.2, 0.28], [5.5, 1.3, 0.2, 0.26], [5.6, 1.7, 0.4, 0.3]]) { const m = posted(w, h); m.position.set(X - (z > 5 ? 0.005 : 0.43), y, z); m.rotation.y = -Math.PI / 2; scene.add(m); }
  // 時間割表3枚（40分・45分・50分）と時計
  const tt = (title) => tex(160, 220, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; g.font = "bold 15px sans-serif"; g.fillText(title, 18, 20); g.strokeStyle = "#222"; for (let i = 0; i <= 9; i++) { g.beginPath(); g.moveTo(8, 28 + i * 20); g.lineTo(w - 8, 28 + i * 20); g.stroke(); } g.beginPath(); g.moveTo(48, 28); g.lineTo(48, 208); g.stroke(); g.font = "12px sans-serif"; const L = ["SHR", "1校時", "2校時", "3校時", "4校時", "昼休み", "5校時", "6校時", "7校時"]; L.forEach((t, i) => { g.fillText(t, 11, 43 + i * 20); g.fillText(`${8 + Math.floor(i * 0.8)}:${(40 + i * 7) % 60 < 10 ? "0" : ""}${(40 + i * 7) % 60} 〜`, 56, 43 + i * 20); }); });
  [["平常【40分】授業", 1.25], ["平常【45分】授業", 1.85], ["平常【50分】授業", 2.45]].forEach(([t, z]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.58), M(0xffffff, { map: tt(t), roughness: 0.8 })); m.position.set(X - 0.005, 2.2, z); m.rotation.y = -Math.PI / 2; scene.add(m); });
  const face = tex(128, 128, (g, w) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, w); g.fillStyle = "#222"; g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), 64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48); } g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(84, 50); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(70, 104); g.stroke(); });
  const clk = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), M(0xffffff, { map: face, roughness: 0.3 })); clk.position.set(X - 0.01, 2.3, 3.0); clk.rotation.y = -Math.PI / 2; scene.add(clk);
  add([new THREE.TorusGeometry(0.165, 0.014, 6, 32).rotateY(Math.PI / 2).translate(X - 0.01, 2.3, 3.0)], M(0xb8bcc0, { roughness: 0.3, metalness: 0.7 }));
  // 天井の空調（天井つりの白い箱）と、南の窓の上の黒いロールカーテン
  ceiling.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.65).translate(14.2, CEIL - 0.12, 5.9), M(0xeeeae0, { roughness: 0.5 })));
  ceiling.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.4).translate(14.2, CEIL - 0.245, 5.9), M(0x9ea29f)));
  WALL_EXTRAS.push(add([0.4, 5.2, 10.0, 14.8, 19.6].map((a) => B(4.0, 0.16, 0.1, a + 2.0, 2.4, 7.22)), M(0x2a2c2e, { roughness: 0.8 }), false));
}
// 写真（3年側）：北のはしの窓の前の机（大きな黒いモニター、東を向いて座る）、その南の白いプリンター（増設トレイつき、台の上）
{
  place(kit([[black, B(0.04, 0.42, 0.85, 0, 0.12, 0)], [screen, B(0.004, 0.38, 0.8, -0.022, 0.14, 0)], [black, B(0.18, 0.012, 0.25, 0.02, 0, 0)], [black, B(0.04, 0.12, 0.06, 0.03, 0, 0)]]), [{ x: 23.5, z: -1.6, y: DH }]);
  const oki = [[M(0x9a6a40, { roughness: 0.6 }), B(0.5, 0.03, 0.5, 0, 0.3, 0)], [steelD, B(0.03, 0.3, 0.03, -0.22, 0, -0.22)], [steelD, B(0.03, 0.3, 0.03, 0.22, 0, -0.22)], [steelD, B(0.03, 0.3, 0.03, -0.22, 0, 0.22)], [steelD, B(0.03, 0.3, 0.03, 0.22, 0, 0.22)],
    [M(0xeeeeea, { roughness: 0.4 }), R(0.46, 0.75, 0.48, 0, 0.33, 0, 0.02)], [M(0xdcdcd6), B(0.42, 0.006, 0.01, 0, 0.55, -0.24)], [M(0xdcdcd6), B(0.42, 0.006, 0.01, 0, 0.75, -0.24)], [black, B(0.3, 0.012, 0.3, 0, 1.08, 0.04)], [paper, B(0.22, 0.01, 0.3, -0.03, 1.09, 0.04)], [M(0x7aa6c8), B(0.1, 0.05, 0.005, 0.12, 1.0, -0.242)]];
  place(kit(oki), [{ x: 22.75, z: -0.4, rot: -Math.PI / 2 }]);
  // 柱（x 19.2）の南の面の「3学年」のホワイトボードと、はり紙、赤本の貸し出し簿（緑のノート）
  const wb3 = tex(256, 320, (g, w, h) => { g.fillStyle = "#fbfbfa"; g.fillRect(0, 0, w, h); g.fillStyle = "#1a2a7a"; g.font = "18px sans-serif"; g.fillText("10月30日(金)", 12, 30); g.strokeStyle = "#1a2a7a"; g.strokeRect(10, 40, 130, 46); g.fillStyle = "#d22"; g.font = "13px sans-serif"; g.fillText("3年残り", 16, 70); g.fillStyle = "#1a2a7a"; g.font = "bold 30px sans-serif"; g.fillText("56日", 72, 76); g.font = "14px sans-serif"; g.fillText("論国小テスト 10/30", 14, 120); g.fillText("12:50 スタディホール", 26, 140); g.fillText("第3回模試面接 〜11/2", 90, 196); g.fillStyle = "#222"; g.fillRect(w - 52, 6, 46, 16); g.fillStyle = "#fff"; g.font = "bold 11px sans-serif"; g.fillText("3学年", w - 46, 18); g.fillStyle = "#2a9a5a"; g.fillRect(w - 46, 58, 40, 14); g.fillStyle = "#e4c43a"; g.fillRect(10, 98, 4, 160); g.fillStyle = "#1a7a8a"; g.fillRect(4, 98, 4, 160); g.fillStyle = "#e33"; g.fillRect(40, 268, 70, 18); });
  const pz = 0.1 + 0.381;
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), M(0xffffff, { map: wb3, roughness: 0.25 })); m.position.set(19.18, 1.55, pz); scene.add(m); }
  add([B(0.66, 0.025, 0.02, 19.18, 1.14, pz), B(0.66, 0.025, 0.02, 19.18, 1.95, pz), B(0.02, 0.83, 0.02, 18.86, 1.14, pz), B(0.02, 0.83, 0.02, 19.5, 1.14, pz), B(0.6, 0.02, 0.05, 19.18, 1.13, pz + 0.02)], alu, false);
  for (const [x, y, w, h] of [[19.38, 1.2, 0.26, 0.34], [19.33, 0.9, 0.22, 0.3], [18.98, 0.75, 0.22, 0.32], [19.08, 2.25, 0.4, 0.22]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper); m.position.set(x, y, pz + 0.004); scene.add(m); }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.24), M(0x3fa36a)); m.position.set(19.52, 0.55, pz + 0.01); scene.add(m); }
  // 柱のそばのごみ箱（灰色と黄色）
  place(kit([[M(0x9a9c9a, { roughness: 0.5 }), B(0.32, 0.6, 0.36, 0, 0, 0)], [paper, B(0.33, 0.04, 0.37, 0, 0.58, 0)]]), [{ x: 18.55, z: 0.75 }]);
  place(kit([[M(0xe6d65a, { roughness: 0.5, transparent: true, opacity: 0.85 }), B(0.32, 0.6, 0.36, 0, 0, 0)]]), [{ x: 18.55, z: 0.35 }]);
}
// 写真：机の上の銀色の電源タップ
{
  const tapK = kit([[M(0xc9cdd1, { roughness: 0.3, metalness: 0.6 }), R(0.36, 0.035, 0.05, 0, 0, 0, 0.01)], [black, B(0.3, 0.004, 0.02, 0, 0.035, 0)]]);
  place(tapK, desks.filter(() => rnd() < 0.8).map((d) => { const r = d.rot, fx = -Math.sin(r), fz = -Math.cos(r), kx = Math.cos(r), kz = -Math.sin(r); return { x: d.x + kx * 0.05 + fx * 0.27, z: d.z + kz * 0.05 + fz * 0.27, y: DH, rot: r + (rnd() - 0.5) * 0.3 }; }));
}
// 西のはし（写真）：西の壁ぞいに、南から流し台・製氷機・冷蔵庫・食器棚・電子レンジの台、印刷室への入口。
// 前に木の打ち合わせテーブルと折りたたみいす。南の窓の下に木の棚（トースター・電子レンジ・ポット）
{
  const P = [];
  const X0 = 0.075; // 西の壁の内側の面
  const at = (d, h, w, y, z, x = 0) => B(d, h, w, X0 + d / 2 + x, y, z); // 壁から d の奥行き、z を中心に w の幅
  const cream = M(0xe6d6a6, { roughness: 0.6 }), stain = M(0xd0d4d6, { roughness: 0.32, metalness: 0.45 }), stainD = M(0x8d9397, { roughness: 0.4, metalness: 0.45 });
  const woodD = M(0x9a6533, { roughness: 0.55 }), woodT = M(0x86522c, { roughness: 0.45 }), white = M(0xf2f2ef, { roughness: 0.4 });
  // 流し台：クリーム色の下の戸棚、ステンレスの天板と流し、うしろの立ち上がり、蛇口
  P.push([cream, at(0.58, 0.8, 1.05, 0.02, 6.375)], [stainD, at(0.56, 0.06, 1.03, 0, 6.375, 0.01)]);
  for (const z of [6.1, 6.62]) P.push([M(0xd8c690, { roughness: 0.6 }), at(0.01, 0.68, 0.5, 0.08, z, 0.58)], [stainD, at(0.02, 0.1, 0.015, 0.65, z + (z < 6.3 ? 0.2 : -0.2), 0.585)]);
  P.push([stain, at(0.62, 0.04, 1.07, 0.82, 6.375)], [stainD, at(0.4, 0.006, 0.55, 0.858, 6.45, 0.12)], [stain, at(0.04, 0.14, 1.07, 0.86, 6.375)]);
  P.push([chrome, C(0.016, 0.28, X0 + 0.1, 0.86, 6.45, 8)], [chrome, B(0.24, 0.02, 0.02, X0 + 0.2, 1.12, 6.45)], [chrome, B(0.14, 0.025, 0.025, X0 + 0.06, 1.0, 6.2)]);
  // 給湯器（壁の上）と、かがみ、洗剤のボトル、やかん
  P.push([white, at(0.15, 0.42, 0.3, 1.38, 6.05)], [M(0x9aa0a6), at(0.005, 0.12, 0.2, 1.62, 6.05, 0.15)], [chrome, B(0.02, 0.36, 0.02, X0 + 0.1, 1.02, 6.05)]);
  P.push([M(0xd9dde0, { roughness: 0.05, metalness: 0.9 }), at(0.02, 0.32, 0.3, 0.88, 6.75, 0.04)]);
  for (const [z, c, h] of [[5.95, 0xf4f4f0, 0.2], [6.0, 0x7fbf8a, 0.16], [6.25, 0xf0e6c8, 0.14], [6.3, 0xffffff, 0.12], [5.9, 0xe04a3a, 0.18]]) P.push([M(c, { roughness: 0.4 }), C(0.03, h, X0 + 0.07 + (z % 0.1), 0.86, z, 10)]);
  P.push([stain, C(0.09, 0.18, X0 + 0.5, 0.86, 5.98, 16)], [stain, C(0.08, 0.16, X0 + 0.45, 0.86, 6.18, 16)], [black, B(0.03, 0.03, 0.12, X0 + 0.5, 1.06, 5.98)]);
  // 製氷機（ステンレス。下に通気のすき間、上に機械）
  const iz = 5.45;
  P.push([stain, at(0.62, 0.85, 0.68, 0.1, iz)], [stain, at(0.62, 0.52, 0.7, 0.97, iz)], [stainD, at(0.6, 0.02, 0.66, 0.95, iz)]);
  for (let i = 0; i < 4; i++) P.push([stainD, C(0.02, 0.1, X0 + 0.08 + (i % 2) * 0.48, 0, iz + (i < 2 ? -0.28 : 0.28), 8)]);
  for (let k = 0; k < 12; k++) for (const s of [-1, 1]) P.push([M(0x6a7075, { roughness: 0.5, metalness: 0.6 }), at(0.01, 0.006, 0.22, 0.15 + k * 0.022, iz + s * 0.18, 0.62)]);
  P.push([black, at(0.01, 0.12, 0.06, 0.2, iz, 0.62)], [M(0x2a3a8a), at(0.004, 0.05, 0.22, 1.38, iz - 0.12, 0.62)], [M(0x2e8a4a), C(0.03, 0.004, X0 + 0.625, 1.25, iz + 0.25, 12).rotateZ(Math.PI / 2).translate(0, 0, 0)]);
  // 白い配管（床から天井まで）
  P.push([white, C(0.045, CEIL, X0 + 0.06, 0, 4.92, 12)], [white, C(0.055, 0.04, X0 + 0.06, 1.2, 4.92, 12)]);
  // 冷蔵庫（ピンクがかった銀色、3つの扉）と、扉にはった表
  const fz = 4.52, fridge = M(0xd3c5c1, { roughness: 0.28, metalness: 0.35 });
  P.push([fridge, at(0.66, 0.97, 0.64, 0.86, fz)], [fridge, at(0.66, 0.4, 0.64, 0.44, fz)], [fridge, at(0.66, 0.4, 0.64, 0.02, fz)], [M(0x8f8582, { roughness: 0.4 }), at(0.65, 0.01, 0.62, 0.84, fz)], [M(0x8f8582), at(0.65, 0.01, 0.62, 0.43, fz)], [black, at(0.6, 0.02, 0.6, 0, fz)]);
  P.push([paper, at(0.004, 0.32, 0.24, 1.35, fz, 0.66)], [M(0xe9d24a, { roughness: 0.9 }), at(0.004, 0.1, 0.1, 0.18, fz + 0.15, 0.66)], [M(0x8f8582), at(0.01, 0.3, 0.02, 1.0, fz - 0.3, 0.66)]);
  // 木の食器棚（上はガラス戸、下は引き出し）と、上のアルコール
  const cz = 3.47, glassC = new THREE.MeshPhysicalMaterial({ color: 0xd9e4e6, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
  P.push([woodD, at(0.45, 0.12, 0.95, 0, cz)], [woodD, at(0.45, 0.04, 0.95, 0.12, cz)], [woodD, at(0.42, 0.25, 0.93, 0.16, cz)], [woodD, at(0.45, 0.04, 0.95, 0.42, cz)], [woodD, at(0.45, 0.04, 0.95, 1.7, cz)], [woodD, at(0.45, 0.04, 0.95, 1.05, cz)]);
  for (const s of [-1, 1]) P.push([woodD, at(0.45, 1.3, 0.03, 0.44, cz + s * 0.46)]);
  P.push([M(0x6e4a2a, { roughness: 0.7 }), at(0.02, 1.28, 0.9, 0.44, cz)], [woodD, at(0.42, 1.26, 0.025, 0.44, cz)]);
  for (const y of [0.75, 1.32]) P.push([woodD, at(0.4, 0.02, 0.9, y, cz)]);
  for (const s of [-1, 1]) P.push([woodT, at(0.01, 0.2, 0.42, 0.18, cz + s * 0.23, 0.425)], [black, at(0.02, 0.02, 0.1, 0.28, cz + s * 0.23, 0.43)]);
  // ガラスの中の食器（茶わん・どんぶり・皿）
  for (const [y, z, r, h, c] of [[0.77, 3.25, 0.09, 0.06, 0xf4f1ea], [0.77, 3.65, 0.1, 0.08, 0xe9e2d2], [1.34, 3.22, 0.05, 0.12, 0xffffff], [1.34, 3.7, 0.11, 0.05, 0xf4f1ea], [1.07, 3.3, 0.08, 0.05, 0xf4f1ea], [1.07, 3.7, 0.08, 0.1, 0x8aa25a]]) P.push([M(c, { roughness: 0.3 }), C(r, h, X0 + 0.22, y, z, 14)]);
  for (const k of [0, 1, 2]) P.push([M(0xffffff, { roughness: 0.4 }), at(0.08, 0.16, 0.07, 1.74, cz - 0.1 + k * 0.1, 0.1)], [M(0xd5332a), at(0.002, 0.08, 0.06, 1.78, cz - 0.1 + k * 0.1, 0.18)]);
  // 「段ボールゴミ」のはり紙と、たたんだ段ボール
  P.push([M(0xb68a58, { roughness: 0.9 }), at(0.04, 0.5, 0.55, 0, 2.75).rotateZ(0)], [M(0xa77b4a, { roughness: 0.9 }), at(0.04, 0.42, 0.5, 0, 2.78, 0.04)]);
  // 電子レンジの台（小さな木の机）と、白い電子レンジ
  P.push([woodT, at(0.42, 0.03, 0.6, 0.68, 2.3)], [steelD, at(0.03, 0.68, 0.03, 0, 2.03, 0.02)], [steelD, at(0.03, 0.68, 0.03, 0, 2.57, 0.02)], [steelD, at(0.03, 0.68, 0.03, 0, 2.03, 0.37)], [steelD, at(0.03, 0.68, 0.03, 0, 2.57, 0.37)], [steelD, at(0.38, 0.02, 0.56, 0.2, 2.3, 0.02)]);
  P.push([white, at(0.36, 0.28, 0.48, 0.71, 2.3, 0.02)], [screen, at(0.004, 0.18, 0.28, 0.76, 2.24, 0.38)], [M(0x8a8f95), at(0.004, 0.2, 0.08, 0.75, 2.47, 0.38)]);
  // 南の窓の下の木の棚：トースター（黒）、電子レンジ（クリーム）、電気ポット、魔法びん
  const sz = 7.12;
  P.push([woodT, B(1.6, 0.03, 0.42, 1.55, 0.7, sz)], [woodD, B(1.6, 0.08, 0.02, 1.55, 0.62, sz - 0.2)]);
  for (const x of [0.78, 2.32]) P.push([steelD, B(0.03, 0.7, 0.38, x, 0, sz)]);
  P.push([black, B(0.42, 0.24, 0.32, 0.98, 0.73, sz)], [M(0x50545a, { roughness: 0.2 }), B(0.24, 0.14, 0.005, 0.93, 0.78, sz - 0.162)]);
  P.push([M(0xeee5cc, { roughness: 0.4 }), B(0.5, 0.29, 0.36, 1.5, 0.73, sz)], [screen, B(0.3, 0.18, 0.005, 1.45, 0.78, sz - 0.182)]);
  P.push([white, C(0.1, 0.26, 1.9, 0.73, sz, 16)], [M(0x5a5f66, { roughness: 0.25, metalness: 0.7 }), C(0.085, 0.3, 2.15, 0.73, sz, 16)], [black, C(0.05, 0.05, 2.15, 1.03, sz, 12)]);
  // 消火器の赤いしるし（南の柱）
  P.push([M(0xd02a22, { roughness: 0.5 }), B(0.004, 0.32, 0.08, 0.385, 1.35, 7.1)]);

  // 打ち合わせの木のテーブル（南北に長い）と折りたたみいす（奥は青、手前は灰色）
  const tx = 1.75, tz = 2.75;
  P.push([woodT, R(0.9, 0.035, 1.8, tx, 0.685, tz, 0.008)], [M(0x5a3a22), B(0.86, 0.06, 1.76, tx, 0.625, tz)]);
  for (const [dx, dz] of [[-0.38, -0.82], [0.38, -0.82], [-0.38, 0.82], [0.38, 0.82]]) P.push([steelD, C(0.015, 0.63, tx + dx, 0, tz + dz, 8)]);
  for (const [m, g] of kit(P)) add([g], m, !m.transparent);
  add([at(0.004, 1.24, 0.88, 0.45, cz, 0.43)], glassC, false);

  const fold = (seat, back) => kit([[seat, R(0.42, 0.05, 0.4, 0, 0.42, 0, 0.02)], [back, R(0.4, 0.26, 0.03, 0, 0.62, 0.21, 0.015)], [steelG, B(0.025, 0.47, 0.025, 0.19, 0, -0.17)], [steelG, B(0.025, 0.47, 0.025, -0.19, 0, -0.17)], [steelG, B(0.025, 0.9, 0.025, 0.2, 0, 0.21)], [steelG, B(0.025, 0.9, 0.025, -0.2, 0, 0.21)], [steelG, B(0.4, 0.02, 0.02, 0, 0.1, 0.2)], [steelG, B(0.4, 0.02, 0.02, 0, 0.1, -0.17)]]);
  place(fold(M(0x2c3f72, { roughness: 0.8 }), M(0x3c5aa0, { roughness: 0.5 })), [2.2, 2.75, 3.3].map((z) => ({ x: 1.02, z, rot: -Math.PI / 2 })));
  place(fold(M(0x2c3f72, { roughness: 0.8 }), M(0xa7abae, { roughness: 0.5 })), [2.35, 3.15].map((z) => ({ x: 2.5, z, rot: Math.PI / 2 })));
  // テーブルの上：ティッシュ、消毒液、わりばし立て
  const onT = [[M(0xf2e04a), B(0.12, 0.09, 0.22, tx + 0.1, 0.72, 2.05)], [M(0xf4f4f4, { roughness: 0.2 }), C(0.04, 0.2, tx - 0.05, 0.72, 2.2, 12)], [chrome, C(0.05, 0.13, tx + 0.15, 0.72, 2.35, 12)], [M(0xd9b77a), C(0.003, 0.2, tx + 0.15, 0.78, 2.35, 4)], [paper, B(0.2, 0.01, 0.28, tx - 0.15, 0.72, 3.0).rotateY(0.3)]];
  for (const [m, g] of kit(onT)) add([g], m);

  // 印刷室への入口の前：パンフレットのラック、キャスターつきのホワイトボード
  const rack = [[steelG, B(0.04, 1.45, 0.04, 0.3, 0, 1.25)], [steelG, B(0.04, 1.45, 0.04, 0.3, 0, 1.75)], [steelG, B(0.35, 0.02, 0.5, 0.42, 0.05, 1.5)]];
  const pcol = [0xffffff, 0x8fc6e8, 0xf4f4f0, 0xbfe0b0, 0xe8e8e8, 0x9fd0f0];
  for (let i = 0; i < 6; i++) rack.push([M(pcol[i], { roughness: 0.8 }), B(0.02, 0.28, 0.21, 0, 0, 0).rotateZ(-0.35).translate(0.38, 0.25 + i * 0.2, 1.5 + (i % 2 ? 0.11 : -0.11))]);
  for (const [m, g] of kit(rack)) add([g], m);
  const wbT = tex(256, 320, (g, w, h) => { g.fillStyle = "#fbfbf9"; g.fillRect(0, 0, w, h); g.fillStyle = "#24497a"; g.fillRect(150, 20, 90, 12); g.fillStyle = "#fff"; g.fillRect(135, 60, 110, 150); g.strokeStyle = "#aab"; g.strokeRect(135, 60, 110, 150); g.fillStyle = "rgba(40,40,60,0.6)"; for (let k = 0; k < 10; k++) g.fillRect(142, 72 + k * 12, 60 + rnd() * 35, 3); });
  const wbg = new THREE.Group(); wbg.position.set(1.3, 0, 0.62); wbg.rotation.y = 1.05; scene.add(wbg);
  { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), M(0xffffff, { map: wbT, roughness: 0.3 })); b.position.set(0, 1.45, 0.02); wbg.add(b); const back = new THREE.Mesh(B(0.92, 1.22, 0.025, 0, 0.84, 0), alu); back.castShadow = true; wbg.add(back); const legs = new THREE.Mesh(mergeGeometries([B(0.03, 1.5, 0.03, -0.45, 0.05, 0), B(0.03, 1.5, 0.03, 0.45, 0.05, 0), B(0.03, 0.03, 0.5, -0.45, 0.04, 0), B(0.03, 0.03, 0.5, 0.45, 0.04, 0)]), alu); legs.castShadow = true; wbg.add(legs); }

  // 北の壁：引き戸の東の、枠つきの緑の掲示板と欄間、その前のクラス別の配布棚（白・6段×2列を2台）
  const gb = tex(512, 340, (g, w, h) => {
    g.fillStyle = "#1f4a33"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.15})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    const sheet = (x, y, sw, sh, grid) => { g.fillStyle = "#fbfbf8"; g.fillRect(x, y, sw, sh); g.strokeStyle = "rgba(60,60,70,0.55)"; g.lineWidth = 1; if (grid) { for (let k = 1; k < 12; k++) { g.beginPath(); g.moveTo(x + 5, y + 14 + k * (sh - 20) / 12); g.lineTo(x + sw - 5, y + 14 + k * (sh - 20) / 12); g.stroke(); } for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + k * sw / 4, y + 20); g.lineTo(x + k * sw / 4, y + sh - 8); g.stroke(); } } else { g.fillStyle = "rgba(40,40,60,0.55)"; for (let k = 0; k < 18; k++) g.fillRect(x + 8, y + 12 + k * (sh - 20) / 18, (sw - 16) * (0.5 + rnd() * 0.5), 2); } g.fillStyle = "#ddd"; g.beginPath(); g.arc(x + sw / 2, y + 4, 4, 0, 7); g.fill(); };
    sheet(20, 20, 75, 190, false); sheet(130, 30, 65, 95, true);
    for (let i = 0; i < 6; i++) sheet(210 + i * 48, 22 + (i % 2) * 6, 44, 82, true);
    sheet(330, 115, 48, 50, true);
    g.fillStyle = "#3e7fd6"; g.fillRect(140, 8, 34, 14); g.fillRect(250, 6, 64, 14); g.fillStyle = "#fff"; g.font = "bold 11px sans-serif"; g.fillText("公欠", 146, 19); g.fillText("時間割変更", 254, 17);
    g.fillStyle = "#fff"; g.fillRect(200, 130, 85, 26); g.fillStyle = "#222"; g.font = "9px sans-serif"; g.fillText("出欠状況の", 204, 141); g.fillText("スクールネット入力を", 204, 153);
  });
  const gbx = 3.42, gby = 1.08, gbw = 1.5, gbh = 1.0;
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(gbw, gbh), M(0xffffff, { map: gb, roughness: 0.85 })); p.position.set(gbx, gby + gbh / 2, 0.09); scene.add(p); }
  const fcol = M(0xd8c3a3, { roughness: 0.6 });
  add([B(gbw + 0.2, 0.06, 0.05, gbx, gby - 0.06, 0.09), B(gbw + 0.2, 0.08, 0.05, gbx, gby + gbh, 0.09), B(0.08, 1.75, 0.05, gbx - gbw / 2 - 0.06, gby - 0.06, 0.09), B(0.08, 1.75, 0.05, gbx + gbw / 2 + 0.06, gby - 0.06, 0.09), B(gbw + 0.2, 0.05, 0.05, gbx, 2.66, 0.09), B(0.04, 0.5, 0.04, gbx, 2.16, 0.1)], fcol, false);
  add([B(gbw + 0.04, 0.5, 0.01, gbx, 2.16, 0.08)], M(0x55606a, { roughness: 0.1, metalness: 0.3 }), false);
  const mail = [[white, B(0.02, 1.08, 0.42, -0.32, 0, 0)], [white, B(0.02, 1.08, 0.42, 0.32, 0, 0)], [white, B(0.66, 0.03, 0.44, 0, 1.06, 0)], [white, B(0.64, 0.08, 0.4, 0, 0, 0)], [white, B(0.02, 0.98, 0.4, 0, 0.08, 0)], [M(0xe9e9e6), B(0.64, 1.0, 0.01, 0, 0.08, -0.2)]];
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const y = 0.12 + i * 0.155;
    mail.push([white, new THREE.BoxGeometry(0.29, 0.014, 0.38).rotateX(0.12).translate(s * 0.16, y + 0.02, 0)]);
    mail.push([rnd() < 0.3 ? M(0xf2c24a, { roughness: 0.8 }) : paper, new THREE.BoxGeometry(0.21, 0.01, 0.29).rotateX(0.12).translate(s * 0.16 + (rnd() - 0.5) * 0.04, y + 0.04, 0.02)]);
    mail.push([M(0xe25a2a), B(0.12, 0.004, 0.005, s * 0.16, y, 0.19)]);
  }
  place(kit(mail), [{ x: 3.08, z: 0.3 }, { x: 3.76, z: 0.3 }]);
  // 棚の上：こげ茶の出席簿と、水色・ピンクのファイル立て、透明のケース
  const topP = [[M(0xd6dde0, { roughness: 0.1, transparent: true, opacity: 0.5 }), B(0.3, 0.26, 0.24, 2.92, 1.09, 0.3)], [paper, B(0.26, 0.2, 0.18, 2.92, 1.1, 0.3)]];
  let x = 3.12;
  while (x < 4.05) { const r = rnd(); if (r < 0.5) topP.push([M(0x4a2c22, { roughness: 0.7 }), B(0.035, 0.28 + rnd() * 0.04, 0.24, x, 1.09, 0.28).rotateZ(0)]); else topP.push([M(r < 0.78 ? 0x9cc8e8 : 0xf2b9c4, { roughness: 0.6 }), B(0.07, 0.24, 0.22, x, 1.09, 0.29)]); x += 0.045 + rnd() * 0.03; }
  for (const [m, g] of kit(topP)) add([g], m, !m.transparent);
  // 棚の横に立てかけた折りたたみいす
  add([0, 0.06].map((d) => B(0.03, 0.95, 0.4, 2.68 - d, 0, 0.38).rotateZ(0)).map((g, i) => g.rotateX(0).translate(0, 0, 0)), steelG);
}
// 西の壁の時計（配管の右、冷蔵庫の上）
{
  const face = tex(128, 128, (g, w) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, w); g.fillStyle = "#222"; g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), 64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48); } g.lineCap = "round"; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 24, 64 - 14); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 10, 64 + 40); g.stroke(); });
  const clk = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), M(0xffffff, { map: face, roughness: 0.3 })); clk.position.set(0.1, 2.2, 4.35); clk.rotation.y = Math.PI / 2; scene.add(clk);
  add([new THREE.TorusGeometry(0.155, 0.014, 6, 32).rotateY(Math.PI / 2).translate(0.1, 2.2, 4.35)], M(0xb8bcc0, { roughness: 0.3, metalness: 0.7 }));
}

// ---------- くらしの小物（職員室らしさ） ----------
{
  // 机の上：書類トレー、マグカップ、本やファイルの山、付せん、卓上カレンダー。机の下：ごみ箱
  const trayK = kit([[M(0x3c4048, { roughness: 0.5 }), B(0.25, 0.012, 0.34, 0, 0, 0)], [M(0x3c4048, { roughness: 0.5 }), B(0.25, 0.05, 0.01, 0, 0, 0.165)], [M(0x3c4048, { roughness: 0.5 }), B(0.25, 0.05, 0.01, 0, 0, -0.165)], [M(0x3c4048), B(0.25, 0.012, 0.34, 0, 0.07, 0)], [paper, B(0.21, 0.03, 0.29, 0, 0.012, 0)], [paper, B(0.21, 0.02, 0.29, 0, 0.082, 0)]]);
  const mugCols = [0xffffff, 0xd8473a, 0x2f5f9a, 0xe7c34a, 0x5a9a5a];
  const mugKs = mugCols.map((c) => kit([[M(c, { roughness: 0.3 }), C(0.042, 0.095, 0, 0, 0, 14)], [M(c, { roughness: 0.3 }), new THREE.TorusGeometry(0.028, 0.008, 6, 10, Math.PI).rotateZ(-Math.PI / 2).translate(0.045, 0.05, 0)], [M(0x3a2414, { roughness: 0.2 }), C(0.036, 0.004, 0, 0.08, 0, 14)]]));
  const bookCols = [0x2a4f8a, 0x8a2a2a, 0x2f6b47, 0xd9b44a, 0x444444, 0xe8e2d0];
  const bookKs = bookCols.map((c) => kit([[M(c, { roughness: 0.75 }), B(0.21, 0.025, 0.3, 0, 0, 0)], [paper, B(0.2, 0.021, 0.29, 0.006, 0.002, 0)]]));
  const fileBoxK = kit([[M(0x2c5a8a, { roughness: 0.6 }), B(0.1, 0.3, 0.26, 0, 0, 0)], [M(0xc9a85a, { roughness: 0.6 }), B(0.1, 0.3, 0.26, 0.11, 0, 0)], [M(0xd8d8d0), B(0.08, 0.06, 0.005, 0, 0.18, 0.131)], [M(0xd8d8d0), B(0.08, 0.06, 0.005, 0.11, 0.18, 0.131)]]);
  const calK = kit([[M(0xffffff, { roughness: 0.8 }), B(0.18, 0.12, 0.004, 0, 0, 0).rotateX(-0.35)], [M(0xffffff, { roughness: 0.8 }), B(0.18, 0.12, 0.004, 0, 0, 0).rotateX(0.35).translate(0, 0, -0.08)], [M(0xd33, { roughness: 0.6 }), B(0.18, 0.02, 0.004, 0, 0.1, -0.035)]]);
  const noteK = kit([[M(0xf6e36b, { roughness: 0.9 }), B(0.075, 0.003, 0.075, 0, 0, 0)], [M(0xf3a3b8, { roughness: 0.9 }), B(0.075, 0.003, 0.075, 0.09, 0, 0.02)]]);
  const binK = kit([[M(0x8a929a, { roughness: 0.5 }), C(0.13, 0.3, 0, 0, 0, 16)], [M(0x3a3f45), C(0.125, 0.01, 0, 0.28, 0, 16)]]);
  const bagCols = [0x262a30, 0x5a3b2a, 0x2a3a5a];
  const bagKs = bagCols.map((c) => kit([[M(c, { roughness: 0.8 }), R(0.38, 0.28, 0.12, 0, 0, 0, 0.03)], [M(c, { roughness: 0.8 }), new THREE.TorusGeometry(0.09, 0.012, 6, 12, Math.PI).translate(0, 0.28, 0)]]));
  const lists = { tray: [], mug: mugCols.map(() => []), book: bookCols.map(() => []), fileBox: [], cal: [], note: [], bin: [], bag: bagCols.map(() => []) };
  for (const d of desks) {
    const r = d.rot, fx = -Math.sin(r), fz = -Math.cos(r), kx = Math.cos(r), kz = -Math.sin(r);
    const at = (u, w, y = DH, dr = 0) => ({ x: d.x + kx * u - fx * w, z: d.z + kz * u - fz * w, y, rot: r + dr });
    if (rnd() < 0.6) lists.tray.push(at(0.33, -0.15, DH, (rnd() - 0.5) * 0.15));
    if (rnd() < 0.55) lists.mug[(rnd() * mugCols.length) | 0].push(at(0.22 + rnd() * 0.15, 0.12 + rnd() * 0.12, DH, rnd() * 6));
    if (rnd() < 0.65) { const n = 1 + ((rnd() * 4) | 0); for (let i = 0; i < n; i++) lists.book[(rnd() * bookCols.length) | 0].push(at(-0.36, -0.12, DH + i * 0.026, (rnd() - 0.5) * 0.25)); }
    if (rnd() < 0.4) lists.fileBox.push(at(-0.3, -0.22, DH));
    if (rnd() < 0.3) lists.cal.push(at(0.1, -0.24, DH));
    if (rnd() < 0.35) lists.note.push(at(-0.1, 0.22, DH, rnd()));
    if (rnd() < 0.7) lists.bin.push(at(-0.3, -0.05, 0));
    if (rnd() < 0.3) lists.bag[(rnd() * bagCols.length) | 0].push(at(0.05, 0.42, 0, Math.PI / 2 + (rnd() - 0.5) * 0.4));
  }
  // 写真（3年）：机の上の透明な引き出しケース（3段）と、引き出しの名札
  const clearK = kit([[M(0xe8eef0, { roughness: 0.2, transparent: true, opacity: 0.55 }), B(0.36, 0.4, 0.3, 0, 0, 0)], [M(0xd8dee0), B(0.36, 0.01, 0.3, 0, 0.13, 0)], [M(0xd8dee0), B(0.36, 0.01, 0.3, 0, 0.26, 0)], [paper, B(0.28, 0.08, 0.2, 0, 0.02, 0)], [M(0xf1c9d0), B(0.28, 0.06, 0.2, 0, 0.15, 0)]]);
  place(clearK, desks.filter((d) => d.x > 18.5 && rnd() < 0.4).map((d) => { const r = d.rot, fx = -Math.sin(r), fz = -Math.cos(r), kx = Math.cos(r), kz = -Math.sin(r); return { x: d.x + kx * 0.3 + fx * 0.15, z: d.z + kz * 0.3 + fz * 0.15, y: DH, rot: r }; }));
  place(kit([[paper, B(0.12, 0.05, 0.004, 0, 0, 0)]]), desks.map((d) => { const r = d.rot, fx = -Math.sin(r), fz = -Math.cos(r), kx = Math.cos(r), kz = -Math.sin(r); return { x: d.x + kx * (DW / 2 - 0.22) - fx * (DD / 2 - 0.02), z: d.z + kz * (DW / 2 - 0.22) - fz * (DD / 2 - 0.02), y: 0.5, rot: r }; }));
  place(trayK, lists.tray); place(fileBoxK, lists.fileBox); place(calK, lists.cal); place(noteK, lists.note); place(binK, lists.bin);
  mugKs.forEach((k, i) => place(k, lists.mug[i])); bookKs.forEach((k, i) => place(k, lists.book[i])); bagKs.forEach((k, i) => place(k, lists.bag[i]));
}
{
  // 南の窓の下の棚の上の電話（配置図の TEL）と、複合機（コピー機）
  const telK = kit([[M(0xf1f1ee, { roughness: 0.4 }), R(0.2, 0.06, 0.22, 0, 0, 0, 0.015)], [M(0xf1f1ee, { roughness: 0.4 }), R(0.05, 0.04, 0.2, -0.08, 0.06, 0, 0.015)], [M(0x2a2d32), B(0.08, 0.01, 0.06, 0.04, 0.06, 0.03)], [M(0x9bd), B(0.06, 0.004, 0.03, 0.04, 0.062, -0.05)]]);
  place(telK, [2.4, 6.6, 11.7, 13.3, 21.2].map((x) => ({ x, z: 7.08, y: 0.8, rot: Math.PI })));
  // ごみの分別箱（流し台の横）、消火器（ドアの横）、傘立て
  const ext = kit([[M(0xd02a22, { roughness: 0.35 }), C(0.075, 0.48, 0, 0.02, 0, 16)], [M(0x2a2d32), C(0.03, 0.08, 0, 0.5, 0, 10)], [M(0x2a2d32), B(0.04, 0.02, 0.18, 0.02, 0.56, 0.06)], [M(0xe8e4d8), B(0.24, 0.02, 0.24, 0, 0, 0)]]);
  place(ext, [{ x: 0.55, z: 7.05 }, { x: 15.0, z: -0.05 }, { x: 22.95, z: -2.25 }]);
}
{
  // 北の壁：ホワイトボードとはり紙、柱の時間割表
  const board = (x, w, h, y, mat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(x, y + h / 2, 0.085); scene.add(p); add([B(w + 0.05, 0.03, 0.03, x, y - 0.03, 0.09), B(w + 0.05, 0.03, 0.03, x, y + h, 0.09), B(0.03, h + 0.06, 0.03, x - w / 2 - 0.015, y - 0.03, 0.09), B(0.03, h + 0.06, 0.03, x + w / 2 + 0.015, y - 0.03, 0.09)], alu, false); add([B(w, 0.025, 0.07, x, y - 0.04, 0.12)], alu, false); };
  const tt = tex(512, 256, (g, w, h) => { g.fillStyle = "#f7f7f2"; g.fillRect(0, 0, w, h); g.fillStyle = "#123"; g.font = "bold 22px sans-serif"; g.fillText("時間割", 12, 28); g.strokeStyle = "#555"; g.lineWidth = 1; for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(10 + i * 82, 40); g.lineTo(10 + i * 82, h - 8); g.stroke(); } for (let j = 0; j <= 7; j++) { g.beginPath(); g.moveTo(10, 40 + j * 29); g.lineTo(w - 10, 40 + j * 29); g.stroke(); } const sub = ["国", "数", "英", "理", "社", "体", "芸", "家", "情"]; g.font = "15px sans-serif"; for (let i = 1; i < 6; i++) for (let j = 1; j < 7; j++) { g.fillStyle = ["#123", "#a22", "#225"][(i + j) % 3]; g.fillText(sub[(i * 3 + j * 5) % sub.length] + (1 + ((i + j) % 8)), 22 + i * 82, 62 + j * 29); } });
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.4), M(0xffffff, { map: tt, roughness: 0.6 })); p.position.set(4.8, 1.85, 0.495); scene.add(p); } // X8の柱の南の面
  // ---- 写真：北の壁ぞい（X8〜X10）と、共用スペース ----
  const white = M(0xf3f3f0, { roughness: 0.4 });
  // X8の柱の東：白い戸棚の上の壁に、はり紙のあるホワイトボード2枚。柱の東の面に鍵ボックス（各特別教室などの鍵）。下の白い引き違い戸の戸棚2台は、グループ業務のロッカー（グループ①・②）
  const posted = tex(256, 320, (g, w, h) => { g.fillStyle = "#fbfbfa"; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { const x = 10 + (i % 2) * 120 + rnd() * 10, y = 14 + ((i / 2) | 0) * 150 + rnd() * 10; g.fillStyle = "#fff"; g.fillRect(x, y, 100, 135); g.strokeStyle = "#bbb"; g.strokeRect(x, y, 100, 135); g.fillStyle = "rgba(40,40,60,0.55)"; for (let k = 0; k < 16; k++) g.fillRect(x + 6, y + 8 + k * 8, 50 + rnd() * 40, 2); g.fillStyle = ["#d33", "#2a6", "#27c", "#e90"][i]; g.beginPath(); g.arc(x + 50, y + 3, 6, 0, 7); g.fill(); } g.fillStyle = "#2a7fd0"; g.fillRect(140, 4, 70, 8); });
  for (const x of [6.62, 7.44]) board(x, 0.78, 0.95, 1.3, M(0xffffff, { map: posted, roughness: 0.3 }));
  add([B(0.14, 0.62, 0.46, 5.25, 1.35, 0.27)], M(0xe2dcc8, { roughness: 0.6 })); add([B(0.004, 0.32, 0.2, 5.322, 1.5, 0.2)], paper, false); add([B(0.01, 0.6, 0.012, 5.325, 1.36, 0.04)], M(0xb0a890), false);
  // グループ業務のロッカーの見出し（グループ①：管理運営・生活支援・生徒会指導、グループ②：広報研究・学務開発）と、上のデジタルタイマー
  const lab = (t) => M(0xffffff, { map: tex(128, 32, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.strokeStyle = "#888"; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = "#111"; g.font = "bold 20px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, w / 2, h / 2 + 1); }), roughness: 0.6 });
  const fz = 0.38 + 0.245;
  for (const [x, y, t, w] of [[5.98, 1.08, "グループ①", 0.16], [6.18, 0.95, "管理運営", 0.13], [6.12, 0.62, "生活支援", 0.13], [6.1, 0.3, "生徒会指導", 0.15], [6.9, 1.08, "グループ②", 0.16], [7.18, 0.98, "広報研究", 0.13], [7.15, 0.72, "学務開発", 0.13]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), lab(t)); m.position.set(x, y, fz); scene.add(m); }
  // 教科用ロッカー（1年・2年の北の列のうしろ。食事スペースに近い西から教科①〜⑫（⑦〜⑩の中身は未確認）。正面は北）。写真の見出しどおり
  const bz = 1.95 - 0.245;
  for (const [x, n, subj] of [[3.85, "①", ["国語", "数学", "英語"]], [4.77, "②", ["国語", "数学", "英語"]], [5.69, "③", ["社会", "理科", "理科"]], [6.61, "④", ["社会", "音楽", "チョーク"]], [8.65, "⑤", ["国語", "数学", "英語"]], [9.57, "⑥", ["国語", "数学", "英語"]], [10.49, "⑦", []], [11.41, "⑧", []], [13.25, "⑨", []], [14.17, "⑩", []], [15.09, "⑪", ["社会", "理科", "情報"]], [16.01, "⑫", ["社会", "理科", "事務用品"]]]) {
    const put = (px, y, t, w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), lab(t)); m.position.set(px, y, bz); m.rotation.y = Math.PI; scene.add(m); };
    put(x, 1.08, "教科" + n, 0.14);
    subj.forEach((t, k) => put(x - 0.23 + k * 0.03, 0.97 - k * 0.32, t, t.length > 3 ? 0.16 : t.length > 2 ? 0.13 : 0.1));
  }
  add([B(0.2, 0.15, 0.06, 7.25, 1.15, 0.25)], M(0xf3f3f0)); add([B(0.16, 0.08, 0.004, 7.25, 1.19, 0.282)], M(0x1a1a1a, { roughness: 0.2 }), false);
  // 古紙の分別カート（4段。黒い前板に白い名札、キャスター）
  const cart = [[M(0xd9dadb, { roughness: 0.5 }), B(0.5, 0.06, 0.42, 0, 0.05, 0)], [black, C(0.025, 0.05, 0.2, 0, 0.17, 8)], [black, C(0.025, 0.05, -0.2, 0, -0.17, 8)]];
  for (let i = 0; i < 4; i++) { const y = 0.11 + i * 0.24; cart.push([M(0xd9dadb, { roughness: 0.5 }), B(0.5, 0.03, 0.42, 0, y + 0.2, 0)], [M(0xd9dadb), B(0.03, 0.24, 0.42, -0.235, y, 0)], [M(0xd9dadb), B(0.03, 0.24, 0.42, 0.235, y, 0)], [M(0x2a2c30, { roughness: 0.4 }), new THREE.BoxGeometry(0.44, 0.17, 0.01).rotateX(-0.45).translate(0, y + 0.1, 0.19)], [paper, new THREE.BoxGeometry(0.3, 0.035, 0.012).rotateX(-0.45).translate(0, y + 0.13, 0.2)]); }
  place(kit(cart), [{ x: 7.6, z: 0.3 }]);
  // X9の柱：東の面にインターホン（受話器）
  add([B(0.08, 0.26, 0.13, 10.02, 1.25, 0.3), B(0.05, 0.2, 0.05, 10.08, 1.28, 0.28)], M(0xeeeae0, { roughness: 0.4 }));
  // X9〜X10：枠つきのくぼみ（上に欄間）に「予定表」のホワイトボード。前に白い棚（青い薄型の引き出し・小物の引き出しケース）とごみ箱
  const plan = tex(512, 288, (g, w, h) => {
    g.fillStyle = "#fbfbf9"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; g.font = "bold 20px sans-serif"; g.fillText("予 定 表", 200, 22);
    g.strokeStyle = "#333"; g.lineWidth = 1; g.font = "bold 13px sans-serif";
    for (let c = 0; c < 2; c++) { const x0 = 8 + c * 252; g.fillText("日曜", x0 + 20, 42); g.fillText("記 事", x0 + 110, 42); for (let r = 0; r < 16; r++) { const y = 48 + r * 14.8; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 244, y); g.stroke(); const d = c * 16 + r + 1; if (d <= 31) g.fillText(String(d), x0 + 222, y + 12); } g.beginPath(); g.moveTo(x0 + 40, 30); g.lineTo(x0 + 40, h - 4); g.stroke(); }
    for (let i = 0; i < 5; i++) { const x = 30 + rnd() * 420, y = 40 + rnd() * 160; g.fillStyle = "#fff"; g.fillRect(x, y, 48, 66); g.strokeStyle = "#999"; g.strokeRect(x, y, 48, 66); g.fillStyle = "rgba(40,40,60,0.5)"; for (let k = 0; k < 8; k++) g.fillRect(x + 4, y + 6 + k * 7, 24 + rnd() * 16, 2); }
    for (let i = 0; i < 12; i++) { g.fillStyle = ["#e33", "#27c", "#ec2", "#3a5"][i % 4]; g.beginPath(); g.arc(470 + (i % 2) * 18, 30 + i * 18, 6, 0, 7); g.fill(); }
  });
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.98), M(0xffffff, { map: plan, roughness: 0.3 })); p.position.set(10.92, 1.62, 0.1); scene.add(p); }
  add([B(1.78, 0.03, 0.03, 10.92, 1.11, 0.1), B(1.78, 0.03, 0.03, 10.92, 2.11, 0.1), B(0.03, 1.03, 0.03, 10.04, 1.11, 0.1), B(0.03, 1.03, 0.03, 11.8, 1.11, 0.1)], alu, false);
  add([B(0.08, 1.75, 0.05, 9.98, 0.95, 0.09), B(0.08, 1.75, 0.05, 11.86, 0.95, 0.09), B(1.96, 0.05, 0.05, 10.92, 2.66, 0.09), B(1.96, 0.06, 0.05, 10.92, 2.12, 0.09), B(0.04, 0.5, 0.04, 10.92, 2.16, 0.1)], M(0xd8c3a3, { roughness: 0.6 }), false);
  add([B(1.86, 0.5, 0.01, 10.92, 2.16, 0.08)], M(0x55606a, { roughness: 0.1, metalness: 0.3 }), false);
  const trays = tex(64, 256, (g, w, h) => { g.fillStyle = "#2e6fa6"; g.fillRect(0, 0, w, h); for (let i = 0; i < 22; i++) { const y = i * (h / 22); g.fillStyle = "rgba(255,255,255,0.75)"; g.fillRect(0, y, w, 1.5); g.fillStyle = ["#e04040", "#f4f4f4", "#3cae5a"][i % 3]; g.fillRect(w * 0.55, y + 3, 10, 4); } });
  const ds = [[white, B(1.3, 0.02, 0.38, 0, 0.98, 0)], [white, B(1.3, 0.05, 0.38, 0, 0, 0)], [white, B(0.02, 1.0, 0.38, -0.64, 0, 0)], [white, B(0.02, 1.0, 0.38, 0.64, 0, 0)], [white, B(0.02, 0.95, 0.36, -0.2, 0.03, 0)], [white, B(1.28, 0.95, 0.01, 0, 0.03, -0.185)]];
  for (const y of [0.33, 0.66]) ds.push([white, B(0.82, 0.02, 0.36, 0.22, y, 0)]);
  for (const [x, y] of [[0.05, 0.68], [0.3, 0.68], [0.05, 0.36], [0.3, 0.36]]) ds.push([M(0xe8e0c8, { roughness: 0.4 }), B(0.22, 0.28, 0.3, x, y, 0)], [M(0xc8c0a8), B(0.18, 0.004, 0.01, x, y + 0.12, 0.15)], [M(0xc8c0a8), B(0.18, 0.004, 0.01, x, y + 0.2, 0.15)]);
  ds.push([M(0xf1d64a, { roughness: 0.7 }), B(0.4, 0.25, 0.3, 0.1, 0.05, 0)], [M(0xf4f4f0, { roughness: 0.3 }), B(0.36, 0.15, 0.3, 0.48, 0.05, 0.02)]);
  ds.push([M(0xf3b6c4, { roughness: 0.8 }), B(0.3, 0.01, 0.22, 0.05, 1.0, 0.05).rotateY(0.1)], [M(0xd9c08e, { roughness: 0.8 }), B(0.32, 0.01, 0.24, 0.3, 1.0, 0.02)], [black, C(0.025, 0.25, 0.42, 1.03, 0.1, 10).rotateZ(Math.PI / 2).translate(0, 0, 0)]);
  place(kit(ds), [{ x: 10.72, z: 0.27 }]);
  for (const dx of [-0.42, -0.2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.92), M(0xffffff, { map: trays, roughness: 0.4 })); p.position.set(10.72 + dx + 0.11, 0.51, 0.27 + 0.192); scene.add(p); }
  // ごみ箱（燃えるごみ：灰色、プラスチック：半透明の黄色）
  const binR = kit([[M(0xb8bcc0, { roughness: 0.5 }), B(0.3, 0.6, 0.36, 0, 0, 0)], [M(0xf6f6f6, { roughness: 0.8 }), B(0.31, 0.05, 0.37, 0, 0.58, 0)], [M(0xe5452a), B(0.08, 0.2, 0.004, 0, 0.12, 0.181)]]);
  const binY = kit([[M(0xf2e9a0, { roughness: 0.4, transparent: true, opacity: 0.75 }), B(0.32, 0.62, 0.38, 0, 0, 0)], [M(0xf0d23a), B(0.06, 0.3, 0.004, 0, 0.1, 0.191)]]);
  place(binR, [{ x: 11.55, z: 0.3 }]); place(binY, [{ x: 11.9, z: 0.32 }]);

  // 共用スペース（写真）：白い個人ロッカー（2列×4段、名札とダイヤル錠、郵便受けのすき間）、白い丸い立ち机と丸いすつ4つ、すみの棚
  const lk = [[white, B(0.9, 1.78, 0.5, 0, 0.02, 0)], [M(0xe9e9e6), B(0.9, 0.04, 0.48, 0, 0, 0)]];
  for (let r = 0; r < 4; r++) for (const c of [-1, 1]) { const y = 0.1 + r * 0.42, x = c * 0.222; lk.push([M(0xfafaf8, { roughness: 0.35 }), B(0.43, 0.4, 0.012, x, y, 0.256)], [black, B(0.26, 0.025, 0.01, x - 0.04, y + 0.32, 0.263)], [M(0xd8d8d4), B(0.035, 0.09, 0.02, x + 0.15, y + 0.15, 0.266)], [paper, B(0.07, 0.035, 0.004, x + 0.15, y + 0.28, 0.263)]); }
  for (let r = 0; r < 4; r += 2) lk.push([M(0xc89ac8, { roughness: 0.8 }), B(0.16, 0.05, 0.02, -0.15, 0.1 + r * 0.42 + 0.34, 0.27)]);
  const lockerKit = kit(lk);
  const lockers = [{ x: 14.73, z: -0.65, rot: Math.PI / 2 }, ...[17.05, 17.95, 20.05, 20.95, 21.85].map((x) => ({ x, z: -2.17, rot: 0 }))];
  place(lockerKit, lockers);
  const rt = [[white, C(0.45, 0.025, 0, 1.0, 0, 32)], [white, C(0.035, 1.0, 0, 0, 0, 12)], [white, B(0.9, 0.025, 0.06, 0, 0.005, 0).rotateY(0.6)], [white, B(0.9, 0.025, 0.06, 0, 0.005, 0).rotateY(0.6 + Math.PI / 2)]];
  for (const [m, g] of kit(rt)) { const mesh = new THREE.Mesh(g, m); mesh.position.set(16.0, 0, -1.15); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
  const stool = (col) => kit([[M(col, { roughness: 0.95 }), R(0.38, 0.07, 0.38, 0, 0.64, 0, 0.03)], [white, new THREE.TorusGeometry(0.17, 0.008, 6, 20).rotateX(Math.PI / 2).translate(0, 0.25, 0)], ...[0, 1, 2, 3].map((k) => [white, C(0.009, 0.66, Math.cos(k * 1.57 + 0.78) * 0.15, 0, Math.sin(k * 1.57 + 0.78) * 0.15, 6)])]);
  const sp = (a) => ({ x: 16.0 + Math.cos(a) * 0.52, z: -1.15 + Math.sin(a) * 0.52 });
  place(stool(0x4a7aa6), [sp(-2.4), sp(0.75)]); place(stool(0xd8714a), [sp(-0.75), sp(2.4)]);
  // すみの木の棚（B4の紙の箱、トイレットペーパー）と、更衣室の入口の奥（グレーのロッカー）
  const cs = [[M(0x9a6a3a, { roughness: 0.6 }), B(0.5, 0.75, 0.32, 14.85, 0, -2.25)], [M(0x5a3b20), B(0.46, 0.3, 0.3, 14.85, 0.05, -2.24)], [M(0xc49a62, { roughness: 0.6 }), B(0.45, 0.42, 0.32, 15.35, 0, -2.25)], [M(0x4f9fd0, { roughness: 0.6 }), B(0.42, 0.26, 0.3, 14.85, 0.75, -2.25)], [M(0x4f9fd0, { roughness: 0.6 }), B(0.4, 0.26, 0.3, 15.35, 0.42, -2.25)], [M(0xc8c0a8, { roughness: 0.5 }), B(0.38, 0.22, 0.28, 14.85, 1.01, -2.25)]];
  for (let i = 0; i < 4; i++) cs.push([M(0xf2f5ee, { roughness: 0.6 }), C(0.06, 0.38, 15.25 + (i % 2) * 0.14, 0.42 + ((i / 2) | 0) * 0.0, -2.0 + ((i / 2) | 0) * 0.13, 12)]);
  for (const [m, g] of kit(cs)) add([g], m);
  // 壁のコンセント・スイッチ、エアコン（壁かけ）、天井の火災報知器とスプリンクラー
  const plate = M(0xf4f4f0, { roughness: 0.4 });
  add([2.6, 5.6, 9.0, 13.9].map((x) => B(0.07, 0.12, 0.01, x, 0.3, 0.08)).concat([0.7, 7.7].map((x) => B(0.07, 0.12, 0.01, x, 1.2, 0.08))), plate, false);
  const ac = (x, z, ry) => { const g = [R(0.9, 0.3, 0.24, 0, 0, 0, 0.04)]; const m = new THREE.Mesh(mergeGeometries(g.map((q) => q.toNonIndexed())), M(0xf3f3ef, { roughness: 0.4 })); m.position.set(x, 2.45, z); m.rotation.y = ry; m.castShadow = true; scene.add(m); const v = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.01), M(0x8a8f95)); v.position.set(0, 0.04, 0.125); m.add(v); };
  const det = [], spr = [];
  for (let x = 2.4; x < 24; x += 4.8) for (const z of [2.6, 5.4]) { det.push(C(0.06, 0.035, x, CEIL - 0.035, z, 16)); spr.push(C(0.02, 0.05, x + 1.2, CEIL - 0.05, z + 0.6, 8)); }
  ceiling.add(new THREE.Mesh(mergeGeometries(det.map((g) => g.toNonIndexed())), M(0xf6f6f3)));
  ceiling.add(new THREE.Mesh(mergeGeometries(spr.map((g) => g.toNonIndexed())), chrome));
  // 幅木（壁の下のふちの、こげ茶の帯）
  const bb = M(0x8a909c, { roughness: 0.5 }); // 写真：床のふちの灰青色のゴムの幅木
  add([B(14.4, 0.08, 0.015, 7.2, 0, 0.085), B(9.6, 0.08, 0.015, 19.2, 0, -2.415), B(0.015, 0.08, 7.4, 0.085, 0, 3.7), B(0.015, 0.08, 9.9, 23.915, 0, 2.45), B(24, 0.08, 0.015, 12, 0, 7.315)], bb, false);
}

// ---------- 印刷室（職員室の西どなり。写真） ----------
// x -4.8〜0（東の壁は職員室との境。北のはしに入口）、z 0（北の壁・廊下側）〜7.4（南の窓）
// 北の壁：廊下への木の開き戸（上に欄間）・灰色のロッカー・金属の棚・緑の鉄の棚。西の壁：灰色の書庫2台・白い棚・緑の作業台・充電保管庫2台・机
// 東の壁：ファイルキャビネット・赤いトナーの箱・白い長机（スキャナー）・木の板・黒いガラス戸の棚。まんなか：大きなコピー機・印刷機（リソグラフ）3台・丁合機
{
  const PX0 = -4.8, PX1 = 0, PZ0 = 0, PZ1 = 7.4;
  const cache = new Map(), mm = (c, o = {}) => { const k = c + JSON.stringify(o); if (!cache.has(k)) cache.set(k, M(c, o)); return cache.get(k); };
  const beige = mm(0xcfc4ab, { roughness: 0.85 }), whiteW = M(0xe8e7e2, { roughness: 0.95, map: tex(128, 128, (g, w, h) => { g.fillStyle = "#e9e8e3"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,118,110,${rnd() * 0.12})`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); } }, 4, 2) });
  // 壁（下 1.25m はベージュ、上は白いザラザラの壁）
  const pw = { H: 1.25, lo: beige, hi: whiteW };
  wall(PX0, PZ0, PX1 - 0.075, PZ0, [[PX1 - 0.075 - PX0 - 0.95, PX1 - 0.075 - PX0 - 0.08, 0, 2.05], [PX0 + 1.85 - PX0, PX1 - 0.075 - PX0 - 0.02, 2.12, 2.72]], 0.15, pw); // 北：廊下への戸と欄間
  wall(PX0, PZ0, PX0, PZ1, [], 0.15, pw);                                   // 西
  wall(PX0, PZ1, PX1 - 0.075, PZ1, [[0.5, 4.3, 0.85, 2.55]], 0.15, pw);   // 南：窓
  wall(PX1 - 0.085, PZ0, PX1 - 0.085, PZ1, [[0.45, 1.35, 0, 2.05]], 0.02, pw); // 職員室との境の壁の、印刷室がわの面
  // 床：灰色がかったコンクリート（しみ・汚れ）
  const fl = tex(256, 256, (g, w, h) => { g.fillStyle = "#b8b1a2"; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 40; const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, "rgba(70,60,48,0.35)"); gr.addColorStop(1, "rgba(70,60,48,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "60,50,40"},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } }, 2, 3);
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0).rotateX(-Math.PI / 2).translate((PX0 + PX1) / 2, 0.001, (PZ0 + PZ1) / 2), M(0xffffff, { map: fl, roughness: 0.7 })); f.receiveShadow = true; scene.add(f); }
  // 天井と蛍光灯、天井ぞいの白い配管（上から見るときは消す）
  ceiling.add(new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0).rotateX(Math.PI / 2).translate((PX0 + PX1) / 2, CEIL, (PZ0 + PZ1) / 2), M(0xecebe6, { roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.3 })));
  const pipes = [C(0.06, PX1 - PX0, 0, 0, 0, 10).rotateZ(Math.PI / 2).translate((PX0 + PX1) / 2, 2.7, 0.2), C(0.045, PX1 - PX0, 0, 0, 0, 10).rotateZ(Math.PI / 2).translate((PX0 + PX1) / 2, 2.58, 0.25), C(0.05, PZ1, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(-0.25, 2.72, PZ1 / 2), C(0.055, CEIL, -0.2, 0, 0.18, 10)];
  ceiling.add(new THREE.Mesh(mergeGeometries(pipes.map((q) => q.toNonIndexed())), M(0xf2f2ee, { roughness: 0.4 })));
  for (const z of [2.2, 5.0]) { ceiling.add(new THREE.Mesh(B(0.2, 0.06, 1.25, -2.4, CEIL - 0.06, z), M(0xf4f4f2))); ceiling.add(new THREE.Mesh(B(0.12, 0.03, 1.2, -2.4, CEIL - 0.09, z), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }))); }
  { const l = new THREE.RectAreaLight(0xfff4e6, 0.9, 3.4, 5.6); l.position.set(-2.4, 2.84, 3.7); l.lookAt(-2.4, 0, 3.7); scene.add(l); }

  const P = [];
  const at = (parts, x, z, r = 0) => { for (const [m, g] of parts) P.push([m, g.clone().rotateY(r).translate(x, 0, z)]); };
  const wM = mm(0xf3f3f0, { roughness: 0.4 }), dark = mm(0x2a2c30, { roughness: 0.5 }), blueP = mm(0x2a8fd8, { roughness: 0.4 }), panel = mm(0x1b2a38, { roughness: 0.2, emissive: 0x0e2233, emissiveIntensity: 0.6 });
  const cardb = mm(0xb68a58, { roughness: 0.9 }), okiY = mm(0xd9a52a, { roughness: 0.7 }), grayCab = mm(0xbdb8a6, { roughness: 0.6 }), greenSt = mm(0x6f9a86, { roughness: 0.5, metalness: 0.2 });
  // 印刷機（リソグラフ）：正面は北（-z）。白い台（中に箱）、本体、上のふた、操作パネル、東に黒い排紙台（青い留め具）、西に給紙台
  // 印刷機（リソグラフ。写真）：正面は北（-z）。キャスターつきの白い台（前があいていて箱が入っている）、角の丸い本体、上の原稿台とふた、
  // 右前の操作パネル（画面・テンキー・青とピンクの丸いボタン）、東に黒い排紙台（すのこの囲いと青い留め具）、西に給紙台（青いつまみ）
  // 部品を、その部品の中心のまわりで回す
  const LR = (g, ax, ang) => { g.computeBoundingBox(); const c = new THREE.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z); if (ax === "X") g.rotateX(ang); else g.rotateZ(ang); return g.translate(c.x, c.y, c.z); };
  const lightG = mm(0xe6e6e1, { roughness: 0.45 }), grayT = mm(0x55595e, { roughness: 0.5 }), keyG = mm(0xc9cbc8), pink = mm(0xe2589a, { roughness: 0.4 });
  const riso = [
    [wM, B(0.8, 0.03, 0.66, 0, 0.36, 0)], [wM, B(0.03, 0.36, 0.66, -0.385, 0.02, 0)], [wM, B(0.03, 0.36, 0.66, 0.385, 0.02, 0)], [wM, B(0.8, 0.36, 0.02, 0, 0.02, 0.32)], [wM, B(0.8, 0.03, 0.66, 0, 0.02, 0)],
    [cardb, B(0.3, 0.28, 0.5, -0.17, 0.05, 0.03)], [cardb, B(0.3, 0.28, 0.5, 0.17, 0.05, 0.03)], [mm(0xf0f0f0), C(0.07, 0.3, -0.25, 0.05, -0.2, 12)],
    ...[-0.33, 0.33].flatMap((x) => [-0.28, 0.28].map((z) => [dark, LR(C(0.03, 0.025, x, 0, z, 8), "Z", Math.PI / 2)])),
    [wM, R(0.86, 0.56, 0.7, 0, 0.39, 0, 0.03)], [lightG, B(0.42, 0.44, 0.006, 0.17, 0.43, -0.352)], [mm(0x30323a), B(0.12, 0.03, 0.004, 0.17, 0.75, -0.356)],
    [mm(0x8ac6a8), LR(C(0.05, 0.004, -0.33, 0.47, -0.354, 16), "X", Math.PI / 2)], [mm(0x3aa070), B(0.12, 0.05, 0.004, -0.33, 0.55, -0.354)],
    [wM, R(0.96, 0.14, 0.72, 0.03, 0.94, 0, 0.03)], [lightG, R(0.86, 0.05, 0.6, 0.02, 1.08, 0.02, 0.02)], [lightG, LR(B(0.5, 0.03, 0.25, -0.05, 1.12, 0.06), "X", 0.08)], [mm(0xdcdcd6), B(0.6, 0.01, 0.03, 0.05, 1.13, -0.08)],
    [lightG, LR(B(0.46, 0.05, 0.2, 0.2, 1.0, -0.42), "X", -0.35)], [panel, LR(B(0.15, 0.006, 0.09, 0.07, 1.05, -0.43), "X", -0.35)], [keyG, LR(B(0.11, 0.006, 0.09, 0.24, 1.05, -0.43), "X", -0.35)],
    [blueP, LR(C(0.022, 0.012, 0.35, 1.04, -0.45, 12), "X", -0.35)], [pink, LR(C(0.022, 0.012, 0.39, 1.045, -0.42, 12), "X", -0.35)], [mm(0x6a9ad0), LR(C(0.015, 0.012, 0.33, 1.05, -0.39, 10), "X", -0.35)],
    [blueP, B(0.006, 0.18, 0.32, 0.433, 0.6, -0.05)], [mm(0x9aa0a6), B(0.006, 0.25, 0.4, 0.434, 0.45, 0.05)],
    // 排紙台（東）
    [grayT, LR(B(0.5, 0.02, 0.44, 0.72, 0.62, 0), "Z", -0.12)], [dark, B(0.5, 0.03, 0.04, 0.72, 0.6, -0.22)], [dark, B(0.5, 0.03, 0.04, 0.72, 0.6, 0.22)],
    ...[0, 1, 2, 3, 4].flatMap((k) => [[dark, B(0.02, 0.32, 0.025, 0.52 + k * 0.08, 0.64, -0.2)], [dark, B(0.02, 0.32, 0.025, 0.52 + k * 0.08, 0.64, 0.2)]]),
    [dark, B(0.42, 0.025, 0.025, 0.68, 0.94, -0.2)], [dark, B(0.42, 0.025, 0.025, 0.68, 0.94, 0.2)], [dark, B(0.025, 0.32, 0.4, 0.93, 0.62, 0)],
    [blueP, B(0.04, 0.12, 0.05, 0.6, 0.76, -0.2)], [blueP, B(0.04, 0.12, 0.05, 0.6, 0.76, 0.2)], [blueP, LR(C(0.03, 0.03, 0.93, 0.7, 0, 10), "Z", Math.PI / 2)],
    // 給紙台（西）
    [grayT, LR(B(0.42, 0.02, 0.42, -0.65, 0.66, 0), "Z", 0.15)], [dark, B(0.02, 0.06, 0.4, -0.85, 0.7, 0)], [grayT, LR(B(0.02, 0.25, 0.03, -0.75, 0.42, -0.15), "Z", 0.4)],
    [blueP, B(0.04, 0.06, 0.05, -0.62, 0.7, -0.17)], [blueP, B(0.04, 0.06, 0.05, -0.62, 0.7, 0.17)], [blueP, LR(C(0.03, 0.03, -0.45, 0.62, -0.32, 10), "X", Math.PI / 2)],
  ];
  at(riso, -2.75, 2.95); at(riso, -2.75, 4.05); at(riso, -3.2, 5.6);
  // 大きなコピー機（FUJIFILM）とフィニッシャー：正面は南
  // 複合機（FUJIFILM Apeos。写真）：正面は南。白い本体、前に給紙トレイ3段（取っ手）、上に黒い原稿送り（ADF）、右前に腕の先の大きなタッチパネル、
  // 東にフィニッシャー（排紙トレイ2枚）。北の棚との間はあけてある
  const copier = [[wM, R(0.68, 0.95, 0.7, 0, 0.04, 0, 0.02)], ...[-0.3, 0.3].flatMap((x) => [-0.3, 0.3].map((z) => [dark, C(0.03, 0.04, x, 0, z, 8)])),
    ...[0.12, 0.38, 0.62].flatMap((y) => [[mm(0xd6d6d2), B(0.66, 0.004, 0.01, 0, y, 0.352)], [mm(0xcfd0cc), B(0.18, 0.05, 0.02, 0, y + 0.1, 0.36)]]),
    [dark, R(0.68, 0.13, 0.62, 0, 0.99, -0.03, 0.02)], [mm(0x3a3d42), B(0.62, 0.03, 0.4, 0, 1.12, -0.06)], [mm(0xe9e9e5), LR(B(0.4, 0.08, 0.3, 0.08, 1.14, 0.0), "X", -0.12)], [mm(0xdadad6), LR(B(0.3, 0.02, 0.22, -0.12, 1.24, -0.05), "Z", 0.2)],
    [mm(0x2a2c30), B(0.03, 0.03, 0.25, 0.26, 1.0, 0.36)], [dark, LR(B(0.36, 0.025, 0.24, 0.2, 1.07, 0.47), "X", -0.6)], [panel, LR(B(0.32, 0.006, 0.2, 0.2, 1.09, 0.475), "X", -0.6)],
    [mm(0x6a8fd8), B(0.16, 0.06, 0.004, -0.18, 0.8, 0.352)], [mm(0x9aa0a6), B(0.12, 0.03, 0.004, -0.22, 0.9, 0.352)],
    [wM, R(0.48, 1.05, 0.6, 0.6, 0.04, 0, 0.02)], [mm(0xa8aeb2), LR(B(0.32, 0.02, 0.32, 0.92, 0.85, 0), "Z", -0.2)], [mm(0xa8aeb2), LR(B(0.32, 0.02, 0.32, 0.92, 0.55, 0), "Z", -0.2)], [mm(0xd6d6d2), B(0.004, 0.6, 0.4, 0.84, 0.25, 0)]];
  at(copier, -2.3, 1.9, Math.PI / 2); // 写真：入口から見て右手前。タッチパネルの正面は東（通路）を向く
  // 丁合機（白い塔に青い棚がたくさん）と、電動の裁断機の机（写真：入口から見て左奥。下に「マスター A3機用」の箱）
  const coll = [[wM, B(0.6, 0.45, 0.62, 0, 0, 0)], [mm(0xe9e9e4), B(0.34, 1.35, 0.45, -0.1, 0.45, 0)], [panel, B(0.02, 0.2, 0.15, -0.28, 1.5, 0)]];
  for (let i = 0; i < 10; i++) coll.push([mm(0x5aa2b8, { roughness: 0.4 }), B(0.42, 0.012, 0.3, 0.2, 0.55 + i * 0.12, 0).rotateZ(0.12)]);
  coll.push([paper, B(0.3, 0.15, 0.004, 0, 0.15, 0.312)]);
  at(coll, -2.2, 6.75);
  at([[mm(0xe2e2dc), B(0.8, 0.03, 0.5, 0, 0.72, 0)], [dark, B(0.03, 0.72, 0.03, -0.37, 0, -0.22)], [dark, B(0.03, 0.72, 0.03, 0.37, 0, -0.22)], [dark, B(0.03, 0.72, 0.03, -0.37, 0, 0.22)], [dark, B(0.03, 0.72, 0.03, 0.37, 0, 0.22)],
    [wM, R(0.62, 0.34, 0.46, 0, 0.75, 0, 0.02)], [mm(0x2a2c30, { roughness: 0.15 }), B(0.46, 0.14, 0.006, -0.03, 0.88, -0.232)], [mm(0xdcdcd6), B(0.6, 0.06, 0.42, 0, 1.09, 0)], [blueP, C(0.04, 0.04, 0.27, 0.95, -0.24, 12).rotateX(Math.PI / 2).translate(0, 0, 0)], [mm(0xb8bcc0, { metalness: 0.6 }), B(0.5, 0.02, 0.1, -0.03, 0.8, -0.27)], [cardb, B(0.32, 0.4, 0.36, -0.18, 0, 0)], [cardb, B(0.32, 0.4, 0.36, 0.18, 0, 0)], [paper, B(0.35, 0.15, 0.004, 0, 0.5, -0.25)]], -1.25, 6.85);
  // 東の壁ぞい：赤いトナーの箱（入口のとなり）、95番ロッカー（白い4段のキャビネット。教科・学年の取り扱い注意のものを保管。上から教科・学年・…・管理職限定）、白い長机2台（スキャナー3台・ノートパソコン）、木の板、黒いガラス戸の棚
  const red = mm(0xc8282a, { roughness: 0.7 });
  for (let i = 0; i < 4; i++) P.push([red, B(0.34, 0.3, 0.32, -0.26, i * 0.3, 1.53)]);
  for (let i = 0; i < 3; i++) P.push([red, B(0.34, 0.3, 0.32, -0.62, i * 0.3, 1.53)]);
  const fc = [[wM, B(0.62, 1.33, 0.47, 0, 0, 0)], [mm(0xbfe0f4, { roughness: 0.8 }), B(0.004, 0.32, 0.45, 0.29, 1.33, 0)], [mm(0xe8e8e2), B(0.38, 0.02, 0.4, 0.05, 1.33, 0)], [mm(0xb8bcbe, { metalness: 0.6 }), C(0.02, 0.01, -0.2, 1.3, -0.236, 8).rotateX(Math.PI / 2)]];
  for (let i = 0; i < 4; i++) { const y = 0.08 + i * 0.31; fc.push([mm(0xeeeeea), B(0.006, 0.29, 0.43, -0.312, y, 0)], [mm(0xe4e2d8), B(0.03, 0.06, 0.2, -0.325, y + 0.17, 0)], [paper, B(0.004, 0.03, 0.1, -0.342, y + 0.2, 0)]); }
  at(fc, -0.39, 1.98);
  const tbl = [[mm(0xe3e3dd, { roughness: 0.5 }), B(0.75, 0.03, 1.6, 0, 0.7, 0)], [dark, B(0.77, 0.04, 1.62, 0, 0.66, 0)], [dark, B(0.04, 0.66, 0.06, 0.1, 0, -0.7)], [dark, B(0.04, 0.66, 0.06, 0.1, 0, 0.7)], [dark, B(0.5, 0.04, 0.06, 0.1, 0, -0.7)], [dark, B(0.5, 0.04, 0.06, 0.1, 0, 0.7)]];
  at(tbl, -0.45, 3.1); at(tbl, -0.45, 4.72);
  const scan = [[mm(0xefeee8, { roughness: 0.4 }), R(0.3, 0.17, 0.24, 0, 0.73, 0, 0.02)], [dark, B(0.26, 0.04, 0.12, 0, 0.9, 0.04).rotateX(0.3)]];
  for (const z of [3.2, 3.75, 4.3]) at(scan, -0.4, z, Math.PI / 2);
  for (const z of [2.6, 4.95]) at([[dark, B(0.33, 0.02, 0.23, 0, 0.73, 0)]], -0.55, z, 0.2);
  const blkChair = kit(chairParts.map(([m, g]) => [m === chairFab ? mm(0x1d1f22, { roughness: 0.9 }) : m, g.clone()]));
  place(blkChair, [{ x: -1.05, z: 3.4, rot: Math.PI / 2 + 0.2 }, { x: -1.05, z: 4.6, rot: Math.PI / 2 - 0.1 }]);
  at([[mm(0x9a6a40, { roughness: 0.6 }), B(0.72, 1.3, 0.035, 0, 0, 0)], [mm(0xf1e98a), B(0.45, 0.25, 0.3, 0.05, 1.3, 0.05)]], -0.46, 5.66);
  at([[mm(0xe2e2dc), B(0.6, 1.25, 0.62, 0, 0, 0)], [mm(0x1a1c20, { roughness: 0.1 }), B(0.5, 0.95, 0.01, 0, 0.18, -0.31)]], -0.42, 6.85, Math.PI / 2);
  // 西の壁ぞい：テストロッカー2台（テスト保管用。91・92。上にテスト保存ファイル）、白い棚、緑の作業台、充電保管庫2台（上にプリンター）、窓ぎわの机（モノクロプリンター）
  for (const [z, lbl] of [[0.6, "91"], [1.52, "92"]]) {
    at([[grayCab, B(0.45, 1.8, 0.9, 0, 0, 0)], [mm(0xa9a492), B(0.004, 1.7, 0.004, 0.226, 0.05, 0)], [mm(0xc9c4b2), B(0.03, 0.12, 0.05, 0.24, 0.9, -0.08)], [mm(0xc9c4b2), B(0.03, 0.12, 0.05, 0.24, 0.9, 0.08)], [mm(0x3f7fd0), B(0.004, 0.05, 0.8, 0.226, 1.72, 0)], [paper, B(0.004, 0.3, 0.22, 0.228, 1.1, -0.22)], [paper, B(0.004, 0.25, 0.2, 0.228, 1.2, 0.22)]], PX0 + 0.3, z);
  }
  for (let i = 0; i < 14; i++) P.push([i % 3 ? wM : mm(0x2f62b8), B(0.3, 0.32, 0.07, PX0 + 0.35, 1.8, 0.25 + i * 0.1)]);
  P.push([cardb, B(0.4, 0.12, 0.7, PX0 + 0.3, 1.8, 0.45).rotateZ(0.05)]);
  at([[wM, B(0.4, 1.5, 0.02, 0, 0, -0.29)], [wM, B(0.4, 1.5, 0.02, 0, 0, 0.29)], [wM, B(0.02, 1.5, 0.6, -0.19, 0, 0)], ...[0.02, 0.4, 0.75, 1.1, 1.48].map((y) => [wM, B(0.4, 0.02, 0.6, 0, y, 0)]), [mm(0xd8d1b8), B(0.3, 0.2, 0.45, 0, 0.42, 0)], [mm(0xe0a050), B(0.35, 0.12, 0.5, 0, 1.5, 0)]], PX0 + 0.3, 2.35);
  // 緑の作業台（写真）：上に裁断機（白い台・黒い刃の枠・銀色の長いレバーと青い握り・青い定規）、黒い大きな穴あけパンチ（レバーつき）、
  // 青いトレー、白い小さな機械、ペン立て。下にインクの箱、青いごみ箱
  const silver = mm(0xc8ccd0, { roughness: 0.25, metalness: 0.8 });
  const bench = [[greenSt, B(0.7, 0.04, 1.8, 0, 0.72, 0)], [greenSt, B(0.05, 0.72, 0.05, -0.3, 0, -0.85)], [greenSt, B(0.05, 0.72, 0.05, 0.3, 0, -0.85)], [greenSt, B(0.05, 0.72, 0.05, -0.3, 0, 0.85)], [greenSt, B(0.05, 0.72, 0.05, 0.3, 0, 0.85)], [greenSt, B(0.6, 0.03, 1.7, 0, 0.12, 0)],
    // 裁断機
    [wM, R(0.42, 0.07, 0.5, 0.05, 0.76, -0.55, 0.01)], [mm(0xdcdcd6), B(0.36, 0.004, 0.42, 0.05, 0.83, -0.55)], [blueP, B(0.03, 0.03, 0.42, 0.24, 0.83, -0.55)], [blueP, B(0.3, 0.025, 0.03, 0.05, 0.83, -0.33)],
    [dark, B(0.04, 0.3, 0.04, -0.13, 0.83, -0.78)], [dark, B(0.04, 0.3, 0.04, 0.23, 0.83, -0.78)], [dark, B(0.4, 0.05, 0.06, 0.05, 1.08, -0.78)], [silver, B(0.38, 0.04, 0.02, 0.05, 0.86, -0.76)],
    [silver, B(0.035, 0.035, 0.62, 0, 0, 0.31).rotateX(-0.75).translate(0.2, 1.1, -0.78)], [blueP, C(0.025, 0.14, 0, 0, 0, 10).rotateX(Math.PI / 2 - 0.75).translate(0.2, 1.53, -0.36)],
    // 大きな穴あけパンチ（黒）
    [dark, B(0.22, 0.12, 0.3, -0.12, 0.76, -0.02)], [dark, B(0.16, 0.18, 0.12, -0.12, 0.88, -0.1)], [dark, B(0.03, 0.03, 0.4, 0, 0, 0.2).rotateX(-1.0).translate(-0.12, 1.05, -0.12)], [silver, C(0.02, 0.12, -0.12, 0.85, 0.08, 10)],
    [mm(0x2f62b8), B(0.25, 0.04, 0.2, 0.15, 0.76, 0.2)], [wM, B(0.25, 0.18, 0.25, 0.05, 0.76, 0.55)], [mm(0xdfe6ea, { transparent: true, opacity: 0.8 }), C(0.05, 0.12, 0.2, 0.76, 0.75, 10)],
    [cardb, B(0.35, 0.35, 0.45, 0.05, 0.15, -0.5)], [cardb, B(0.35, 0.35, 0.45, 0.05, 0.15, 0.0)], [mm(0x5b8fd0, { transparent: true, opacity: 0.8 }), B(0.35, 0.45, 0.35, 0.05, 0.15, 0.55)], [mm(0xd9ebb0), B(0.004, 0.2, 0.4, 0.351, 0.55, 0.5)]];
  at(bench, PX0 + 0.42, 3.65);
  const cart = [[wM, B(0.55, 0.88, 0.55, 0, 0.08, 0)], [wM, B(0.62, 0.03, 0.6, 0, 0.96, 0)], [dark, B(0.02, 0.12, 0.03, 0.24, 0.6, 0.1)], [paper, B(0.004, 0.22, 0.25, 0.277, 0.65, -0.1)], ...[0.2, 0.35, 0.5, 0.65].map((y) => [dark, B(0.004, 0.06, 0.05, 0.277, y, 0.2)]), ...[-0.2, 0.2].flatMap((x) => [-0.2, 0.2].map((z) => [dark, C(0.04, 0.03, x, 0.02, z, 8).rotateZ(Math.PI / 2)]))];
  at(cart, PX0 + 0.33, 4.95); at(cart, PX0 + 0.33, 5.6);
  at([[wM, R(0.42, 0.15, 0.4, 0, 0.99, 0, 0.02)], [mm(0xdcdcd8), B(0.3, 0.05, 0.3, 0, 1.14, 0)]], PX0 + 0.33, 4.95);
  at([[wM, R(0.48, 0.18, 0.4, 0, 0.99, 0, 0.02)], [wM, B(0.3, 0.25, 0.02, 0, 1.17, -0.15).rotateX(0.3)]], PX0 + 0.33, 5.6);
  at([[mm(0xe3e3dd), B(0.6, 0.03, 1.2, 0, 0.7, 0)], [dark, B(0.04, 0.7, 0.04, -0.25, 0, -0.55)], [dark, B(0.04, 0.7, 0.04, 0.25, 0, -0.55)], [dark, B(0.04, 0.7, 0.04, -0.25, 0, 0.55)], [dark, B(0.04, 0.7, 0.04, 0.25, 0, 0.55)],
    [wM, R(0.42, 0.42, 0.4, 0, 0.73, -0.3, 0.02)], [dark, B(0.3, 0.02, 0.25, 0, 1.15, -0.3)], [dark, B(0.32, 0.02, 0.24, 0, 0.73, 0.3)], [cardb, B(0.4, 0.3, 0.4, 0, 0, 0.2)]], PX0 + 0.36, 6.6);
  // 北の壁ぞい：緑の鉄の棚（コピー用紙の包み、上にトナーの箱）、金属の棚（ホッチキス・紙）、灰色のロッカー、廊下への戸
  const shelf = [...[-0.58, 0.58].flatMap((x) => [-0.2, 0.2].map((z) => [greenSt, B(0.04, 1.8, 0.04, x, 0, z)])), ...[0.1, 0.65, 1.2, 1.78].map((y) => [greenSt, B(1.2, 0.025, 0.45, 0, y, 0)])];
  for (let i = 0; i < 6; i++) shelf.push([cardb, B(0.3, 0.06, 0.22, -0.3 + (i % 2) * 0.32, 0.67 + Math.floor(i / 2) * 0.06, 0)]);
  for (let i = 0; i < 5; i++) shelf.push([cardb, B(0.3, 0.06, 0.22, 0.25, 1.22 + i * 0.06, -0.02)]);
  for (let i = 0; i < 3; i++) shelf.push([cardb, B(0.3, 0.06, 0.22, -0.3, 0.12 + i * 0.06, 0)]);
  for (let i = 0; i < 8; i++) shelf.push([i % 3 ? cardb : okiY, B(0.28, 0.24, 0.3, -0.45 + (i % 4) * 0.3, 1.81 + Math.floor(i / 4) * 0.24, 0)]);
  at(shelf, -3.65, 0.3);
  const ms = [...[-0.43, 0.43].flatMap((x) => [-0.18, 0.18].map((z) => [mm(0x8a8c88, { metalness: 0.5 }), B(0.04, 1.85, 0.04, x, 0, z)])), ...[0.1, 0.5, 0.9, 1.3, 1.82].map((y) => [mm(0x9a9c98, { metalness: 0.4 }), B(0.86, 0.02, 0.38, 0, y, 0)])];
  ms.push([wM, B(0.4, 0.15, 0.3, -0.2, 0.92, 0)], [cardb, B(0.35, 0.18, 0.3, 0.22, 0.92, 0)], [dark, B(0.6, 0.12, 0.25, 0, 1.32, 0)], [mm(0xf4e04a), B(0.25, 0.12, 0.004, -0.2, 1.05, 0.195)], [mm(0xf4e04a), B(0.25, 0.12, 0.004, 0.2, 0.65, 0.195)], [mm(0xf0a0b0), B(0.3, 0.25, 0.3, -0.2, 0.12, 0)], [wM, B(0.3, 0.2, 0.3, 0.2, 0.52, 0)]);
  at(ms, -2.5, 0.28);
  at([[mm(0x6c726c, { roughness: 0.5 }), B(0.9, 1.85, 0.45, 0, 0, 0)], [mm(0x585e58), B(0.004, 1.75, 0.004, 0, 0.05, 0.226)], [mm(0xa8aca8), B(0.03, 0.15, 0.03, -0.06, 0.95, 0.24)], [mm(0xa8aca8), B(0.03, 0.15, 0.03, 0.06, 0.95, 0.24)], [mm(0x9fb7d0), B(0.6, 0.25, 0.25, 0.1, 1.85, 0)], [red, B(0.25, 0.15, 0.2, -0.3, 1.85, 0)]], -1.5, 0.3);
  // 廊下への木の開き戸（すりガラスの窓）と枠、欄間のむこうの段ボール（Canon）
  const woodD = mm(0xb59672, { roughness: 0.6 });
  P.push([woodD, B(0.84, 1.98, 0.04, -0.52, 0.02, 0.1)], [woodD, B(0.06, 2.75, 0.17, -0.98, 0, 0)], [woodD, B(0.06, 2.1, 0.17, -0.06, 0, 0)], [woodD, B(2.95, 0.07, 0.17, -1.5, 2.06, 0)], [woodD, B(2.95, 0.06, 0.17, -1.5, 2.7, 0)], [woodD, B(0.05, 0.6, 0.17, -1.5, 2.12, 0)], [mm(0xb8b8b0), B(0.3, 0.012, 0.012, -0.85, 1.0, 0.13)]);
  P.push([mm(0xcfd4d2, { roughness: 0.3 }), B(0.4, 0.5, 0.005, -0.52, 1.3, 0.125)], [cardb, B(1.2, 0.4, 0.4, -2.2, 2.15, -0.35)], [mm(0x8aa0a8), B(0.5, 0.35, 0.3, -1.2, 2.15, -0.3)]);
  for (let i = 0; i < 6; i++) P.push([mm(0x7e8a90), C(0.05, 0.3, -1.4 + i * 0.12, 2.12, -0.2, 8)]);
  // 南の窓：アルミ枠、黄色いカーテン（両はし）、右上の壁かけの換気扇（クーラー）
  const fr = [B(3.8, 0.05, 0.1, -2.45, 0.83, PZ1 - 0.05), B(3.8, 0.05, 0.1, -2.45, 2.52, PZ1 - 0.05), B(3.8, 0.04, 0.08, -2.45, 2.0, PZ1 - 0.05)];
  for (const x of [-4.3, -3.35, -2.4, -1.45, -0.5]) fr.push(B(0.05, 1.7, 0.08, x, 0.85, PZ1 - 0.05));
  P.push(...fr.map((g) => [alu, g]));
  P.push([mm(0xd8c8a0, { roughness: 0.7 }), B(0.55, 0.38, 0.32, -0.9, 2.1, PZ1 - 0.25)], [mm(0x8a8070), B(0.45, 0.25, 0.004, -0.9, 2.15, PZ1 - 0.41)]);
  P.push([mm(0xe6dccd), B(0.04, 0.32, 0.32, PX0 + 0.1, 2.3, 4.2)]); // 西の壁の換気口
  for (const [m, g] of kit(P)) add([g], m, !m.transparent);
  add([B(3.75, 1.65, 0.01, -2.4, 0.86, PZ1 - 0.06)], glass, false);
  const yc = mm(0xf0dc8a, { roughness: 0.95, side: THREE.DoubleSide });
  for (const [x, w] of [[-4.25, 0.7], [-1.05, 0.7]]) { const g = new THREE.PlaneGeometry(w, 1.95, 30, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 30) * 0.035); g.computeVertexNormals(); g.translate(x + w / 2 - 0.1, 0.55 + 0.97, PZ1 - 0.18); add([g], yc, false); }
  // 壁のはり紙（「燃えないゴミ」「インク在庫に注意」など）と時計
  for (const [x, y, z, w, h, ry] of [[-0.09, 1.55, 3.2, 0.42, 0.3, -Math.PI / 2], [-0.09, 1.55, 3.7, 0.3, 0.42, -Math.PI / 2], [-0.09, 1.3, 4.6, 0.25, 0.35, -Math.PI / 2], [-0.09, 1.6, 5.2, 0.3, 0.42, -Math.PI / 2], [PX0 + 0.08, 1.5, 4.9, 0.25, 0.32, Math.PI / 2], [PX0 + 0.08, 1.5, 5.6, 0.25, 0.32, Math.PI / 2], [PX0 + 0.08, 1.45, 3.5, 0.3, 0.25, Math.PI / 2], [-0.5, 1.25, 0.13, 0.22, 0.3, 0]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); }
  { const c = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), M(0xffffff)); c.position.set(-0.1, 2.2, 1.9); c.rotation.y = -Math.PI / 2; scene.add(c); add([new THREE.TorusGeometry(0.14, 0.012, 6, 24).rotateY(Math.PI / 2).translate(-0.1, 2.2, 1.9)], dark); }
}

// ---------- 男子更衣室（職員更衣室兼休養室の西。共用スペースの北。写真） ----------
// x 14.4〜19.2、z -9.9（北の窓）〜-2.5（共用スペースとの境。あけたままの引き戸）
// 入口のあたり：金属の棚と段ボール、白い背の高いキャビネット、水色の台（テプラの回収箱）、黄色いカーテン、茶色の板の仕切り
// 奥：両側に灰色の2段ロッカーが並ぶ通路、ハンガーラック、かご、ごみ箱。北の窓ぎわ：ソファベッドと革のいす、クッションの棚、ストーブ、エアコン
{
  const X0 = 14.4, X1 = 19.2, Z0 = -9.9, Z1 = -2.5;
  const cache = new Map(), mm = (c, o = {}) => { const k = c + JSON.stringify(o); if (!cache.has(k)) cache.set(k, M(c, o)); return cache.get(k); };
  const beige = mm(0xc9bba0, { roughness: 0.85 }), whiteW = mm(0xe6e4dc, { roughness: 0.95 });
  const pw = { H: 1.3, lo: beige, hi: whiteW };
  wall(X0, Z0, X1, Z0, [[0.5, 4.3, 0.9, 2.6]], 0.15, pw);   // 北：窓
  wall(X0, Z0, X0, Z1, [], 0.15, pw);                          // 西
  wall(X1, Z0, X1, Z1, [], 0.15, pw);                          // 東（女子更衣室との境）
  wall(X0, Z1 - 0.085, X1, Z1 - 0.085, [[1.2, 2.1, 0, 2.05]], 0.02, pw); // 共用スペースとの境の壁の、更衣室がわの面
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0.001, (Z0 + Z1) / 2), M(0xd8cdb4, { roughness: 0.4 })); f.receiveShadow = true; scene.add(f); }
  ceiling.add(new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(Math.PI / 2).translate((X0 + X1) / 2, CEIL, (Z0 + Z1) / 2), M(0xeceae2, { roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.25 })));
  for (const z of [-4.3, -7.6]) { ceiling.add(new THREE.Mesh(B(1.25, 0.06, 0.18, 16.8, CEIL - 0.06, z), M(0xf4f4f2))); ceiling.add(new THREE.Mesh(B(1.2, 0.03, 0.1, 16.8, CEIL - 0.09, z), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }))); }
  { const l = new THREE.RectAreaLight(0xfff4e6, 0.7, 3.4, 5.8); l.position.set(16.8, 2.84, -6.2); l.lookAt(16.8, 0, -6.2); scene.add(l); }

  const P = [];
  const at = (parts, x, z, r = 0) => { for (const [m, g] of parts) P.push([m, g.clone().rotateY(r).translate(x, 0, z)]); };
  const gray = mm(0x7f8580, { roughness: 0.45, metalness: 0.35 }), grayD = mm(0x5d625e, { roughness: 0.5 }), slotM = mm(0x2c302e), dark = mm(0x2a2c30, { roughness: 0.5 }), chromeM = mm(0xc8ccd0, { roughness: 0.2, metalness: 0.85 });
  const cardb = mm(0xb68a58, { roughness: 0.9 }), leather = mm(0x3a2a22, { roughness: 0.45 }), woodB = mm(0x6e4a2e, { roughness: 0.6 }), whiteM = mm(0xf2f2ee, { roughness: 0.4 });
  // 灰色の2段（たて長2枚戸）のロッカー：正面は +z の向き（rot で回す）。幅 0.9 に扉2枚、上に通気のすじ、名札、取っ手
  const locker = [[gray, B(0.9, 1.8, 0.5, 0, 0, 0)], [grayD, B(0.004, 1.74, 0.004, 0, 0.03, 0.252)]];
  for (const s of [-1, 1]) { const x = s * 0.225; for (let k = 0; k < 4; k++) locker.push([slotM, B(0.2, 0.012, 0.004, x, 1.5 + k * 0.035, 0.253)]); locker.push([paper, B(0.12, 0.035, 0.004, x, 1.2, 0.253)], [chromeM, B(0.03, 0.06, 0.02, x + s * -0.17, 0.95, 0.26)], [chromeM, C(0.012, 0.01, x + s * -0.17, 0.85, 0.26, 8).rotateX(Math.PI / 2)]); for (let k = 0; k < 3; k++) locker.push([slotM, B(0.15, 0.01, 0.004, x, 0.1 + k * 0.03, 0.253)]); }
  // 西の壁ぞい（正面は東）：入口から奥まで
  for (let z = -4.4; z >= -8.0; z -= 0.92) at(locker, X0 + 0.33, z, Math.PI / 2);
  // 東の壁ぞい（正面は西）
  for (let z = -4.6; z >= -7.4; z -= 0.92) at(locker, X1 - 0.33, z, -Math.PI / 2);
  // 窓ぎわ西のすみの1台（正面は東）と、ロッカーの上の箱・かばん
  for (const [x, z, w, h, c] of [[X0 + 0.33, -4.6, 0.45, 0.35, 0xb68a58], [X0 + 0.33, -5.6, 0.5, 0.25, 0x3a8a4a], [X0 + 0.33, -6.4, 0.35, 0.4, 0xc0282a], [X0 + 0.33, -7.2, 0.45, 0.3, 0x2a2c30], [X1 - 0.33, -5.0, 0.5, 0.45, 0xb68a58], [X1 - 0.33, -6.0, 0.45, 0.3, 0xe8e8e2], [X1 - 0.33, -7.0, 0.4, 0.2, 0xb68a58]]) P.push([mm(c, { roughness: 0.85 }), B(0.42, h, w, x, 1.8, z)]);
  // ハンガーラック（東のロッカーの前。黒い上着がたくさん）
  const rack = [[chromeM, C(0.02, 1.6, -0.6, 0, 0, 8)], [chromeM, C(0.02, 1.6, 0.6, 0, 0, 8)], [chromeM, C(0.02, 1.2, 0, 1.58, 0, 8).rotateZ(Math.PI / 2)], [chromeM, B(0.04, 0.03, 0.5, -0.6, 0.04, 0)], [chromeM, B(0.04, 0.03, 0.5, 0.6, 0.04, 0)]];
  for (let i = 0; i < 9; i++) rack.push([mm([0x1d2028, 0x2c3038, 0x4a4e56, 0x2a2c30, 0x6a6e66][i % 5], { roughness: 0.9 }), B(0.06, 0.8 + (i % 3) * 0.12, 0.5, -0.5 + i * 0.12, 1.55 - 0.8 - (i % 3) * 0.12, 0)]);
  at(rack, X1 - 0.95, -5.6, Math.PI / 2);
  // かご（緑・青）、ごみ箱（青）、ペットボトル、紙袋
  P.push([mm(0x2a9a4a, { roughness: 0.6 }), B(0.5, 0.28, 0.35, X1 - 1.0, 0, -4.4)], [mm(0x2f5f9a, { roughness: 0.6 }), B(0.5, 0.4, 0.35, X1 - 1.0, 0, -4.0)], [mm(0x2a6fc0, { roughness: 0.5 }), C(0.15, 0.36, 16.5, 0, -7.2, 14)], [paper, B(0.3, 0.45, 0.15, X1 - 0.7, 0, -3.6)]);
  // 北の窓ぎわ：ソファベッド（茶色の革のひじかけ、毛布）、革のひとりがけいす、クッションの木の棚、ストーブ
  const sofa = [[leather, B(1.9, 0.3, 0.8, 0, 0.1, 0)], [leather, B(0.15, 0.55, 0.8, -0.97, 0, 0)], [leather, B(0.15, 0.55, 0.8, 0.97, 0, 0)], [mm(0xcdd8c8, { roughness: 1 }), B(1.8, 0.14, 0.78, 0, 0.4, 0)], [mm(0xe3e6e2, { roughness: 1 }), B(1.0, 0.1, 0.7, 0.3, 0.52, 0.02).rotateZ(0.04)]];
  at(sofa, 15.75, -9.35);
  const chair = [[leather, B(0.7, 0.42, 0.65, 0, 0.05, 0)], [leather, B(0.7, 0.45, 0.14, 0, 0.45, -0.3)], [leather, B(0.12, 0.25, 0.65, -0.35, 0.45, 0)], [leather, B(0.12, 0.25, 0.65, 0.35, 0.45, 0)], [mm(0x523a2e), B(0.6, 0.06, 0.5, 0, 0.47, 0.05)]];
  at(chair, 17.3, -9.3);
  at([[woodB, B(0.42, 0.75, 0.32, 0, 0, 0)], [mm(0x3a2a20), B(0.38, 0.32, 0.3, 0, 0.05, 0.01)], [mm(0x3aa6d8), B(0.3, 0.28, 0.22, 0, 0.42, 0)], [mm(0xe8c43a), B(0.25, 0.22, 0.2, 0, 0.08, 0)], [mm(0x9ec070), B(0.45, 0.2, 0.34, 0, 0.75, 0)], [mm(0xe8e2d0), B(0.4, 0.1, 0.3, 0, 0.95, 0)]], X0 + 0.3, -8.95);
  at([[whiteM, R(0.35, 0.42, 0.25, 0, 0, 0, 0.02)], [mm(0x30343a), B(0.25, 0.2, 0.005, 0, 0.12, -0.126)]], 15.4, -8.2);
  // 窓：アルミ枠、上の欄間、黄色いカーテン（オレンジのふち）、壁かけのエアコン（DAIKIN）、右上の換気の箱、オレンジの板
  const fr = [B(3.8, 0.05, 0.1, 16.8, 0.88, Z0 + 0.05), B(3.8, 0.05, 0.1, 16.8, 2.58, Z0 + 0.05), B(3.8, 0.04, 0.08, 16.8, 2.1, Z0 + 0.05)];
  for (const x of [14.9, 15.85, 16.8, 17.75, 18.7]) fr.push(B(0.05, 1.7, 0.08, x, 0.88, Z0 + 0.05));
  P.push(...fr.map((g) => [alu, g]));
  P.push([whiteM, R(0.8, 0.28, 0.24, 16.4, 2.62, Z0 + 0.2, 0.04)], [mm(0x8a8070), B(0.4, 0.35, 0.3, 18.6, 2.3, Z0 + 0.22)], [mm(0x6a6258), B(0.32, 0.26, 0.004, 18.6, 2.34, Z0 + 0.375)], [mm(0xd06a4a), B(0.6, 0.18, 0.02, 16.2, 2.92 - 0.2, Z0 + 0.09)], [whiteM, C(0.025, 2.4, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(17.4, 2.6, Z0 + 0.12)]);
  // 入口のあたり（共用スペースの戸の内がわ）：金属の棚と段ボール、白い背の高いキャビネット、水色の台とテプラの回収箱、茶色の板の仕切り、黄色いカーテン
  const shelf = [...[-0.43, 0.43].flatMap((x) => [-0.2, 0.2].map((z) => [mm(0x8a8c88, { metalness: 0.5 }), B(0.04, 1.8, 0.04, x, 0, z)])), ...[0.1, 0.55, 1.0, 1.45, 1.78].map((y) => [mm(0x9a9c98, { metalness: 0.4 }), B(0.86, 0.02, 0.42, 0, y, 0)]), [cardb, B(0.4, 0.3, 0.35, -0.2, 0.12, 0)], [cardb, B(0.35, 0.25, 0.35, 0.22, 0.57, 0)], [mm(0xe8e8e2), B(0.4, 0.35, 0.35, -0.2, 1.02, 0)], [cardb, B(0.6, 0.3, 0.38, 0, 1.8, 0)]];
  at(shelf, X0 + 0.28, -3.3, Math.PI / 2);
  at([[whiteM, B(0.5, 1.6, 0.85, 0, 0, 0)], [dark, B(0.45, 0.06, 0.6, 0, 1.6, 0)], [cardb, B(0.4, 0.3, 0.5, 0, 1.66, 0.1)], [mm(0x3aa6d8), B(0.3, 0.2, 0.3, 0, 1.96, -0.2)]], 17.2, -3.4);
  at([[mm(0x3fb0a8, { roughness: 0.5 }), B(0.42, 0.03, 0.42, 0, 0.6, 0)], [mm(0x3fb0a8), B(0.42, 0.03, 0.42, 0, 0.2, 0)], ...[-0.19, 0.19].flatMap((x) => [-0.19, 0.19].map((z) => [mm(0x3fb0a8), B(0.03, 0.62, 0.03, x, 0, z)])), [mm(0xf4f4f0), B(0.3, 0.35, 0.25, 0, 0.63, 0)], [mm(0x3a9a4a), B(0.004, 0.2, 0.2, 0, 0.7, -0.126)], [cardb, B(0.35, 0.22, 0.3, 0, 0.23, 0)]], 16.75, -2.85);
  at([[woodB, B(0.03, 1.6, 0.9, 0, 0.1, 0)], [woodB, B(0.03, 1.6, 0.9, 0, 0.1, 0.92)], [chromeM, B(0.04, 1.75, 0.04, 0, 0, -0.46)], [chromeM, B(0.04, 1.75, 0.04, 0, 0, 0.46)], [chromeM, B(0.04, 1.75, 0.04, 0, 0, 1.38)]], 15.25, -4.9, Math.PI / 2);
  for (const [m, g] of kit(P)) add([g], m, !m.transparent);
  add([B(3.75, 1.65, 0.01, 16.8, 0.9, Z0 + 0.06)], glass, false);
  const yc = mm(0xf0e2a8, { roughness: 0.95, side: THREE.DoubleSide });
  for (const [x, w] of [[14.55, 1.8], [16.75, 1.85]]) { const g = new THREE.PlaneGeometry(w, 1.25, 40, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 28) * 0.03); g.computeVertexNormals(); g.translate(x + w / 2, 0.85 + 0.62, Z0 + 0.2); add([g], yc, false); add([B(w, 0.06, 0.01, x + w / 2, 0.83, Z0 + 0.21)], mm(0xd9a050), false); }
  // 入口の黄色いカーテン（戸の内がわ、東のはし）
  { const g = new THREE.PlaneGeometry(0.4, 1.9, 12, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 30) * 0.03); g.computeVertexNormals(); g.rotateY(Math.PI / 2).translate(16.6, 1.05, -2.85); add([g], yc, false); }
}

// ---------- 名前の札 ----------
const tag = (text, color, x, y, z) => { const d = document.createElement("div"); d.className = "tag"; d.textContent = text; d.style.background = color; const o = new CSS2DObject(d); o.position.set(x, y, z); scene.add(o); return o; };
const tags = [tag("男子更衣室", "#8a7a5a", 16.8, 2.3, -6.2), tag("印刷室", "#8a7a5a", -2.4, 2.3, 3.9), tag("1年", "#c2549a", 6.5, 1.6, 4.0), tag("2年", "#2b8fb4", 12.8, 1.6, 4.0), tag("3年", "#3c9a4a", 21.6, 1.6, 2.4), tag("業務アシスタント", "#6b6f78", 18.3, 1.6, 3.5), tag("教頭・副校長", "#6b6f78", 18.9, 1.6, 5.4), tag("共用スペース", "#8a7a5a", 19.2, 2.0, -1.2), tag("流し・給湯", "#8a7a5a", 0.5, 1.9, 5.9), tag("打ち合わせテーブル", "#8a7a5a", 1.75, 1.2, 2.75), tag("クラス別の配布棚", "#8a7a5a", 3.42, 1.5, 0.4), tag("予定表", "#8a7a5a", 10.9, 2.15, 0.4), tag("丸テーブル", "#8a7a5a", 16.0, 1.4, -1.1)];

// ---------- 歩く（一人称視点） ----------
// ぶつかる物（机・戸棚・柱・テーブル・流し台）の四角を集めておく。いすはよけずに通れる
const solids = [];
const box2 = (x, z, w, d) => solids.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
for (const d of desks) { const along = Math.abs(Math.sin(d.rot)) < 0.5; box2(d.x, d.z, along ? DW : DD, along ? DD : DW); }
for (const c of [...cabs, ...lows, ...mids, ...talls]) { const along = Math.abs(Math.sin(c.rot)) < 0.5; box2(c.x, c.z, along ? 0.9 : 0.45, along ? 0.45 : 0.9); }
for (const x of [0, 4.8, 9.6, 14.4, 19.2, 24]) box2(x, 7.25, 0.76, 0.66);
for (const x of [0, 4.8, 9.6, 14.4, 24]) box2(x, 0.15, 0.76, 0.66);
box2(19.2, 0.1, 0.76, 0.76); for (const x of [14.4, 19.2, 24]) box2(x, -2.35, 0.76, 0.5);
box2(18.55, VZ, 3.9, VD);
// 男子更衣室：ロッカーの列、ハンガーラック、ソファベッド・いす・棚、入口の棚とキャビネット・水色の台・仕切り
for (const [x, z, w, d] of [[14.73, -6.25, 0.5, 4.6], [18.87, -6.0, 0.5, 3.7], [18.25, -5.6, 0.5, 1.25], [15.75, -9.35, 2.1, 0.85], [17.3, -9.3, 0.75, 0.7], [14.7, -8.95, 0.32, 0.42], [14.68, -3.3, 0.45, 0.9], [17.2, -3.4, 0.5, 0.85], [16.75, -2.85, 0.45, 0.45], [15.75, -4.9, 1.9, 0.1], [18.2, -4.2, 0.5, 0.8]]) box2(x, z, w, d);
// 印刷室：印刷機・コピー機・丁合機・机・棚など
for (const [x, z, w, d] of [[-2.75, 2.95, 1.9, 0.72], [-2.75, 4.05, 1.9, 0.72], [-3.2, 5.6, 1.9, 0.72], [-2.3, 1.65, 0.75, 1.35], [-2.2, 6.75, 0.65, 0.65], [-1.25, 6.85, 0.8, 0.5], [-0.42, 1.75, 0.7, 0.85], [-0.45, 3.9, 0.77, 3.25], [-0.46, 5.66, 0.75, 0.1], [-0.42, 6.85, 0.62, 0.6], [-4.5, 1.05, 0.45, 1.8], [-4.5, 2.35, 0.4, 0.6], [-4.38, 3.65, 0.7, 1.8], [-4.47, 5.27, 0.6, 1.25], [-4.44, 6.6, 0.6, 1.2], [-3.65, 0.3, 1.2, 0.45], [-2.5, 0.28, 0.9, 0.4], [-1.5, 0.3, 0.9, 0.45]]) box2(x, z, w, d); box2(16.85, 7.1, 3.9, 0.47); box2(23.72, 2.95, 0.45, 3.9); box2(23.75, -0.5, 0.4, 0.5); box2(22.75, -0.4, 0.5, 0.5); box2(18.55, 0.55, 0.36, 0.8); box2(23.78, -0.1, 0.3, 0.3);
// 北の壁ぞいの分別カート・白い棚とごみ箱、共用スペースのロッカー・丸テーブル・すみの棚
box2(7.6, 0.3, 0.5, 0.42); box2(11.0, 0.3, 1.9, 0.42); box2(14.73, -0.65, 0.5, 0.9); box2(17.5, -2.17, 1.8, 0.5); box2(20.95, -2.17, 2.7, 0.5); box2(16.0, -1.15, 1.3, 1.3); box2(15.1, -2.25, 1.0, 0.34);
// 西のはし：流し台・製氷機・冷蔵庫・食器棚・レンジ台、窓の下の棚、打ち合わせテーブル、配布棚、ホワイトボード、ごみの分別箱
box2(0.37, 4.6, 0.6, 2.85); box2(0.3, 2.75, 0.45, 1.6); box2(1.55, 7.12, 1.6, 0.42); box2(1.75, 2.75, 0.9, 1.8); box2(3.42, 0.3, 1.32, 0.44); box2(1.3, 0.62, 0.5, 0.5);
const RAD = 0.22;
const inRoom = (x, z) => (x > 14.55 + RAD && x < 19.05 - RAD && z > -9.75 + RAD && z < -2.6 - RAD) || (x > 15.6 + RAD && x < 16.5 - RAD && z > -2.9 && z < -2.1) || (x > -4.65 + RAD && x < -0.1 - RAD && z > 0.08 + RAD && z < 7.25 - RAD) || (x > -0.45 && x < 0.45 && z > 0.45 + RAD && z < 1.35 - RAD) || (x > 0.12 + RAD && x < 23.88 - RAD && z > 0.08 + RAD && z < 7.25 - RAD) || (x > 14.5 + RAD && x < 23.88 - RAD && z > -2.42 + RAD && z < 0.5);
const free = (x, z) => inRoom(x, z) && !solids.some(([a, b, c, d]) => x > a - RAD && x < b + RAD && z > c - RAD && z < d + RAD);
const walk = { on: false, x: 0.9, z: 3.9, yaw: -Math.PI / 2, pitch: -0.05, keys: new Set(), pad: { f: 0, t: 0 }, saved: null };
const EYE = 1.55;
function setWalk(on) {
  if (on === walk.on) return;
  walk.on = on;
  document.body.classList.toggle("walking", on);
  document.getElementById("walk-btn").classList.toggle("active", on);
  controls.enabled = !on;
  if (on) {
    anim = null;
    walk.saved = [camera.position.clone(), controls.target.clone()];
    // いま見ている場所の近くの、歩けるところから
    let best = [0.9, 3.9], bd = Infinity;
    for (let x = -4.4; x < 23.6; x += 0.25) for (let z = -9.6; z < 7.1; z += 0.25) if (free(x, z)) { const d = (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2; if (d < bd) { bd = d; best = [x, z]; } }
    [walk.x, walk.z] = best;
    const d = controls.target.clone().sub(camera.position); walk.yaw = Math.atan2(-d.x, -d.z); walk.pitch = -0.05;
  } else {
    walk.keys.clear(); walk.pad.f = walk.pad.t = 0;
    if (walk.saved) { camera.position.copy(walk.saved[0]); controls.target.copy(walk.saved[1]); }
  }
}
function updateWalk(dt) {
  const k = walk.keys;
  const fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) + walk.pad.f;
  const side = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
  walk.yaw += ((k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0) + walk.pad.t) * dt * 1.8;
  if (fwd || side) {
    const sp = 1.4 * dt, fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
    const mx = (fx * fwd - fz * side) * sp, mz = (fz * fwd + fx * side) * sp;
    if (free(walk.x + mx, walk.z + mz)) { walk.x += mx; walk.z += mz; }
    else if (free(walk.x + mx, walk.z)) walk.x += mx;
    else if (free(walk.x, walk.z + mz)) walk.z += mz;
  }
  // 歩いているときは、ほんの少し上下にゆれる
  const bob = fwd ? Math.sin(performance.now() / 160) * 0.015 : 0;
  camera.position.set(walk.x, EYE + bob, walk.z);
  const look = new THREE.Vector3(-Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
  controls.target.copy(camera.position).add(look);
  camera.lookAt(controls.target);
}
addEventListener("keydown", (e) => {
  if (!walk.on) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { setWalk(false); return; }
  if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { walk.keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => walk.keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => walk.keys.clear());
{
  let last = null;
  labels.domElement.addEventListener("pointerdown", (e) => { if (walk.on) last = [e.clientX, e.clientY]; });
  addEventListener("pointermove", (e) => {
    if (!walk.on || !last || !e.buttons) return;
    walk.yaw += (e.clientX - last[0]) * 0.005;
    walk.pitch = Math.max(-1.1, Math.min(0.9, walk.pitch + (e.clientY - last[1]) * 0.004));
    last = [e.clientX, e.clientY];
  });
  addEventListener("pointerup", () => { last = null; });
  const pad = document.getElementById("pad");
  pad.addEventListener("pointerdown", (e) => { const b = e.target.closest("button"); if (!b) return; e.preventDefault(); if (b.dataset.end) { setWalk(false); return; } if (b.dataset.f) walk.pad.f = Number(b.dataset.f); if (b.dataset.t) walk.pad.t = Number(b.dataset.t); b.setPointerCapture(e.pointerId); });
  const stop = (e) => { const b = e.target.closest?.("button"); if (b?.dataset.f) walk.pad.f = 0; if (b?.dataset.t) walk.pad.t = 0; };
  pad.addEventListener("pointerup", stop); pad.addEventListener("pointercancel", stop);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
  document.getElementById("walk-btn").addEventListener("click", () => setWalk(!walk.on));
}

// ---------- 見る場所 ----------
const VIEWS = {
  walk: [[0.9, 1.55, 3.9], [20, 1.1, 3.2]],
  east: [[23.2, 1.55, 6.6], [6, 1.0, 3.0]],
  sink: [[5.6, 1.55, 5.2], [0.4, 1.1, 2.6]],
  print: [[-0.5, 1.6, 1.0], [-3.0, 0.9, 6.0]],
  men: [[16.2, 1.6, -2.2], [16.6, 1.0, -9.0]],
  top: [[12, 30, 2.5], [12, 0, 2.45]],
  bird: [[4, 12, 15], [13, 0, 2.5]],
};
let anim = null;
function go(name, ms = 900) {
  const [p, t] = VIEWS[name];
  anim = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t) };
  document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.classList.toggle("active", b.dataset.v === name));
}
{
  // 見る場所のボタンは「📍 見る場所」を押したときだけ出す（選ぶと閉じる）
  const vm = document.getElementById("vmenu"), vb = document.getElementById("vmenu-btn");
  vb.addEventListener("click", () => { const o = vm.classList.toggle("open"); vb.textContent = o ? "📍 見る場所 ▴" : "📍 見る場所 ▾"; });
  document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.addEventListener("click", () => { setWalk(false); go(b.dataset.v); vm.classList.remove("open"); vb.textContent = "📍 見る場所 ▾"; }));
}
camera.position.set(...VIEWS.walk[0]); controls.target.set(...VIEWS.walk[1]);
document.querySelector('.views .btn[data-v="walk"]').classList.add("active");
// 印刷室から来たとき（#print）：はじめから印刷室を見て、「マップにもどる」は印刷室の紹介へ
if (location.hash === "#print") {
  camera.position.set(...VIEWS.print[0]); controls.target.set(...VIEWS.print[1]);
  document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.classList.toggle("active", b.dataset.v === "print"));
  document.querySelector("a.back").href = "./#room=F2-AV126";
}

// ---------- 操作（長い部屋でも動かしやすく） ----------
// ・ドラッグで回す中心は、部屋の真ん中ではなく「いま画面のまん中に見えている所」（部屋の中では目の前 2m ほど）
// ・真上から見ているときは、1本指（左ドラッグ）で地図のようにずらす
// ・ホイールは指した方へ進む（中心にぶつかって止まらない）。ピンチは OrbitControls のまま
// ・ダブルクリック／ダブルタップで、そこへ近づく
controls.zoomToCursor = true;
controls.minDistance = 0.05;
const BOX = { x0: -4.8, x1: 24, z0: -9.9, z1: 7.4 };
const fwd = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
// 部屋の中から：壁・床・天井までの距離。外（上）から：机の高さの面までの距離
function hitDist(o, d) {
  const inside = o.x > BOX.x0 && o.x < BOX.x1 && o.z > BOX.z0 && o.z < BOX.z1 && o.y < CEIL && o.y > 0;
  if (inside) {
    let t = Infinity;
    for (const [p, v, lo, hi] of [[o.x, d.x, BOX.x0, BOX.x1], [o.y, d.y, 0, CEIL], [o.z, d.z, BOX.z0, BOX.z1]]) { if (v > 1e-6) t = Math.min(t, (hi - p) / v); else if (v < -1e-6) t = Math.min(t, (lo - p) / v); }
    return t;
  }
  return d.y < -0.05 ? (o.y - 0.7) / -d.y : null;
}
function repivot() {
  camera.getWorldDirection(fwd);
  const inside = camera.position.y < CEIL - 0.05;
  const h = hitDist(camera.position, fwd);
  if (h == null) return;
  const dist = inside ? Math.max(0.4, Math.min(h * 0.8, 2.0)) : h;
  controls.target.copy(camera.position).addScaledVector(fwd, dist);
}
const lookingDown = () => { camera.getWorldDirection(fwd); return fwd.y < -0.93; };
view.addEventListener("pointerdown", (e) => {
  if (walk.on || e.target.closest("button, a")) return;
  anim = null;
  repivot();
  const pan = lookingDown();
  controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  controls.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
}, true);
view.addEventListener("wheel", (e) => {
  if (walk.on) return;
  e.preventDefault(); e.stopPropagation(); anim = null;
  repivot();
  const r = view.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const d = ray.ray.direction, h = hitDist(camera.position, d) ?? 10;
  const s = Math.sign(e.deltaY) * -1, step = Math.max(0.12, Math.min(s > 0 ? (h - 0.8) * 0.3 : h * 0.18, 3)) * Math.min(3, Math.abs(e.deltaY) / 100 || 1);
  if (s > 0 && h < 0.9) return; // 壁や物の 1m 手前で止まる
  const mv = d.clone().multiplyScalar(s * step), was = camera.position.clone();
  camera.position.add(mv);
  // 部屋の中にいたら、うしろに下がっても壁や床をつきぬけない
  if (was.y < CEIL - 0.05) camera.position.set(Math.min(Math.max(camera.position.x, BOX.x0 + 0.15), BOX.x1 - 0.15), Math.min(Math.max(camera.position.y, 0.3), CEIL - 0.15), Math.min(Math.max(camera.position.z, (camera.position.x < 14.4 ? 0 : BOX.z0) + 0.15), BOX.z1 - 0.15));
  controls.target.add(camera.position.clone().sub(was));
}, { capture: true, passive: false });
// ダブルクリック・ダブルタップ：その場所へ近づく
const pickables = () => scene.children.filter((o) => o.isMesh && o.visible && o !== mirror);
function flyToPoint(cx, cy) {
  const r = view.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables(), false)[0];
  if (!hit) return;
  const p = hit.point, off = camera.position.clone().sub(controls.target);
  if (off.length() < 0.5) off.copy(fwd.set(0, 0.4, 1)); // 目の前を回っていたときは、手前ななめ上から
  off.setLength(Math.min(Math.max(off.length(), 2.5), 5));
  const cam = p.clone().add(off);
  cam.y = Math.max(cam.y, 0.6);
  anim = { t0: performance.now(), ms: 700, p0: camera.position.clone(), t0v: controls.target.clone(), p1: cam, t1: p.clone() };
}
view.addEventListener("dblclick", (e) => { if (!walk.on) flyToPoint(e.clientX, e.clientY); });
{
  let last = 0, lx = 0, ly = 0, sx = 0, sy = 0;
  view.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  view.addEventListener("pointerup", (e) => {
    if (walk.on || e.pointerType !== "touch" || Math.hypot(e.clientX - sx, e.clientY - sy) > 12) return;
    const now = performance.now();
    if (now - last < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 40) { flyToPoint(e.clientX, e.clientY); last = 0; } else { last = now; lx = e.clientX; ly = e.clientY; }
  });
}
// 中心が部屋から遠くはなれないように（ずらしすぎて見失わない）
const clampV = new THREE.Vector3();
// ---------- 平行移動のスティック（スマホ向け。ゲームの移動スティックのような ◎）：少し動かすと、画面の左下に ◎ の円盤が出る。
// まん中の丸に指を置いて、上下左右・ななめにずらすと、画面で見ている向きのまま、その方向へ平行に動く ----------
const NAV = { until: 0, hold: null, shown: false, grab: null };
{
  const pad = document.getElementById("stick"), knob = pad.querySelector(".knob");
  const R = () => pad.clientWidth / 2;
  const setFrom = (e) => {
    const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (e.clientX - cx) / R(), y = (e.clientY - cy) / R(); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    NAV.hold = Math.hypot(x, y) < 0.12 ? [0, 0] : [x, y];
    knob.style.transform = `translate(${x * R() * 0.6}px, ${y * R() * 0.6}px)`;
  };
  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); NAV.grab = e.pointerId; pad.setPointerCapture(e.pointerId); pad.classList.add("on"); setFrom(e); });
  pad.addEventListener("pointermove", (e) => { if (NAV.grab === e.pointerId) setFrom(e); });
  const stop = (e) => { if (NAV.grab !== e.pointerId) return; NAV.grab = null; NAV.hold = null; knob.style.transform = ""; pad.classList.remove("on"); NAV.until = performance.now() + 3000; };
  pad.addEventListener("pointerup", stop); pad.addEventListener("pointercancel", stop);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
  controls.addEventListener("start", () => { NAV.until = performance.now() + 4000; });
  view.addEventListener("wheel", () => { NAV.until = performance.now() + 4000; }, { passive: true });
  view.addEventListener("pointermove", (e) => { if (e.buttons) NAV.until = performance.now() + 4000; });
  NAV.pad = pad;
}
const navV = new THREE.Vector3(), navF = new THREE.Vector3(), navR = new THREE.Vector3();
function updateNav(now, dt) {
  const show = !walk.on && (now < NAV.until || NAV.grab !== null);
  if (show !== NAV.shown) { NAV.shown = show; NAV.pad.classList.toggle("show", show); }
  if (!NAV.hold || walk.on || (!NAV.hold[0] && !NAV.hold[1])) return;
  // 画面の上 = カメラの前（床に水平）、右 = カメラの右。ずらした大きさに合わせた速さで、カメラと中心をいっしょに動かす
  const az = controls.getAzimuthalAngle(); navF.set(-Math.sin(az), 0, -Math.cos(az)); // 真上から見ていても向きがわかるように、カメラの回りぐあいから前を決める
  navF.normalize(); navR.set(-navF.z, 0, navF.x);
  const d = camera.position.distanceTo(controls.target), sp = Math.min(14, Math.max(2.5, d * 1.3)) * dt;
  navV.copy(navR).multiplyScalar(NAV.hold[0] * sp).addScaledVector(navF, -NAV.hold[1] * sp);
  camera.position.add(navV); controls.target.add(navV); anim = null;
}
function keepNear() {
  const t = controls.target;
  clampV.set(Math.min(Math.max(t.x, BOX.x0 - 1), BOX.x1 + 1), Math.min(Math.max(t.y, 0), CEIL), Math.min(Math.max(t.z, BOX.z0 - 1), BOX.z1 + 1)).sub(t);
  if (clampV.lengthSq() > 0) { t.add(clampV); camera.position.add(clampV); }
}

// 止まっているときだけ、すみや物のあいだのかげ（アンビエントオクルージョン）と、光のにじみを足して、写真のような絵にする
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 16 });
gtao.blendIntensity = 0.95;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.4, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let dirty = 2;
function resize() { const w = innerWidth, h = innerHeight; renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); renderer.setSize(w, h); labels.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = 2; }
addEventListener("resize", resize); resize();

renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // 物は動かないので、影は1回だけ計算
// 動いているあいだは軽い描き方でなめらかに、止まったら1回だけきれいに描く
let lastMove = 0, fine = false;
const camKey = new Float64Array(16);
let lastT = 0;
// 動いているあいだのコマの間かくを見て、カクつくようなら画面のきめを少し下げる（なめらかさを優先）。余裕があれば少しずつ戻す
let ema = 16, slow = 0, quick = 0, prevMoving = false, lastAdapt = 0;
function adapt(now, interval) {
  ema += (interval - ema) * 0.1;
  slow = ema > 24 ? slow + 1 : 0; quick = ema < 17.5 ? quick + 1 : 0;
  if (now - lastAdapt < 1500) return;
  let next = dpr;
  if (slow > 20 && dpr > minDpr) next = Math.max(minDpr, dpr * 0.82);
  else if (quick > 240 && dpr < maxDpr) next = Math.min(maxDpr, dpr + 0.15);
  if (next !== dpr) { dpr = next; lastAdapt = now; slow = quick = 0; resize(); }
}
// ---------- 壁の透過：部屋の外から見ているときは、カメラの側の壁（と、その壁の柱・窓）を消して中が見えるようにする ----------
const insideAny = (x, z) => (x > 14.4 && x < 19.2 && z > -9.9 && z <= -2.5) || (x > 0 && x < 24 && z > 0 && z < 7.4) || (x > 14.4 && x < 24 && z > -2.5 && z <= 0) || (x > -4.8 && x <= 0 && z > 0 && z < 7.4);
const EXT = [];
{
  for (const w of WALLS) {
    const L = Math.hypot(w.bx - w.ax, w.bz - w.az); if (L < 0.01) continue;
    const nx = -(w.bz - w.az) / L, nz = (w.bx - w.ax) / L, mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2;
    const a = insideAny(mx + nx * 0.4, mz + nz * 0.4), b = insideAny(mx - nx * 0.4, mz - nz * 0.4);
    if (a === b) continue; // 部屋と部屋のあいだの壁は消さない
    EXT.push({ ...w, mx, mz, ox: a ? -nx : nx, oz: a ? -nz : nz, ms: [...w.ms] });
  }
  // 柱・窓・カーテンは、いちばん近い外側の壁といっしょに消す
  const c = new THREE.Vector3();
  for (const m of WALL_EXTRAS) {
    m.geometry.computeBoundingBox(); m.geometry.boundingBox.getCenter(c);
    let best = null, bd = 0.8;
    for (const w of EXT) { const dx = w.bx - w.ax, dz = w.bz - w.az, t = Math.max(0, Math.min(1, ((c.x - w.ax) * dx + (c.z - w.az) * dz) / (dx * dx + dz * dz))); const d = Math.hypot(c.x - (w.ax + dx * t), c.z - (w.az + dz * t)); if (d < bd) { bd = d; best = w; } }
    if (best) best.ms.push(m);
  }
  // ドア・枠・窓ガラス：いちばん近い外側の壁ごとにまとめて置き、その壁が消えるときは、うっすら残す
  const groups = new Map();
  for (const [mat, g] of DOOR_PARTS) {
    g.computeBoundingBox(); g.boundingBox.getCenter(c);
    let best = null, bd = 0.8;
    for (const w of EXT) { const dx = w.bx - w.ax, dz = w.bz - w.az, t = Math.max(0, Math.min(1, ((c.x - w.ax) * dx + (c.z - w.az) * dz) / (dx * dx + dz * dz))); const d = Math.hypot(c.x - (w.ax + dx * t), c.z - (w.az + dz * t)); if (d < bd) { bd = d; best = w; } }
    const key = best ? EXT.indexOf(best) : -1;
    if (!groups.has(key)) groups.set(key, new Map());
    const byMat = groups.get(key); if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g);
  }
  for (const [key, byMat] of groups) for (const [mat, gs] of byMat) {
    const m = add(gs, mat, mat !== glass);
    if (key < 0) continue;
    const faded = mat.clone(); faded.transparent = true; faded.opacity = mat === glass ? 0.06 : 0.14; faded.depthWrite = false;
    (EXT[key].fades ||= []).push({ m, mat, faded });
  }
}
function updateWalls() {
  const p = camera.position, inside = insideAny(p.x, p.z) && p.y < CEIL;
  for (const w of EXT) { const show = inside || (p.x - w.mx) * w.ox + (p.z - w.mz) * w.oz < 0.05; for (const m of w.ms) m.visible = show; for (const d of w.fades || []) d.m.material = show ? d.mat : d.faded; }
}
function tick(now) {
  const interval = lastT ? now - lastT : 16;
  if (walk.on) updateWalk(Math.min(0.1, interval / 1000));
  lastT = now;
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0v, anim.t1, e);
    if (k >= 1) anim = null;
  }
  if (!walk.on) { controls.update(); if (!anim) keepNear(); }
  // 天井より上から見るときは、天井を消して中が見えるように。札も、上から見るときだけ出す
  const above = camera.position.y > CEIL - 0.05;
  ceiling.visible = outside.visible = !above;
  updateWalls();
  updateNav(now, Math.min(0.1, interval / 1000));
  for (const t of tags) t.visible = above || camera.position.distanceTo(t.position) < 9;
  camera.updateMatrixWorld();
  let moved = false; const e = camera.matrixWorld.elements; for (let i = 0; i < 16; i++) if (camKey[i] !== e[i]) { camKey[i] = e[i]; moved = true; }
  const moving = moved || anim;
  if (moving && prevMoving) adapt(now, interval);
  prevMoving = moving;
  if (moving) { lastMove = now; fine = false; if (mirror) mirror.visible = false; floorMat.opacity = 1; renderer.render(scene, camera); labels.render(scene, camera); }
  else if (!fine && now - lastMove > (walk.on ? 450 : 250)) { fine = true; if (mirror) mirror.visible = !above; floorMat.opacity = above ? 1 : 0.8; composer.render(); labels.render(scene, camera); }
  else if (dirty) { dirty--; fine = false; lastMove = now; }
  requestAnimationFrame(tick);
}
// ---------- 軽くする：動かない部品を、材質ごとに1つにまとめる（描く回数を減らす） ----------
// 外から見るとき消える壁・うっすらになるドアは別のまま。InstancedMesh や子をもつ部品もそのまま
{
  const keep = new Set([mirror]);
  for (const w of EXT) { for (const m of w.ms) keep.add(m); for (const d of w.fades || []) keep.add(d.m); }
  const bake = (parent) => {
    const groups = new Map();
    for (const o of [...parent.children]) {
      if (!o.isMesh || (o.isInstancedMesh && o.count > 12) || keep.has(o) || o.children.length || !o.visible || Array.isArray(o.material)) continue;
      const k = o.material.uuid + "|" + o.castShadow + "|" + o.receiveShadow;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const gs = [];
      const im = new THREE.Matrix4(), mm2 = new THREE.Matrix4();
      const each = [];
      for (const o of list) {
        o.updateMatrix();
        if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, im); each.push([o, mm2.copy(o.matrix).multiply(im).clone()]); }
        else each.push([o, o.matrix]);
      }
      for (const [o, mat] of each) {
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(mat);
        for (const n of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(n)) g.deleteAttribute(n);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.morphAttributes = {};
        gs.push(g);
      }
      const merged = mergeGeometries(gs);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
      for (const o of list) { parent.remove(o); if (!o.isInstancedMesh) o.geometry.dispose(); }
      parent.add(m);
    }
  };
  // さらに、模様のない色だけの材質は、色を頂点にうつして、つやなどが同じものどうしを1つにまとめる
  const bakeColors = (parent) => {
    const groups = new Map();
    for (const o of [...parent.children]) {
      const m = o.material;
      if (!o.isMesh || o.isInstancedMesh || keep.has(o) || o.children.length || !o.visible || Array.isArray(m) || m.type !== "MeshStandardMaterial") continue;
      if (m.map || m.emissiveMap || m.transparent || m.vertexColors || m.emissive.getHex() !== 0) continue;
      const k = [m.roughness.toFixed(2), m.metalness.toFixed(2), m.side, o.castShadow, o.receiveShadow].join("|");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const gs = list.map((o) => {
        o.updateMatrix();
        const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
        for (const n of Object.keys(g.attributes)) if (!["position", "normal"].includes(n)) g.deleteAttribute(n);
        if (!g.attributes.normal) g.computeVertexNormals();
        const n = g.attributes.position.count, c = new Float32Array(n * 3), col = o.material.color;
        for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
        g.setAttribute("color", new THREE.BufferAttribute(c, 3));
        return g;
      });
      const merged = mergeGeometries(gs);
      if (!merged) continue;
      const m0 = list[0].material;
      const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m0.roughness, metalness: m0.metalness, side: m0.side }));
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
      for (const o of list) { parent.remove(o); o.geometry.dispose(); }
      parent.add(m);
    }
  };
  bake(scene); bake(ceiling); bake(outside);
  bakeColors(scene); bakeColors(ceiling); bakeColors(outside);
}
requestAnimationFrame(tick);
document.getElementById("loading").remove();

// ---------- 備品をさがす ----------
// 検索すると、その置き場所へカメラが飛んでいき、棚が光ってラベルが出る。一覧は js/staffroom-items.js
{
  const norm = (t) => t.normalize("NFKC").toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s　・（）()]/g, "");
  const items = STAFF_ITEMS.map((it) => ({ ...it, key: norm(it.name + " " + (it.yomi || "") + " " + it.place + " " + (it.note || "")) }));
  const btn = document.getElementById("sq-btn"), panel = document.getElementById("sq"), input = document.getElementById("sq-in"), list = document.getElementById("sq-list"), note = document.getElementById("sq-note");
  let mark = null, markLabel = null;
  const clearMark = () => { if (mark) { scene.remove(mark); mark = null; } if (markLabel) { scene.remove(markLabel); markLabel.element.remove(); markLabel = null; } note.style.display = "none"; dirty = 2; };
  function show(it) {
    clearMark(); setWalk(false);
    const [cx, cy, cz, w, h, d] = it.box;
    mark = new THREE.Group();
    mark.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, d + 0.06), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.28, depthWrite: false })));
    mark.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.06, h + 0.06, d + 0.06)), new THREE.LineBasicMaterial({ color: 0xff8a00 })));
    mark.position.set(cx, cy, cz); scene.add(mark);
    const el = document.createElement("div"); el.className = "tag"; el.style.background = "#e8730c"; el.textContent = it.name;
    markLabel = new CSS2DObject(el); markLabel.position.set(cx, cy + h / 2 + 0.25, cz); scene.add(markLabel);
    note.textContent = it.name + "：" + it.place; note.style.display = "block";
    const p = new THREE.Vector3(...it.from), t = new THREE.Vector3(cx, cy, cz);
    anim = { t0: performance.now(), ms: 1100, p0: camera.position.clone(), t0v: controls.target.clone(), p1: p, t1: t };
    document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.classList.remove("active"));
    panel.classList.remove("open");
  }
  function render() {
    const q = norm(input.value);
    const hit = q ? items.filter((it) => it.key.includes(q)) : items;
    list.innerHTML = "";
    if (!hit.length) { list.innerHTML = '<div class="none">見つかりません。別の言い方で試してください。</div>'; return; }
    for (const it of hit) {
      const li = document.createElement("li"); li.tabIndex = 0;
      li.innerHTML = "<b></b><span></span>"; li.firstChild.textContent = it.name; li.lastChild.textContent = it.place;
      li.addEventListener("click", () => show(it));
      li.addEventListener("keydown", (e) => { if (e.key === "Enter") show(it); });
      list.appendChild(li);
    }
  }
  btn.addEventListener("click", () => { const o = panel.classList.toggle("open"); if (o) { render(); input.focus(); } });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const f = list.querySelector("li"); if (f) f.click(); } if (e.key === "Escape") panel.classList.remove("open"); });
  // 見る場所のボタンを押したら、光る印は消す
  document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.addEventListener("click", clearMark));
}
