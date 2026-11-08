import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { speckle, hsl } from "./tex.js";
import { ROOMS_RAW } from "./data.js";
import { baseRooms } from "./rooms.js";
import { FESTIVAL, loadExhibits, matchPlace, exhibitCardsHtml, genreColor, esc } from "./festival.js";
import { FOOTPRINTS, OPEN_COURTS, STAIRS, WINGS, CATEGORIES, describe, SCHOOL, SITE, SITE_INFO, SITE_NOTE, AERIAL_ALIGN, FACADE, BLOCKS, PILOTIS, ROOM_PARTS, COLUMN_AREAS, GYM_GALLERY, ROOM_EDITS, EXTRA_ROOMS, ROOM_SPLITS, ROOM_STYLE, WALL_OPENINGS, PHOTOS, GEO_ALIGN, SEARCH_ALIASES, VENDING_NOTE } from "./info.js";
import { buildFurniture, floorStyle, FLOOR_TEX } from "./furniture.js";
import { buildTrees, buildColumnTrees, hedgeBox, hedgeMass, matHedge, bakeStatic } from "./nature.js";
import { buildSite, createAerial, flatPoly, polyBounds, inPoly, buildTerrain, setSlope, texAsphalt, texPavers, worldUV } from "./site.js";

// ---------- 寸法（メートル） ----------
const CW = 1.5;   // 図面の1列の幅
const RH = 1.25;  // 図面の1行の奥行き
const FH = 3.6;   // 1フロアの高さ
const BAY = 3.0;  // 窓1つ分の幅
const C_MID = 36, R_MID = 35;
const X = (c) => (c - C_MID) * CW;
const Z = (r) => (r - R_MID) * RH;
const base = (f) => (f - 1) * FH;
const rectOf = (o) => ({ x0: X(o.c0), x1: X(o.c1 + 1), z0: Z(o.r0), z1: Z(o.r1 + 1) });
const key = (c, r) => c + "," + r;
// 棟の範囲（いくつかの長方形）
const areasOf = (w) => w.areas || [w.area];
const inCells = (c, r, [c0, r0, c1, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1;

// ---------- 航空写真のトレース（棟ごとの位置合わせ） ----------
// 建物は図面の座標で作り、棟ごとのグループに「拡大縮小＋移動」をかけて、航空写真で測った位置に置く
const BLOCK_LIST = BLOCKS.map((b) => {
  const [c0, r0, c1, r1] = b.cells, [wx0, wz0, wx1, wz1] = b.world;
  const sx = (wx1 - wx0) / (X(c1 + 1) - X(c0)), sz = (wz1 - wz0) / (Z(r1 + 1) - Z(r0));
  return { ...b, sx, sz, ox: wx0 - X(c0) * sx, oz: wz0 - Z(r0) * sz };
});
const IDENT = { id: "_", cells: [0, 0, -1, -1], sx: 1, sz: 1, ox: 0, oz: 0 };
const blockAtCell = (c, r) => BLOCK_LIST.find((b) => inCells(c, r, b.cells)) || IDENT;
const blockAtPoint = (x, z) => blockAtCell(Math.floor(x / CW + C_MID), Math.floor(z / RH + R_MID));
const blockById = (id) => BLOCK_LIST.find((b) => b.id === id) || IDENT;
const toWorld = (x, z, b = blockAtPoint(x, z)) => [b.ox + x * b.sx, b.oz + z * b.sz];
// 実際の位置（メートル）から図面の座標へ
function toDrawing(x, z) {
  const b = BLOCK_LIST.find((k) => x >= k.world[0] - 0.5 && x <= k.world[2] + 0.5 && z >= k.world[1] - 0.5 && z <= k.world[3] + 0.5);
  return b ? [(x - b.ox) / b.sx, (z - b.oz) / b.sz] : [x, z];
}
// parent の中に、その棟の変換をかけたグループを作る（同じ棟なら使い回す）
// 体育館は、2階・3階の床が校舎の床より高い（1階の武道場の天井が高い）。その差（m）
const GYM_LIFT = 1.05;
// 体育館の南の外廊下の腰壁：茶色の小さなタイル（写真）。1枚ずつ色が少しちがう
const matGymTile = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const c = cv.getContext("2d");
  c.fillStyle = "#cfc2b8"; c.fillRect(0, 0, 128, 128); // 目地
  const tw = 128 / 12, th = 128 / 20; // 0.6m に 12×20 枚（細長いタイル）
  for (let j = 0; j < 20; j++) for (let i = 0; i < 12; i++) {
    const v = Math.random() * 30 - 15;
    c.fillStyle = `rgb(${104 + v},${58 + v * 0.7},${58 + v * 0.6})`;
    c.fillRect(i * tw + 0.6, j * th + 0.6, tw - 1.2, th - 1.2);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
})();
// 体育館の外廊下と渡り廊下の床の、緑の人工芝
const matTurf = new THREE.MeshStandardMaterial({ color: 0x2f9a3a, roughness: 1 });
function inBlock(parent, b) {
  const map = (parent.userData.blocks ||= {});
  if (!map[b.id]) {
    const g = new THREE.Group();
    // 2階より上の階のグループ（userData.floor が2以上）に入る体育館の部分は、GYM_LIFT だけ高くする
    g.position.set(b.ox, b.id === "gym" && (parent.userData.floor ?? 0) >= 2 ? GYM_LIFT : 0, b.oz);
    g.scale.set(b.sx, 1, b.sz);
    parent.add(g);
    map[b.id] = g;
  }
  return map[b.id];
}

// ---------- 部屋データ ----------
// 分ける部屋を、横にならんだ小さな部屋にする
const ROOMS = baseRooms(); // 部屋の一覧は js/rooms.js（管理画面と共通）
STAIRS.forEach((s, i) => {
  s.floors.forEach((f) => {
    ROOMS.push({
      id: `F${f}-ST${i}`, name: s.name, floor: f, c0: s.c0, r0: s.r0, c1: s.c1, r1: s.r1,
      cat: "stairs", kind: "stairs", upTo: s.floors.includes(f + 1), fromBelow: s.floors.includes(f - 1),
      desc: `${s.floors.join("・")}階をつなぐ階段です。（位置は図面から読み取ったおおよその場所です）`,
    });
  });
});
// 図面で名前のない区画を、となりの部屋の一部としてつける（事務室のL字など）
for (const p of ROOM_PARTS) {
  const parent = ROOMS.find((r) => r.name === p.name && r.floor === p.floor && r.kind === "room");
  if (!parent) continue;
  const part = { ...p, id: parent.id + "-P" + ((parent.parts ||= []).length), cat: parent.cat, kind: "part", parent };
  parent.parts.push(part);
  ROOMS.push(part);
  // join：となりの部屋とのあいだに壁を立てない（つながっている）
  if (p.join) {
    const j = ROOMS.find((r) => r.name === p.join && r.floor === p.floor && r.kind === "room");
    if (j) { (parent.joined ||= []).push(j); j.joinedTo = parent; }
  }
}
ROOMS.forEach((r) => {
  const rc = rectOf(r);
  r.cx = (rc.x0 + rc.x1) / 2;
  r.cz = (rc.z0 + rc.z1) / 2;
  r.w = rc.x1 - rc.x0;
  r.d = rc.z1 - rc.z0;
  const ccx = (r.c0 + r.c1) / 2, ccr = (r.r0 + r.r1) / 2;
  // 航空写真に合わせたあとの位置と大きさ。2つの棟にまたがる部屋は、角ごとにその棟の位置を使う
  r.block = blockAtCell(Math.floor(ccx), Math.floor(ccr));
  let [wx0, wz0] = toWorld(rc.x0, rc.z0, blockAtCell(r.c0, r.r0));
  let [wx1, wz1] = toWorld(rc.x1, rc.z1, blockAtCell(r.c1, r.r1));
  // xBlock：東西の位置と幅は、この棟に合わせる（棟にまたがって細くなりすぎる部屋のため）
  if (r.xBlock) { const b = blockById(r.xBlock); wx0 = toWorld(rc.x0, 0, b)[0]; wx1 = toWorld(rc.x1, 0, b)[0]; }
  r.wx = (wx0 + wx1) / 2; r.wz = (wz0 + wz1) / 2; r.ww = wx1 - wx0; r.wd = wz1 - wz0;
  // 部屋の板・壁は r.block の中に置くので、その棟の図面の座標に戻しておく
  r.cx = (r.wx - r.block.ox) / r.block.sx; r.cz = (r.wz - r.block.oz) / r.block.sz;
  r.w = r.ww / r.block.sx; r.d = r.wd / r.block.sz;
  r.wing = WINGS.find((w) => areasOf(w).some((a) => ccx >= a[0] && ccx <= a[2] + 1 && ccr >= a[1] && ccr <= a[3] + 1));
});
const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

// 表示用の短い名前
function shortName(r) {
  if (r.grade) return `${r.grade}-${r.cls}`;
  if (r.kind === "stairs") return "階段";
  return r.name
    .replace("みんなのトイレ", "みんなのWC")
    .replace("男子トイレ", "男子WC")
    .replace("女子トイレ", "女子WC")
    .replace("職員トイレ", "職員WC");
}

// ---------- 建物の輪郭（セルの集合） ----------
const OCC = {};
for (const f of [1, 2, 3]) {
  const m = new Map();
  for (const [c0, r0, c1, r1, style] of FOOTPRINTS[f]) {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (!m.has(key(c, r))) m.set(key(c, r), style);
  }
  for (const [c0, r0, c1, r1] of OPEN_COURTS) {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) m.delete(key(c, r));
  }
  OCC[f] = m;
}

// ---------- three.js の準備 ----------
const app = document.getElementById("viewer");
// スマホなど画面のきめが細かい（1つの点が小さい）ときは、ふちのギザギザが目立たないので、ギザギザをなめらかにする処理（重い）を省く
const fineScreen = window.devicePixelRatio >= 2 && Math.min(window.innerWidth, window.innerHeight) < 700;
const renderer = new THREE.WebGLRenderer({ antialias: !fineScreen, powerPreference: "high-performance" }); // 2つ画像処理の部品があるパソコンでは、速いほうを使う
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.min(window.innerWidth, window.innerHeight) < 700 ? 1.5 : 1.75)); // 細かすぎると重いので、上限をおさえる
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 処理落ち対策①：太陽は動かないので、影は毎回計算しなおさず、見せるものが変わったとき（階の切りかえ・家具の表示など）だけ計算する
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
const shadowsDirty = () => { renderer.shadowMap.needsUpdate = true; };
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "labels";
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = skyTexture();
// 遠くの家並みは霧でうすくなって消えていく
scene.fog = new THREE.Fog(0xdde8f1, 230, 360);

const persp = new THREE.PerspectiveCamera(45, 1, 0.5, 1000);
persp.position.set(55, 75, 95);
const ortho = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
ortho.position.set(0, 200, 0.001);
ortho.up.set(0, 0, -1);

const controls3d = new OrbitControls(persp, labelRenderer.domElement);
controls3d.enableDamping = true;
controls3d.maxPolarAngle = Math.PI * 0.48;
controls3d.minDistance = 6;
// 操作しやすく：地面にそって動かす、マウスの位置に向かってズーム、少しなめらかに止まる
controls3d.screenSpacePanning = false;
controls3d.zoomToCursor = true;
controls3d.dampingFactor = 0.09; // 指をはなしたあと、少しすべるように止まる
controls3d.rotateSpeed = 0.7;
controls3d.panSpeed = 1.1;
controls3d.zoomSpeed = 1.2;
controls3d.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls3d.keyPanSpeed = 25;
controls3d.maxDistance = 220;
controls3d.target.set(0, 4, 0);

const controls2d = new OrbitControls(ortho, labelRenderer.domElement);
controls2d.enableRotate = false;
controls2d.screenSpacePanning = true;
controls2d.minZoom = 0.6;
controls2d.zoomToCursor = true;
controls2d.maxZoom = 8;
controls2d.enabled = false;
controls2d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls2d.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

scene.add(new THREE.HemisphereLight(0xdcebff, 0xa49c86, 1.0));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(70, 110, 55);
sun.castShadow = true;
// スマホなど小さい画面では影を軽くする
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700 || /Android|iPhone|iPad/.test(navigator.userAgent);
sun.shadow.mapSize.set(isSmall ? 2048 : 4096, isSmall ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 400 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun);

// ---------- テクスチャ（窓・地面など）をその場で描く ----------
function canvasTex(w, h, draw, repeat = true) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function skyTexture() {
  return canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#7fb2e5");
    gr.addColorStop(0.55, "#cfe3f5");
    gr.addColorStop(1, "#dde8f1");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}

function noise(g, w, h, alpha, n = 1800) {
  speckle(g, w, h, n, [[255, 255, 255], [0, 0, 0]], alpha);
}

// 1ベイ（幅3m × 高さ3.6m）分の外壁。px = 80 / m
const PX = 80;
function glass(g, x, y, w, h) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, "#5f7f9c");
  gr.addColorStop(0.45, "#2f4a63");
  gr.addColorStop(0.5, "#8fb0c8");
  gr.addColorStop(0.58, "#3a5772");
  gr.addColorStop(1, "#24394d");
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}
function frame(g, x, y, w, h, t = 4) {
  g.strokeStyle = "#c3c8cc"; g.lineWidth = t; g.strokeRect(x, y, w, h);
}
const H = FH * PX, W = BAY * PX;
const yFromFloor = (m) => H - m * PX; // 床からの高さ(m) → canvas の y

// 外壁の色（白い壁と茶色いタイルの壁）
const PALETTE = {
  white: { base: "#f1eee7", band: "#e1ddd3", line: "#d3cec2", tile: false },
};
function wallBase(g, p) {
  g.fillStyle = p.base; g.fillRect(0, 0, W, H);
  noise(g, W, H, p.tile ? 0.12 : 0.06);
  if (p.tile) {
    // タイルの目地
    g.fillStyle = "rgba(255,240,220,0.10)";
    for (let y = 0; y < H; y += 0.25 * PX) g.fillRect(0, y, W, 1.5);
    for (let row = 0, y = 0; y < H; y += 0.25 * PX, row++) for (let x = (row % 2) * 0.3 * PX; x < W; x += 0.6 * PX) g.fillRect(x, y, 1.5, 0.25 * PX);
  }
}
function makeSchoolTex(p) {
  return canvasTex(W, H, (g) => {
    wallBase(g, p);
    // 床スラブの帯
    g.fillStyle = p.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
    g.fillStyle = p.line; g.fillRect(0, yFromFloor(0.45), W, 3);
    // 窓（写真では、床から約1.2mまでは白い腰壁で、窓はその上だけ）
    const x = 0.3 * PX, w = 2.4 * PX, y = yFromFloor(2.9), h = 1.65 * PX;
    glass(g, x, y, w, h);
    // 窓の内側の、両はしにまとめたクリーム色のカーテン（ひだ）。ところどころ少し引き出してある
    for (const [cx0, cw] of [[x + 4, 0.28 * PX], [x + w - 4 - 0.22 * PX, 0.22 * PX]]) {
      for (let i = 0; i < cw; i++) {
        const v = 200 + Math.sin(i / 2.2) * 22;
        g.fillStyle = `rgba(${v},${v - 6},${v - 28},0.85)`;
        g.fillRect(cx0 + i, y + 3, 1, h - 6);
      }
    }
    g.fillStyle = "#c3c8cc";
    g.fillRect(x + w / 2 - 2, y, 4, h);           // 縦の桟
    g.fillRect(x, yFromFloor(2.35), w, 4);         // 欄間
    // 腰壁の目地
    g.fillStyle = "rgba(0,0,0,0.07)"; g.fillRect(0, yFromFloor(1.15), W, 3);
    frame(g, x, y, w, h, 5);
    // 窓台の影
    g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, y + h + 2, w, 4);
    // 窓台の両はしから下へのびる、うすい雨だれのよごれ
    for (const sx of [x + 6, x + w * 0.5, x + w - 10]) {
      const gr = g.createLinearGradient(0, y + h + 6, 0, y + h + 6 + 0.9 * PX);
      gr.addColorStop(0, "rgba(90,85,75,0.10)"); gr.addColorStop(1, "rgba(90,85,75,0)");
      g.fillStyle = gr; g.fillRect(sx, y + h + 6, 5 + Math.random() * 4, 0.9 * PX);
    }
    // 柱
    g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  });
}
const texSchool = makeSchoolTex(PALETTE.white);
// 窓のない白い壁（練習室の北など）
const texPlain = canvasTex(W, H, (g) => { wallBase(g, PALETTE.white); });
const texPlainArt = canvasTex(W, H, (g) => { wallBase(g, { base: "#e9dfcf", band: "#ddd2c0", line: "#cfc3ae", tile: false }); }); // 美術・図書館棟の色
// 美術・図書館棟はうすいベージュの壁（写真）
// 図書室の西の面（写真）：白い柱のあいだが、床から天井近くまで青みがかった灰色の大きなガラス窓。床の位置に濃い青灰色の帯
const texLibGlass = canvasTex(W, H, (g) => {
  wallBase(g, { base: "#eceae4", band: "#ddd8cc", line: "#cfc8b8", tile: false });
  const x = 0.32 * PX, w = BAY * PX - 0.64 * PX, y = yFromFloor(3.05), h = 2.55 * PX;
  g.fillStyle = "#5d6f80"; g.fillRect(x, y, w, h);
  glass(g, x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = "rgba(70,90,110,0.35)"; g.fillRect(x, y, w, h);
  g.fillStyle = "#8b98a4"; g.fillRect(x, yFromFloor(1.3), w, 4); g.fillRect(x + w / 3, y, 3, h); g.fillRect(x + (2 * w) / 3, y, 3, h);
  frame(g, x, y, w, h, 5);
  g.fillStyle = "#56677a"; g.fillRect(0, yFromFloor(0.5), W, 0.5 * PX); // 床の位置の帯
});
const texArtWing = makeSchoolTex({ base: "#e9dfcf", band: "#ddd2c0", line: "#cfc3ae", tile: false });
// 美術室・図書室の中庭側（東）の面（写真）：うすいベージュの壁に、柱のあいだいっぱいの大きな窓。
// 白いアルミの枠で、たての桟が3本、上に欄間。内側にクリーム色のカーテン。床の位置に横の帯
const texArtCourt = canvasTex(W, H, (g) => {
  wallBase(g, { base: "#e9dfcf", band: "#ddd2c0", line: "#cfc3ae", tile: false });
  g.fillStyle = "#ddd2c0"; g.fillRect(0, yFromFloor(0.55), W, 0.55 * PX);
  g.fillStyle = "#cfc3ae"; g.fillRect(0, yFromFloor(0.55), W, 3);
  const x = 0.22 * PX, w = BAY * PX - 0.44 * PX, y = yFromFloor(3.0), h = 2.25 * PX, yt = yFromFloor(2.4);
  glass(g, x, y, w, h);
  // カーテン（両はしと、まんなかに少し）
  for (const [cx0, cw] of [[x + 4, 0.3 * PX], [x + w * 0.5 - 0.12 * PX, 0.24 * PX], [x + w - 4 - 0.3 * PX, 0.3 * PX]]) {
    for (let i = 0; i < cw; i++) { const v = 205 + Math.sin(i / 2.2) * 20; g.fillStyle = `rgba(${v},${v - 4},${v - 24},0.8)`; g.fillRect(cx0 + i, yt + 4, 1, y + h - yt - 8); }
  }
  g.fillStyle = "#f4f4f2";
  for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4 - 2.5, y, 5, h); // たての桟
  g.fillRect(x, yt - 3, w, 6);                                              // 欄間
  g.strokeStyle = "#f4f4f2"; g.lineWidth = 7; g.strokeRect(x, y, w, h);
  g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(x, y + h + 3, w, 4); // 窓台の影
});

// 茶色いレンガタイルの壁（端の壁。窓はほとんどない）
const texBrick = canvasTex(W, H, (g) => {
  // 写真のレンガ：明るめの赤茶色で、1枚ずつ色が少しちがう。目地はうすい灰色
  g.fillStyle = "#b39a8c"; g.fillRect(0, 0, W, H);
  const bh = 0.12 * PX, bw = 0.3 * PX;
  for (let row = 0, y = 0; y < H; y += bh, row++) {
    for (let x = -(row % 2) * bw / 2; x < W; x += bw) {
      const v = Math.random() * 44 - 22;
      g.fillStyle = `rgb(${168 + v},${84 + v * 0.7},${64 + v * 0.5})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  // 床の位置の目地（少し濃い帯）
  g.fillStyle = "rgba(60,25,15,0.35)"; g.fillRect(0, yFromFloor(0.05), W, 4);
});

// 丸い階段塔（白い壁に横長の窓の帯）
const texStack = canvasTex(256, H, (g, w, h) => {
  g.fillStyle = "#f3f1ec"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.05);
  g.fillStyle = "#5b6d7e"; g.fillRect(0, yFromFloor(2.4), w, 0.55 * PX);
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(0, yFromFloor(2.4), w, 4);
  g.fillStyle = "#d9d5cc"; g.fillRect(0, yFromFloor(1.15), w, 3);
  g.fillStyle = "#dcd8cf"; g.fillRect(0, yFromFloor(0.35), w, 0.35 * PX);
}, true);
texStack.repeat.set(4, 1);
const texTower = canvasTex(256, H, (g, w, h) => {
  g.fillStyle = "#f3f1ec"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.05);
  // 横じまの帯（手すり壁）と窓
  g.fillStyle = "#c9c6bd"; for (const m of [0.95, 2.35]) g.fillRect(0, yFromFloor(m), w, 4);
  g.fillStyle = "#5b6d7e"; g.fillRect(0, yFromFloor(2.25), w, 0.7 * PX);
}, true);
texTower.repeat.set(6, 1);

const makeGymLow = (p) => canvasTex(W, H, (g) => {
  wallBase(g, p);
  g.fillStyle = p.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  // 地窓
  glass(g, 0.4 * PX, yFromFloor(1.0), 2.2 * PX, 0.45 * PX);
  frame(g, 0.4 * PX, yFromFloor(1.0), 2.2 * PX, 0.45 * PX, 3);
  // 縦のリブ
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, 0, 2, yFromFloor(1.1));
});
const texGymLow = makeGymLow(PALETTE.white);
const texGymHigh = canvasTex(W, H, (g) => {
  wallBase(g, PALETTE.white);
  const x = 0.3 * PX, w = 2.4 * PX, y = yFromFloor(3.2), h = 1.9 * PX;
  glass(g, x, y, w, h);
  g.fillStyle = "#c3c8cc"; g.fillRect(x + w / 3, y, 4, h); g.fillRect(x + 2 * w / 3, y, 4, h);
  frame(g, x, y, w, h, 5);
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, yFromFloor(1.2), 2, 1.2 * PX);
});
const texHigh = canvasTex(W, H, (g) => {
  wallBase(g, PALETTE.white);
  g.fillStyle = PALETTE.white.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  const x = 0.35 * PX, w = 2.3 * PX, y = yFromFloor(3.1), h = 1.4 * PX;
  glass(g, x, y, w, h);
  frame(g, x, y, w, h, 5);
});

// 芝生：細かい葉の粒と、刈り込みのむら（ところどころ明るい・暗いところ）
const texGrass = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#7a9e55"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 50 + Math.random() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, Math.random() < 0.5 ? "rgba(60,85,35,0.08)" : "rgba(170,180,100,0.07)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  { // 細長い葉（模様はうすめ）
    const pal = Array.from({ length: 24 }, () => hsl(80 + Math.random() * 20, 30 + Math.random() * 14, 38 + Math.random() * 18));
    speckle(g, w, h, 40000, pal, 0.45 * 2, 1, () => 2 + ((Math.random() * 3) | 0));
  }
});
texGrass.repeat.set(60, 60);


// 外のレンガ敷き（昇降口のあいだ・体育館のまわりの広場で同じものを使う）
function makeBrickFloorTex() {
  return canvasTex(256, 256, (g, W2, H2) => {
    g.fillStyle = "#a7685a"; g.fillRect(0, 0, W2, H2);
    const bh = 16, bw = 32;
    for (let row = 0, y = 0; y < H2; y += bh, row++) {
      for (let x = -(row % 2) * bw / 2; x < W2; x += bw) {
        const v = Math.random() * 26 - 13;
        g.fillStyle = `rgb(${172 + v},${108 + v * 0.6},${88 + v * 0.5})`; // 少し明るめのレンガ
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
  });
}
const texBrickFloor = makeBrickFloorTex();

const texStairs = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = "#9aa0a8"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#6f757d";
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 8, w, 3);
});

const texRoofTop = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#b4b8b2"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.08, 1500);
});

// ---------- 外壁を作る ----------
// 輪郭セルの集合から、外側に面した辺を探して壁の板にする
function boundarySegments(cells, classify = null) {
  const segs = [];
  const dirs = [
    { dc: 0, dr: -1, n: [0, -1] }, // 北（図面の上）
    { dc: 0, dr: 1, n: [0, 1] },   // 南
    { dc: -1, dr: 0, n: [-1, 0] }, // 西
    { dc: 1, dr: 0, n: [1, 0] },   // 東
  ];
  const groups = new Map();
  for (const [k, style] of cells) {
    const [c, r] = k.split(",").map(Number);
    dirs.forEach((d, di) => {
      if (cells.has(key(c + d.dc, r + d.dr))) return;
      const horizontal = d.dr !== 0;
      const line = horizontal ? r + (d.dr > 0 ? 1 : 0) : c + (d.dc > 0 ? 1 : 0);
      const pos = horizontal ? c : r;
      const st = classify ? classify(c, r, d, style) : style;
      const gk = `${di}|${line}|${st}`;
      if (!groups.has(gk)) groups.set(gk, { di, line, style: st, pos: [] });
      groups.get(gk).pos.push(pos);
    });
  }
  for (const g of groups.values()) {
    g.pos.sort((a, b) => a - b);
    let start = g.pos[0], prev = g.pos[0];
    const flush = (a, b) => {
      const d = dirs[g.di];
      let ax, az, bx, bz;
      if (d.dr !== 0) { ax = X(a); bx = X(b + 1); az = bz = Z(g.line); }
      else { az = Z(a); bz = Z(b + 1); ax = bx = X(g.line); }
      segs.push({ ax, az, bx, bz, n: d.n, style: g.style });
    };
    for (let i = 1; i < g.pos.length; i++) {
      if (g.pos[i] !== prev + 1) { flush(start, prev); start = g.pos[i]; }
      prev = g.pos[i];
    }
    flush(start, prev);
  }
  return segs;
}

// 外向きの面になるように壁の板をつくる
function wallGeometry(segs, y0, h, uScale = 1 / BAY) {
  const pos = [], uv = [], idx = [];
  for (const s of segs) {
    let { ax, az, bx, bz } = s;
    // (-dz, dx) が外向きになる向きにそろえる
    const dx = bx - ax, dz = bz - az;
    if (-dz * s.n[0] + dx * s.n[1] < 0) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
    const len = Math.hypot(bx - ax, bz - az);
    const i = pos.length / 3;
    pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0 + h, az);
    const u = len * uScale;
    uv.push(0, 0, u, 0, u, 1, 0, 1);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// セルの集合を長方形の集まりにまとめる
function cellsToRects(set) {
  const rows = new Map();
  for (const k of set) {
    const [c, r] = k.split(",").map(Number);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(c);
  }
  const runsByRow = new Map();
  for (const [r, cs] of rows) {
    cs.sort((a, b) => a - b);
    const runs = [];
    let s = cs[0], p = cs[0];
    for (let i = 1; i < cs.length; i++) {
      if (cs[i] !== p + 1) { runs.push([s, p]); s = cs[i]; }
      p = cs[i];
    }
    runs.push([s, p]);
    runsByRow.set(r, runs);
  }
  const rects = [];
  const open = new Map(); // "c0,c1" -> rect
  const sortedRows = [...runsByRow.keys()].sort((a, b) => a - b);
  let lastRow = null;
  for (const r of sortedRows) {
    const next = new Map();
    for (const [c0, c1] of runsByRow.get(r)) {
      const k2 = c0 + "," + c1;
      const o = open.get(k2);
      if (o && lastRow === r - 1) { o.r1 = r; next.set(k2, o); open.delete(k2); }
      else { const nr = { c0, c1, r0: r, r1: r }; rects.push(nr); next.set(k2, nr); }
    }
    open.clear();
    for (const [k2, v] of next) open.set(k2, v);
    lastRow = r;
  }
  return rects;
}

const matPlain = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9, side: THREE.DoubleSide });
// 屋上のふち：屋根の板の横の面と同じ面にあるので、少し手前に描く（ちらつき対策）
const matParapet = new THREE.MeshStandardMaterial({ color: 0xd9d3c5, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
const matRoof = new THREE.MeshStandardMaterial({ map: texRoofTop, color: 0xffffff, roughness: 0.95 });
// 中央棟の北の屋根：屋根いっぱいに古い太陽光パネル（黒っぽい板が格子にならぶ）
const texPanelRoof = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const c = cv.getContext("2d");
  c.fillStyle = "#9a9a96"; c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 32) {
    const v = Math.random() * 12;
    c.fillStyle = `rgb(${38 + v},${44 + v},${56 + v})`; c.fillRect(x + 1, y + 1, 30, 14);
    c.strokeStyle = "rgba(160,170,185,0.25)"; c.lineWidth = 0.6;
    for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x + 1 + k * 7.5, y + 1); c.lineTo(x + 1 + k * 7.5, y + 15); c.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const matRoofDark = new THREE.MeshStandardMaterial({ map: texPanelRoof, color: 0xffffff, roughness: 0.4, metalness: 0.3 });

// 白い壁の柱と庇。柱は窓の区切りごと、庇は各階の上の端
const matRelief = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.85 });
function wallRelief(segs, f) {
  const geos = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); geos.push(g); };
  for (const sg of segs) {
    if (sg.style === "brick") continue;
    const gym = sg.style.startsWith("gym");
    const alongX = sg.n[1] !== 0; // 北・南向きの面は x 方向にのびる
    const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az);
    if (len < 2) continue;
    const [nx, nz] = sg.n;
    const y0 = base(f);
    // 柱（たて）
    const step = gym ? 6 : alongX ? 4.5 : 3.75;
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = sg.ax + (sg.bx - sg.ax) * t + nx * 0.2, z = sg.az + (sg.bz - sg.az) * t + nz * 0.2;
      const cd = gym ? 0.4 : 0.55; // 柱の出っ張り（教室棟は腰壁の帯より前に出る）
      box(alongX ? 0.45 : cd, FH, alongX ? cd : 0.45, x + nx * (cd / 2 - 0.2), y0 + FH / 2, z + nz * (cd / 2 - 0.2));
    }
    if (gym) {
      // 体育館は上のふちに細い庇
      const dep = 0.35;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (alongX) box(len + 0.4, 0.2, dep, cx, y0 + FH - 0.1, cz);
      else box(dep, 0.2, len + 0.4, cx, y0 + FH - 0.1, cz);
    } else if (sg.style === "office") {
      // 窓の上の小さな庇（写真の、窓ごとの茶色っぽい庇）
      const dep = 0.45;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (f < 3) { if (alongX) box(len + 0.2, 0.12, dep, cx, y0 + FH - 0.55, cz); else box(dep, 0.12, len + 0.2, cx, y0 + FH - 0.55, cz); }
    } else if (sg.style === "artdoor") {
      // 床までの窓なので、横の帯は出さない
    } else if (sg.style === "artwing" || sg.style === "artcourt") {
      // 美術・図書館棟（写真）：窓の上下に細い横の帯だけ（出っ張りは小さい）
      const dep = 0.12;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      // 中庭側は窓が大きいので、帯は窓の下だけ
      for (const yy of sg.style === "artcourt" ? [0.2, 0.68] : [0.25, 1.15]) { if (alongX) box(len + 0.2, 0.12, dep, cx, y0 + yy, cz); else box(dep, 0.12, len + 0.2, cx, y0 + yy, cz); }
    } else if (sg.style === "glassblock") {
      // 床の位置の白い梁だけ（腰はガラスブロックなので出っ張らない）
      const dep = 0.25, bh = 0.5;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (alongX) box(len + 0.3, bh, dep, cx, y0 + bh / 2 - 0.05, cz); else box(dep, bh, len + 0.3, cx, y0 + bh / 2 - 0.05, cz);
    } else {
      // 教室棟は、各階の下の白い腰壁の帯が外に出ている（写真の太い白い横帯）
      const dep = 0.3, bh = 1.25;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (alongX) box(len + 0.3, bh, dep, cx, y0 + bh / 2 - 0.05, cz);
      else box(dep, bh, len + 0.3, cx, y0 + bh / 2 - 0.05, cz);
    }
    // 1階の足もと（基礎の帯）
    if (f === 1) {
      const bx = (sg.ax + sg.bx) / 2 + nx * 0.1, bz = (sg.az + sg.bz) / 2 + nz * 0.1;
      if (alongX) box(len, 0.5, 0.2, bx, 0.05, bz); else box(0.2, 0.5, len, bx, 0.05, bz);
    }
  }
  const beige = segs.length && segs.every((sg) => /^art(wing|court|door)$/.test(sg.style));
  const m = new THREE.Mesh(geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry(), beige ? matReliefBeige : matRelief);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const matReliefBeige = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.85 });

// 太陽光パネル（屋上の長方形の中に、南向きに少し傾けてならべる）
const texSolar = canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = "#1d2f5c"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#7f93b8"; g.lineWidth = 1;
  for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = "#c9ced6"; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
}, false);
const panelGeo = new THREE.BoxGeometry(1.0, 0.05, 1.6);
const panelMat = new THREE.MeshStandardMaterial({ map: texSolar, roughness: 0.35, metalness: 0.4 });
function solarPanels(rects, y) {
  const spots = [];
  for (const rc of rects) {
    const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    if (w < 6 || d < 4.5) continue;
    for (let z = rc.z0 + 1.6; z <= rc.z1 - 1.6; z += 2.2) {
      for (let x = rc.x0 + 1.2; x <= rc.x1 - 1.2; x += 1.05) {
        // 写真のように、ところどころ設備の白い四角があってパネルがない
        const k = Math.sin(Math.round(x / 3.2) * 12.99 + Math.round(z / 4.4) * 78.23) * 43758.55;
        if (k - Math.floor(k) < 0.12) continue;
        spots.push([x, z]);
      }
    }
  }
  const im = new THREE.InstancedMesh(panelGeo, panelMat, Math.max(1, spots.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.17, 0, 0));
  spots.forEach(([x, z], i) => { m4.compose(new THREE.Vector3(x, y + 0.35, z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
  im.count = spots.length;
  im.castShadow = true;
  return im;
}
// 廊下の床：学校によくある長尺シート（うすい灰緑色。かすかなまだら模様と、つなぎ目の線）
const texCorridor = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const c = cv.getContext("2d");
  c.fillStyle = "#efe7d8"; c.fillRect(0, 0, 256, 256); // うすいベージュ
  speckle(c, 256, 256, 2500, [[255, 255, 255], [90, 100, 90]], 0.08);
  c.fillStyle = "rgba(150,135,110,0.18)"; c.fillRect(0, 0, 256, 1.5); // 1.8m おきのつなぎ目
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
})();
const matSlab = new THREE.MeshStandardMaterial({ map: texCorridor, color: 0xffffff, roughness: 0.6 });
// 外壁は、同じ面にぴったり重なる柱・床のふちなどより「少し奥」にあるものとして描く（重なった面がちらつかないように）
const wallMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 });
const matStack = new THREE.MeshStandardMaterial({ map: texStack, roughness: 0.8 });
const matGlassDoor = new THREE.MeshStandardMaterial({ color: 0x3e5a74, roughness: 0.15, metalness: 0.3 });
const matStackSide = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85, side: THREE.DoubleSide });
// フロア表示のときの外壁の高さ。外観と同じ模様の下の部分（レンガ・窓の下半分まで）を見せる
const CUT_H = 2.2;

const cutMats = {};
function cutMat(style) {
  if (!cutMats[style]) {
    const src = (MAT_WALL[style] || MAT_WALL.school).map;
    const t = src.clone();
    t.needsUpdate = true;
    t.repeat.set(1, CUT_H / FH);
    cutMats[style] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 });
  }
  return cutMats[style];
}
const matTower = new THREE.MeshStandardMaterial({ map: texTower, roughness: 0.8 });
// 2号館の中庭側（写真）：小さな窓が2つ（上にガラリ）のベイと、横長の窓のベイが交互。窓の上に小さな庇
// 模様1枚が2ベイ分（6m）
const texOffice = canvasTex(W * 2, H, (g) => {
  wallBase(g, PALETTE.white);
  g.save(); g.translate(W, 0); wallBase(g, PALETTE.white); g.restore(); // 右半分（2ベイめ）も塗る
  g.fillStyle = PALETTE.white.band; g.fillRect(0, yFromFloor(0.45), W * 2, 0.45 * PX);
  g.fillStyle = PALETTE.white.line; g.fillRect(0, yFromFloor(0.45), W * 2, 3);
  // ベイA：小さな窓2つ（トイレ・準備室など）と、その上のガラリ
  for (const x of [0.45 * PX, 1.85 * PX]) {
    const w = 0.7 * PX, y = yFromFloor(2.45), h = 1.0 * PX;
    glass(g, x, y, w, h);
    g.fillStyle = "#c3c8cc"; g.fillRect(x + w / 2 - 1.5, y, 3, h);
    frame(g, x, y, w, h, 4);
    g.fillStyle = "#b9bdc0"; g.fillRect(x, yFromFloor(2.85), w, 0.3 * PX);
    g.fillStyle = "rgba(0,0,0,0.25)"; for (let k = 0; k < 5; k++) g.fillRect(x, yFromFloor(2.85) + k * 5, w, 1.5);
  }
  // ベイB：横長の窓（教室・事務室など）
  {
    const x = W + 0.25 * PX, w = 2.5 * PX, y = yFromFloor(2.75), h = 1.55 * PX;
    glass(g, x, y, w, h);
    for (const [cx0, cw] of [[x + 4, 0.3 * PX], [x + w - 4 - 0.25 * PX, 0.25 * PX]]) for (let i = 0; i < cw; i++) { const v = 205 + Math.sin(i / 2.2) * 20; g.fillStyle = `rgba(${v},${v - 6},${v - 28},0.85)`; g.fillRect(cx0 + i, y + 3, 1, h - 6); }
    g.fillStyle = "#c3c8cc"; for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4 - 1.5, y, 3, h);
    g.fillRect(x, yFromFloor(2.3), w, 4);
    frame(g, x, y, w, h, 5);
  }
  // 雨どい
  g.fillStyle = "rgba(200,200,195,0.9)"; g.fillRect(W - 6, 0, 5, H);
});
// 中庭に面した渡り廊下（写真）：腰の部分がうすい緑のガラスブロック、上は窓
const texGlassBlock = canvasTex(W, H, (g) => {
  wallBase(g, PALETTE.white);
  const x = 0.15 * PX, w = 2.7 * PX;
  // ガラスブロック（20cm 角くらい）
  const y0 = yFromFloor(1.15), bh = 0.75 * PX;
  g.fillStyle = "#cfd8cf"; g.fillRect(x, y0, w, bh);
  const cell = 0.19 * PX;
  for (let yy = y0 + 2; yy < y0 + bh - 2; yy += cell) for (let xx = x + 2; xx < x + w - 2; xx += cell) {
    const v = Math.random() * 14;
    g.fillStyle = `rgb(${170 + v},${196 + v},${186 + v})`; g.fillRect(xx + 1.5, yy + 1.5, cell - 3, cell - 3);
    g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(xx + 3, yy + 3, cell * 0.35, 2);
  }
  // 上の窓（廊下の向こうの掲示物がうっすら見える）
  const wy = yFromFloor(2.75), wh = 1.45 * PX;
  glass(g, x, wy, w, wh);
  for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${200 + Math.random() * 50},${180 + Math.random() * 60},${150 + Math.random() * 80},0.45)`; g.fillRect(x + 20 + i * 52, wy + 30, 34, 50); }
  g.fillStyle = "#c3c8cc"; for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4 - 1.5, wy, 3, wh);
  frame(g, x, wy, w, wh, 5);
  g.fillStyle = PALETTE.white.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
});

// 美術室の中庭側（1階・写真）：床までの大きな窓（人が出入りできる引き違いの窓）。下に低いけこみ板、上に欄間
const texArtDoor = canvasTex(W, H, (g) => {
  wallBase(g, { base: "#e9dfcf", band: "#ddd2c0", line: "#cfc3ae", tile: false });
  const x = 0.2 * PX, w = BAY * PX - 0.4 * PX, y = yFromFloor(2.95), h = 2.9 * PX, yt = yFromFloor(2.35);
  glass(g, x, y, w, h);
  for (const [cx0, cw] of [[x + 4, 0.3 * PX], [x + w - 4 - 0.3 * PX, 0.3 * PX]]) {
    for (let i = 0; i < cw; i++) { const v = 205 + Math.sin(i / 2.2) * 20; g.fillStyle = `rgba(${v},${v - 4},${v - 24},0.8)`; g.fillRect(cx0 + i, yt + 4, 1, y + h - yt - 0.2 * PX); }
  }
  g.fillStyle = "#f4f4f2";
  for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4 - 2.5, y, 5, h); // 引き違いの戸のたての枠
  g.fillRect(x, yt - 3, w, 6);                                              // 欄間
  g.fillStyle = "#cfd2d4"; g.fillRect(x, yFromFloor(0.18), w, 0.18 * PX); // 足もとのけこみ板
  g.strokeStyle = "#f4f4f2"; g.lineWidth = 7; g.strokeRect(x, y, w, h);
  for (let k = 0; k < 4; k++) { g.fillStyle = "#9aa0a6"; g.fillRect(x + (w * (k + 0.5)) / 4 - 2, yFromFloor(1.0), 4, 0.18 * PX); } // 取っ手
});

const MAT_WALL = {
  artwing: wallMat(texArtWing),
  artcourt: wallMat(texArtCourt),
  artdoor: wallMat(texArtDoor),
  office: wallMat(texOffice),
  glassblock: wallMat(texGlassBlock),
  school: wallMat(texSchool),
  high: wallMat(texHigh),
  brick: wallMat(texBrick),
  gym2: wallMat(texGymLow),
  gym3: wallMat(texGymHigh),
  plain: wallMat(texPlain),
  libglass: wallMat(texLibGlass),
  plainart: wallMat(texPlainArt),
};

const layers = { exterior: {}, roofs: {}, cut: {}, slab: {}, rooms: {}, labels: {}, furniture: {}, inner: {}, wallsBelow: {} };
// 外壁の内側の面（フロア表示のときだけ）：腰壁＋ガラスの窓（STUDY HALL のガラスと同じ）＋上の壁。外壁は外向きの面しかないので、中から見ると柱だけが見えてしまうため
const matInnerWall = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.9 });
const matInnerGlass = new THREE.MeshStandardMaterial({ color: 0x9cc4dc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const matInnerFrame = new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.5, metalness: 0.4 }); // アルミの窓枠
// 和室（作法室）の窓の内側は障子
const texShoji = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#f6f1e3"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#b08a5a";
  for (let x = 0; x <= w; x += w / 4) g.fillRect(Math.min(x, w - 3), 0, 3, h);
  for (let y = 0; y <= h; y += h / 6) g.fillRect(0, Math.min(y, h - 3), w, 3);
});
const matShoji = new THREE.MeshStandardMaterial({ map: texShoji, roughness: 0.9 });
const SHOJI_ROOMS = /作法室/;
const NO_WINDOW_STYLE = /^(brick|gym|plain)/;
// ガラスブロック（内側から見たとき）：20cm角のブロックがならぶ
const texGlassBlockTile = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#b9c4bd"; g.fillRect(0, 0, w, h); g.fillStyle = "#d5e2d9"; g.fillRect(3, 3, w - 6, h - 6); g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(8, 8, w * 0.4, 5); g.fillStyle = "rgba(90,110,100,0.25)"; g.fillRect(w * 0.55, h * 0.55, w * 0.35, h * 0.35); });
const matGlassBlockIn = new THREE.MeshStandardMaterial({ map: texGlassBlockTile, roughness: 0.25, metalness: 0.05 });
// 長さ L・高さ h の板に、ガラスブロックの模様を 19cm ごとにくり返す
const glassBlockBox = (alongX, L, h, cx, cy, cz, t = 0.1) => { const g = new THREE.BoxGeometry(alongX ? L : t, h, alongX ? t : L).translate(cx, cy, cz); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(L / 0.19)), uv.getY(i) * Math.max(1, Math.round(h / 0.19))); return g; }; // レンガの壁・体育館は窓なし（レンガは内側も壁だけ、体育館は作らない）
const y0OfFloor = (f) => base(f);
const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

for (const f of [1, 2, 3]) {
  // 外壁の色分け（info.js の FACADE で設定）。棟の境目で壁を分けるため、棟の名前もつけておく
  const facade = (c, r, d, style) => {
    const b = blockAtCell(c, r).id;
    const side = d.dr < 0 ? "n" : d.dr > 0 ? "s" : d.dc < 0 ? "w" : "e";
    const op = WALL_OPENINGS.find(([ff, c0, r0, c1, r1, dir]) => ff === f && inCells(c, r, [c0, r0, c1, r1]) && (!dir || dir === side));
    if (op) return (op[6] === "rail" ? "rail|" : "open|") + b; // "rail"：壁のかわりに手すり壁だけ（バルコニー）
    if ((FACADE.plain || []).some(([ff, c0, r0, c1, r1, dir]) => ff === f && side === dir && inCells(c, r, [c0, r0, c1, r1]))) return (b === "art" ? "plainart|" : "plain|") + b; // 窓のない壁
    if (style === "gym") return "gym" + f + "|" + b;
    if (style === "high") return "high|" + b;
    if (OPEN_COURTS.some((rc) => inCells(c + d.dc, r + d.dr, rc))) return "school|" + b; // 光庭のまわりは白
    // 写真に合わせた面ごとの壁（[c0, r0, c1, r1, 向き]）
    for (const [st, list] of [["office", FACADE.office], ["glassblock", FACADE.glassblock], ["libglass", FACADE.libglass], ["artcourt", FACADE.artcourt]]) {
      if (f === 1 && (FACADE.artdoor || []).some(([c0, r0, c1, r1, dir]) => side === dir && inCells(c, r, [c0, r0, c1, r1]))) return "artdoor|" + b;
      if ((list || []).some(([c0, r0, c1, r1, dir]) => side === dir && inCells(c, r, [c0, r0, c1, r1]) && (f >= 2 || st !== "glassblock"))) return st + "|" + b;
    }
    if (b === "art" && style !== "gym") return "artwing|" + b; // 美術・図書館棟
    if (FACADE.brick.some((rc) => inCells(c, r, rc))) return "brick|" + b;
    if (d.dc !== 0 && FACADE.endWallWings.some((rc) => inCells(c, r, rc))) return "brick|" + b; // 棟の東西の端
    return "school|" + b;
  };
  const segs = boundarySegments(OCC[f], facade);
  const segsByBlock = {}, railSegs = {};
  for (const sg of segs) {
    const [st, b] = sg.style.split("|");
    sg.style = st;
    if (st === "open") continue;
    if (st === "rail") { (railSegs[b] ||= []).push(sg); continue; }
    (segsByBlock[b] ||= []).push(sg);
  }
  const ext = new THREE.Group();
  const cut = new THREE.Group();
  const inner = new THREE.Group();
  ext.userData.floor = cut.userData.floor = inner.userData.floor = f;
  const st0 = (sg) => (sg.style.startsWith("gym") ? "gym" : sg.style);
  // バルコニーの外側の手すり壁（高さ1.1m、白）
  for (const [bid, list] of Object.entries(railSegs)) {
    const gs = list.map((sg) => { const alongX = sg.n[1] !== 0, len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az); return new THREE.BoxGeometry(alongX ? len : 0.2, 1.1, alongX ? 0.2 : len).translate((sg.ax + sg.bx) / 2 - sg.n[0] * 0.1, base(f) + 0.55, (sg.az + sg.bz) / 2 - sg.n[1] * 0.1); });
    const m = new THREE.Mesh(mergeGeometries(gs), matRelief); m.castShadow = m.receiveShadow = true;
    inBlock(ext, blockById(bid)).add(m);
  }
  for (const [bid, list] of Object.entries(segsByBlock)) {
    const b = blockById(bid);
    const holder = inBlock(ext, b);
    const byStyle = {};
    for (const sg of list) (byStyle[sg.style] ||= []).push(sg);
    if (bid === "bridge") {
      // 渡り廊下：下半分だけの腰壁で、上半分は開いている（柱が屋根を支える）
      // 床（下から見える厚い板）と、厚みのある腰壁
      const rc = rectOf({ c0: 27, r0: 19, c1: 32, r1: 21 });
      // 2階の渡り廊下は、体育館の2階と同じ高さ（校舎より GYM_LIFT 高い。コモンスペースから階段で上がる）
      const lift = () => (f === 2 ? GYM_LIFT : 0); // 体育館の2階と同じ高さで、まっすぐ
      const shear = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + lift(p.getX(i))); g.computeVertexNormals(); return g; };
      const fg = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.4, rc.z1 - rc.z0, 4, 1, 1);
      fg.translate((rc.x0 + rc.x1) / 2, base(f) - 0.2, (rc.z0 + rc.z1) / 2);
      const fl = new THREE.Mesh(shear(fg), matRelief);
      fl.castShadow = fl.receiveShadow = true;
      holder.add(fl);
      // 2階の渡り廊下（体育館へ）の床は、緑の人工芝（写真）
      if (f === 2) { const tg = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.03, rc.z1 - rc.z0 - 0.5); tg.translate((rc.x0 + rc.x1) / 2, base(f) + GYM_LIFT + 0.015, (rc.z0 + rc.z1) / 2); const tm = new THREE.Mesh(tg, matTurf); tm.receiveShadow = true; holder.add(tm); }
      for (const sg of list) {
        const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), alongX = sg.n[1] !== 0;
        const wg = new THREE.BoxGeometry(alongX ? len : 0.2, 1.7, alongX ? 0.2 : len, alongX ? 4 : 1, 1, 1); // 腰壁は少し高め（1.7m）
        wg.translate((sg.ax + sg.bx) / 2, base(f) + 0.85, (sg.az + sg.bz) / 2);
        const w = new THREE.Mesh(shear(wg), matRelief);
        w.castShadow = w.receiveShadow = true;
        holder.add(w);
      }
      for (const sg of list) {
        const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), n = Math.max(1, Math.round(len / 3));
        for (let i = 0; i <= n; i++) {
          const x = sg.ax + ((sg.bx - sg.ax) * i) / n, h = FH - 1.7 - lift(x);
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, 0.25), matRelief);
          p.position.set(x, base(f) + 1.7 + lift(x) + h / 2, sg.az + ((sg.bz - sg.az) * i) / n);
          holder.add(p);
        }
      }
    } else {
      for (const [st, l2] of Object.entries(byStyle)) {
        const wh = bid === "gym" && f === 1 ? FH + GYM_LIFT : FH; // 体育館の1階は天井が高い
        const m = new THREE.Mesh(wallGeometry(l2, base(f), wh, st === "office" ? 1 / (2 * BAY) : 1 / BAY), MAT_WALL[st] || MAT_WALL.school);
        m.castShadow = true; m.receiveShadow = true;
        holder.add(m);
      }
      // 白い壁の立体感：窓のあいだの柱と、各階の床の位置の庇（ひさし）
      holder.add(wallRelief(list, f));
    }
    // 切断した壁（フロア表示用）
    // 外の壁は窓の下の部分まで見えるように、外壁の模様の下の方を使う
    for (const [st, l2] of Object.entries(byStyle)) {
      const cm = new THREE.Mesh(wallGeometry(l2, base(f), CUT_H, st === "office" ? 1 / (2 * BAY) : 1 / BAY), cutMat(st));
      cm.castShadow = true; cm.receiveShadow = true;
      inBlock(cut, b).add(cm);
    }
    // 外壁の内側の面
    if (bid !== "bridge") {
      const wallG = [], glassG = [], frameG = [], y0 = base(f), inset = 0.18, th = 0.06;
      const piece = (list, sg, y, h, t = th, from = 0, to = 1) => {
        const alongX = sg.n[1] !== 0, len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az) * (to - from) - (from === 0 && to === 1 ? 0.24 : 0); // 両はしは外壁の角から少し離す（角の外に白い線が出ないように）
        const k = (from + to) / 2, cx = sg.ax + (sg.bx - sg.ax) * k - sg.n[0] * inset, cz = sg.az + (sg.bz - sg.az) * k - sg.n[1] * inset;
        list.push(new THREE.BoxGeometry(alongX ? len : t, h, alongX ? t : len).translate(cx, y + h / 2, cz));
      };
      const shojiG = [], gbG = [];
      const inShoji = (sg) => {
        const mx = (sg.ax + sg.bx) / 2 - sg.n[0] * 0.3, mz = (sg.az + sg.bz) / 2 - sg.n[1] * 0.3;
        const c = Math.floor(mx / CW + C_MID), r = Math.floor(mz / RH + R_MID);
        return ROOMS.some((q) => q.floor === f && SHOJI_ROOMS.test(q.name) && inCells(c, r, [q.c0, q.r0, q.c1, q.r1]));
      };
      // 障子の部屋にかかる壁は、部屋の境目で切り分ける（長い壁は1本にまとまっているため）
      const parts = [];
      for (const sg of list) {
        const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), n = Math.max(1, Math.round(L / (sg.n[1] !== 0 ? CW : RH)));
        let start = 0, prev = null;
        for (let i = 0; i <= n; i++) {
          const cur = i < n ? inShoji({ ...sg, ax: sg.ax + (sg.bx - sg.ax) * i / n, az: sg.az + (sg.bz - sg.az) * i / n, bx: sg.ax + (sg.bx - sg.ax) * (i + 1) / n, bz: sg.az + (sg.bz - sg.az) * (i + 1) / n }) : null;
          if (i > 0 && cur !== prev) {
            parts.push({ ...sg, shoji: prev, ax: sg.ax + (sg.bx - sg.ax) * start / n, az: sg.az + (sg.bz - sg.az) * start / n, bx: sg.ax + (sg.bx - sg.ax) * i / n, bz: sg.az + (sg.bz - sg.az) * i / n });
            start = i;
          }
          prev = cur;
        }
      }
      for (const sg of parts) {
        if (!NO_WINDOW_STYLE.test(sg.style) && sg.shoji) { // 障子：窓のところに障子をはめる
          piece(wallG, sg, y0, 0.85); piece(wallG, sg, y0 + 2.65, FH - 2.65);
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), alongX = sg.n[1] !== 0;
          const cx = (sg.ax + sg.bx) / 2 - sg.n[0] * 0.14, cz = (sg.az + sg.bz) / 2 - sg.n[1] * 0.14;
          const g = new THREE.BoxGeometry(alongX ? L : 0.04, 1.8, alongX ? 0.04 : L).translate(cx, y0 + 0.85 + 0.9, cz);
          const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.max(1, Math.round(L / 0.9)));
          shojiG.push(g);
          continue;
        }
        if (st0(sg) === "gym") { // 体育館：下半分は壁、上半分はガラス窓
          piece(wallG, sg, y0, FH / 2); piece(glassG, sg, y0 + FH / 2, FH / 2 - 0.1, 0.03); piece(frameG, sg, y0 + FH / 2, 0.08, 0.12); piece(frameG, sg, y0 + FH - 0.1, 0.08, 0.12);
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), n = Math.max(1, Math.round(L / 2.4));
          for (let i = 0; i <= n; i++) { const u = i / n, w = 0.06 / L; piece(frameG, sg, y0 + FH / 2, FH / 2 - 0.1, 0.1, Math.max(0, u - w / 2), Math.min(1, u + w / 2)); }
          continue;
        }
        if (NO_WINDOW_STYLE.test(sg.style)) { piece(wallG, sg, y0, FH); continue; }
        if (sg.style === "glassblock") { // 2階の渡り廊下の東（写真）：下はガラスブロック、その上に銀の枠の窓
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az) - 0.24, alongX = sg.n[1] !== 0;
          const cx = (sg.ax + sg.bx) / 2 - sg.n[0] * inset, cz = (sg.az + sg.bz) / 2 - sg.n[1] * inset;
          piece(wallG, sg, y0, 0.3);
          gbG.push(glassBlockBox(alongX, L, 0.85, cx, y0 + 0.3 + 0.425, cz));
          piece(frameG, sg, y0 + 1.15, 0.06, 0.16);
          piece(glassG, sg, y0 + 1.2, 1.2, 0.03); piece(frameG, sg, y0 + 2.38, 0.06, 0.12);
          const n = Math.max(1, Math.round(L / 0.9));
          for (let i = 0; i <= n; i++) { const u = i / n, w = 0.05 / L; piece(frameG, sg, y0 + 1.2, 1.2, 0.1, Math.max(0, u - w / 2), Math.min(1, u + w / 2)); }
          piece(wallG, sg, y0 + 2.44, FH - 2.44);
          continue;
        }
        const wb = 0.85, wt = 2.65; // 窓の下と上の高さ
        piece(wallG, sg, y0, wb); piece(wallG, sg, y0 + wt, FH - wt);
        piece(glassG, sg, y0 + wb, wt - wb, 0.03);
        piece(frameG, sg, y0 + wb, 0.06, 0.12); piece(frameG, sg, y0 + wt - 0.06, 0.06, 0.12); piece(frameG, sg, y0 + 1.95, 0.04, 0.1);
        const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), n = Math.max(1, Math.round(L / 1.8));
        for (let i = 0; i <= n; i++) { const u = i / n, w = 0.06 / L; piece(frameG, sg, y0 + wb, wt - wb, 0.1, Math.max(0, u - w / 2), Math.min(1, u + w / 2)); }
      }
      const holderIn = inBlock(inner, b);
      for (const [geos, mat] of [[wallG, matInnerWall], [glassG, matInnerGlass], [frameG, matInnerFrame], [shojiG, matShoji], [gbG, matGlassBlockIn]]) {
        if (!geos.length) continue;
        const m = new THREE.Mesh(mergeGeometries(geos), mat);
        m.receiveShadow = true;
        holderIn.add(m);
      }
    }
  }
  // 白い丸い階段塔（位置は実際のメートル）
  // 半円のバルコニー（東の壁から半円に出る）と、音楽室の横の半円の塔（北の壁から出る）
  for (const t of FACADE.roundStairs) {
    if (!t.tower && t.strip) {
      // 白いたての帯（レンガの壁の上に少し出る）と、両はしの柱
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, FH, t.strip), matRelief);
      band.position.set(t.x + 0.08, base(f) + FH / 2, t.z);
      ext.add(band);
      for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, FH, 0.4), matRelief); col.position.set(t.x + 0.22, base(f) + FH / 2, t.z + s * (t.strip / 2 + 0.2)); col.castShadow = true; ext.add(col); }
      if (f === 1 && t.noDoor) {
        const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.9), matGlassDoor);
        w1.position.set(t.x + 0.2, 1.6, t.z);
        ext.add(w1);
      } else if (f === 1) {
        // 1階は出入口（ガラス戸）と小さな段
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.0), matGlassDoor);
        door.position.set(t.x + 0.18, 1.0, t.z);
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.8), matRelief);
        step.position.set(t.x + 0.6, -0.05, t.z);
        ext.add(door, step);
      }
      if (!t.floors.includes(f)) continue;
      // 半円のバルコニー（下は丸い腰壁で囲まれた形）
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.22, 24, 1, false, 0, Math.PI), matRelief);
      slab.position.set(t.x + 0.16, base(f), t.z);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 1.1, 24, 1, false, 0, Math.PI), matStackSide);
      rail.position.set(t.x + 0.16, base(f) + 0.55, t.z);
      for (const m of [slab, rail]) { m.castShadow = m.receiveShadow = true; ext.add(m); }
      // バルコニーの上の窓と、バルコニーの下の小さな窓
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.8), matGlassDoor);
      win.position.set(t.x + 0.2, base(f) + 1.9, t.z);
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.7), matGlassDoor);
      win2.position.set(t.x + 0.2, base(f) - 1.3, t.z);
      ext.add(win, win2);
      continue;
    }
    if (t.northBalcony) {
      // 北へ出る半円のバルコニー：床（半円の板）と手すり壁（半円の輪）。北向きの半分＝theta π/2〜3π/2
      if (!t.floors.includes(f)) continue;
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.22, 24, 1, false, Math.PI / 2, Math.PI), matRelief);
      slab.position.set(t.x, base(f), t.z);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 1.1, 24, 1, true, Math.PI / 2, Math.PI), matStackSide);
      rail.position.set(t.x, base(f) + 0.65, t.z);
      for (const m of [slab, rail]) { m.castShadow = m.receiveShadow = true; ext.add(m); }
      if (f === 3) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.1, t.r + 0.1, 0.3, 24, 1, false, Math.PI / 2, Math.PI), matRelief); cap.position.set(t.x, base(f) + FH, t.z); cap.castShadow = true; ext.add(cap); } // いちばん上は屋根
      continue;
    }
    if (!t.tower) {
      // 床（半円の板）と、手すり壁（半円の輪）。東向きの半分＝theta 0〜π
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.22, 24, 1, false, 0, Math.PI), matRelief);
      slab.position.set(t.x, base(f) + 0.0, t.z);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 1.1, 24, 1, true, 0, Math.PI), matStackSide);
      rail.position.set(t.x, base(f) + 0.65, t.z);
      for (const m of [slab, rail]) { m.castShadow = m.receiveShadow = true; ext.add(m); }
      // バルコニーに出る窓（ガラス戸と白い枠）を、うしろの壁につける
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 2.2), matRelief);
      frame.position.set(t.x + 0.04, base(f) + 1.3, t.z);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 1.9), matGlassDoor);
      pane.position.set(t.x + 0.1, base(f) + 1.25, t.z);
      ext.add(frame, pane);
      continue;
    }
    // 北向きの半分＝theta π/2〜3π/2
    const m = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, FH, 28, 1, false, Math.PI / 2, Math.PI), matTower);
    m.position.set(t.x, base(f) + FH / 2, t.z);
    m.castShadow = m.receiveShadow = true;
    ext.add(m);
    if (f === 3) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.1, t.r + 0.1, 0.5, 28, 1, false, Math.PI / 2, Math.PI), matParapet);
      cap.position.set(t.x, base(f) + FH + 0.25, t.z);
      cap.castShadow = true;
      ext.add(cap);
    }
  }
  layers.exterior[f] = ext;
  buildingGroup.add(ext);
  layers.cut[f] = cut;
  buildingGroup.add(cut);
  layers.inner[f] = inner;
  buildingGroup.add(inner);

  // 屋上（上の階がない部分）
  const roofCells = new Set();
  for (const [k, st] of OCC[f]) {
    if (st === "gym" && f === 3) continue;
    if (f === 2 && blockAtCell(...k.split(",").map(Number)).id === "art" && Number(k.split(",")[1]) <= 58) continue; // 図書室の棟は2階の上に寄棟の屋根（別に作る）。南の廊下・階段・トイレの帯は平らな屋上
    if (f === 3 && st === "high") continue;
    if (f === 3 || !OCC[f + 1].has(k)) roofCells.add(k);
  }
  const roof = new THREE.Group();
  roof.userData.floor = f;
  // 屋根の種類：中央棟の北半分は黒っぽい屋根（古い太陽光パネル）、ほかは明るい灰色。棟ごとに分ける
  const groups = {};
  for (const k of roofCells) {
    const [c, r] = k.split(",").map(Number);
    const kind = c >= 33 && c <= 41 && r <= 26 ? "dark" : "light";
    const gk = kind + "|" + blockAtCell(c, r).id;
    (groups[gk] ||= new Set()).add(k);
  }
  for (const [gk, set] of Object.entries(groups)) {
    const [kind, bid] = gk.split("|");
    const holder = inBlock(roof, blockById(bid));
    const rects = cellsToRects(set);
    const geos = rects.map((r) => {
      const rc = rectOf(r);
      const g = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.3, rc.z1 - rc.z0);
      g.translate((rc.x0 + rc.x1) / 2, base(f) + FH + 0.15, (rc.z0 + rc.z1) / 2);
      return g;
    });
    const mg = mergeGeometries(geos);
    if (kind === "dark") { // パネルの模様を、屋根の大きさに合わせてくり返す（4mで1枚の模様）
      const p = mg.attributes.position, uv = mg.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
    }
    const rm = new THREE.Mesh(mg, kind === "dark" ? matRoofDark : matRoof);
    rm.receiveShadow = true; rm.castShadow = true;
    holder.add(rm);
    // 1号館・2号館・3号館の屋上には太陽光パネルがある
    if (f === 3 && kind === "light" && ["w1", "w2", "w3"].includes(bid)) holder.add(solarPanels(rects.map(rectOf), base(f) + FH + 0.3));
  }
  if (roofCells.size) {
    // パラペット（屋上のふち）。となりに同じ階の建物があるところには作らない
    const roofMap = new Map([...roofCells].map((k) => [k, "p"]));
    const psegs = boundarySegments(roofMap, (c, r) => blockAtCell(c, r).id).filter((sg) => {
      const mx = (sg.ax + sg.bx) / 2 + sg.n[0] * 0.3, mz = (sg.az + sg.bz) / 2 + sg.n[1] * 0.3;
      const c = Math.floor(mx / CW + C_MID), r = Math.floor(mz / RH + R_MID);
      return !OCC[f].has(key(c, r));
    });
    const byB = {};
    for (const sg of psegs) (byB[sg.style] ||= []).push(sg);
    for (const [bid, list] of Object.entries(byB)) {
      const pm = new THREE.Mesh(wallGeometry(list, base(f) + FH, 0.75), matParapet);
      pm.castShadow = true;
      inBlock(roof, blockById(bid)).add(pm);
    }
  }
  layers.roofs[f] = roof;
  buildingGroup.add(roof);

  // 床（フロア表示用）
  const slab = new THREE.Group();
  slab.userData.floor = f;
  const slabSets = {};
  for (const [k, st] of OCC[f]) {
    const [c, r] = k.split(",").map(Number);
    // 3階の体育館は吹き抜け。ギャラリー（細い通路）と卓球場などの部屋のところだけ床がある
    if (f === 3 && st === "gym" && !GYM_GALLERY.some((g) => inCells(c, r, g)) && r < 33) continue;
    if (f === 3 && st === "high") continue;
    // 下の階から上ってくる階段のところは床に穴をあける
    if (STAIRS.some((sr) => sr.floors.includes(f - 1) && sr.floors.includes(f) && inCells(c, r, [sr.c0, sr.r0, sr.c1, sr.r1]))) continue;
    // 吹き抜け（昇降口の上など）は床がない
    if (ROOMS_RAW.some((q) => q.floor === f && q.name === "吹抜" && inCells(c, r, [q.c0, q.r0, q.c1, q.r1]))) continue;
    (slabSets[blockAtCell(c, r).id] ||= new Set()).add(k);
  }
  for (const [bid, set] of Object.entries(slabSets)) {
    const geos = cellsToRects(set).map((r) => {
      const rc = rectOf(r);
      const g = new THREE.BoxGeometry(rc.x1 - rc.x0 - 0.04, 0.25, rc.z1 - rc.z0 - 0.04); // 外壁と同じ面にならないよう、ほんの少し小さく
      g.translate((rc.x0 + rc.x1) / 2, base(f) - 0.1, (rc.z0 + rc.z1) / 2);
      return g;
    });
    const mg = mergeGeometries(geos);
    { const p = mg.attributes.position, uv = mg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.8, p.getZ(i) / 1.8); }
    const m = new THREE.Mesh(mg, matSlab);
    m.receiveShadow = true;
    inBlock(slab, blockById(bid)).add(m);
  }
  // 体育館3階のギャラリーの手すり（吹き抜け側）
  if (f === 3) {
    const g1 = new THREE.BoxGeometry(0.12, 1.1, Z(33) - Z(8));
    g1.translate(X(25), base(3) + 0.55, (Z(8) + Z(33)) / 2);
    const g2 = new THREE.BoxGeometry(X(25) - X(7), 1.1, 0.12);
    g2.translate((X(7) + X(25)) / 2, base(3) + 0.55, Z(33));
    const g3 = new THREE.BoxGeometry(X(25) - X(23), 1.1, 0.12);
    g3.translate((X(23) + X(25)) / 2, base(3) + 0.55, Z(8));
    const rail = new THREE.Mesh(mergeGeometries([g1, g2, g3]), matSlab);
    rail.castShadow = true;
    inBlock(slab, blockById("gym")).add(rail);
  }
  layers.slab[f] = slab;
  buildingGroup.add(slab);
}

// 3号館の西のはしのレンガの壁（写真）：まんなかに白い柱が1本あり、レンガが左右2枚に分かれて見える
{
  const b3 = blockById("w3"), [px, pz0] = toWorld(X(15), Z(63), b3), [, pz1] = toWorld(X(15), Z(70), b3);
  for (const f of [1, 2, 3]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, FH, 0.7), matRelief);
    pil.position.set(px - 0.2, base(f) + FH / 2, pz0 + (pz1 - pz0) * 0.75); // レンガは南半分（教室の側）
    pil.castShadow = pil.receiveShadow = true;
    layers.exterior[f].add(pil);
  }
}
// 図書室の棟のピンク色の寄棟屋根
{
  // 寄棟は教室・図書室の部分だけ（南の廊下・階段・トイレの帯は3階まであるので、平らな屋上にする）
  const rc = rectOf({ c0: 9, r0: 44, c1: 22, r1: 57 });
  const ov = 1.6, y = 2 * FH + 0.3, rise = 1.4; // 2階の上。写真：ゆるい勾配で、軒が大きく張り出している
  const x0 = rc.x0 - ov, x1 = rc.x1 + ov, z0 = rc.z0 - ov, z1 = rc.z1 + 1.1; // 南の軒は、階段の塔とのすき間の上まで
  const h = (z1 - z0) / 2, zc = (z0 + z1) / 2;
  const v = [
    [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1],
    [x0 + h, y + rise, zc], [x1 - h, y + rise, zc],
  ];
  const faces = [[0, 4, 5], [0, 5, 1], [1, 5, 2], [2, 5, 4], [2, 4, 3], [3, 4, 0]];
  const pos = [];
  for (const fc of faces) for (const i of fc) pos.push(...v[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const hip = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb98676, roughness: 0.75, side: THREE.DoubleSide }));
  hip.castShadow = hip.receiveShadow = true;
  // 軒先の茶色い鼻隠し（屋根のふち）と、軒の裏（白）
  const fasc = new THREE.MeshStandardMaterial({ color: 0x7b5547, roughness: 0.6 });
  const soffit = new THREE.MeshStandardMaterial({ color: 0xece4d6, roughness: 0.9, side: THREE.DoubleSide });
  const fg = [new THREE.BoxGeometry(x1 - x0, 0.35, 0.08).translate((x0 + x1) / 2, y - 0.1, z0), new THREE.BoxGeometry(x1 - x0, 0.35, 0.08).translate((x0 + x1) / 2, y - 0.1, z1),
    new THREE.BoxGeometry(0.08, 0.35, z1 - z0).translate(x0, y - 0.1, (z0 + z1) / 2), new THREE.BoxGeometry(0.08, 0.35, z1 - z0).translate(x1, y - 0.1, (z0 + z1) / 2)];
  const under = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), soffit);
  under.rotation.x = -Math.PI / 2; under.position.set((x0 + x1) / 2, y - 0.27, (z0 + z1) / 2);
  const holderArt = inBlock(layers.roofs[2], blockById("art"));
  holderArt.add(hip, new THREE.Mesh(mergeGeometries(fg), fasc), under);
}

// 3階：視聴覚教室の前（写真）。廊下から2段上がった広い踊り場に視聴覚教室の両開きの扉（上に「使用中」の灯り）。
// 南側は5段の階段で、さらに高い細い通路が西の奥まで続き、その北側の横に準備室の扉（まわりは暗い）。踊り場の奥は壁
{
  const R = rectOf({ c0: 37, r0: 23, c1: 39, r1: 25 });
  const y = base(3) + 0.02, P = 1.3, xd = R.x0 + 1.2, xs = R.x0 + 2.6, top = 0.3 + 5 * 0.17, xw = X(33), zS = Z(25); // P：通路の幅、xd：踊り場の奥の壁、xs：階段の下
  const floorM = new THREE.MeshStandardMaterial({ color: 0xcfc6ad, roughness: 0.45 }), nose = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.7 }), edge = new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: 0.6 });
  const wallM = new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.95 }), darkM = new THREE.MeshStandardMaterial({ color: 0x9d9384, roughness: 0.9 });
  const Bx = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, y + (y0 + y1) / 2, (z0 + z1) / 2);
  const fl = [], ns = [], ed = [], wl = [], dk = [];
  // 廊下からの2段（踊り場の幅いっぱい）と踊り場
  fl.push(Bx(R.x1 - 0.35, R.x1, 0, 0.15, R.z0, R.z1), Bx(xd, R.x1 - 0.35, 0, 0.3, R.z0, R.z1));
  ns.push(Bx(R.x1 - 0.02, R.x1, 0, 0.15, R.z0, R.z1), Bx(R.x1 - 0.37, R.x1 - 0.35, 0.15, 0.3, R.z0, R.z1));
  ed.push(Bx(R.x1 - 0.06, R.x1, 0.14, 0.16, R.z0, R.z1), Bx(R.x1 - 0.41, R.x1 - 0.35, 0.29, 0.31, R.z0, R.z1));
  // 南側の5段の階段（西へ上がる）と、高い通路
  for (let i = 0; i < 5; i++) { const h = 0.3 + 0.17 * (i + 1), x = xs - 0.28 * (i + 1); fl.push(Bx(x, x + 0.28, 0.3, h, R.z1 - P, R.z1)); ns.push(Bx(x + 0.26, x + 0.28, h - 0.17, h, R.z1 - P, R.z1)); ed.push(Bx(x + 0.24, x + 0.28, h - 0.01, h + 0.01, R.z1 - P, R.z1)); }
  fl.push(Bx(R.x0, xd, 0, top, R.z1 - P, R.z1));
  fl.push(Bx(xw, R.x0, 0, top, zS, R.z1)); // 通路は西へ奥まで続く（北どなりの細い準備室の南の壁ぞい）
  // 階段の北の側面（白い）と、踊り場の奥の壁・通路の北の壁（暗い通路）
  ns.push(Bx(xd, xs, 0.3, 0.3 + 0.12, R.z1 - P - 0.12, R.z1 - P));
  wl.push(Bx(xd - 0.12, xd, 0, FH - 0.3, R.z0, R.z1 - P), Bx(R.x0, xd, 0, FH - 0.3, R.z1 - P - 0.12, R.z1 - P));
  // 準備室の扉：通路の北の壁（奥のほう）。通路の突きあたりは壁
  dk.push(Bx(xw + 1.6, xw + 2.5, top, top + 1.95, zS, zS + 0.04));
  const add = (list, m) => { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = mesh.receiveShadow = true; return mesh; };
  const g = new THREE.Group();
  g.add(add(fl, floorM), add(ns, nose), add(ed, edge), add(wl, wallM), add(dk, darkM));
  // 階段の手すり（赤茶色のパイプ）
  const railM = new THREE.MeshStandardMaterial({ color: 0xb4624e, roughness: 0.5, metalness: 0.2 });
  const zr = R.z1 - P - 0.06, a = new THREE.Vector3(xs + 0.05, y + 0.3 + 0.9, zr), b = new THREE.Vector3(xd, y + top + 0.9, zr);
  const len = a.distanceTo(b), pipe = new THREE.CylinderGeometry(0.025, 0.025, len, 8).rotateZ(Math.PI / 2 - Math.atan2(b.y - a.y, a.x - b.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, zr);
  g.add(add([pipe, new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8).translate(xs + 0.05, y + 0.3 + 0.6, zr), new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8).translate(xd + 0.6, y + 0.3 + 0.5 * (top - 0.3) + 0.45, zr)], railM));
  // 視聴覚教室の扉の上の「使用中」の灯り（扉は踊り場から入る）、通路のカラーコーン
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: 0x332a20 }));
  lamp.position.set(R.x0 + 2.95, y + 2.75, R.z0 + 0.06);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 16).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
  cone.position.set(xw + 0.35, y + top + 0.15, R.z1 - 0.35);
  const boards = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.45), new THREE.MeshStandardMaterial({ color: 0xd9c49a, roughness: 0.9 }));
  boards.position.set(xw + 0.35, y + top + 0.075, R.z1 - 0.35);
  g.add(lamp, cone, boards);
  inBlock(layers.inner[3], blockById("spine")).add(g);
}

// 中央棟の屋上の設備（白い箱）
for (const [c, r] of [[36, 15], [36, 30]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), new THREE.MeshStandardMaterial({ color: 0xf2f2ee }));
  m.position.set(X(c), 3 * FH + 1.1, Z(r));
  m.castShadow = true;
  inBlock(layers.roofs[3], blockById("spine")).add(m);
}

// 体育館の屋根：真ん中は茶色い金属の切妻屋根、北の端（ステージ側）と南の端（卓球場の上）は平らな屋根
const gymRect = rectOf({ c0: 7, r0: 6, c1: 26, r1: 31 });
const gymRoof = (() => {
  const g = new THREE.Group();
  const y0 = 3 * FH, rise = 1.8, ov = 0.6;
  const w = gymRect.x1 - gymRect.x0, d = gymRect.z1 - gymRect.z0;
  const cx = (gymRect.x0 + gymRect.x1) / 2, cz = (gymRect.z0 + gymRect.z1) / 2;
  const half = w / 2 + ov;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const ribTex = canvasTex(256, 64, (c, W2, H2) => {
    c.fillStyle = "#8f8276"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#6e645b"; for (let i = 0; i < 4; i++) c.fillRect(0, i * 16, W2, 3);
    // さびの筋
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(${150 + Math.random() * 40},${80 + Math.random() * 30},50,${Math.random() * 0.25})`;
      c.fillRect(Math.random() * W2, 0, 2 + Math.random() * 6, H2);
    }
  });
  ribTex.repeat.set(1, d / 1.2);
  const roofMat = new THREE.MeshStandardMaterial({ map: ribTex, roughness: 0.6, metalness: 0.25 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.25, d + ov), roofMat);
    p.position.set(cx + side * half / 2, y0 + rise / 2, cz);
    p.rotation.z = -side * ang;
    p.castShadow = true; p.receiveShadow = true;
    g.add(p);
  }
  // 妻壁（三角の壁）
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rise); tri.closePath();
  for (const z of [gymRect.z0, gymRect.z1]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ color: 0xe3dccb, side: THREE.DoubleSide }));
    m.position.set(cx, y0, z);
    m.castShadow = true;
    g.add(m);
  }
  // 平らな部分
  const flat = (r0, r1, color) => {
    const rc = rectOf({ c0: 7, r0, c1: 26, r1 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0, 0.3, rc.z1 - rc.z0), new THREE.MeshStandardMaterial({ map: texRoofTop, color, roughness: 0.9 }));
    m.position.set((rc.x0 + rc.x1) / 2, y0 + 0.15, (rc.z0 + rc.z1) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return { ...rc, mat: m.material };
  };
  // 北の端：さびたオレンジ色の平らな屋根。南の端：黒っぽい金属板にさびが出た屋根（太陽光パネルではない）
  flat(1, 5, 0xb97a45).mat.map = rustTex();
  const south = flat(32, 38, 0x6a6c6c);
  south.mat.map = canvasTex(256, 128, (c, W2, H2) => {
    c.fillStyle = "#7a7c7b"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#4e5152";
    for (let y = 6; y < H2; y += 16) for (let x = (y % 32 ? 0 : 20); x < W2; x += 44) c.fillRect(x, y, 38, 9); // 継ぎ目のある板
    c.fillStyle = "rgba(170,100,45,0.55)"; c.fillRect(0, 0, W2, 6); c.fillRect(0, H2 - 8, W2, 8); c.fillRect(0, 0, 6, H2);  // ふちのさび
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(160,95,45,${Math.random() * 0.35})`; c.fillRect(Math.random() * W2, Math.random() * H2, 4 + Math.random() * 10, 2); }
  });
  return g;
})();
gymRoof.position.y += GYM_LIFT;
inBlock(buildingGroup, blockById("gym")).add(gymRoof);

// さびた金属の屋根の模様
function rustTex() {
  return canvasTex(128, 128, (c, W2, H2) => {
    c.fillStyle = "#a0623a"; c.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${90 + Math.random() * 80},${50 + Math.random() * 30},30,${Math.random() * 0.4})`; c.fillRect(Math.random() * W2, Math.random() * H2, 3 + Math.random() * 8, 2); }
    c.fillStyle = "rgba(0,0,0,0.15)"; for (let x = 0; x < W2; x += 8) c.fillRect(x, 0, 2, H2);
  });
}
// 渡り廊下の屋根は、白い平らな屋根
{
  const rc = rectOf({ c0: 27, r0: 19, c1: 32, r1: 21 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0, 0.35, rc.z1 - rc.z0), matRelief);
  m.position.set((rc.x0 + rc.x1) / 2, 2 * FH + 0.2, (rc.z0 + rc.z1) / 2);
  m.castShadow = true;
  inBlock(layers.roofs[2], blockById("bridge")).add(m);
  // 屋根は体育館の壁にくっつくまでのびている（体育館東の外廊下の上）
  const gw = blockById("gym").world, bw = blockById("bridge").world;
  const ext = new THREE.Mesh(new THREE.BoxGeometry(bw[0] - gw[2] + 0.2, 0.35, bw[3] - bw[1]), m.material);
  ext.position.set((gw[2] + bw[0]) / 2, 2 * FH + 0.2, (bw[1] + bw[3]) / 2);
  ext.castShadow = true;
  layers.roofs[2].add(ext);
}

// 体育館の外まわり：西側の通路（手すり壁つき）と北の端の外階段、南側の2階のテラスと外階段、1階の柱
{
  const white = matRelief;
  const geos1 = [], geos2 = [];
  const box = (list, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); list.push(g); };
  // 階段（段を積む）。(x0,z0) が下、(x1,z1) が上
  const stair = (list, x0, z0, x1, z1, y0, y1, width) => {
    const n = Math.max(4, Math.round((y1 - y0) / 0.18));
    const dx = (x1 - x0) / n, dz = (z1 - z0) / n, rise = (y1 - y0) / n;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let i = 0; i < n; i++) {
      const cx = x0 + dx * (i + 0.5), cz = z0 + dz * (i + 0.5), top = y0 + rise * (i + 1);
      // 地面から始まる階段は下まで埋める。上の階から始まる階段は、段の下に板の厚みだけ
      const b0 = y0 > 0.5 ? y0 + rise * i - 0.35 : 0;
      if (alongX) box(list, Math.abs(dx) + 0.02, top - b0, width, cx, (top + b0) / 2, cz);
      else box(list, width, top - b0, Math.abs(dz) + 0.02, cx, (top + b0) / 2, cz);
    }
    // 手すり壁（両側。段にそって傾けた細い板）
    const L = Math.hypot(x1 - x0, z1 - z0), S = Math.hypot(L, y1 - y0);
    const ang = Math.atan2(y1 - y0, L) * (alongX ? Math.sign(x1 - x0) : -Math.sign(z1 - z0));
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(alongX ? S : 0.15, 1.0, alongX ? 0.15 : S), white);
      rail.position.set((x0 + x1) / 2 + (alongX ? 0 : s * width / 2), (y0 + y1) / 2 + 0.6, (z0 + z1) / 2 + (alongX ? s * width / 2 : 0));
      if (alongX) rail.rotation.z = ang; else rail.rotation.x = ang;
      rail.castShadow = true;
      gymExtras.add(rail);
    }
  };
  const gymExtras = new THREE.Group();
  const eaves = [];
  const gx = X(7), gz0 = Z(1), gz1 = Z(39), gxe = X(27);
  // 2階の高さで体育館を囲む外廊下（渡り廊下）。東側で中央棟からの渡り廊下につながり、南の2階の玄関まで行ける
  const ty = FH + GYM_LIFT, dw = 3; // 床の高さ（体育館の2階は校舎より高い）、幅
  const zTop = gz0 + 2, zBot = gz1 + 1.2; // 南の外廊下はせまく（図書室の棟とあくように）
  // 外廊下の床（写真）：体育準備室の前から東は緑の人工芝（両はしは少しコンクリートが見える）
  const turf = [];
  const deck = (x0, x1, z0, z1, noTurf = false) => {
    box(geos2, x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, ty - 0.15, (z0 + z1) / 2);
    const m = 0.25, w = x1 - x0 - 2 * m, d = z1 - z0 - 2 * m;
    // 人工芝は、体育準備室の前から東だけ。プール側（西）の外廊下と踊り場はふつうのコンクリート
    if (!noTurf && x1 > gx + 0.01 && w > 0.3 && d > 0.3) turf.push(new THREE.BoxGeometry(w, 0.03, d).translate((x0 + x1) / 2, ty + 0.015, (z0 + z1) / 2));
  };
  // 外廊下の腰壁（写真では高め、約1.6m）
  // 南（正面側）の腰壁は、柱のあいだが茶色の小さなタイル（写真）。タイルの模様は 0.6m 四方でくり返す
  const tileGeos = [];
  const railTile = (x0, x1, z) => {
    const L = x1 - x0, g = new THREE.BoxGeometry(L, 1.6, 0.2).translate((x0 + x1) / 2, ty + 0.65, z), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.6, uv.getY(i) * 1.6 / 0.6);
    tileGeos.push(g);
  };
  const rail = (x0, x1, z0, z1) => box(geos2, Math.max(0.18, x1 - x0), 1.6, Math.max(0.18, z1 - z0), (x0 + x1) / 2, ty + 0.65, (z0 + z1) / 2);
  // 西側は、北の端の踊り場だけ2階の高さ。そこから南に向かって1階へ下りる外階段がある（写真）
  const landL = 3, stairL = 9.4, sw = 2.4;
  // 外階段は外廊下のさらに外（西）。北の端で外廊下から西へ踊り場が張り出し、そこから南へ下りる
  const so = gx - sw - 0.2;                      // 外廊下の外のふち
  deck(so - sw - 0.2, so, zTop, zTop + landL);  // 北西の踊り場（外廊下の外）
  // 西側の2階の外廊下（体育館の長さいっぱい）
  // 写真：体育館の西の壁ぞいに、北の踊り場から南へ1階へ下りる外階段。その南から外廊下が続く
  deck(gx - sw - 0.2, gx, zTop, zBot);       // 外廊下は北から南までつながる
  rail(so, so, zTop + landL + stairL, zBot);  // 階段の南から先の外廊下の手すり
  rail(so - sw - 0.2, so - sw - 0.2, zTop, zTop + landL); // 踊り場の西の手すり
  rail(so - sw - 0.2, so, zTop, zTop);
  rail(gx - sw - 0.2, gx, zBot, zBot); // 西の外廊下の南のはし（落ちないように手すり）
  deck(gx, gxe + dw, gz1, zBot);                // 南
  deck(gx, X(19), Z(38), gz1);                  // 引っこんだ玄関・体育準備室の前
  box(eaves, X(19) - gx, 0.35, Z(39) - Z(38), (gx + X(19)) / 2, 2 * FH - 0.2, (Z(38) + Z(39)) / 2); // その上は3階の卓球場の張り出し
  rail(gx - sw - 0.2, gx, zTop, zTop);
  // 南：保健体育科準備室（西の端）の前が踊り場。そこから東へ下りる外階段
  const pl = 2.6, sl = 9.4, SW = 2.6; // SW：体育準備室の前の外階段の幅（図書室の棟とあくように少しせまく）
  deck(gx, gx + pl, zBot, zBot + SW);
  railTile(gx + pl, gx + pl + sl, zBot);
  railTile(gx + pl + sl + 2.4, gxe + dw, zBot); // 上の階段の踊り場のところはあけておく
  rail(gx, gx, zBot, zBot + SW);
  rail(gx, gx + pl, zBot + SW, zBot + SW);
  // 中央棟からの渡り廊下がつながるところは手すりなし（渡り廊下の実際の位置を、体育館の図面の座標に直す）
  const gb = blockById("gym"), brw = blockById("bridge").world;
  const bz0 = (brw[1] - gb.oz) / gb.sz, bz1 = (brw[3] - gb.oz) / gb.sz;
  // 東：北の端に踊り場。そこから南へ下りる外階段（外廊下の外側）
  // 東の外廊下：中央棟からの渡り廊下がつながるところから南だけ人工芝。北（北の踊り場・外階段のほう）はコンクリート（写真）
  deck(gxe, gxe + dw, zTop, bz0, true);
  deck(gxe, gxe + dw, bz0, gz1);
  deck(gxe + dw, gxe + dw + 2.4, zTop, zTop + 2.4, true);
  rail(gxe + dw + 2.4, gxe + dw + 2.4, zTop, zTop + 2.4);
  rail(gxe + dw, gxe + dw + 2.4, zTop, zTop);
  rail(gxe + dw, gxe + dw, zTop + 2.4, bz0);
  rail(gxe + dw, gxe + dw, bz1, zBot);
  rail(gxe, gxe + dw, zTop, zTop);
  box(geos2, 0.35, ty, 0.35, gxe + dw + 2.2, ty / 2 - 0.15, zTop + 0.2);
  // 外廊下と踊り場を支える柱
  for (let z = zTop; z <= zBot; z += 4.5) box(geos2, 0.35, ty, 0.35, gxe + dw - 0.3, ty / 2 - 0.15, z);
  for (let x = gx; x <= gxe + dw; x += 4.5) box(geos2, 0.35, ty, 0.35, x, ty / 2 - 0.15, zBot - 0.3);
  box(geos2, 0.35, ty, 0.35, gx - sw, ty / 2 - 0.15, zTop + 0.3);
  box(geos2, 0.35, ty, 0.35, so - sw, ty / 2 - 0.15, zTop + 0.3);
  box(geos2, 0.35, ty, 0.35, so - sw, ty / 2 - 0.15, zTop + landL - 0.3);
  // 外階段：北西の踊り場から南へ1階に下りる階段と、南側の外から2階に上がる階段
  // 外廊下のさらに西に、北の踊り場へ上がる外階段（南から北へ上る）
  stair(geos1, so - sw / 2 - 0.1, zTop + landL + stairL, so - sw / 2 - 0.1, zTop + landL, -0.2, ty, sw);
  for (let z = zTop + 4.5; z <= gz1; z += 4.5) box(geos2, 0.35, ty, 0.35, gx - sw, ty / 2 - 0.15, z);
  // 南側の2階の入口の上は、3階の床がのびた ひさし
  // （上の外階段のところは、ひさしの南の部分をあける）
  box(eaves, pl, 0.35, zBot + SW - gz1, gx + pl / 2, 2 * FH - 0.2, (gz1 + zBot + SW) / 2);
  // 踊り場より東は、壁から少しだけ出た小さなひさし
  const eD = 1.5;
  box(eaves, gxe + dw - gx - pl, 0.3, eD, (gx + pl + gxe + dw) / 2, 2 * FH - 0.18, gz1 + eD / 2);
  stair(geos1, gx + pl + sl, zBot + SW / 2, gx + pl, zBot + SW / 2, -0.2, ty, SW - 0.1);
  // 体育準備室の前の外階段は、1階→2階の階段の真上に、同じ形の2階→3階の階段がある（3階の卓球場へ）
  deck(gx + pl + sl, gx + pl + sl + 2.4, zBot, zBot + SW); // 2階：上の階段の上り口の踊り場
  rail(gx + pl + sl + 2.4, gx + pl + sl + 2.4, zBot, zBot + SW);
  stair(geos1, gx + pl + sl, zBot + SW / 2, gx + pl, zBot + SW / 2, ty, 2 * FH + GYM_LIFT, SW - 0.1);
  // 2階→3階の階段の両側のななめの手すり壁と、上りきった3階の踊り場（卓球場の入口の前）とそのまわりの手すり壁
  {
    const y3 = 2 * FH + GYM_LIFT, rise = y3 - ty, ang = Math.atan2(rise, sl), len = Math.hypot(sl, rise);
    for (const z of [zBot + 0.08, zBot + SW - 0.08]) {
      const g = new THREE.BoxGeometry(len, 1.0, 0.15).rotateZ(-ang).translate(gx + pl + sl / 2, (ty + y3) / 2 + 0.55, z);
      geos2.push(g);
    }
    box(geos2, pl, 0.3, zBot + SW - gz1, gx + pl / 2, y3 - 0.15, (gz1 + zBot + SW) / 2); // 3階の踊り場
    const r3 = (x0, x1, z0, z1) => box(geos2, Math.max(0.15, x1 - x0), 1.1, Math.max(0.15, z1 - z0), (x0 + x1) / 2, y3 + 0.55, (z0 + z1) / 2);
    r3(gx, gx, gz1, zBot + SW);                 // 西
    r3(gx, gx + pl, zBot + SW, zBot + SW);      // 南
    r3(gx + pl, gx + pl, gz1, zBot);            // 東（階段の上り口の北どなり）
  }
  // 3階の卓球場の入口：外階段を上りきった踊り場の前に、ガラスの引き戸2枚と、その上の壁
  {
    const y3 = 2 * FH + GYM_LIFT, dx0 = X(7), dx1 = X(9), dwid = dx1 - dx0;
    for (const k of [0, 1]) {
      const dr = new THREE.Mesh(new THREE.BoxGeometry(dwid / 2 - 0.08, 2.2, 0.08), matGlassDoor);
      dr.position.set(dx0 + dwid / 4 + k * dwid / 2, y3 + 1.1, gz1 - 0.1 + k * 0.08);
      gymExtras.add(dr);
    }
    box(geos2, dwid, 0.12, 0.2, dx0 + dwid / 2, y3 + 2.25, gz1 - 0.05); // ドアの上の枠
    box(geos2, dwid, FH - 2.3, 0.3, dx0 + dwid / 2, y3 + 2.3 + (FH - 2.3) / 2, gz1 - 0.05); // ドアの上の壁
  }
  stair(geos1, gxe + dw + 1.2, zTop + 2.4 + sl, gxe + dw + 1.2, zTop + 2.4, -0.2, ty, 2.3);
  // 1階の南側の柱（柱が並ぶ吹きさらしの部分）
  // （写真）柱は、白い大きな角柱で、足もとだけ灰色。柱のあいだにアーチはない
  const pilBase = [];
  for (let x = gx + 9; x < gxe; x += 4.2) { box(geos2, 0.9, ty, 0.7, x, ty / 2 - 0.2, gz1 + 0.3); pilBase.push(new THREE.BoxGeometry(1.0, 0.4, 0.8).translate(x, 0, gz1 + 0.3)); }
  if (pilBase.length) { const pb = new THREE.Mesh(mergeGeometries(pilBase), new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 0.95 })); pb.castShadow = pb.receiveShadow = true; gymExtras.add(pb); }
  // その奥の茶色い壁（アーチはない）
  {
    const brown = new THREE.MeshStandardMaterial({ color: 0x7a4b38, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(gxe - gx - 8.5, ty - 0.2, 0.3), brown);
    back.position.set((gx + 8.5 + gxe) / 2, ty / 2 - 0.3, gz1 - 2.5);
    back.receiveShadow = true;
    gymExtras.add(back);
  }
  // 南の2階の入口の上の庇（3階の通路）は、2階を見ているときはじゃまなので、2階の屋根と同じあつかい
  { const em = new THREE.Mesh(mergeGeometries(eaves), white); em.castShadow = em.receiveShadow = true; inBlock(layers.roofs[2], blockById("gym")).add(em); }
  const gymHolder = inBlock(layers.exterior[1], blockById("gym"));
  for (const list of [geos1, geos2]) {
    const m = new THREE.Mesh(mergeGeometries(list), white);
    m.castShadow = m.receiveShadow = true;
    gymHolder.add(m);
  }
  gymHolder.add(gymExtras);
  if (tileGeos.length) { const tm = new THREE.Mesh(mergeGeometries(tileGeos), matGymTile); tm.castShadow = tm.receiveShadow = true; gymHolder.add(tm); }
  if (turf.length) { const tm = new THREE.Mesh(mergeGeometries(turf), matTurf); tm.receiveShadow = true; gymHolder.add(tm); }
}

// ---------- 地面・植栽 ----------
// まわりの土地は斜面（北が高く南が低い）。敷地の形に穴をあけてある
setSlope(SITE.slope);
const grassFar = texGrass.clone(); grassFar.needsUpdate = true; grassFar.repeat.set(1, 1);
const ground = buildTerrain(SITE.boundary, new THREE.MeshStandardMaterial({ map: grassFar, roughness: 1 }), SITE.roads);
scene.add(ground);
// 斜面の地面のさらに外：遠くまで続く平らな地面（四角いはしが見えないように。霧で空にとけこむ）
const farGround = new THREE.Mesh(new THREE.RingGeometry(150, 2500, 48, 1), new THREE.MeshStandardMaterial({ color: 0x8fa874, roughness: 1 }));
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -2.5;
scene.add(farGround);

// 学校の敷地（アスファルト）
// 学校の敷地（芝生・植え込み）と、舗装している範囲（アスファルト）
const siteBB = polyBounds(SITE.boundary);
const siteGrassTex = texGrass.clone(); siteGrassTex.needsUpdate = true;
siteGrassTex.repeat.set((siteBB.x1 - siteBB.x0) / 6, (siteBB.z1 - siteBB.z0) / 6);
const siteGround = flatPoly(SITE.boundary, new THREE.MeshStandardMaterial({ map: siteGrassTex, color: 0xd6e6c4, roughness: 1 }), -0.23, siteBB);
scene.add(siteGround);
const bb = polyBounds(SITE.paved);
// 構内の舗装はアスファルト（道路より少し明るい）
const pavingTex = texAsphalt.clone(); pavingTex.needsUpdate = true;
pavingTex.repeat.set((bb.x1 - bb.x0) / 6, (bb.z1 - bb.z0) / 6);
const paving = flatPoly(SITE.paved, new THREE.MeshStandardMaterial({ map: pavingTex, color: 0xd2d0cb, roughness: 0.95 }), 0, bb);
paving.position.y = -0.2;
paving.receiveShadow = true;
scene.add(paving);

// 体育館と校舎のあいだのピンク色の舗装、1号館と2号館のあいだの中庭
const outdoor = new THREE.Group();
scene.add(outdoor);
{
  const flatRect = (x0, x1, z0, z1, mat, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    if (mat.userData.uvScale) worldUV(m, mat.userData.uvScale); // 模様の大きさを実際の長さに合わせる
    outdoor.add(m);
  };
  // 体育館のまわりの広場は、昇降口のあいだと同じ茶色いレンガ敷き
  const pinkTex = texBrickFloor.clone(); pinkTex.needsUpdate = true; pinkTex.repeat.set(10, 10);
  const pink = new THREE.MeshStandardMaterial({ map: pinkTex, roughness: 0.95 });
  // 体育館と中央棟のあいだ、体育館の南、図書室の棟と中央棟のあいだ
  // （位置は航空写真で測った実際のメートル）
  flatRect(-13.4, -4.95, -14.9, 10.4, pink, -0.19);
  flatRect(-43.5, -13.4, 2.7, 10.4, pink, -0.19); // 重ならないように分ける
  flatRect(-16.3, -4.95, 10.4, 33.0, pink, -0.19);
  // 武道場の前のピロティ（体育館の2階の下）も、同じレンガ敷き
  {
    const [px0, pz0] = toWorld(X(20), Z(23), blockById("gym")), [px1, pz1] = toWorld(X(27), Z(39), blockById("gym"));
    flatRect(px0, px1, pz0, pz1, pink, -0.188);
  }
  // 体育館下のピロティ（写真）：奥（北）の壁に武道場の入口（クリーム色の4枚の扉と、ネットのついた欄間の窓）、西の壁ぞいにベンチ
  {
    const gb = blockById("gym"), [dx0, dz] = toWorld(X(22.5), Z(23), gb), [dx1] = toWorld(X(26.5), Z(23), gb);
    const cream = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 0.8 });
    const w = dx1 - dx0, cx = (dx0 + dx1) / 2, g = [];
    for (let i = 0; i < 4; i++) g.push(new THREE.BoxGeometry(w / 4 - 0.04, 2.3, 0.08).translate(dx0 + (w * (i + 0.5)) / 4, 1.0, dz + 0.06));
    const door = new THREE.Mesh(mergeGeometries(g), cream);
    const win = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x3c4c48, roughness: 0.3 }));
    win.position.set(cx, 2.75, dz + 0.06);
    const net = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 1.0, 0.04), new THREE.MeshStandardMaterial({ color: 0x2f5a3a, wireframe: true }));
    net.position.set(cx, 2.75, dz + 0.12);
    const benches = [];
    const [bx, bz0] = toWorld(X(20) + 0.5, Z(27), gb), [, bz1] = toWorld(X(20), Z(35), gb);
    for (const bz of [bz0, (bz0 + bz1) / 2, bz1]) benches.push(new THREE.BoxGeometry(0.35, 0.06, 1.8).translate(bx, 0.22, bz), new THREE.BoxGeometry(0.3, 0.42, 0.06).translate(bx, 0.0, bz - 0.8), new THREE.BoxGeometry(0.3, 0.42, 0.06).translate(bx, 0.0, bz + 0.8));
    const bm = new THREE.Mesh(mergeGeometries(benches), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }));
    for (const m of [door, win, bm]) { m.castShadow = m.receiveShadow = true; }
    outdoor.add(door, win, net, bm);
  }
  const planter = matHedge;
  // 図書室の棟と中央のあいだのレンガの広場の植え込み（航空写真をなぞった形）
  // 北：こんもりした丸い木のかたまり、南：だ円形の植え込み
  outdoor.add(hedgeMass([[-12.7, 20.7, 1.7], [-10, 21.3, 1.6], [-9.1, 18.6, 1.5], [-12.4, 18.2, 1.6], [-10.8, 19.8, 1.6]], 2.6));
  outdoor.add(hedgeMass([[-10.8, 27.1, 1.3], [-8.6, 26.6, 1.5], [-6.6, 27.2, 1.3], [-9.6, 28.0, 1.3], [-7.6, 28.0, 1.2]], 1.5));
  // 広場の色ちがいの舗装（こげ茶の四角）
  const dark = new THREE.MeshStandardMaterial({ color: 0x6e4a3e, roughness: 1 });
  flatRect(-16.3, -8.5, 13.3, 15.8, dark, -0.186);
  flatRect(-6.6, -4.95, 12.6, 18.6, dark, -0.186);
  // 1号館と2号館のあいだの中庭（アスファルト、十字の通路、植え込み）
  const court = new THREE.MeshStandardMaterial({ map: texAsphalt, roughness: 0.95 });
  court.userData.uvScale = 6;
  flatRect(10.3, 49, -8.3, 8.1, court, -0.19);
  // （真上からの航空写真で測った形）
  // 白い通路：西の入口から植え込みまでの東西の通路、植え込みの両はしにつながる南北の通路、東の端の通路
  const walk = new THREE.MeshStandardMaterial({ map: texPavers, roughness: 0.95 });
  walk.userData.uvScale = 2.4;
  // 通路は舗装より1.5cm上に置く（同じ高さだと遠くから見たときにちらつく）
  flatRect(10.3, 24.5, 0.2, 2.3, walk, -0.175);
  flatRect(23.9, 26, -4.7, -1.5, walk, -0.175);
  flatRect(23.9, 26, 2.5, 6.4, walk, -0.175);
  flatRect(37.5, 49, -2.7, -0.6, walk, -0.175);
  // 生け垣（角の丸い植え込み）。高さ0.8m、上に低木をのせる
  const hedge = matHedge;
  const curb = new THREE.MeshStandardMaterial({ color: 0xd9d5cb, roughness: 1 });
  const rounded = (x0, x1, z0, z1, h = 0.8) => {
    const w = x1 - x0, d = z1 - z0, r = Math.min(w, d) / 2;
    const sh = new THREE.Shape();
    sh.moveTo(x0 + r, -z0);
    sh.lineTo(x1 - r, -z0); sh.absarc(x1 - r, -z0 - r, r, Math.PI / 2, -Math.PI / 2, true);
    sh.lineTo(x0 + r, -z1); sh.absarc(x0 + r, -z0 - r, r, -Math.PI / 2, Math.PI / 2, true);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 12 });
    geo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(geo, curb);
    rim.position.y = -0.2; rim.scale.y = 0.4;
    const top = new THREE.Mesh(geo, hedge); // 緑は灰色のふちの上から（同じ面が重なってちらつかないように）
    top.position.y = -0.2 + 0.4 * h; top.scale.y = 0.6;
    rim.castShadow = rim.receiveShadow = top.castShadow = top.receiveShadow = true;
    outdoor.add(rim, top);
    // 低木のかたまり
    const n = Math.max(2, Math.round(w / 2.2));
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), matHedge);
      b.scale.set(Math.min(1.3, d / 2), 0.7, Math.min(1.3, d / 2) * 0.9);
      b.position.set(x0 + r + ((w - 2 * r) * (i + 0.5)) / n, h - 0.1, (z0 + z1) / 2 + Math.sin(i * 2.3) * d * 0.12);
      b.castShadow = true;
      outdoor.add(b);
    }
  };
  rounded(9.8, 23.4, -7.8, -4.7);   // 北西：1号館ぞいの太い生け垣
  rounded(23.4, 39, -8.2, -6.4);    // 北東：1号館ぞいの細い生け垣
  rounded(23.1, 38, -2.7, 3.1);     // まんなか：細長い植え込み（東西の通路の先）
  // 中央の植え込みの正門側の、植え込みの中から立つ高い時計塔（白い柱の上に四面の時計）
  {
    const tx = 36.3, tz = 0.2, H = 7.5; // 植え込みの中から立っている
    const white = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.7 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), white);
    pole.position.set(tx, H / 2 - 0.2, tz);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), white);
    head.position.set(tx, H + 0.3, tz);
    const capT = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x5f6b72, roughness: 0.6 }));
    capT.position.set(tx, H + 1.1, tz); capT.rotation.y = Math.PI / 4;
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const c = cv.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, 64, 64); c.strokeStyle = "#222"; c.lineWidth = 3;
    c.beginPath(); c.arc(32, 32, 28, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(32, 32); c.lineTo(32, 12); c.moveTo(32, 32); c.lineTo(46, 38); c.stroke();
    const face = new THREE.CanvasTexture(cv); face.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 });
    for (let k = 0; k < 4; k++) {
      const f2 = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), fm);
      const a = (k * Math.PI) / 2;
      f2.position.set(tx + Math.sin(a) * 0.51, H + 0.3, tz + Math.cos(a) * 0.51);
      f2.rotation.y = a;
      outdoor.add(f2);
    }
    for (const m of [pole, head, capT]) { m.castShadow = true; outdoor.add(m); }
  }
  rounded(11.5, 20.6, 4.8, 7.6);    // 南西：2号館ぞいの生け垣
  // 3号館の北の壁の外ぞいの、丸く刈った低木の列（廊下に入らないよう壁の外へ）
  for (const [x0, x1, z, step] of [[-14.6, -5.6, 32.2, 1.8]]) {
    for (let x = x0; x <= x1; x += step) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 2), matHedge);
      b.scale.set(1, 0.75, 1); b.position.set(x, 0.45, z);
      b.castShadow = b.receiveShadow = true;
      outdoor.add(b);
    }
  }
  // 保健室の前（2号館の南）の大きな植え込み：西は三角に広がり、東は建物ぞいに細くのびる（航空写真）
  {
    // 西の部分は南の車路の手前まで広く、ななめのふちで東の細い帯につながる。中に木が何本かある
    // 西のはし（3号館の東の壁ぞい）は、保健室へつながるアスファルトの通路なので植えない（航空写真）
    // 形は三角形：2号館の南の壁ぞい（北の辺）と、保健室への通路ぞい（西の辺）、東のはしから南西へななめの辺
    const poly = [[23.8, 28.8], [44, 27.2], [44.4, 28.4], [37, 33], [31, 38], [27, 43], [24.6, 45.4], [23.8, 45]];
    const blobs = [];
    for (let x = 24.2; x <= 44; x += 1.6) for (let z = 27.2; z <= 46.6; z += 1.6) if (inPoly(x, z, poly)) blobs.push([x, z, 1.25]);
    outdoor.add(hedgeMass(blobs, 1.6));
    outdoor.add(buildTrees([[26.5, 32, -0.2, 0.8], [30, 31, -0.2, 0.7], [27.5, 36, -0.2, 0.75], [33, 32, -0.2, 0.65], [26, 40, -0.2, 0.75]].map(([x, z, y, sc]) => [x, y, z, sc])));
  }
}

// 正面玄関（2号館の東）：写真では張り出した庇はなく、レンガの壁にアーチの入口。奥にガラスの扉。前はレンガタイルのテラス
{
  // アーチの壁は、外壁をあけた所（図面の48〜51行）をちょうどふさぐ大きさ
  const wx = 49.8, cz = 12.78, R = 1.4; // R：扉を引っこめる深さ
  const glassM = new THREE.MeshStandardMaterial({ color: 0x3e5a74, roughness: 0.15, metalness: 0.3 });
  const parts = [];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parts.push(m); return m; };
  // レンガのアーチの枠（壁の面にそのまま重ねる）
  const ow = 6.3, oh = 3.8, aw = 3.4, spring = 1.7, D = 0.2; // 壁と同じ面（張り出しなし）
  const sh = new THREE.Shape();
  // 下のふちから入口の形（アーチ）を切りこんだ1本の輪郭
  sh.moveTo(-ow / 2, 0); sh.lineTo(-aw / 2, 0); sh.lineTo(-aw / 2, spring);
  sh.absarc(0, spring, aw / 2, Math.PI, 0, true);
  sh.lineTo(aw / 2, 0); sh.lineTo(ow / 2, 0); sh.lineTo(ow / 2, oh); sh.lineTo(-ow / 2, oh); sh.lineTo(-ow / 2, 0);
  const ag = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 20 });
  const bt = texBrick.clone(); bt.needsUpdate = true; bt.repeat.set(1 / BAY, 1 / FH);
  const arch = add(ag, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85 }), wx, -0.2, cz);
  arch.rotation.y = Math.PI / 2; // 押し出しの向きを東（+x）に
  arch.position.x = wx;
  // アーチの内側の天井と横の壁（少し暗い）、奥のガラスの扉
  const inner = new THREE.MeshStandardMaterial({ color: 0x5a3a30, roughness: 0.9, side: THREE.DoubleSide });
  // 引っこんだ入口：奥のガラスの扉、両わきのレンガの壁、アーチ形の天井、床のタイル
  const xd = wx - R;
  add(new THREE.BoxGeometry(0.06, 2.4, aw - 0.1), glassM, xd, 1.0, cz);
  for (const dz of [-1.65, -0.55, 0.55, 1.65]) add(new THREE.BoxGeometry(0.08, 2.45, 0.08), matRelief, xd + 0.04, 1.02, cz + dz);
  add(new THREE.BoxGeometry(0.06, spring + aw / 2 - 2.2, aw), inner, xd, 2.2 + (spring + aw / 2 - 2.2) / 2 - 0.2, cz);
  const sideMat = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85, side: THREE.DoubleSide });
  for (const s2 of [-1, 1]) add(new THREE.BoxGeometry(R, spring + 0.2, 0.1), sideMat, wx - R / 2, (spring - 0.2) / 2, cz + s2 * (aw / 2 + 0.05));
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(aw / 2, aw / 2, R, 20, 1, true, 0, Math.PI), inner); // 上半分だけ
  vault.rotation.z = Math.PI / 2; vault.position.set(wx - R / 2, spring - 0.2, cz); parts.push(vault);
  const it = texBrickFloor.clone(); it.needsUpdate = true; it.repeat.set(0.6, 1.4);
  add(new THREE.BoxGeometry(R, 0.08, aw), new THREE.MeshStandardMaterial({ map: it, color: 0xf0c8a8, roughness: 0.95 }), wx - R / 2, -0.14, cz);
  // 学校名の銘板（入口の北のわき）
  const plateTex = (() => { const cv = document.createElement("canvas"); cv.width = 48; cv.height = 256; const c = cv.getContext("2d"); c.fillStyle = "#3b3b38"; c.fillRect(0, 0, 48, 256); c.fillStyle = "#e9e4d6"; c.font = "bold 26px serif"; c.textAlign = "center"; [..."神奈川県立麻生高等学校"].forEach((ch, i) => c.fillText(ch, 24, 26 + i * 22.5)); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pl = add(new THREE.PlaneGeometry(0.35, 1.7), new THREE.MeshStandardMaterial({ map: plateTex }), wx + 0.22, 1.4, cz - ow / 2 + 0.45);
  pl.rotation.y = Math.PI / 2;
  // レンガタイルのテラスと、北の花壇（レンガのふち）
  const tt = texBrickFloor.clone(); tt.needsUpdate = true; tt.repeat.set(1.6, 2.4);
  add(new THREE.BoxGeometry(4.2, 0.1, 8.5), new THREE.MeshStandardMaterial({ map: tt, color: 0xf0c8a8, roughness: 0.95 }), wx + 2.1, -0.16, cz + 0.6);
  add(new THREE.BoxGeometry(1.6, 0.45, 3.2), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85 }), wx + 1.0, 0.0, cz - ow / 2 - 1.7);
  const fl = add(new THREE.BoxGeometry(1.4, 0.5, 3.0), matHedge, wx + 1.0, 0.25, cz - ow / 2 - 1.7);
  // テラスの植木鉢
  const pot = new THREE.MeshStandardMaterial({ color: 0xc0704c, roughness: 0.8 });
  for (const [dx, dz] of [[1.8, -1.9], [1.8, 2.1]]) {
    add(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 12), pot, wx + D + dx - 1.2, 0.05, cz + dz);
    add(new THREE.SphereGeometry(0.45, 8, 6), matHedge, wx + D + dx - 1.2, 0.85, cz + dz);
  }
  for (const p of parts) outdoor.add(p);
}

// 2つの昇降口のあいだのレンガ敷きの屋外（上に2・3階がのっている）
{
  const rc = rectOf({ c0: PILOTIS.cells[0], r0: PILOTIS.cells[1], c1: PILOTIS.cells[2], r1: PILOTIS.cells[3] });
  const b = blockAtCell(PILOTIS.cells[0], PILOTIS.cells[1]);
  const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
  const brickTex = texBrickFloor.clone();
  brickTex.needsUpdate = true;
  brickTex.repeat.set(w / 4, d / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((rc.x0 + rc.x1) / 2, -0.17, (rc.z0 + rc.z1) / 2);
  floor.receiveShadow = true;
  inBlock(outdoor, b).add(floor);
  // 2階は吹き抜け。3階の床の裏（天井）と、それを支える2階分の高さの柱
  const low = [], high = [];
  const box = (list, bw2, bh2, bd, x, y, z) => { const g = new THREE.BoxGeometry(bw2, bh2, bd); g.translate(x, y, z); list.push(g); };
  // 柱はテラコッタ色、天井はこげ茶の板張り（昇降口前の写真）
  const cols = [];
  const soffitTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#4e3528"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(0,0,0,0.3)"; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1); });
  soffitTex.repeat.set(1, 20);
  const soffitMat = new THREE.MeshStandardMaterial({ map: soffitTex, roughness: 0.8 });
  // 2階の渡り廊下の床の裏と、吹き抜けの上の3階の床の裏
  const bx0 = X(PILOTIS.bridge[0]), bx1 = X(PILOTIS.bridge[1] + 1);
  box(low, bx1 - bx0, 0.4, d, (bx0 + bx1) / 2, FH - 0.2, (rc.z0 + rc.z1) / 2);
  box(high, bx0 - rc.x0, 0.4, d, (rc.x0 + bx0) / 2, 2 * FH - 0.2, (rc.z0 + rc.z1) / 2);
  // 柱は1列に3本（写真）。1階から3階の床まで、上まで茶色（内側の3本はなくした）
  const colsHigh = [];
  for (const z of [0.18, 0.5, 0.82].map((k) => rc.z0 + (rc.z1 - rc.z0) * k)) {
    for (const x of [rc.x0 + 0.4]) { // 内側（まんなか）の3本はなし
      box(cols, 0.6, FH, 0.6, x, FH / 2 - 0.2, z);
      box(colsHigh, 0.6, FH, 0.6, x, FH * 1.5 - 0.2, z);
    }
    // 渡り廊下を支える柱（中庭側と吹き抜け側）
    box(cols, 0.5, FH, 0.5, bx1 - 0.3, FH / 2 - 0.2, z);
    box(cols, 0.5, FH, 0.5, bx0 + 0.3, FH / 2 - 0.2, z);
  }
  // 写真：柱は赤みのあるテラコッタ色で、たての溝が2本。途中に灰色の帯は入れず、上まで全部茶色
  const colTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = "#a8705e"; c.fillRect(0, 0, w, h); noise(c, w, h, 0.12, 600); c.fillStyle = "rgba(60,30,20,0.35)"; c.fillRect(w * 0.3, 0, 2, h); c.fillRect(w * 0.68, 0, 2, h); });
  const brownCol = new THREE.MeshStandardMaterial({ map: colTex, roughness: 0.85 });
  for (const [list, f] of [[cols, 1], [colsHigh, 2]]) {
    const cm = new THREE.Mesh(mergeGeometries(list), brownCol);
    cm.castShadow = cm.receiveShadow = true;
    inBlock(layers.exterior[f], b).add(cm);
  }
  for (const [list, f] of [[low, 1], [high, 2]]) {
    const m = new THREE.Mesh(mergeGeometries(list), soffitMat); // 天井（床の裏）はこげ茶の板張り（写真）
    m.castShadow = m.receiveShadow = true;
    // 3階の床の裏（吹き抜けの天井）は、2階を見ているときはじゃまなので屋根と同じあつかい
    inBlock(f === 2 ? layers.roofs[2] : layers.exterior[f], b).add(m);
  }
}

// 下の階に部屋がない張り出し部分を、1階の柱で支える
for (const [c0, r0, c1, r1] of COLUMN_AREAS) {
  const rc = rectOf({ c0, r0, c1, r1 });
  const b = blockAtCell(c0, r0);
  const geos = [];
  // 体育館の東側のピロティ（写真）：東のふちに、白い大きな角柱（足もとは灰色）が1列。1本は、X形の柱
  if (b.id === "gym" && c0 === 20 && r0 === 23) {
    const ch = FH + GYM_LIFT, cream = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9 }), gray = new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 0.95 });
    const cx = rc.x1 - 0.7, zA = rc.z0 + 0.9, zB = rc.z1 - 0.9, n = Math.round((zB - zA) / 4.2), step = (zB - zA) / n, xIdx = n - 1; // xIdx：南から2本め
    const body = [], base = [];
    for (let i = 0; i <= n; i++) {
      const z = zA + step * i;
      if (i === xIdx) {
        // X形の柱：板を斜めに2本交差させる（正面は東向き。厚み 0.5m）
        const H = ch, hw = 1.25, t = 0.5;
        for (const sgn of [1, -1]) {
          const sh = new THREE.Shape();
          sh.moveTo(-sgn * hw - t, 0); sh.lineTo(-sgn * hw + t, 0); sh.lineTo(sgn * hw + t, H - 0.6); sh.lineTo(sgn * hw - t, H - 0.6); sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false });
          g.rotateY(-Math.PI / 2).translate(cx + 0.25, -0.2, z); // 形の横方向を z に、厚みを x に
          body.push(g);
        }
        body.push(new THREE.BoxGeometry(0.5, 0.6, 3.1).translate(cx, ch - 0.5, z)); // 上の梁（X の頭）
      } else {
        body.push(new THREE.BoxGeometry(1.0, ch, 0.7).translate(cx, ch / 2 - 0.2, z));
        base.push(new THREE.BoxGeometry(1.1, 0.4, 0.8).translate(cx, 0.0, z));
      }
    }
    const flat = (l) => mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g)));
    const mb = new THREE.Mesh(flat(body), cream), mg = new THREE.Mesh(flat(base), gray);
    for (const m of [mb, mg]) { m.castShadow = m.receiveShadow = true; inBlock(layers.exterior[1], b).add(m); }
    continue;
  }
  const xs = [], zs = [];
  for (let x = rc.x0 + 0.3; x <= rc.x1 - 0.2; x += Math.max(3, (rc.x1 - rc.x0 - 0.6) / Math.max(1, Math.round((rc.x1 - rc.x0) / 5)))) xs.push(x);
  if (rc.x1 - 0.3 - xs[xs.length - 1] > 1) xs.push(rc.x1 - 0.3);
  zs.push(rc.z0 + 0.3); if (rc.z1 - rc.z0 > 2) zs.push(rc.z1 - 0.3);
  for (const x of xs) for (const z of zs) {
    // 1階に建物があるところには立てない
    const c = Math.floor(x / CW + C_MID), r = Math.floor(z / RH + R_MID);
    if (OCC[1].has(key(c, r))) continue;
    const ch = b.id === "gym" ? FH + GYM_LIFT : FH; // 体育館の2階を支える柱は高い
    const g = new THREE.BoxGeometry(0.5, ch, 0.5);
    g.translate(x, ch / 2 - 0.2, z);
    geos.push(g);
  }
  if (!geos.length) continue;
  const m = new THREE.Mesh(mergeGeometries(geos), matRelief);
  m.castShadow = m.receiveShadow = true;
  inBlock(layers.exterior[1], b).add(m);
}

// うすい色のレンガタイル（1枚の模様が 2.4m 四方。タイルは 20cm×10cm くらい）
const texCourtTile = canvasTex(256, 256, (g, W, H) => {
  g.fillStyle = "#cdbcaa"; g.fillRect(0, 0, W, H); // 目地
  const bw = 21, bh = 10.5;
  for (let row = 0, y = 0; y < H; row++, y += bh) for (let x = (row % 2) * bw / 2 - bw; x < W; x += bw) {
    const v = Math.random() * 18 - 9;
    g.fillStyle = `rgb(${226 + v},${200 + v},${180 + v})`;
    g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  }
});
texCourtTile.wrapS = texCourtTile.wrapT = THREE.RepeatWrapping;
// 光庭：床はうすい色のレンガタイル。植え込みはほんの少しだけ（両はしに小さく）
for (const [c0, r0, c1, r1] of OPEN_COURTS) {
  const rc = rectOf({ c0, r0, c1, r1 });
  const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
  const tex = texCourtTile.clone(); tex.needsUpdate = true; tex.repeat.set(w / 2.4, d / 2.4);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  m.position.set((rc.x0 + rc.x1) / 2, -0.12, (rc.z0 + rc.z1) / 2);
  m.receiveShadow = true;
  const holder = inBlock(scene, blockAtCell(c0, r0));
  holder.add(m);
  holder.add(hedgeMass([[rc.x0 + 1.0, rc.z0 + 0.9, 0.8], [rc.x0 + 1.9, rc.z0 + 0.8, 0.7]], 0.9));
  holder.add(hedgeMass([[rc.x1 - 1.0, rc.z1 - 0.9, 0.8], [rc.x1 - 1.9, rc.z1 - 0.8, 0.7]], 0.9));
}

// グラウンド・テニスコート・駐輪場
const site = buildSite(scene, SITE);
const aerial = createAerial(scene, SCHOOL);

// 木（建物のまわりに並べる。位置は雰囲気を出すための飾り）
const trees = new THREE.Group();
scene.add(trees);
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = [];
  const columnar = [];
  const ok = (x, z) => {
    // 建物（航空写真で測った各棟の範囲）のそばには植えない
    if (BLOCK_LIST.some((b) => x > b.world[0] - 3 && x < b.world[2] + 3 && z > b.world[1] - 3 && z < b.world[3] + 3)) return false;
    return site.isFree(x, z);
  };
  // 敷地の中の、舗装していない場所（のり面・植え込み）に木を植える
  for (let i = 0, added = 0; i < 4000 && added < 170; i++) {
    const x = siteBB.x0 + rnd() * (siteBB.x1 - siteBB.x0), z = siteBB.z0 + rnd() * (siteBB.z1 - siteBB.z0);
    if (!inPoly(x, z, SITE.boundary) || inPoly(x, z, SITE.paved)) continue;
    if (spots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4)) continue;
    if (ok(x, z)) { spots.push([x, z, 0.8 + rnd() * 0.6]); added++; }
  }
  // グラウンド北東の道路ぞいの並木（2列）
  {
    const { from: [ax, az], to: [bx2, bz2], offsets, step } = SITE.treeRow;
    const L = Math.hypot(bx2 - ax, bz2 - az), ux = (bx2 - ax) / L, uz = (bz2 - az) / L;
    const nx = uz, nz = -ux;
    for (const off of offsets) for (let t = 0; t < L; t += step) if (site.isFree(ax + ux * t + nx * off, az + uz * t + nz * off)) columnar.push([ax + ux * t + nx * off, az + uz * t + nz * off, 0.9 + ((t * 7) % 3) * 0.08]);
  }
  // 体育館と校舎のあいだの広場の丸い植え込みの木
  // 庭園の木
  for (const [x, z] of SITE.garden?.trees || []) spots.push([x, z, 0.7]);
  // 木（葉のかたまりを重ねた形）と、並木の細長い木
  trees.add(buildTrees(spots.map(([x, z, sc]) => [x, 0, z, sc * 0.85])));
  trees.add(buildColumnTrees(columnar.map(([x, z, sc]) => [x, 0, z, sc])));
}

// ---------- 部屋（フロア表示） ----------
// 折り返し階段の形。上り始めの向き dir（0=東, 90=南, 180=西, 270=北）。上り口から見て右側が上り、左側が下り（左側通行で下り）
function stairFrame(r, H = FH) {
  const st = STAIRS.find((x) => x.name === r.name);
  const A = THREE.MathUtils.degToRad(st && st.dir !== undefined ? st.dir : r.w >= r.d ? 0 : 90);
  const ca = Math.round(Math.cos(A)), sa = Math.round(Math.sin(A)); // 90度ごと
  const L = ca !== 0 ? r.w : r.d, Wd = ca !== 0 ? r.d : r.w;
  // 部屋の中の座標 (u: 上る向き, v: 上る向きの右) の箱を、図面の座標に置く
  const add = (list, u0, u1, v0, v1, y0, y1) => {
    const su = u1 - u0, sv = v1 - v0, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const g = new THREE.BoxGeometry(Math.abs(ca) * su + Math.abs(sa) * sv, y1 - y0, Math.abs(sa) * su + Math.abs(ca) * sv);
    g.translate(r.cx + cu * ca - cv * sa, (y0 + y1) / 2, r.cz + cu * sa + cv * ca);
    list.push(g);
  };
  const n = 11, land = Math.min(1.6, L * 0.28), run = L - land - 0.2, tread = run / n, rise = H / 2 / n;
  return { add, L, Wd, n, tread, rise, a0: -L / 2 + 0.1, landU: L / 2 - 0.1 - land };
}
// まっすぐな階段（折り返しなし）：壁の幅いっぱいに段がならび、上りきったところが踊り場
const isStraight = (r) => !!STAIRS.find((x) => x.name === r.name)?.straight;
function straightFlight(r, y, list) {
  const { add, L, Wd } = stairFrame(r);
  const land = 1.5, a0 = -L / 2 + 0.05, run = L - land - 0.1, n = 18, tread = run / n, rise = FH / n;
  for (let i = 0; i < n; i++) add(list, a0 + i * tread, a0 + (i + 1) * tread, -Wd / 2 + 0.05, Wd / 2 - 0.05, y + rise * (i + 1) - 0.35, y + rise * (i + 1));
  return { add, L, Wd, landU: a0 + run };
}
// H：その階から上の階までの高さ（体育館の1階→2階は高い）
const flightH = (r, fromFloor) => (r.block?.id === "gym" && fromFloor === 1 ? FH + GYM_LIFT : FH);
function stairFlights(r, y, list, upperOnly = false, H = FH) {
  if (isStraight(r)) { straightFlight(r, y, list); return; }
  const { add, L, Wd, n, tread, rise, a0, landU } = stairFrame(r, H);
  for (let i = 0; i < n; i++) {
    if (!upperOnly) add(list, a0 + i * tread, a0 + (i + 1) * tread, 0.06, Wd / 2 - 0.1, y, y + rise * (i + 1)); // 上り（右側）
    const top = y + H / 2 + rise * (i + 1);
    add(list, landU - (i + 1) * tread, landU - i * tread, -Wd / 2 + 0.1, -0.06, top - 0.35, top);              // 踊り場から上の階へ（左側）
  }
  add(list, landU, L / 2 - 0.1, -Wd / 2 + 0.1, Wd / 2 - 0.1, y + H / 2 - 0.25, y + H / 2);                  // 踊り場
  add(list, a0, landU, -0.06, 0.06, upperOnly ? y + H / 2 : y, y + H);                                      // まんなかの壁
}
// いちばん上の階：上り切ったところの床と、吹き抜けのまわりの手すり壁
function stairGuard(r, y, list) {
  if (isStraight(r)) {
    // 上りきったところの踊り場と、段の両側の手すり壁（踊り場の先は通路なので壁なし）
    const { add, L, Wd, landU } = straightFlight(r, y - FH, []);
    add(list, landU, L / 2, -Wd / 2, Wd / 2, y - 0.2, y);
    for (const v of [-Wd / 2, Wd / 2 - 0.1]) add(list, -L / 2, landU, v, v + 0.1, y, y + 1.0);
    return;
  }
  const { add, L, Wd, a0, landU } = stairFrame(r);
  add(list, -L / 2, a0 + 0.02, -Wd / 2, Wd / 2, y - 0.2, y);           // 上り切ったところの床
  add(list, a0, landU, -0.08, 0.08, y, y + 1.1);                        // 吹き抜けと上りの段のあいだの手すり壁
  add(list, a0 - 0.08, a0 + 0.08, 0, Wd / 2 - 0.1, y, y + 1.1);         // 吹き抜けの手前の手すり壁
  add(list, landU, L / 2 - 0.1, Wd / 2 - 0.18, Wd / 2 - 0.1, y, y + 1.1); // 踊り場の上の壁ぎわ
  add(list, -L / 2, L / 2, -Wd / 2 - 0.05, -Wd / 2 + 0.1, y, y + 1.1);   // 外側の壁
  add(list, -L / 2, L / 2, Wd / 2 - 0.1, Wd / 2 + 0.05, y, y + 1.1);
  add(list, L / 2 - 0.1, L / 2 + 0.05, -Wd / 2, Wd / 2, y, y + 1.1);
}

// 生徒や来校者が入らない部屋（準備室・倉庫・設備の部屋など）：うすく小さく表示し、押しても反応しない
const STAFF_ONLY = /準備室|印刷室|保管室|倉庫|器具庫|器具室|電気室|受水槽|給湯室|技能員室|資料室|整理室|職員(男子|女子)?トイレ|職員更衣室|放送$/;
const isStaffOnly = (r) => r.kind !== "stairs" && STAFF_ONLY.test(r.kind === "part" ? r.parent.name : r.name);
const styleOf = (r) => ROOM_STYLE.find((s) => s.name === r.name && s.floor === r.floor && (s.r0 === undefined || s.r0 === r.r0) && (s.c0 === undefined || s.c0 === r.c0));
// 部屋の仕切りの壁の高さ（天井まで描くと中が見えにくいので、ドアの上が少し見える高さ）
const WALL_H = 2.45;
const pickables = [];
const matStairs = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.9 });
const matPartition = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.9 }); // 白（ほんの少しクリーム色）
// ガラス張りの仕切り（STUDY HALL など）
const matGlassWall = new THREE.MeshStandardMaterial({ color: 0x9cc4dc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const matGlassFrame = new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.5, metalness: 0.4 }); // 黒い枠（写真より）
for (const f of [1, 2, 3]) {
  const grp = new THREE.Group();
  const lbl = new THREE.Group();
  grp.userData.floor = lbl.userData.floor = f;
  const walls = {}; // 棟ごと
  const wallsBelow = new THREE.Group(); wallsBelow.userData.floor = f; wallsBelow.visible = false;
  for (const r of ROOMS.filter((x) => x.floor === f)) {
    const y = base(f);
    const isOpen = r.cat === "open";
    const isCourt = /光庭/.test(r.name) || r.name === "吹抜"; // 吹き抜けは床を描かない（下が見える）
    const color = new THREE.Color(CATEGORIES[r.cat].color);
    // 床の模様（木の床・タイル・畳・体育館のコート）
    let map = r.kind === "stairs" ? texStairs : null;
    let tint = color;
    if (!isOpen && r.kind !== "stairs") {
      const st = floorStyle(r.name);
      map = FLOOR_TEX[st === "flooring" ? "wood" : st].clone();
      map.needsUpdate = true;
      if (st === "gym") { map.center.set(0.5, 0.5); map.rotation = Math.PI / 2; tint = new THREE.Color(0xffffff); r.glossy = true; } // 体育館の床はつやがある
      else if (st === "tatami") { map.repeat.set(r.w / 3.6, r.d / 3.6); tint = new THREE.Color(0xffffff); }
      else if (st === "flooring") { map.repeat.set(r.w / 3, r.d / 3); tint = new THREE.Color(0xd9b07a); } // 武道場の木の床
      else if (st === "tile") map.repeat.set(r.w / 1.2, r.d / 1.2);
      else map.repeat.set(r.w / 4, r.d / 4);
      if (/ステージ/.test(r.name)) tint = new THREE.Color(0xc99560); // ステージの木の床
      else if (/卓球場/.test(r.name)) { map = null; tint = new THREE.Color(0x2f7a72); } // 卓球場の床は緑がかった青の樹脂の床（写真）
      else if (/^土間$/.test(r.name)) { map = texBrickFloor.clone(); map.needsUpdate = true; map.repeat.set(r.w / 3, r.d / 3); tint = new THREE.Color(0xffffff); } // 土間はレンガ色のタイル
      else if (/^美術教室$/.test(r.name)) { map = null; tint = new THREE.Color(0xc8c6be); } // 美術教室の床は明るい灰色（写真）
      else if (/^職員室$/.test(r.name)) { map = null; tint = new THREE.Color(0xcfc6b6); } // 職員室の床はつやのあるベージュ（写真）
      else if (/放送室/.test(r.name)) { map = null; tint = new THREE.Color(0x9a4a3c); } // 放送室の床は赤茶色（写真）
      else if (/生徒指導室/.test(r.name)) { map = null; tint = new THREE.Color(0xb9b3a6); } // 生徒指導室の床は灰色がかったベージュ（写真）
      else if (/調理室/.test(r.name)) { map = null; tint = new THREE.Color(0x8a9a88); } // 調理室の床は灰色がかった緑（写真）
      else if (/社会科教室/.test(r.name)) { map = null; tint = new THREE.Color(0x8a9c8c); } // 社会科教室の床は灰色がかった緑（写真）
      else if (/^らくらくスペース$/.test(r.name)) { map = null; tint = new THREE.Color(0xb3b5b3); } // らくらくスペースの床は灰色（写真）
      else if (/^ウエイトルーム$/.test(r.name)) { map = null; tint = new THREE.Color(0x26272a); } // ウエイトルームの床は黒いゴムマット（写真）
      else if (/^視聴覚教室$/.test(r.name)) { map = null; tint = new THREE.Color(0x84443b); } // 視聴覚教室の床は赤茶色のつやのある床（写真）
      else if (/^音楽室$/.test(r.name)) { map = null; tint = new THREE.Color(0x7b2733); } // 音楽室の床はえんじ色
      else if (/STUDY HALL/.test(r.name)) { map = null; tint = new THREE.Color(0x8a7c6c); } // STUDY HALL の床は灰色がかった茶色（写真）
      else if (/コンピューター/.test(r.name)) tint = new THREE.Color(0x4a74c9); // コンピューター教室の床は青
      else if (/教室/.test(r.name) && st === "wood") tint = new THREE.Color(0xeadfc8); // 教室の床はうすいベージュ
    }
    const mat = r.kind === "part" ? r.parent.mesh.material : new THREE.MeshStandardMaterial({
      color: tint, roughness: r.glossy ? 0.35 : 0.85,
      map,
      transparent: isOpen || !!styleOf(r)?.noFloor, opacity: isCourt || styleOf(r)?.noFloor ? 0.0 : isOpen ? 0.35 : 1,
      depthWrite: !isOpen && !styleOf(r)?.noFloor,
    });
    if (r.kind === "stairs") { mat.transparent = true; mat.opacity = 0; mat.depthWrite = false; } // 階段は形で見せ、板はクリック用
    const th = /ステージ/.test(r.name) ? 1.0 : 0.14; // ステージは高くする
    const ins = r.kind === "part" || r.parts ? 0 : 0.14; // L字の部屋は、つながった部分とのあいだにすき間ができないように板をちぢめない
    const tile = new THREE.Mesh(new THREE.BoxGeometry(r.w - ins, th, r.d - ins), mat);
    tile.position.set(r.cx, y + 0.01 + th / 2, r.cz);
    tile.receiveShadow = true;
    tile.userData.room = r.kind === "part" ? r.parent : r;
    r.mesh = tile;
    r.baseColor = color.clone();
    inBlock(grp, r.block).add(tile);
    if (!isStaffOnly(r)) pickables.push(tile); // 入れない部屋は押せない（床の色はそのまま。名前の文字だけうすく小さく）

    // 建物の中の階段：上の階へ上がる折り返し階段（行きの段・踊り場・帰りの段）
    // その階から上る段と、下の階から上ってきた段（上り切ったところ）の両方を見せる。いちばん上の階では吹き抜けに手すり
    if (r.kind === "stairs") {
      const list = [];
      if (r.upTo) stairFlights(r, y, list, false, flightH(r, f));
      // 下の階から上ってくる階段は、行きの段（右側）と下の階の床まで見せる（その階だけ表示したとき、下まで突き抜けないように）
      if (r.fromBelow) { const Hb = flightH(r, f - 1); stairFlights(r, y - Hb, list, false, Hb); stairFrame(r).add(list, -stairFrame(r).L / 2, stairFrame(r).L / 2, -stairFrame(r).Wd / 2, stairFrame(r).Wd / 2, y - Hb - 0.2, y - Hb); }
      if (!r.upTo && r.fromBelow) stairGuard(r, y, list);
      if (list.length) {
        const m = new THREE.Mesh(mergeGeometries(list), matStairs);
        m.castShadow = m.receiveShadow = true;
        inBlock(grp, r.block).add(m);
      }
    }

    if (r.parts) {
      // L字などの部屋は、つながった形のまわりにだけ壁を立てる
      const cells = new Map();
      for (const q of [r, ...r.parts, ...(r.joined || [])]) for (let c = q.c0; c <= q.c1; c++) for (let rr = q.r0; rr <= q.r1; rr++) cells.set(key(c, rr), "p");
      for (const sg of boundarySegments(cells)) {
        // 建物の外に面した辺は外壁があるので立てない（L字の部屋も）
        { const mx = (sg.ax + sg.bx) / 2 + sg.n[0] * 0.3, mz = (sg.az + sg.bz) / 2 + sg.n[1] * 0.3; if (!OCC[f].has(key(Math.floor(mx / CW + C_MID), Math.floor(mz / RH + R_MID)))) continue; }
        const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), t = 0.14, h = WALL_H;
        const g = new THREE.BoxGeometry(sg.n[1] !== 0 ? len : t, h, sg.n[1] !== 0 ? t : len);
        g.translate((sg.ax + sg.bx) / 2, y + h / 2, (sg.az + sg.bz) / 2);
        (walls[r.block.id] ||= []).push(g);
      }
    } else if (!isCourt && r.kind !== "stairs" && r.kind !== "part" && !r.joinedTo) {
      const t = 0.14, h = isOpen ? 1.0 : WALL_H;
      const rc = { x0: r.cx - r.w / 2, x1: r.cx + r.w / 2, z0: r.cz - r.d / 2, z1: r.cz + r.d / 2 };
      const sty = styleOf(r);
      // 建物の外に面した辺は、外壁があるので部屋の壁を立てない（外壁から少しはみ出して、レンガの壁に白い帯が見えてしまうため）
      const ca = Math.floor(r.c0), cb = Math.ceil(r.c1), outSide = (side) => {
        const ks = [];
        const ra = Math.floor(r.r0), rb = Math.ceil(r.r1); // 区画の途中で終わる部屋（録音室など）も、ます目に合わせて調べる
        if (side === "n" || side === "s") for (let c = ca; c <= cb; c++) ks.push(key(c, side === "n" ? ra - 1 : rb + 1));
        else for (let rr = ra; rr <= rb; rr++) ks.push(key(side === "w" ? ca - 1 : cb + 1, rr));
        return ks.every((k) => !OCC[f].has(k));
      };
      // 外に面した辺に向かってのびる壁は、外壁の内側で止める（はしが外壁から少し出て白い線に見えないように）
      const cut = 0.25, oW = outSide("w") ? cut : 0, oE = outSide("e") ? cut : 0, oN = outSide("n") ? cut : 0, oS = outSide("s") ? cut : 0;
      for (const [w, d, x, z, side] of [
        [r.w - oW - oE, t, r.cx + (oW - oE) / 2, rc.z0, "n"], [r.w - oW - oE, t, r.cx + (oW - oE) / 2, rc.z1, "s"],
        [t, r.d - oN - oS, rc.x0, r.cz + (oN - oS) / 2, "w"], [t, r.d - oN - oS, rc.x1, r.cz + (oN - oS) / 2, "e"],
      ]) {
        if (sty?.open?.includes(side)) continue;
        if (!sty?.glass?.includes(side) && outSide(side)) continue;
        if (sty?.glass?.includes(side)) {
          // 床から天井近くまでのガラスと、細い枠（たての枠は約1.5mおき）
          const along = side === "n" || side === "s", L = along ? w : d, H = WALL_H + 0.4;
          const pane = new THREE.Mesh(new THREE.BoxGeometry(along ? L : 0.03, H, along ? 0.03 : L), matGlassWall);
          pane.position.set(x, y + H / 2, z);
          inBlock(grp, r.block).add(pane);
          const fr = [];
          for (const [yy, hh] of [[0.05, 0.1], [H - 0.04, 0.08]]) { const b = new THREE.BoxGeometry(along ? L : 0.08, hh, along ? 0.08 : L); b.translate(x, y + yy, z); fr.push(b); }
          const n = Math.max(1, Math.round(L / 1.5));
          for (let i = 0; i <= n; i++) {
            const o = -L / 2 + (L * i) / n, b = new THREE.BoxGeometry(0.07, H, 0.07);
            b.translate(along ? x + o : x, y + H / 2, along ? z : z + o);
            fr.push(b);
          }
          const fm = new THREE.Mesh(mergeGeometries(fr), matGlassFrame);
          inBlock(grp, r.block).add(fm);
          continue;
        }
        // となりの部屋が、この壁の側を「あける」と指定しているところ（体育館と玄関のあいだなど）は、壁を立てない
        let segs = [[x - w / 2, x + w / 2]];
        if (side === "n" || side === "s") {
          for (const q of ROOMS) {
            if (q === r || q.floor !== f || q.kind !== "room" || !styleOf(q)?.open?.includes(side === "s" ? "n" : "s")) continue;
            if (Math.abs((side === "s" ? q.cz - q.d / 2 : q.cz + q.d / 2) - z) > 0.3) continue;
            const q0 = q.cx - q.w / 2, q1 = q.cx + q.w / 2;
            segs = segs.flatMap(([a0, a1]) => (q1 <= a0 || q0 >= a1 ? [[a0, a1]] : [[a0, q0], [q1, a1]].filter(([u, v]) => v - u > 0.05)));
          }
        }
        for (const [a0, a1] of segs) {
          const g = new THREE.BoxGeometry(a1 - a0, h, d);
          g.translate((a0 + a1) / 2, y + h / 2, z);
          (walls[r.block.id] ||= []).push(g);
        }
      }
    }

    if (r.kind === "part") continue; // ラベルは元の部屋だけ
    if (styleOf(r)?.noLabel) continue; // 名前を出さない場所（昇降口のとなりのホール）
    // ラベル
    const div = document.createElement("div");
    const small = r.w < 4.2 || r.d < 3;
    div.className = `room-label cat-${r.cat}${small ? " small" : ""}${r.grade ? " hr" : ""}${r.kind === "stairs" ? " stairs" : ""}${isStaffOnly(r) ? " staff" : ""}`;
    div.textContent = shortName(r);
    if (r.d > r.w * 1.6 && small && !r.grade) div.classList.add("vertical");
    div.addEventListener("pointerdown", (e) => e.stopPropagation());
    div.addEventListener("click", (e) => { e.stopPropagation(); selectRoom(r, { close: true }); }); // 名前を押すと、その部屋に寄る（紹介を閉じると元にもどる）
    const obj = new CSS2DObject(div);
    obj.position.set(r.cx, y + 1.6, r.cz);
    r.label = div;
    inBlock(lbl, r.block).add(obj);
  }
  for (const [bid, list] of Object.entries(walls)) {
    const pm = new THREE.Mesh(mergeGeometries(list), matPartition);
    pm.castShadow = true; pm.receiveShadow = true;
    inBlock(grp, blockById(bid)).add(pm);
    // 上の階から吹き抜けをのぞいたときにも見えるように、同じ壁を別のグループにも入れておく
    const pm2 = new THREE.Mesh(pm.geometry, matPartition);
    inBlock(wallsBelow, blockById(bid)).add(pm2);
  }
  layers.wallsBelow[f] = wallsBelow;
  scene.add(wallsBelow);
  // 廊下に面した入口のドア：教室の家具の置き方にドアがない部屋は、廊下（部屋のない建物の中）に面した辺にドアをつける
  const NO_DOOR = /年\d+組|選択|オーラル|社会科教室|音楽室|昇降口|玄関|ホール|吹抜|バルコニー|光庭|体育館|ステージ|ラウンジ|らくらく|STUDY HALL|部室|窯/;
  const roomCells = new Set();
  for (const q of ROOMS.filter((x) => x.floor === f)) for (let c = Math.floor(q.c0); c <= Math.ceil(q.c1); c++) for (let rr = q.r0; rr <= q.r1; rr++) roomCells.add(key(c, rr));
  const autoDoors = (x) => {
    if (x.kind !== "room" || NO_DOOR.test(x.name) || styleOf(x)?.doors || styleOf(x)?.open) return null;
    const c0 = Math.floor(x.c0), c1 = Math.ceil(x.c1), sides = { n: [], s: [], w: [], e: [] };
    for (let c = c0; c <= c1; c++) { sides.n.push(key(c, x.r0 - 1)); sides.s.push(key(c, x.r1 + 1)); }
    for (let rr = x.r0; rr <= x.r1; rr++) { sides.w.push(key(c0 - 1, rr)); sides.e.push(key(c1 + 1, rr)); }
    let best = null, bestN = 0;
    for (const [d, ks] of Object.entries(sides)) {
      const n = ks.filter((k) => OCC[f].has(k) && !roomCells.has(k)).length;
      if (n > bestN && n >= Math.min(2, ks.length)) { best = d; bestN = n; }
    }
    // 廊下に面していない部屋（倉庫・設備の部屋など）は、外に面した辺に入口をつける（入口のない部屋をなくす）
    if (!best) for (const [d, ks] of Object.entries(sides)) {
      const n = ks.filter((k) => !OCC[f].has(k)).length;
      if (n > bestN && n >= Math.min(2, ks.length)) { best = d; bestN = n; }
    }
    // 前と後ろに入口がある特別教室
    return best ? [/被服室|コンピューター|調理室|実験室|美術教室|工芸教室/.test(x.name) ? best + "2" : best] : null;
  };
  // 家具（伸び縮みさせず、航空写真に合わせたあとの部屋の大きさで置く）
  const toItem = (x) => ({ floor: f, name: x.kind === "part" ? (x.parent.name === "事務室" ? "受付カウンター" : x.parent.name + "（L字）") : x.name, cx: x.wx, cz: x.wz, w: x.ww, d: x.wd, vending: x.kind === "part" ? null : styleOf(x)?.vending, vendingN: styleOf(x)?.vendingN, vendingShift: styleOf(x)?.vendingShift, doors: x.kind === "part" ? styleOf(x.parent)?.partDoors || null : (styleOf(x)?.doors || autoDoors(x))?.filter((d) => !/clubDoor|door4/.test(d)) });
  const onFloor = ROOMS.filter((x) => x.floor === f && (x.kind === "room" || x.kind === "part"));
  const inGym = (x) => f >= 2 && x.block.id === "gym";
  const furn = new THREE.Group();
  furn.add(buildFurniture(onFloor.filter((x) => !inGym(x)).map(toItem), y0OfFloor(f)));
  if (onFloor.some(inGym)) furn.add(buildFurniture(onFloor.filter(inGym).map(toItem), y0OfFloor(f) + GYM_LIFT)); // 体育館は高い
  // 外への入口（部室の扉）は外観でも見えるように、外壁といっしょに表示する
  const outDoors = onFloor.filter((x) => x.kind === "room" && styleOf(x)?.doors?.some((d) => /clubDoor|door4/.test(d)));
  if (outDoors.length) layers.exterior[f].add(buildFurniture(outDoors.map((x) => ({ name: "_外の入口", cx: x.wx, cz: x.wz, w: x.ww, d: x.wd, doors: styleOf(x).doors.filter((d) => /clubDoor|door4/.test(d)) })), y0OfFloor(f) + (outDoors.some(inGym) ? GYM_LIFT : 0)));
  layers.furniture[f] = furn;
  grp.add(furn);
  if (f === 2) build2FHall(grp);
  layers.rooms[f] = grp;
  layers.labels[f] = lbl;
  scene.add(grp, lbl);
}

// 棟のラベル（外観表示）
const wingLabels = new THREE.Group();
for (const w of WINGS) {
  const div = document.createElement("div");
  div.className = "wing-label";
  div.textContent = w.name;
  w.label = div;
  div.addEventListener("pointerdown", (e) => e.stopPropagation());
  div.addEventListener("click", (e) => { e.stopPropagation(); showWing(w); });
  const obj = new CSS2DObject(div);
  const [c0, r0, c1, r1] = areasOf(w)[0];
  const top = w.id === "wg" ? 3 * FH + 4 : 3 * FH + 2.5;
  const [wx, wz] = toWorld((X(c0) + X(c1 + 1)) / 2, (Z(r0) + Z(r1 + 1)) / 2);
  obj.position.set(wx, top, wz);
  wingLabels.add(obj);
}
// まわりの施設のラベル（外観でも、階を見ているときでも出す）
const siteLabels = new THREE.Group();
for (const it of SITE_INFO) {
  if (it.key && !SITE[it.key]) continue; // key のない項目は、いつも表示する
  const div = document.createElement("div");
  div.className = "wing-label site";
  div.textContent = it.name;
  it.label = div;
  div.addEventListener("pointerdown", (e) => e.stopPropagation());
  div.addEventListener("click", (e) => { e.stopPropagation(); showSite(it); });
  const obj = new CSS2DObject(div);
  obj.position.set(it.x, 5, it.z);
  obj.userData.under = !!it.under; // 建物の下（1階のレベル）の場所：2・3階を見るときは文字を出さない
  siteLabels.add(obj);
}
scene.add(wingLabels, siteLabels);

// ---------- 表示の切り替え ----------
const state = { floor: 0, view: "3d", selected: null };

// ラベル（HTML）はグループごと消しても残ることがあるので、1つずつ切り替える
function setLabelsVisible(group, v) {
  group.visible = v;
  group.traverse((o) => { if (o.isCSS2DObject) o.visible = v; });
}
const visibleDeep = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

// 3階を見ているとき、体育館（3階は吹き抜け）の下に2階の体育館の床とステージ・ゴールなどを見せる（押せない）
// 2階を見ているとき、昇降口の上の吹き抜けから1階の昇降口（床・下駄箱・自販機）が見えるように
const belowGroup = (floor, test) => {
  const g = new THREE.Group();
  const list = ROOMS.filter((r) => r.floor === floor && r.kind === "room" && test(r));
  for (const r of list) {
    const m = new THREE.Mesh(r.mesh.geometry, r.mesh.material);
    m.position.copy(r.mesh.position); m.receiveShadow = true;
    inBlock(g, r.block).add(m);
  }
  g.add(buildFurniture(list.map((x) => ({ name: x.name, cx: x.wx, cz: x.wz, w: x.ww, d: x.wd, vending: styleOf(x)?.vending, vendingN: styleOf(x)?.vendingN, vendingShift: styleOf(x)?.vendingShift })), y0OfFloor(floor)));
  g.visible = false;
  scene.add(g);
  return g;
};
const entranceBelow = belowGroup(1, (r) => r.name === "昇降口");
const gymBelow = (() => {
  const g = new THREE.Group();
  g.userData.floor = 2;
  const list = ROOMS.filter((r) => r.floor === 2 && r.kind === "room" && /^(体育館|ステージ|ウエイトルーム)$/.test(r.name));
  for (const r of list) {
    const m = new THREE.Mesh(r.mesh.geometry, r.mesh.material); // clone は userData（部屋）までコピーしようとするので使わない
    m.position.copy(r.mesh.position); m.receiveShadow = true;
    inBlock(g, r.block).add(m);
  }
  g.add(buildFurniture(list.map((x) => ({ name: x.name, cx: x.wx, cz: x.wz, w: x.ww, d: x.wd })), y0OfFloor(2) + GYM_LIFT));
  g.visible = false;
  scene.add(g);
  return g;
})();

function applyMode() {
  shadowsDirty();
  const f = state.floor;
  if (ex.on && f && ex.lastF !== f) { placeExplorer(f, ex.x, ex.z); ex.yaw = bestYaw(f, ex.yaw); }
  ex.lastF = f;
  gymBelow.visible = f === 3;
  entranceBelow.visible = f === 2;
  for (const k of [1, 2, 3]) {
    const below = f === 0 || k < f;
    // 選んだ階の外壁も、外観と同じもの（窓・レンガ・柱・バルコニー）をそのまま見せる。屋根だけ外して中を見る
    layers.exterior[k].visible = below || k === f;
    layers.roofs[k].visible = below || (ex.on && k === f); // 探検中は天井（屋根）も見せる
    layers.cut[k].visible = false;
    layers.inner[k].visible = f !== 0 && k <= f;
    layers.wallsBelow[k].visible = f !== 0 && k === f - 1; // すぐ下の階の部屋の壁（吹き抜けから見える） // 下の階の外壁の内側も見せる（吹き抜けから下をのぞいたとき、壁や窓が消えないように）
    layers.slab[k].visible = k === f || (ex.on && k === f + 1); // 探検中は上の階の床＝天井
    layers.rooms[k].visible = k === f;
    setLabelsVisible(layers.labels[k], k === f && labelsOn);
  }
  gymRoof.visible = f === 0;
  setLabelsVisible(wingLabels, f === 0 && labelsOn);
  setLabelsVisible(siteLabels, labelsOn && !ex.on);
  siteLabels.children.forEach((o) => { if (o.userData.under && f >= 2) o.visible = false; });
  document.querySelectorAll(".floor-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.floor) === f));
  document.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.getElementById("view-toggle").classList.toggle("disabled", f === 0);
  const floorNote = document.getElementById("floor-note");
  floorNote.textContent = f === 0 ? "外観：棟の名前をクリックすると、その建物の案内が出ます" : `${f}階：部屋をクリックすると紹介が出ます`;
}

function useCamera() {
  const is2d = state.view === "2d" && state.floor !== 0;
  controls3d.enabled = !is2d && !ex.on;
  controls2d.enabled = is2d;
  return is2d ? ortho : persp;
}

let floorCamInit = false; // いちど見たら、階を切り替えても見ている角度・場所はそのまま
function setFloor(f, { keepCamera = false } = {}) {
  if (f === 0 && ex.on) setExplore(false); // 外観にしたら探検はおわり
  const prev = state.floor;
  state.floor = f;
  if (f === 0) state.view = "3d";
  applyMode();
  useCamera();
  if (ex.on) return; // 探検中は、カメラは自分の目
  if (!keepCamera && floorCamInit && state.view === "3d") {
    // 角度と場所はそのままで、見る高さだけ新しい階に合わせる
    const dy = (f ? base(f) : 0) - (prev ? base(prev) : 0);
    anim = null;
    persp.position.y += dy; controls3d.target.y += dy;
    return;
  }
  if (!keepCamera && floorCamInit && state.view === "2d") return; // 平面図も、ずらした場所・ズームのまま
  floorCamInit = true;
  if (!keepCamera) {
    if (f === 0) flyTo(new THREE.Vector3(75, 120, 120), new THREE.Vector3(0, 0, -35)); // HOME と同じ
    else if (state.view === "3d") flyTo(new THREE.Vector3(10, base(f) + 85, 70), new THREE.Vector3(0, base(f), 4));
    else fit2d();
  }
}

function setView(v) {
  if (state.floor === 0) return;
  state.view = v;
  applyMode();
  useCamera();
  if (v === "2d") fit2d();
  else flyTo(new THREE.Vector3(10, base(state.floor) + 85, 70), new THREE.Vector3(0, base(state.floor), 4));
}

function fit2d() {
  controls2d.target.set(X(36), 0, Z(35));
  ortho.position.set(X(36), 200, Z(35) + 0.001);
  ortho.zoom = 1;
  resize();
  controls2d.update();
}

// カメラをなめらかに動かす
let anim = null;
function flyTo(pos, target, ms = 700) {
  const c = state.view === "2d" && state.floor !== 0 ? null : persp;
  if (!c) return;
  // 縦長の画面（スマホ）では少し離れて全体が入るようにする
  if (persp.aspect < 1) pos = pos.clone().sub(target).multiplyScalar(Math.min(1.7, 1 / persp.aspect)).add(target);
  anim = { t0: performance.now(), ms, p0: c.position.clone(), t0v: controls3d.target.clone(), p1: pos, t1: target };
}

// ---------- 選択と情報パネル ----------
const panel = document.getElementById("panel");
const panelBody = document.getElementById("panel-body");

function nearest(r, test) {
  let best = null, bd = Infinity;
  for (const o of ROOMS) {
    if (o.floor !== r.floor || o === r || !test(o) || isStaffOnly(o)) continue; // 先生用のトイレなどは案内しない
    const d = Math.hypot(o.wx - r.wx, o.wz - r.wz);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { room: best, dist: Math.round(bd / 5) * 5 || 5 } : null;
}

function roomLink(o, extra = "") {
  return `<button class="link" data-room="${o.id}">${o.name}</button>${extra}`;
}

// 紹介写真：1枚目は大きく、2枚目からは小さな写真をならべる。押すと画面いっぱいに大きく見られる（左右にめくれる）
function photosHtml(list, name) {
  if (!list.length) return "";
  const img = (src, i, cls) => `<img class="${cls}" src="${src}" data-i="${i}" alt="${name}の写真${list.length > 1 ? `（${i + 1}/${list.length}）` : ""}" loading="lazy">`;
  return `<div class="photos" data-srcs="${list.join("|")}">${img(list[0], 0, "room-photo")}${list.length > 1 ? `<div class="thumbs">${list.slice(1).map((src, i) => img(src, i + 1, "thumb")).join("")}</div>` : ""}</div>`;
}
const lightbox = document.createElement("div");
lightbox.className = "lightbox"; lightbox.hidden = true;
lightbox.innerHTML = `<button class="lb-close" aria-label="閉じる">✕</button><button class="lb-prev" aria-label="前の写真">‹</button><img alt=""><button class="lb-next" aria-label="次の写真">›</button><p class="lb-count"></p>`;
document.body.appendChild(lightbox);
let lbList = [], lbI = 0;
function lbShow(i) {
  lbI = (i + lbList.length) % lbList.length;
  lightbox.querySelector("img").src = lbList[lbI];
  lightbox.querySelector(".lb-count").textContent = lbList.length > 1 ? `${lbI + 1} / ${lbList.length}` : "";
  lightbox.querySelector(".lb-prev").hidden = lightbox.querySelector(".lb-next").hidden = lbList.length < 2;
}
document.addEventListener("click", (e) => {
  const im = e.target.closest(".photos img");
  if (!im) return;
  lbList = im.closest(".photos").dataset.srcs.split("|");
  lightbox.hidden = false;
  lbShow(Number(im.dataset.i));
});
lightbox.addEventListener("click", (e) => {
  if (e.target.closest(".lb-prev")) lbShow(lbI - 1);
  else if (e.target.closest(".lb-next")) lbShow(lbI + 1);
  else if (e.target.tagName !== "IMG") lightbox.hidden = true;
});
{ // スマホ：左右にスワイプでめくる
  let sx = null;
  lightbox.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener("touchend", (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) lbShow(lbI + (dx < 0 ? 1 : -1)); sx = null; });
}
window.addEventListener("keydown", (e) => {
  if (lightbox.hidden) return;
  if (e.key === "Escape") lightbox.hidden = true;
  else if (e.key === "ArrowRight") lbShow(lbI + 1);
  else if (e.key === "ArrowLeft") lbShow(lbI - 1);
  else return;
  e.stopImmediatePropagation(); e.preventDefault();
}, true);

// 選んだ部屋の床の板（ふだんは見えない）を出して光らせる。L字の部屋は、つながった部分の板も
function showTile(r, on) {
  for (const q of [r, ...ROOMS.filter((x) => x.kind === "part" && x.parent === r)]) if (q.mesh && !q.mesh.material.transparent) q.mesh.visible = on;
}
// 部屋に寄る前の見え方（紹介を閉じたときに、ここへ戻る）
let returnView = null;
function saveReturnView() {
  if (returnView) return;
  returnView = state.view === "2d" && state.floor !== 0
    ? { is2d: true, pos: ortho.position.clone(), target: controls2d.target.clone(), zoom: ortho.zoom }
    : { is2d: false, pos: persp.position.clone(), target: controls3d.target.clone() };
}
function restoreView() {
  const v = returnView; returnView = null;
  if (!v) return;
  const now2d = state.view === "2d" && state.floor !== 0;
  if (v.is2d !== now2d) return; // 見え方（3D／2D）を切りかえたあとは、戻さない
  if (v.is2d) {
    controls2d.target.copy(v.target); ortho.position.copy(v.pos); ortho.zoom = v.zoom; ortho.updateProjectionMatrix(); controls2d.update();
  } else flyTo(v.pos, v.target);
}
function selectRoom(r, { fly = true, close = false } = {}) {
  if (fly) saveReturnView();
  if (state.selected?.mesh) {
    showTile(state.selected, false);
    state.selected.mesh.material.emissive.setHex(0x000000);
    state.selected.label?.classList.remove("selected");
  }
  state.selected = r;
  state.site = null;
  if (state.floor !== r.floor) setFloor(r.floor, { keepCamera: true });
  r.mesh.material.emissive.setHex(0x553300);
  showTile(r, true);
  r.label?.classList.add("selected");
  if (fly) {
    if (state.view === "2d") {
      controls2d.target.set(r.wx, 0, r.wz);
      ortho.position.set(r.wx, 200, r.wz + 0.001);
      ortho.zoom = Math.max(ortho.zoom, close ? 2.0 : 1.6);
      ortho.updateProjectionMatrix();
    } else {
      // close：部屋の大きさに合わせて、ぐっと近づく
      const k = close ? Math.min(0.9, Math.max(0.55, Math.max(r.w, r.d) / 30)) : 1;
      flyTo(new THREE.Vector3(r.wx + 10 * k, base(r.floor) + 26 * k, r.wz + 26 * k), new THREE.Vector3(r.wx, base(r.floor), r.wz));
    }
  }
  const cat = CATEGORIES[r.cat];
  const sameFloor = r.kind === "stairs"
    ? `<p class="muted">この階段で行ける階：${STAIRS.find((s) => s.name === r.name).floors.map((f) => `<button class="link" data-floor="${f}">${f}階</button>`).join(" ")}</p>`
    : "";
  panelBody.innerHTML = `
    <div class="chip" style="--c:${cat.color}">${cat.label}</div>
    <h2>${r.name}</h2>
    <p class="where">${r.floor}階${r.wing ? `・<button class="link" data-wing="${r.wing.id}">${r.wing.name}</button>` : ""}</p>
    ${exhibitCardsHtml(r.exhibits)}
    ${(() => { const ph = r.photos ? [, r.photos] : PHOTOS.find(([re, , fl]) => re.test(r.name) && (fl === undefined || fl === r.floor)); return ph ? photosHtml([].concat(ph[1]), r.name) : ""; })()}
    <p class="desc">${r.desc || "（紹介文はまだありません）"}</p>
    ${sameFloor}
    <p class="share"><button class="link" id="copy-link">🔗 この部屋へのリンクをコピー</button></p>
  `;
  openPanel();
  history.replaceState(null, "", `#room=${r.id}`);
  // シークレット：職員室・印刷室の名前を5回つづけて押すと、職員室のくわしいモデルのページへ（印刷室は、となりの印刷室を見た状態で開く）
  if (r.name === "職員室" || (r.name === "印刷室" && r.floor === 2)) {
    const h = panelBody.querySelector("h2");
    let n = 0, t = 0;
    h.addEventListener("click", () => {
      const now = performance.now();
      n = now - t < 1500 ? n + 1 : 1; t = now;
      h.style.transform = `scale(${1 + n * 0.03})`;
      if (n >= 5) location.href = r.name === "印刷室" ? "staffroom.html#print" : "staffroom.html";
    });
  }
}

function showWing(w) {
  returnView = null;
  const rooms = ROOMS.filter((r) => r.wing === w && r.kind === "room" && r.cat !== "open" && !isStaffOnly(r));
  const byFloor = [1, 2, 3].map((f) => {
    const list = rooms.filter((r) => r.floor === f).sort((a, b) => a.name.localeCompare(b.name, "ja"));
    if (!list.length) return "";
    return `<h3>${f}階</h3><div class="room-chips">${list.map((r) => `<button class="room-chip" data-room="${r.id}" style="--c:${CATEGORIES[r.cat].color}">${r.name}</button>`).join("")}</div>`;
  }).join("");
  panelBody.innerHTML = `
    <div class="chip" style="--c:#c7d2dc">建物</div>
    <h2>${w.name}</h2>
    ${photosHtml([].concat(w.photos || []), w.name)}
    <p class="desc">${w.note}</p>
    ${byFloor}
  `;
  openPanel();
  const [c0, r0, c1, r1] = areasOf(w)[0];
  const [cx, cz] = toWorld((X(c0) + X(c1 + 1)) / 2, (Z(r0) + Z(r1 + 1)) / 2);
  flyTo(new THREE.Vector3(cx + 30, 45, cz + 45), new THREE.Vector3(cx, 5, cz));
}

function showSite(it, { fly = true } = {}) {
  if (fly) returnView = null;
  state.site = it;
  panelBody.innerHTML = `
    <div class="chip" style="--c:#cfe3c4">屋外の施設</div>
    <h2>${it.name}</h2>
    ${exhibitCardsHtml(it.exhibits)}
    ${photosHtml([].concat(it.photos || []), it.name)}
    <p class="desc">${it.desc}</p>
    <p class="muted">${SITE_NOTE}</p>
  `;
  openPanel();
  if (fly) flyTo(new THREE.Vector3(it.x + 30, 50, it.z + 55), new THREE.Vector3(it.x, 0, it.z));
}

function openPanel() { panel.classList.add("open"); document.body.classList.add("panel-open"); }
function closePanel({ restore = true } = {}) {
  panel.classList.remove("open");
  document.body.classList.remove("panel-open");
  if (state.selected?.mesh) {
    showTile(state.selected, false); state.selected.mesh.material.emissive.setHex(0x000000);
    state.selected.label?.classList.remove("selected");
  }
  state.selected = null;
  state.site = null;
  history.replaceState(null, "", location.pathname + location.search);
  if (restore) restoreView(); else returnView = null;
}

panel.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.room) selectRoom(ROOM_BY_ID[t.dataset.room]);
  else if (t.dataset.wing) showWing(WINGS.find((w) => w.id === t.dataset.wing));
  else if (t.dataset.floor) setFloor(Number(t.dataset.floor));
  else if (t.id === "copy-link") {
    navigator.clipboard?.writeText(location.href).then(() => { t.textContent = "✅ コピーしました"; });
  } else if (t.id === "panel-close") closePanel();
});

// ---------- クリック判定 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
labelRenderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
labelRenderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, useCamera());
  if (state.floor === 0) {
    // 外観：建物をクリックしたら、その棟の案内
    const hit = ray.intersectObjects(buildingGroup.children, true).find((h) => visibleDeep(h.object));
    if (hit) {
      const p = hit.point;
      const [dx, dz] = toDrawing(p.x, p.z);
      const c = dx / CW + C_MID, r = dz / RH + R_MID;
      const w = WINGS.find((w) => areasOf(w).some((a) => c >= a[0] - 0.5 && c <= a[2] + 1.5 && r >= a[1] - 0.5 && r <= a[3] + 1.5));
      if (w) { showWing(w); return; }
    }
    closePanel(); // 何もないところを押したら、紹介を閉じる
    return;
  }
  const hits = ray.intersectObjects(pickables.filter((m) => m.userData.room.floor === state.floor), false);
  if (hits.length) selectRoom(hits[0].object.userData.room, { fly: false });
  else closePanel(); // 部屋のないところを押したら、紹介を閉じる
});

// ---------- 検索 ----------
const search = document.getElementById("search");
const results = document.getElementById("results");
// 虫めがねを押すと入力欄を開く。空のまま外をさわると、また閉じる
const searchBox = document.querySelector(".search-box");
const openSearch = () => { searchBox.classList.remove("collapsed"); search.focus(); };
document.getElementById("search-open").addEventListener("click", openSearch);
search.addEventListener("blur", () => setTimeout(() => { if (!search.value && !searchBox.contains(document.activeElement)) searchBox.classList.add("collapsed"); }, 150));
// カタカナはひらがなにそろえ、空白・長音の違いをなくして比べる
const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s/g, "").replace(/[ー－‐-]/g, "");
// 部屋ごとの検索のことば（名前・読みがな・分類・紹介文の一部）
const searchText = (r) => {
  const alias = SEARCH_ALIASES.filter(([re]) => re.test(r.name)).map(([, a]) => a).join(" ");
  const alt = r.grade ? `${r.grade}-${r.cls} ${r.grade}年${r.cls}組 ${r.grade}の${r.cls}` : "";
  const vend = styleOf(r)?.vending ? VENDING_NOTE : "";
  return norm(`${r.name} ${alt} ${alias} ${CATEGORIES[r.cat].label} ${vend} ${r.desc || ""}`);
};
const SITE_READINGS = { グラウンド: "ぐらうんど こうてい うんどうじょう", テニスコート: "てにすこーと てにす", プール: "ぷーる すいえい", 駐輪場: "ちゅうりんじょう じてんしゃ", 中庭: "なかにわ どうぞう", ピロティ: "ぴろてぃ", 昇降口前: "しょうこうぐち" };
const SITE_SEARCH = SITE_INFO.filter((it) => !it.key || SITE[it.key]).map((it) => ({ it, text: norm(`${it.name} ${it.desc || ""} ${Object.entries(SITE_READINGS).filter(([k]) => it.name.includes(k)).map(([, v]) => v).join(" ")}`) }));
search.addEventListener("input", () => {
  const q = norm(search.value);
  if (!q) { results.hidden = true; return; }
  const rooms = ROOMS.filter((r) => r.kind === "room" && r.cat !== "open" && !isStaffOnly(r));
  // 名前に入っているものを先に、読みがなや紹介文に入っているものをあとに
  const byName = rooms.filter((r) => norm(r.name).includes(q) || (r.grade && norm(`${r.grade}-${r.cls}${r.grade}年${r.cls}組`).includes(q)));
  const byText = rooms.filter((r) => !byName.includes(r) && searchText(r).includes(q));
  const list = [...byName, ...byText].slice(0, 30);
  const sites = SITE_SEARCH.filter(({ text }) => text.includes(q)).slice(0, 6);
  const exs = EXHIBITS.filter((e) => norm(`${e.title} ${e.group} ${e.genre} ${e.desc}`).includes(q)).slice(0, 20);
  results.innerHTML = list.length || sites.length || exs.length
    ? exs.map((e) => `<li><button ${e.room ? `data-room="${e.room.id}"` : `data-site="${SITE_INFO.indexOf(e.site)}"`}><span class="dot" style="background:${genreColor(e.genre)}"></span>🎪 ${esc(e.title)}<span class="fl">${esc(placeName(e))}</span></button></li>`).join("")
      + list.map((r) => `<li><button data-room="${r.id}"><span class="dot" style="background:${CATEGORIES[r.cat].color}"></span>${r.name}<span class="fl">${r.floor}階${r.wing ? "・" + r.wing.name : ""}</span></button></li>`).join("")
      + sites.map(({ it }, i) => `<li><button data-site="${SITE_INFO.indexOf(it)}"><span class="dot" style="background:#cfe3c4"></span>${it.name}<span class="fl">屋外</span></button></li>`).join("")
    : `<li class="none">見つかりませんでした</li>`;
  results.hidden = false;
});
results.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-room], button[data-site]");
  if (!b) return;
  results.hidden = true;
  search.value = "";
  search.blur();
  if (b.dataset.site !== undefined) { if (ex.on) setExplore(false); showSite(SITE_INFO[Number(b.dataset.site)]); return; }
  selectRoom(ROOM_BY_ID[b.dataset.room]);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) results.hidden = true; });

// ---------- 部屋一覧（右上の小さなボタン。ひらいたときだけ、階ごとの一覧が出る） ----------
{
  const btn = document.getElementById("rooms-btn"), box = document.getElementById("room-list");
  let tab = 1;
  const roomsOf = (f) => ROOMS.filter((r) => r.kind === "room" && r.cat !== "open" && !isStaffOnly(r) && r.floor === f).sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  const sitesOf = () => SITE_INFO.map((it, i) => ({ it, i })).filter(({ it }) => !it.key || SITE[it.key]);
  const render = () => {
    const tabs = [1, 2, 3, 0].map((f) => `<button data-tab="${f}" class="${f === tab ? "active" : ""}">${f ? f + "階" : "屋外"}</button>`).join("");
    const items = tab
      ? roomsOf(tab).map((r) => `<li><button data-room="${r.id}"><span class="dot" style="background:${CATEGORIES[r.cat].color}"></span>${r.name}</button></li>`).join("")
      : sitesOf().map(({ it, i }) => `<li><button data-site="${i}"><span class="dot" style="background:#cfe3c4"></span>${it.name}</button></li>`).join("");
    box.innerHTML = `<div class="tabs">${tabs}</div><ul>${items}</ul>`;
  };
  const setOpen = (on) => { box.hidden = !on; btn.setAttribute("aria-expanded", on); if (on) { tab = state.floor || tab; render(); } };
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(box.hidden); });
  box.addEventListener("click", (e) => {
    e.stopPropagation();
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.tab !== undefined) { tab = Number(t.dataset.tab); render(); return; }
    setOpen(false);
    if (t.dataset.site !== undefined) { if (ex.on) setExplore(false); showSite(SITE_INFO[Number(t.dataset.site)]); return; }
    selectRoom(ROOM_BY_ID[t.dataset.room], { close: true });
  });
  document.addEventListener("click", (e) => { if (!box.hidden && !e.target.closest("#room-list, #rooms-btn")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) setOpen(false); });
}

// ---------- 文化祭の出し物（Google スプレッドシート または data/exhibits.csv から読む） ----------
let EXHIBITS = [];
const EX_SITES = SITE_INFO.filter((it) => !it.key || SITE[it.key]);
const placeName = (e) => e.room ? `${e.room.floor}階 ${e.room.name}` : e.site ? `屋外・${e.site.name}` : (e.place || "場所未定");
document.querySelector(".brand h1").textContent = FESTIVAL.title;
document.querySelector(".brand .sub").textContent = FESTIVAL.subtitle;
document.title = FESTIVAL.title;

function exLabel(el, list, name) {
  if (el.__orig === undefined) el.__orig = { cls: el.className, html: el.innerHTML };
  el.className = el.__orig.cls;
  el.innerHTML = el.__orig.html;
  el.style.removeProperty("--g");
  if (list?.length) {
    el.classList.remove("staff", "vertical", "small");
    el.classList.add("ex");
    el.style.setProperty("--g", genreColor(list[0].genre));
    el.innerHTML = `<span class="ex-name">${esc(name)}</span><span class="ex-title">${esc(list[0].title || list[0].group || "出し物")}${list.length > 1 ? ` ほか${list.length - 1}` : ""}</span>`;
  }
  el.__w = undefined; // 名前の大きさが変わったので、重なりの計算をやり直す
  labelPrio.delete(el);
}

function applyExhibits(list) {
  for (const r of ROOMS) r.exhibits = null;
  for (const it of SITE_INFO) it.exhibits = null;
  EXHIBITS = list.map((e) => {
    const m = matchPlace(e.place, ROOMS, EX_SITES);
    const o = { ...e, room: m?.room || null, site: m?.site || null };
    if (o.room) (o.room.exhibits ||= []).push(o);
    if (o.site) (o.site.exhibits ||= []).push(o);
    return o;
  });
  for (const r of ROOMS) if (r.label) exLabel(r.label, r.exhibits, shortName(r));
  for (const it of SITE_INFO) if (it.label) exLabel(it.label, it.exhibits, it.name);
  for (const w of WINGS) {
    if (!w.label) continue;
    const n = EXHIBITS.filter((e) => e.room?.wing === w).length;
    w.label.innerHTML = `${esc(w.name)}${n ? ` <span class="ex-count">🎪${n}</span>` : ""}`;
    w.label.__w = undefined;
  }
  document.getElementById("ex-count").textContent = EXHIBITS.length ? EXHIBITS.length : "";
  // 開いている紹介を新しい内容にする
  if (panel.classList.contains("open")) {
    if (state.selected) selectRoom(state.selected, { fly: false });
    else if (state.site) showSite(state.site, { fly: false });
  }
  renderExList();
  poke();
}

let exSig = "";
async function refreshExhibits() {
  const { list, error } = await loadExhibits();
  const sig = JSON.stringify(list);
  if (sig === exSig) return;
  exSig = sig;
  if (error) console.warn("出し物データ:", error);
  applyExhibits(list);
}

// 出し物の一覧（上の「🎪 出し物」ボタン）
const exDialog = document.getElementById("ex-dialog");
let exGenre = "";
function renderExList() {
  const genres = [...new Set(EXHIBITS.map((e) => e.genre || "その他"))];
  if (exGenre && !genres.includes(exGenre)) exGenre = "";
  const chips = [`<button data-genre="" class="${exGenre ? "" : "active"}">すべて</button>`]
    .concat(genres.map((g) => `<button data-genre="${esc(g)}" class="${g === exGenre ? "active" : ""}" style="--g:${genreColor(g)}">${esc(g)}</button>`)).join("");
  const shown = EXHIBITS.filter((e) => !exGenre || (e.genre || "その他") === exGenre);
  const groups = [["1階", (e) => e.room?.floor === 1], ["2階", (e) => e.room?.floor === 2], ["3階", (e) => e.room?.floor === 3], ["屋外", (e) => e.site], ["場所が未定・不明", (e) => !e.room && !e.site]];
  const body = groups.map(([h, test]) => {
    const items = shown.filter(test);
    if (!items.length) return "";
    return `<h3>${h}</h3><ul class="ex-list">${items.map((e) => `<li><button ${e.room ? `data-room="${e.room.id}"` : e.site ? `data-site="${SITE_INFO.indexOf(e.site)}"` : "disabled"}>
      <span class="ex-genre" style="--g:${genreColor(e.genre)}">${esc(e.genre || "その他")}</span>
      <b>${esc(e.title || "（出し物名未定）")}</b>
      <span class="ex-sub">${esc(e.group)}${e.group ? "・" : ""}${esc(placeName(e))}${e.time ? `・🕒${esc(e.time.split("\n")[0])}` : ""}</span></button></li>`).join("")}</ul>`;
  }).join("");
  document.getElementById("ex-body").innerHTML = EXHIBITS.length
    ? `<div class="ex-chips">${chips}</div>${body}`
    : `<p class="muted">出し物の情報はまだありません。</p>`;
}
document.getElementById("ex-btn").addEventListener("click", () => { renderExList(); exDialog.showModal(); });
exDialog.addEventListener("click", (e) => {
  if (e.target === exDialog) { exDialog.close(); return; }
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.genre !== undefined) { exGenre = t.dataset.genre; renderExList(); return; }
  if (t.dataset.room || t.dataset.site !== undefined) {
    exDialog.close();
    if (ex.on) setExplore(false);
    if (t.dataset.room) selectRoom(ROOM_BY_ID[t.dataset.room], { close: true });
    else showSite(SITE_INFO[Number(t.dataset.site)]);
  }
});

// ---------- ボタン類 ----------
document.querySelectorAll(".floor-btn").forEach((b) => b.addEventListener("click", () => { closePanel({ restore: false }); setFloor(Number(b.dataset.floor)); }));
document.querySelectorAll(".view-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
let labelsOn = true;
document.getElementById("labels-toggle").addEventListener("change", (e) => { labelsOn = e.target.checked; applyMode(); });
document.getElementById("furniture-toggle").addEventListener("change", (e) => {
  for (const f of [1, 2, 3]) layers.furniture[f].visible = e.target.checked;
  shadowsDirty();
});

// ---------- 見る方向 ----------
const DIRS = {
  home: [55, 75, 95],
  n: [0, 95, -175], s: [0, 95, 125], e: [160, 95, -25], w: [-160, 95, -25], top: [0, 230, -24.9],
};
const HOME = [new THREE.Vector3(75, 120, 120), new THREE.Vector3(0, 0, -35)]; // はじめの外観の見え方（「全体」でもどる）
document.querySelectorAll(".dir-btns button").forEach((b) => b.addEventListener("click", () => {
  if (!b.dataset.dir) return; // 「現在地」は別
  if (state.view === "2d" && state.floor !== 0) setView("3d");
  if (b.dataset.dir === "home") { const ty = state.floor ? base(state.floor) : 0; flyTo(HOME[0].clone().setY(HOME[0].y + ty), HOME[1].clone().setY(ty), 900); return; }
  const [x, y, z] = DIRS[b.dataset.dir];
  const ty = state.floor ? base(state.floor) : 0;
  flyTo(new THREE.Vector3(x, y + ty, z), new THREE.Vector3(0, ty + (b.dataset.dir === "home" ? 4 : 0), b.dataset.dir === "home" ? 0 : -25), 900);
}));

// ---------- 操作しやすく ----------
// 見ている中心が学校から遠くへ行きすぎないようにする
const LIMIT = { x0: -130, x1: 140, z0: -170, z1: 120 };
function clampTarget() {
  for (const c of [controls3d, controls2d]) {
    const t = c.target, cam = c.object;
    const nx = THREE.MathUtils.clamp(t.x, LIMIT.x0, LIMIT.x1), nz = THREE.MathUtils.clamp(t.z, LIMIT.z0, LIMIT.z1);
    if (nx !== t.x || nz !== t.z) { cam.position.x += nx - t.x; cam.position.z += nz - t.z; t.x = nx; t.z = nz; }
  }
}
controls3d.addEventListener("change", clampTarget);
controls2d.addEventListener("change", clampTarget);
// ダブルクリック・ダブルタップ：その場所に近づく
{
  let lastTap = 0, lastXY = [0, 0];
  const zoomAt = (cx, cy) => {
    if (state.view === "2d" && state.floor !== 0) { controls2d.object.zoom = Math.min(controls2d.maxZoom, controls2d.object.zoom * 1.8); controls2d.object.updateProjectionMatrix(); return; }
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, persp);
    const hit = ray.intersectObjects(scene.children, true).find((h) => visibleDeep(h.object) && h.object.isMesh);
    const p = hit ? hit.point : ray.ray.at(persp.position.distanceTo(controls3d.target), new THREE.Vector3());
    const dir = persp.position.clone().sub(p);
    const d = Math.max(controls3d.minDistance + 2, dir.length() * 0.45);
    flyTo(p.clone().add(dir.setLength(d)), p, 500);
  };
  // （回転の操作がポインタをつかむので dblclick が来ないことがある。2回目の指・クリックを自分で数える）
  let downXY = null;
  labelRenderer.domElement.addEventListener("pointerdown", (e) => { downXY = [e.clientX, e.clientY]; });
  labelRenderer.domElement.addEventListener("pointerup", (e) => {
    if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 8) { lastTap = 0; return; } // ドラッグは数えない
    const now = e.timeStamp; // 入力の時刻（画面の描画が重くてもずれない）
    if (now - lastTap < 400 && Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 30) { zoomAt(e.clientX, e.clientY); lastTap = 0; return; }
    lastTap = now; lastXY = [e.clientX, e.clientY];
  });
}
// キーボード：矢印・WASDで移動、+ - でズーム、Q E で回る、H で全体にもどる
window.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return; // 使い方などの画面が開いているときは、キーはそちらに
  if (e.target.closest("input, textarea, select")) { if (e.key === "Escape") { search.value = ""; results.hidden = true; search.blur(); } return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const c = state.view === "2d" && state.floor !== 0 ? controls2d : controls3d, cam = c.object;
  const k = e.key.toLowerCase();
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const step = cam.isPerspectiveCamera ? Math.max(1.5, cam.position.distanceTo(c.target) * 0.04) : 4 / cam.zoom;
  const move = (v) => { cam.position.add(v); c.target.add(v); clampTarget(); };
  if (k === "arrowup" || k === "w") move(fwd.multiplyScalar(step));
  else if (k === "arrowdown" || k === "s") move(fwd.multiplyScalar(-step));
  else if (k === "arrowleft" || k === "a") move(right.multiplyScalar(-step));
  else if (k === "arrowright" || k === "d") move(right.multiplyScalar(step));
  else if (k === "+" || k === "=" || k === ";") { if (cam.isPerspectiveCamera) { const v = cam.position.clone().sub(c.target).multiplyScalar(0.85); if (v.length() > c.minDistance) cam.position.copy(c.target).add(v); } else { cam.zoom = Math.min(c.maxZoom, cam.zoom * 1.2); cam.updateProjectionMatrix(); } }
  else if (k === "-" || k === "_") { if (cam.isPerspectiveCamera) { const v = cam.position.clone().sub(c.target).multiplyScalar(1.18); if (v.length() < c.maxDistance) cam.position.copy(c.target).add(v); } else { cam.zoom = Math.max(c.minZoom, cam.zoom / 1.2); cam.updateProjectionMatrix(); } }
  else if ((k === "q" || k === "e") && cam.isPerspectiveCamera) { const a = k === "q" ? 0.15 : -0.15; const v = cam.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a); cam.position.copy(c.target).add(v); }
  else if (k === "h") document.querySelector('.dir-btns [data-dir="home"]').click();
  else if (k === "escape") { closePanel(); results.hidden = true; search.blur(); }
  else if (k === "/") openSearch();
  else return;
  e.preventDefault();
});
// 押したキーを、左下のキーボードの絵でへこませる
{
  const alias = { "=": "+", ";": "+", "_": "-" };
  const flash = (k, on) => document.querySelectorAll(`.key-hint kbd[data-k="${CSS.escape(alias[k] || k)}"]`).forEach((el) => el.classList.toggle("pressed", on));
  window.addEventListener("keydown", (e) => { if (!e.target.closest("input, textarea, select")) flash(e.key.toLowerCase(), true); });
  window.addEventListener("keyup", (e) => flash(e.key.toLowerCase(), false));
  window.addEventListener("blur", () => document.querySelectorAll(".key-hint kbd.pressed").forEach((el) => el.classList.remove("pressed")));
}
const compassEl = document.getElementById("compass");
// 方位磁針を押すと、見る方向のボタンを開く／閉じる。スマホでは最初は閉じて画面を広く
{
  const box = document.querySelector(".dir-box");
  if (window.innerWidth <= 760) box.classList.add("collapsed");
  compassEl.title = "上が北（押すと見る方向のボタンを開く／閉じる）";
  compassEl.addEventListener("click", () => box.classList.toggle("collapsed"));
  // スマホでは方向を選んだら閉じる
  box.querySelectorAll(".dir-btns button").forEach((b) => b.addEventListener("click", () => { if (window.innerWidth <= 760) box.classList.add("collapsed"); }));
}

// ---------- 航空写真 ----------
const ALIGN_KEY = "asao-aerial-align";
let align = { ...AERIAL_ALIGN };
try { Object.assign(align, JSON.parse(localStorage.getItem(ALIGN_KEY) || "{}")); } catch { /* 保存なし */ }
aerial.setAlign(align);
const aerialBtn = document.getElementById("aerial-btn");
const alignPanel = document.getElementById("align-panel");
const aerialMsg = document.getElementById("aerial-msg");
function setAerial(on) {
  aerial.holder.visible = on;
  farGround.visible = ground.visible = paving.visible = trees.visible = site.group.visible = outdoor.visible = siteGround.visible = !on;
  aerialBtn.classList.toggle("active", on);
  document.body.classList.toggle("aerial-on", on);
  document.getElementById("aerial-credit").hidden = !on;
  document.getElementById("align-open").hidden = !on; // 位置合わせは航空写真のときだけ
  if (!on) { alignPanel.hidden = true; return; }
  aerialMsg.textContent = "航空写真を読み込み中…";
  aerial.load().then(() => { aerialMsg.textContent = ""; })
    .catch(() => { aerialMsg.textContent = "航空写真を読み込めませんでした（インターネット接続を確認してください）"; });
}
aerialBtn.addEventListener("click", () => setAerial(!aerial.holder.visible));
document.getElementById("align-open").addEventListener("click", () => { alignPanel.hidden = !alignPanel.hidden; });
const alignInputs = alignPanel.querySelectorAll("input[type=range]");
function showAlign() {
  alignInputs.forEach((inp) => {
    inp.value = align[inp.name];
    inp.nextElementSibling.textContent = Number(align[inp.name]).toFixed(inp.name === "scale" ? 2 : 1);
  });
  document.getElementById("align-code").textContent = `rot: ${align.rot}, x: ${align.x}, z: ${align.z}, scale: ${align.scale}`;
}
alignInputs.forEach((inp) => inp.addEventListener("input", () => {
  align[inp.name] = Number(inp.value);
  aerial.setAlign(align);
  showAlign();
  try { localStorage.setItem(ALIGN_KEY, JSON.stringify(align)); } catch { /* 保存できない環境 */ }
}));
document.getElementById("align-reset").addEventListener("click", () => {
  align = { ...AERIAL_ALIGN };
  aerial.setAlign(align);
  showAlign();
  try { localStorage.removeItem(ALIGN_KEY); } catch { /* 保存できない環境 */ }
});
showAlign();


// 地図・学校情報
const mapDlg = document.getElementById("map-dialog");
document.getElementById("map-btn").addEventListener("click", () => {
  const frame = document.getElementById("gmap");
  if (!frame.src) frame.src = `https://maps.google.com/maps?q=${SCHOOL.lat},${SCHOOL.lng}&t=k&z=18&hl=ja&output=embed`;
  mapDlg.showModal();
});
document.getElementById("school-info").innerHTML = `
  <dl>
    <dt>所在地</dt><dd>${SCHOOL.address}</dd>
    <dt>電話</dt><dd>${SCHOOL.tel}</dd>
    <dt>アクセス</dt><dd>${SCHOOL.access}</dd>
  </dl>
  <p><a href="https://www.google.com/maps/search/?api=1&query=${SCHOOL.lat},${SCHOOL.lng}" target="_blank" rel="noopener">Googleマップで開く</a> ／
  <a href="${SCHOOL.site}" target="_blank" rel="noopener">学校の公式サイト</a></p>`;
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.getElementById("help-btn").addEventListener("click", () => document.getElementById("help-dialog").showModal());
// はじめて開いたときだけ、使い方を1回出す
try { if (!localStorage.getItem("asao-seen")) { localStorage.setItem("asao-seen", "1"); setTimeout(() => { if (!location.hash) document.getElementById("help-dialog").showModal(); }, 1200); } } catch { /* 保存できない環境 */ }

// ---------- 画面サイズ・描画ループ ----------
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  const view = 50; // 2D表示で見える縦の幅(m)の半分
  const a = w / h;
  const halfH = a > 1.25 ? view : (view * 1.25) / a;
  ortho.left = -halfH * a; ortho.right = halfH * a; ortho.top = halfH; ortho.bottom = -halfH;
  ortho.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// 名前ラベルが重なったら、小さい部屋のほうを隠す
let lastDeclutter = 0;
// 名前の札が重ならないように、大事なもの（大きい部屋・選んだ部屋）から順に置き、重なるものはかくす。
// 画面の位置は札の3Dの位置から計算し、札の大きさは最初の1回だけ測って覚えておく（ページのレイアウト計算を毎回させない）
const labelPrio = new Map();
const _wp = new THREE.Vector3();
function declutter() {
  const groups = state.floor === 0 ? [wingLabels, siteLabels] : [layers.labels[state.floor], siteLabels];
  const cam = useCamera(), W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
  const items = [];
  for (const g of groups) {
    if (!g.visible) continue;
    g.traverse((o) => {
      if (!o.isCSS2DObject || !o.visible) return;
      const el = o.element;
      if (el.style.display === "none") return;
      o.getWorldPosition(_wp);
      // 校内探検中は、近くの部屋の名前だけ出す
      const far = ex.on && _wp.distanceTo(persp.position) > 14;
      if (el.classList.contains("far") !== far) el.classList.toggle("far", far);
      if (far) return;
      _wp.project(cam);
      if (_wp.z > 1) return;
      if (!el.__w) { el.__w = el.offsetWidth; el.__h = el.offsetHeight; }
      const x = ((_wp.x + 1) / 2) * W, y = ((1 - _wp.y) / 2) * H, hw = el.__w / 2, hh = el.__h / 2;
      let prio = labelPrio.get(el);
      if (prio === undefined) { const r = ROOMS.find((q) => q.label === el); prio = (r ? (r.grade ? 1e6 : 0) + r.w * r.d : el.classList.contains("site") ? 5e4 : 1e5) + (el.classList.contains("ex") ? 2e6 : 0); labelPrio.set(el, prio); } // 出し物のある場所の名前を先に出す // 外の施設の名前は、棟の名前より後回し
      if (el.classList.contains("selected")) prio = 1e9;
      items.push({ el, prio, left: x - hw, right: x + hw, top: y - hh, bottom: y + hh });
    });
  }
  items.sort((a, b) => b.prio - a.prio);
  const placed = [];
  for (const a of items) {
    const hit = placed.some((b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    if (a.el.classList.contains("overlap") !== hit) a.el.classList.toggle("overlap", hit);
    if (!hit) placed.push(a);
  }
}

// 軽くするため、画面が止まっているときは描き直さない。
// カメラが動いたとき、操作の直後（1.5秒）、アニメーション中だけ描く（念のため1秒に1回は描く）
let activeUntil = 0, lastDraw = 0, lastExT = 0, lastAz = 1e9;
const camKey = new Float64Array(18);
const poke = () => { activeUntil = performance.now() + 1500; };
for (const ev of ["pointerdown", "wheel", "keydown", "click", "touchstart", "touchmove", "resize"]) window.addEventListener(ev, poke, { passive: true, capture: true });
// マウスを動かしただけ（ボタンを押していない）では描き直さない
window.addEventListener("pointermove", (e) => { if (e.buttons) poke(); }, { passive: true, capture: true });
// 処理落ち対策②：画面の細かさ（解像度）は、上限を少しおさえ、動かしたときに重い（1コマ28ms以上が続く）ようなら
// 一段ずつ下げる。動かすたびに切りかえると、そのたびに一瞬止まるので、いちど下げたらそのまま
let dpr = renderer.getPixelRatio(), moving = false, frameTimes = [], lastFrame = 0, lastMoveT = 0;
function noteFrame(dt) {
  frameTimes.push(dt);
  if (frameTimes.length < 40) return;
  const median = [...frameTimes].sort((a, b) => a - b)[20];
  frameTimes = [];
  if (median > 28 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); }
}
function cameraChanged(cam) {
  const e = cam.matrixWorld.elements;
  let ch = false;
  for (let i = 0; i < 16; i++) if (camKey[i] !== e[i]) { camKey[i] = e[i]; ch = true; }
  if (camKey[16] !== cam.zoom) { camKey[16] = cam.zoom; ch = true; }
  if (camKey[17] !== (cam === ortho ? 1 : 0)) { camKey[17] = cam === ortho ? 1 : 0; ch = true; }
  return ch;
}
// ---------- 平行移動のスティック（スマホ向け。ゲームの移動スティックのような ◎）：少し動かすと画面の左下に出る。
// まん中の丸に指を置いて上下左右・ななめにずらすと、画面で見ている向きのまま、その方向へ平行に動く ----------
const NAV = { until: 0, hold: null, shown: false, grab: null, lastT: 0 };
{
  const pad = document.getElementById("stick"), knob = pad.querySelector(".knob");
  const R = () => pad.clientWidth / 2;
  const setFrom = (e) => {
    const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (e.clientX - cx) / R(), y = (e.clientY - cy) / R(); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    NAV.hold = Math.hypot(x, y) < 0.12 ? [0, 0] : [x, y];
    knob.style.transform = `translate(${x * R() * 0.6}px, ${y * R() * 0.6}px)`;
  };
  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); NAV.grab = e.pointerId; pad.setPointerCapture(e.pointerId); pad.classList.add("on"); setFrom(e); poke(); });
  pad.addEventListener("pointermove", (e) => { if (NAV.grab === e.pointerId) setFrom(e); });
  const stop = (e) => { if (NAV.grab !== e.pointerId) return; NAV.grab = null; NAV.hold = null; knob.style.transform = ""; pad.classList.remove("on"); NAV.until = performance.now() + 3000; };
  pad.addEventListener("pointerup", stop); pad.addEventListener("pointercancel", stop);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
  for (const c of [controls3d, controls2d]) c.addEventListener("start", () => { NAV.until = performance.now() + 4000; });
  app.addEventListener("wheel", () => { NAV.until = performance.now() + 4000; }, { passive: true });
  NAV.pad = pad;
}
const navV = new THREE.Vector3();
function updateNav(now, cam) {
  const dt = Math.min(0.1, (now - (NAV.lastT || now)) / 1000); NAV.lastT = now;
  const show = !ex.on && (now < NAV.until || NAV.grab !== null);
  if (show !== NAV.shown) { NAV.shown = show; NAV.pad.classList.toggle("show", show); }
  if (!NAV.hold || ex.on || (!NAV.hold[0] && !NAV.hold[1])) return;
  const [hx, hy] = NAV.hold;
  if (cam === ortho) {
    // 2D：画面の上が北（-z）。見えている広さに合わせた速さ
    const span = (ortho.top - ortho.bottom) / ortho.zoom, sp = span * 0.6 * dt;
    navV.set(hx * sp, 0, hy * sp); ortho.position.add(navV); controls2d.target.add(navV);
  } else {
    const az = controls3d.getAzimuthalAngle(), fx = -Math.sin(az), fz = -Math.cos(az);
    const d = persp.position.distanceTo(controls3d.target), sp = Math.min(60, Math.max(4, d * 0.9)) * dt;
    navV.set((-fz * hx - fx * hy) * sp, 0, (fx * hx - fz * hy) * sp); persp.position.add(navV); controls3d.target.add(navV); anim = null;
  }
  activeUntil = now + 200;
}
function tick(now) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    persp.position.lerpVectors(anim.p0, anim.p1, e);
    controls3d.target.lerpVectors(anim.t0v, anim.t1, e);
    if (k >= 1) anim = null;
  }
  if (here.visible) {
    here.position.y = hereY(); // 現在地の点は、見ている階の床の高さに
    // 目標の位置へ、少しずつすべるように動かす
    const dx = hereGoal.x - here.position.x, dz = hereGoal.z - here.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.02) { here.position.x += dx * 0.08; here.position.z += dz * 0.08; poke(); }
  }
  if (ex.on) { updateExplore(Math.min(0.1, (now - (lastExT || now)) / 1000)); activeUntil = now + 100; }
  lastExT = now;
  const cam = useCamera();
  updateNav(now, cam);
  // 方位磁針（画面の上がどの方角か）
  const az = cam === ortho ? 0 : controls3d.getAzimuthalAngle();
  if (Math.abs(az - lastAz) > 0.002) { lastAz = az; compassEl.style.transform = `rotate(${THREE.MathUtils.radToDeg(az)}deg)`; }
  if (!ex.on) (cam === ortho ? controls2d : controls3d).update();
  cam.updateMatrixWorld();
  const camMoved = cameraChanged(cam);
  if (camMoved || anim) {
    const dt = now - lastFrame;
    if (moving && dt > 0 && dt < 500) noteFrame(dt);
    moving = true; lastMoveT = now;
  } else if (moving && now - lastMoveT > 250) { moving = false; frameTimes = []; lastDeclutter = 0; activeUntil = Math.max(activeUntil, now + 100); } // 止まったらすぐ札を整理
  lastFrame = now;
  // 何もしていないときの描き直しは、読み込みの直後（画像などがあとから届く）だけ1秒ごと。そのあとは5秒ごと（電池と発熱をおさえる）
  if (anim || camMoved || now < activeUntil || now - lastDraw > (now < 20000 ? 1000 : 5000)) {
    lastDraw = now;
    renderer.render(scene, cam);
    labelRenderer.render(scene, cam);
    if (now - lastDeclutter > (moving ? 250 : 120)) { lastDeclutter = now; declutter(); }
  }
  requestAnimationFrame(tick);
}

// 2階の、写真に合わせた形：コモンスペースの南の吹き抜けの、角の丸い腰壁と手すり／中央の渡り廊下（ギャラリースペース）の柱と展示のくぼみ
function build2FHall(grp) {
  const white = matRelief, metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.6, roughness: 0.35 });
  const y = base(2);
  // ① 吹き抜けの腰壁と、その上の金属の手すり。コモンスペースの南の吹き抜けは北と東（北東の角が丸い）、
  //    STUDY HALL の北の吹き抜けはそれを鏡にうつした形で、南と東（南東の角が丸い）
  const atriumRail = (cells, flip) => {
    const rc = rectOf(cells), R = 0.9, t = 0.2, h = 1.0;
    const zE = flip ? rc.z1 : rc.z0, sg = flip ? -1 : 1; // 腰壁のある側の z と、内向きの向き
    const zFar = flip ? rc.z0 : rc.z1;
    const ccx = rc.x1 - R, ccz = zE + sg * R;
    const gs = [];
    gs.push(new THREE.BoxGeometry(rc.x1 - R - rc.x0, h, t).translate((rc.x0 + rc.x1 - R) / 2, y + h / 2, zE + sg * t / 2));
    gs.push(new THREE.BoxGeometry(t, h, Math.abs(zFar - ccz)).translate(rc.x1 - t / 2, y + h / 2, (ccz + zFar) / 2));
    const a0 = flip ? 0 : Math.PI / 2;
    const outer = new THREE.CylinderGeometry(R, R, h, 16, 1, true, a0, Math.PI / 2).translate(ccx, y + h / 2, ccz);
    const inner = new THREE.CylinderGeometry(R - t, R - t, h, 16, 1, true, a0, Math.PI / 2).translate(ccx, y + h / 2, ccz);
    const top = new THREE.RingGeometry(R - t, R, 16, 1, flip ? -Math.PI / 2 : 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(ccx, y + h, ccz);
    const m = new THREE.Mesh(mergeGeometries([...gs.map((g) => g.toNonIndexed()), outer.toNonIndexed(), inner.toNonIndexed(), top.toNonIndexed()]), new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.85, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    const pts = [], hy = y + h + 0.25, rr = R - t / 2;
    for (let x = rc.x0 + 0.1; x < ccx; x += 0.5) pts.push(new THREE.Vector3(x, hy, zE + sg * t / 2));
    for (let i = 0; i <= 8; i++) { const a = (Math.PI / 2) * (i / 8); pts.push(new THREE.Vector3(ccx + Math.sin(a) * rr, hy, ccz - sg * Math.cos(a) * rr)); }
    for (let k = 0.5; k <= Math.abs(zFar - ccz) - 0.1; k += 0.5) pts.push(new THREE.Vector3(rc.x1 - t / 2, hy, ccz + sg * k));
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 120, 0.035, 6), metal);
    const posts = [];
    for (let i = 0; i < pts.length; i += 3) posts.push(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6).translate(pts[i].x, y + h + 0.125, pts[i].z));
    inBlock(grp, blockAtCell(cells.c0, cells.r0)).add(m, rail, new THREE.Mesh(mergeGeometries(posts), metal));
  };
  atriumRail({ c0: 33, r0: 29, c1: 37, r1: 31 }, false);
  atriumRail({ c0: 33, r0: 47, c1: 37, r1: 49 }, true);
  // ② 2階の渡り廊下（1号館と2号館をつなぐ。写真）：床は灰色がかった茶色。西側に白い角柱が5本ならび（柱に壁の照明）、
  //    柱のあいだは、作品の掲示板のあるくぼみ・青灰色の壁のくぼみ（黄色い台の木のベンチ）・ガラスブロックの腰壁と窓、がならぶ
  {
    const rc = rectOf({ c0: 38, r0: 32, c1: 41, r1: 46 }), L = rc.z1 - rc.z0, n = 5, x0 = rc.x0;
    const g = inBlock(grp, blockAtCell(38, 32));
    const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true; g.add(m); };
    // 床（展示スペースの手前まで。展示スペースの床は、他の場所と同じ色）
    const fr = rectOf({ c0: 38, r0: 32, c1: 41, r1: 46 });
    add([new THREE.BoxGeometry(fr.x1 - fr.x0 - 0.1, 0.02, fr.z1 - fr.z0 - 0.1).translate((fr.x0 + fr.x1) / 2, y + 0.02, (fr.z0 + fr.z1) / 2)], new THREE.MeshStandardMaterial({ color: 0x8b8379, roughness: 0.35, metalness: 0.05 }));
    const cols = [], benchBase = [], benchTop = [], boards = [], panels = [], beams = [], lamps = [], gb = [], glass = [], frames = [];
    const zs = Array.from({ length: n }, (_, i) => rc.z0 + (L * (i + 0.5)) / n);
    for (const z of zs) {
      cols.push(new THREE.BoxGeometry(0.6, FH, 0.6).translate(x0 + 0.95, y + FH / 2, z));
      lamps.push(new THREE.BoxGeometry(0.06, 0.26, 0.26).translate(x0 + 1.28, y + 2.35, z)); // 柱の照明
    }
    const kinds = ["art", "glass", "niche", "glass"];
    for (let i = 0; i < n - 1; i++) {
      const za = zs[i] + 0.3, zb = zs[i + 1] - 0.3, zc = (za + zb) / 2, len = zb - za, kind = kinds[i];
      beams.push(new THREE.BoxGeometry(0.75, 0.5, len).translate(x0 + 0.4, y + FH - 0.6, zc)); // 上の白い梁
      if (kind === "glass") {
        // ガラスブロックの腰壁と、その上の銀の枠の窓（外が見える）
        frames.push(new THREE.BoxGeometry(0.12, 0.3, len).translate(x0 + 0.1, y + 0.15, zc));
        gb.push(glassBlockBox(false, len, 0.85, x0 + 0.1, y + 0.3 + 0.425, zc, 0.12));
        frames.push(new THREE.BoxGeometry(0.16, 0.06, len).translate(x0 + 0.1, y + 1.18, zc), new THREE.BoxGeometry(0.12, 0.06, len).translate(x0 + 0.1, y + 2.4, zc));
        glass.push(new THREE.BoxGeometry(0.03, 1.2, len).translate(x0 + 0.1, y + 1.8, zc));
        const m = Math.max(1, Math.round(len / 0.9));
        for (let k = 0; k <= m; k++) frames.push(new THREE.BoxGeometry(0.1, 1.2, 0.05).translate(x0 + 0.1, y + 1.8, za + (len * k) / m));
        frames.push(new THREE.BoxGeometry(0.1, FH - 0.6 - 2.43, len).translate(x0 + 0.1, y + 2.43 + (FH - 0.6 - 2.43) / 2, zc)); // 窓の上の壁
        continue;
      }
      // くぼみ：ベンチ（黄色い台に木の天板）。奥は作品の掲示板か青灰色の壁
      benchBase.push(new THREE.BoxGeometry(0.6, 0.4, len - 0.2).translate(x0 + 0.45, y + 0.2, zc));
      benchTop.push(new THREE.BoxGeometry(0.66, 0.05, len - 0.14).translate(x0 + 0.45, y + 0.425, zc));
      (kind === "art" ? boards : panels).push(new THREE.BoxGeometry(0.05, FH - 0.6 - 0.45, len - 0.1).translate(x0 + 0.13, y + 0.45 + (FH - 0.6 - 0.45) / 2, zc));
    }
    const art = canvasTex(256, 160, (c, w, h) => { c.fillStyle = "#4a4f52"; c.fillRect(0, 0, w, h); const cs = ["#f2c14e", "#e4572e", "#4c9fd6", "#76b041", "#ffffff", "#d96fa8"]; for (let x = 6; x < w - 20; x += 22) for (let yy = 10; yy < h - 24; yy += 24) { c.fillStyle = "#fafafa"; c.fillRect(x, yy, 18, 20); c.fillStyle = cs[(x + yy) % cs.length]; c.fillRect(x + 3, yy + 5, 12, 9); } }, false);
    add(cols, white); add(beams, white);
    add(benchBase, new THREE.MeshStandardMaterial({ color: 0xe6d3a3, roughness: 0.8 }));
    add(benchTop, new THREE.MeshStandardMaterial({ color: 0xa8703c, roughness: 0.6 }));
    add(boards, new THREE.MeshStandardMaterial({ map: art, roughness: 0.9 }));
    add(panels, new THREE.MeshStandardMaterial({ color: 0x66737a, roughness: 0.85 }));
    add(lamps, new THREE.MeshStandardMaterial({ color: 0xe8e4d8, emissive: 0xfff1c8, emissiveIntensity: 0.6 }));
    add(gb, matGlassBlockIn); add(frames, matInnerFrame);
    const gm = new THREE.Mesh(mergeGeometries(glass), matInnerGlass); g.add(gm);
  }
}

// ---------- 現在地（スマホのGPS） ----------
// GPSの緯度・経度を、航空写真と同じ位置合わせ（align）で模型の座標に直して、青い点で表示する。
// 何階にいるかはGPSではわからないので、点は今見ている階の床の高さに出す
const here = new THREE.Group();
here.visible = false;
{
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0x1a73e8, depthTest: false }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  dot.position.y = 0.2; rim.position.y = 0.15;
  const acc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, opacity: 0.18, depthWrite: false, depthTest: false }));
  acc.position.y = 0.05; acc.name = "acc";
  const div = document.createElement("div");
  div.className = "here-label"; div.textContent = "現在地";
  const label = new CSS2DObject(div); label.position.y = 2.2; label.name = "label"; label.visible = false; // 名前の札は、親を隠しても消えないので別に切りかえる
  here.add(acc, rim, dot, label);
  acc.renderOrder = 10; rim.renderOrder = 11; dot.renderOrder = 12; // 屋根や壁にかくれないよう、いちばん上に描く
}
scene.add(here);
const geoMsg = document.getElementById("geo-msg");
let geoWatch = null, geoFirst = true, geoTimer = 0;
const showGeoMsg = (t, ms = 5000) => { geoMsg.textContent = t; clearTimeout(geoTimer); if (ms) geoTimer = setTimeout(() => { geoMsg.textContent = ""; }, ms); };
function geoToWorld(lat, lng) {
  // 学校の地点からの東西（+x が東）・南北（-z が北）のメートル（この緯度での1度の長さ）
  const la = (SCHOOL.lat * Math.PI) / 180;
  const mLat = 111132.92 - 559.82 * Math.cos(2 * la) + 1.175 * Math.cos(4 * la), mLng = 111412.84 * Math.cos(la) - 93.5 * Math.cos(3 * la);
  const gx = (lng - SCHOOL.lng) * mLng, gz = -(lat - SCHOOL.lat) * mLat;
  const { rot, scale, x, z } = GEO_ALIGN, a = (rot * Math.PI) / 180;
  return new THREE.Vector3(scale * (Math.cos(a) * gx - Math.sin(a) * gz) + x, 0, scale * (Math.sin(a) * gx + Math.cos(a) * gz) + z);
}
function hereY() { return state.floor ? base(state.floor) : 0; }
// GPSのふらつきをおさえる：①誤差の大きい位置は使わない ②最近の数回の位置を、誤差の小さいものほど重く平均する
// ③平均した位置の変化が誤差の円より小さければ点を動かさない。点は新しい位置へ、なめらかにすべるように動く
const GEO_MAX_ACC = 30, geoHist = [], hereGoal = new THREE.Vector3();
let hereShown = false;
function onGeo(p) {
  const acc = p.coords.accuracy || 10;
  if (acc > GEO_MAX_ACC && hereShown) return; // ① 誤差が大きい位置は使わない（まだ何も出ていないときだけは使う）
  const v = geoToWorld(p.coords.latitude, p.coords.longitude);
  const dist = Math.hypot(v.x, v.z + 25);
  if (dist > 400) {
    here.visible = false; here.getObjectByName("label").visible = false; hereShown = false;
    showGeoMsg(`学校の外にいるようです（学校から約${dist >= 1000 ? (dist / 1000).toFixed(1) + "km" : Math.round(dist / 10) * 10 + "m"}）。学校の近くで使ってください。`, 7000);
    return;
  }
  // ② 最近の位置（10秒以内・5回まで）を、誤差の小さいものほど重く平均する
  const now = performance.now();
  geoHist.push({ x: v.x, z: v.z, w: 1 / (acc * acc), t: now });
  while (geoHist.length > 5 || (geoHist.length > 1 && now - geoHist[0].t > 10000)) geoHist.shift();
  let sw = 0, ax = 0, az = 0;
  for (const h of geoHist) { sw += h.w; ax += h.x * h.w; az += h.z * h.w; }
  ax /= sw; az /= sw;
  const r = Math.min(60, Math.max(3, acc));
  here.getObjectByName("acc").scale.set(r, 1, r);
  // ③ 変化が小さいときは動かさない（誤差の円の半分より近いとき）
  if (!hereShown) { hereGoal.set(ax, 0, az); here.position.set(ax, hereY(), az); }
  else if (Math.hypot(ax - hereGoal.x, az - hereGoal.z) > Math.max(2, r * 0.5)) hereGoal.set(ax, 0, az);
  hereShown = true;
  here.visible = true; here.getObjectByName("label").visible = true;
  poke();
  if (geoFirst) {
    geoFirst = false;
    if (state.view === "2d" && state.floor !== 0) setView("3d");
    const ty = hereY();
    flyTo(new THREE.Vector3(ax + 18, ty + 30, az + 30), new THREE.Vector3(ax, ty, az), 900);
    showGeoMsg(`青い点が今いるところです（誤差 約${Math.round(r)}m）。建物の中ではずれやすく、何階かはわかりません。`, 7000);
  }
}
function onGeoErr(e) {
  stopGeo();
  showGeoMsg(e.code === 1 ? "位置情報の使用が許可されていません。ブラウザの設定で、このページの位置情報を「許可」にしてください。" : "現在地を取得できませんでした。屋外や窓の近くで、もう一度ためしてください。", 8000);
}
function stopGeo() {
  if (geoWatch !== null) navigator.geolocation.clearWatch(geoWatch);
  geoWatch = null; here.visible = false; here.getObjectByName("label").visible = false; hereShown = false; geoHist.length = 0; poke();
  document.getElementById("here-btn").classList.remove("active");
}
document.getElementById("here-btn").addEventListener("click", () => {
  if (geoWatch !== null) { stopGeo(); showGeoMsg("現在地の表示をやめました。", 2500); return; }
  if (!navigator.geolocation) { showGeoMsg("このブラウザでは現在地を使えません。"); return; }
  geoFirst = true;
  showGeoMsg("現在地をさがしています…", 0);
  document.getElementById("here-btn").classList.add("active");
  geoWatch = navigator.geolocation.watchPosition(onGeo, onGeoErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
});

// STUDY HALL 横の階段（1階は南の昇降口の奥）：階段の両側は、昇降口の写真のような赤茶色の壁
{
  const st = STAIRS.find((x) => x.name === "STUDY HALL横の階段"), b = blockAtCell(st.c0, st.r0), rc = rectOf(st);
  const tex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#c4917e"; c.fillRect(0, 0, w, h); noise(c, w, h, 0.06, 500); });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const g = [];
  for (const z of [rc.z0 + 0.1, rc.z1 - 0.1]) g.push(new THREE.BoxGeometry(rc.x1 - rc.x0, FH - 0.05, 0.2).translate((rc.x0 + rc.x1) / 2, (FH - 0.05) / 2, z));
  const m = new THREE.Mesh(mergeGeometries(g), mat); m.castShadow = m.receiveShadow = true;
  inBlock(layers.rooms[1], b).add(m);
}

// 3階の社会科教室の西：バルコニーの奥の教室の壁（外観でも見えるように、窓のある外壁を立てる）
{
  const b = blockAtCell(35, 36), x = X(35);
  const seg = { ax: x, az: Z(32), bx: x, bz: Z(47), n: [-1, 0] };
  const m = new THREE.Mesh(wallGeometry([seg], base(3), FH), MAT_WALL.school);
  m.material = MAT_WALL.school.clone(); m.material.side = THREE.DoubleSide;
  m.castShadow = m.receiveShadow = true;
  inBlock(layers.exterior[3], b).add(m);
}

// ---------- 校内探検（一人称視点） ----------
// 自分の目の高さで、校舎の中を歩いて見てまわる。歩けるのは建物の床の上だけ（外や吹き抜け・階段の穴には落ちない）。
// 部屋の仕切りの壁は通りぬけられる。階を変えるときは左の階のボタン
const EYE = 1.55;
const ex = { on: false, x: 0, z: 0, y: 0, yaw: 0, pitch: -0.05, keys: new Set(), pad: { f: 0, t: 0 }, saved: null, cells: {} };
function exploreCells(f) {
  if (ex.cells[f]) return ex.cells[f];
  const hole = new Set();
  for (const sr of STAIRS) if (sr.floors.includes(f - 1) && sr.floors.includes(f)) for (let c = sr.c0; c <= sr.c1; c++) for (let r = sr.r0; r <= sr.r1; r++) hole.add(key(c, r));
  for (const q of ROOMS_RAW) if (q.floor === f && (q.name === "吹抜" || /光庭/.test(q.name))) for (let c = q.c0; c <= q.c1; c++) for (let r = q.r0; r <= q.r1; r++) hole.add(key(c, r));
  const ok = new Set();
  for (const [k, st] of OCC[f]) {
    if (hole.has(k)) continue;
    const [c, r] = k.split(",").map(Number);
    if (f === 3 && st === "gym" && !GYM_GALLERY.some((g) => inCells(c, r, g)) && r < 33) continue; // 3階の体育館は吹き抜け
    ok.add(k);
  }
  return (ex.cells[f] = ok);
}
const cellAt = (x, z) => { const [dx, dz] = toDrawing(x, z); return [Math.floor(dx / CW + C_MID), Math.floor(dz / RH + R_MID)]; };
function canStand(x, z, f) {
  // 体の大きさ（半径0.25m）の四すみが、どれも歩ける床の上にあるか
  const cells = exploreCells(f);
  for (const [ox, oz] of [[0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]]) { const [c, r] = cellAt(x + ox, z + oz); if (!cells.has(key(c, r))) return false; }
  return true;
}
function floorY(x, z, f) {
  const [c, r] = cellAt(x, z);
  // 3階の視聴覚教室の前：踊り場は2段上がり、南の細い通路はさらに5段上
  if (f === 3 && c >= 37 && c <= 39 && r >= 23 && r <= 25) return base(f) + (r === 25 ? (c === 37 ? 1.15 : c === 38 ? 0.75 : 0.3) : 0.3);
  return base(f) + (f >= 2 && blockAtCell(c, r).id === "gym" ? GYM_LIFT : 0);
}
function placeExplorer(f, nearX, nearZ) {
  // いちばん近い、歩ける場所へ。部屋の中より廊下（部屋でないます目）を先に探す（壁の目の前からはじまらないように）
  const inRoom = new Set();
  for (const q of ROOMS) if (q.floor === f && q.kind === "room" && q.cat !== "open" && !styleOf(q)?.noFloor) for (let c = Math.floor(q.c0); c <= Math.ceil(q.c1); c++) for (let r = Math.floor(q.r0); r <= Math.ceil(q.r1); r++) inRoom.add(key(c, r));
  let best = null, bd = Infinity;
  for (const pass of [0, 1]) {
    for (const k of exploreCells(f)) {
      if (pass === 0 && inRoom.has(k)) continue;
      const [c, r] = k.split(",").map(Number);
      const [x, z] = toWorld(X(c + 0.5), Z(r + 0.5), blockAtCell(c, r));
      const d = (x - nearX) ** 2 + (z - nearZ) ** 2;
      if (d < bd && canStand(x, z, f)) { bd = d; best = [x, z]; }
    }
    if (best) break;
  }
  if (best) { ex.x = best[0]; ex.z = best[1]; ex.y = floorY(ex.x, ex.z, f); }
}
// いちばん遠くまで歩ける向き（壁の目の前を向いてはじまらないように）。pref：できればこの向き
function bestYaw(f, pref) {
  const reach = (yaw) => { let d = 0; for (; d < 30; d += 0.5) if (!canStand(ex.x - Math.sin(yaw) * d, ex.z - Math.cos(yaw) * d, f)) break; return d; };
  let best = pref, bd = reach(pref);
  for (let i = 0; i < 16; i++) { const y = (i * Math.PI) / 8, d = reach(y); if (d > bd + 2) { bd = d; best = y; } }
  return best;
}
function setExplore(on) {
  if (on === ex.on) return;
  ex.on = on;
  document.body.classList.toggle("exploring", on);
  if (on) {
    ex.saved = [persp.position.clone(), controls3d.target.clone()];
    if (state.view === "2d") setView("3d");
    closePanel();
    if (!state.floor) {
      // 外観からはじめたときは、1階の南の昇降口から、北（中庭のほう）を向いてスタート
      setFloor(1, { keepCamera: true });
      const sh = ROOMS.find((r) => r.name === "昇降口" && r.floor === 1 && r.r0 === 47);
      placeExplorer(1, sh ? sh.wx : 0, sh ? sh.wz : 0);
      ex.yaw = bestYaw(1, 0);
    } else {
      placeExplorer(state.floor, controls3d.target.x, controls3d.target.z);
      const d = controls3d.target.clone().sub(persp.position);
      ex.yaw = bestYaw(state.floor, Math.atan2(-d.x, -d.z));
    }
    ex.pitch = -0.05;
    controls3d.enabled = false;
    showGeoMsg("校内探検：ドラッグで見まわす。パソコンは W・S（または ↑・↓）で前後、A・D で横、←・→ で向きを変える。スマホは右下のボタン。階は左のボタン、Esc でおわり", 9000);
  } else {
    controls3d.enabled = true;
    ex.keys.clear(); ex.pad.f = ex.pad.t = 0;
    if (ex.saved) { persp.position.copy(ex.saved[0]); controls3d.target.copy(ex.saved[1]); }
    showGeoMsg("校内探検をおわりました", 2500);
  }
  applyMode();
  poke();
}
function updateExplore(dt) {
  const k = ex.keys, f = state.floor || 1;
  const fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) + ex.pad.f;
  const side = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
  const turn = (k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0) + ex.pad.t;
  ex.yaw += turn * dt * 1.8;
  if (fwd || side) {
    const sp = 2.2 * dt, fx = -Math.sin(ex.yaw), fz = -Math.cos(ex.yaw);
    const mx = (fx * fwd - fz * side) * sp, mz = (fz * fwd + fx * side) * sp;
    // 壁（建物のはし）にぶつかったら、すべるように横へ
    if (canStand(ex.x + mx, ex.z + mz, f)) { ex.x += mx; ex.z += mz; }
    else if (canStand(ex.x + mx, ex.z, f)) ex.x += mx;
    else if (canStand(ex.x, ex.z + mz, f)) ex.z += mz;
  }
  ex.y += (floorY(ex.x, ex.z, f) - ex.y) * Math.min(1, dt * 8);
  // いまいる場所の名前（部屋の中ならその部屋、そうでなければ廊下）を上に出す
  if (!ex.noteT || performance.now() - ex.noteT > 300) {
    ex.noteT = performance.now();
    const here = ROOMS.find((r) => r.floor === f && r.kind === "room" && r.cat !== "open" && Math.abs(ex.x - r.wx) <= r.ww / 2 && Math.abs(ex.z - r.wz) <= r.wd / 2);
    const nm = here ? (here.grade ? `${here.grade}-${here.cls} 教室` : here.name) : "廊下";
    const t = `校内探検 ${f}階：${nm}`;
    const fn = document.getElementById("floor-note");
    if (fn.textContent !== t) fn.textContent = t;
  }
  const eye = new THREE.Vector3(ex.x, ex.y + EYE, ex.z);
  persp.position.copy(eye);
  const look = new THREE.Vector3(-Math.sin(ex.yaw) * Math.cos(ex.pitch), Math.sin(ex.pitch), -Math.cos(ex.yaw) * Math.cos(ex.pitch));
  controls3d.target.copy(eye).add(look);
  persp.lookAt(controls3d.target);
}
// キーボード（探検中は、カメラの操作のかわりに歩く）
window.addEventListener("keydown", (e) => {
  if (!ex.on || e.target.closest?.("input, textarea")) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { setExplore(false); e.stopImmediatePropagation(); return; }
  if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { ex.keys.add(k); e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
window.addEventListener("keyup", (e) => ex.keys.delete(e.key.toLowerCase()), true);
window.addEventListener("blur", () => ex.keys.clear());
// ドラッグで見まわす
{
  let last = null;
  const el = labelRenderer.domElement;
  el.addEventListener("pointerdown", (e) => { if (ex.on) last = [e.clientX, e.clientY]; });
  window.addEventListener("pointermove", (e) => {
    if (!ex.on || !last || !e.buttons) return;
    ex.yaw += (e.clientX - last[0]) * 0.005;
    ex.pitch = Math.max(-1.2, Math.min(1.0, ex.pitch + (e.clientY - last[1]) * 0.004));
    last = [e.clientX, e.clientY];
    poke();
  });
  window.addEventListener("pointerup", () => { last = null; });
}
// スマホ用のボタン（おしているあいだ動く）
{
  const pad = document.createElement("div");
  pad.className = "explore-pad";
  pad.innerHTML = `<button data-f="1" aria-label="前へ">▲</button><button data-t="1" aria-label="左を向く">⟲</button><button data-t="-1" aria-label="右を向く">⟳</button><button data-f="-1" aria-label="後ろへ">▼</button><button class="ex-end" aria-label="探検をおわる">おわる</button>`;
  document.body.appendChild(pad);
  pad.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    e.preventDefault();
    if (b.classList.contains("ex-end")) { setExplore(false); return; }
    if (b.dataset.f) ex.pad.f = Number(b.dataset.f);
    if (b.dataset.t) ex.pad.t = Number(b.dataset.t);
    b.setPointerCapture(e.pointerId);
  });
  const stop = (e) => { const b = e.target.closest?.("button"); if (b?.dataset.f) ex.pad.f = 0; if (b?.dataset.t) ex.pad.t = 0; };
  pad.addEventListener("pointerup", stop); pad.addEventListener("pointercancel", stop);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
}

// ---------- はじめの表示 ----------
// 動かない屋外の部品を、材質ごとにまとめて軽くする
bakeStatic(site.group);
bakeStatic(outdoor);
// 処理落ち対策：部屋の床の板は、見た目が同じものを1つにまとめて描く。もとの板は見えなくして、押したときの当たり判定と、
// 選んだときの光る板にだけ使う（見えない板は描かない）
for (const f of [1, 2, 3]) {
  const grp = layers.rooms[f];
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
  const buckets = new Map();
  for (const r of ROOMS) {
    const t = r.mesh;
    if (!t || r.floor !== f || !t.parent) continue;
    const m = t.material;
    if (m.transparent || m.opacity < 1) { if (m.opacity === 0) t.visible = false; continue; } // 透明の板（階段・吹き抜けなど）は描かない
    const key = [m.map?.source?.uuid, m.color.getHex(), m.roughness].join("|");
    if (!buckets.has(key)) buckets.set(key, { m, geos: [] });
    const g = t.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, t.matrixWorld));
    if (m.map) { m.map.updateMatrix(); const uv = g.attributes.uv, v = new THREE.Vector3(); for (let i = 0; i < uv.count; i++) { v.set(uv.getX(i), uv.getY(i), 1).applyMatrix3(m.map.matrix); uv.setXY(i, v.x, v.y); } }
    buckets.get(key).geos.push(g);
    t.visible = false;
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; // 選んだときに上に重ねて光らせる
  }
  for (const { m, geos } of buckets.values()) {
    const mat = m.clone();
    if (m.map) { mat.map = m.map.clone(); mat.map.repeat.set(1, 1); mat.map.offset.set(0, 0); mat.map.rotation = 0; mat.map.center.set(0, 0); mat.map.needsUpdate = true; }
    mat.polygonOffset = false; mat.emissive = new THREE.Color(0);
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = true;
    grp.add(mesh);
  }
}
// 処理落ち対策：動かない校舎の部品（外壁・屋根・床・壁の内側など）を、材質ごとに1つにまとめて描く回数を減らす
for (const k of ["exterior", "roofs", "inner", "wallsBelow", "slab", "cut"]) for (const g of Object.values(layers[k])) bakeStatic(g);
// 家具（机・いすなど）も、材質ごとに1つにまとめる
for (const g of Object.values(layers.furniture)) bakeStatic(g, { instances: true });
for (const g of Object.values(layers.exterior)) bakeStatic(g, { instances: true });
bakeStatic(gymRoof);
setFloor(0);
const m = location.hash.match(/room=([\w-]+)/);
if (m && ROOM_BY_ID[m[1]]) selectRoom(ROOM_BY_ID[m[1]]);
const ms = location.hash.match(/site=(\d+)/); // パンフレットから屋外の場所へ
if (ms && SITE_INFO[Number(ms[1])]) showSite(SITE_INFO[Number(ms[1])]);
requestAnimationFrame(tick);
refreshExhibits();
setInterval(refreshExhibits, 5 * 60 * 1000); // 5分ごとに出し物データを読み直す（開きっぱなしの案内用の画面のため）
document.getElementById("loading").remove();


// 階を切りかえたときに一瞬止まらないように、最初の画面が出たあと、ひまなときに
// 全部の階の材質（色や光の計算のしかた）と模様の画像を、先に画面の部品へ準備しておく
setTimeout(() => {
  const saved = [];
  const show = (g) => { saved.push([g, g.visible]); g.visible = true; };
  for (const k of ["exterior", "roofs", "inner", "wallsBelow", "slab", "rooms"]) for (const g of Object.values(layers[k])) show(g);
  for (const g of [gymBelow, entranceBelow, gymRoof]) show(g);
  for (const r of ROOMS) if (r.mesh && !r.mesh.visible && !r.mesh.material.transparent) show(r.mesh);
  const texs = new Set();
  scene.traverseVisible((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.map) texs.add(m.map); });
  renderer.compileAsync(scene, persp).catch(() => { /* 準備できなくても、使うときに準備される */ });
  for (const [g, v] of saved) g.visible = v;
  // 模様の画像は、少しずつ（1回8ミリ秒まで）送る
  const list = [...texs];
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < list.length && performance.now() - t0 < 8) renderer.initTexture(list[i++]);
    if (i < list.length) setTimeout(step, 30);
  };
  step();
}, 600);
