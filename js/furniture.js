// 部屋の中の家具（机・椅子・黒板・実験台・本棚など）
// 家具の種類ごとに InstancedMesh をまとめて作るので、数が多くても軽く動く
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { speckle, hsl } from "./tex.js";

// ---------- 材質 ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

const texBooks = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#6b4a2f"; g.fillRect(0, 0, w, h);
  const colors = ["#b23a3a", "#2f5f8a", "#d8b04a", "#3d7a4f", "#e8e2d0", "#7a3f7a", "#c96b2c", "#335"];
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 4;
    const y0 = shelf * 32 + 4;
    while (x < w - 4) {
      const bw = 3 + Math.random() * 5;
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      g.fillRect(x, y0 + Math.random() * 6, bw, 26 - Math.random() * 6);
      x += bw + 0.5;
    }
    g.fillStyle = "#5a3d26"; g.fillRect(0, y0 + 26, w, 4);
  }
});

// 黒板（チョークの字と、右はしの日付・日直）
const texBoard = canvasTex(512, 160, (g, w, h) => {
  g.fillStyle = "#2f5a45"; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1500, [[255, 255, 255]], 0.04, 3, 1);
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    const y = 26 + i * 22;
    g.moveTo(24, y); g.lineTo(150 + Math.random() * 180, y + Math.random() * 3);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.font = "bold 18px sans-serif";
  g.fillText("10月20日（火）", w - 150, 30);
  g.fillText("日直", w - 150, 70);
  g.strokeStyle = "rgba(255,255,255,0.5)"; g.strokeRect(w - 156, 50, 130, 70);
  g.fillStyle = "rgba(240,220,120,0.8)"; g.fillText("連絡", 24, h - 14);
});

// 自動販売機の正面（飲み物がならんだ窓）
const texVend = canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = "#e9eef2"; g.fillRect(0, 0, w, h);
  const cols = ["#d33", "#36c", "#3a3", "#fa0", "#eee", "#a5f"];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { g.fillStyle = cols[(r * 5 + c) % cols.length]; g.fillRect(4 + c * 12, 6 + r * 16, 8, 12); }
  g.fillStyle = "#333"; g.fillRect(6, 74, 52, 14);
});

// 電子黒板の画面（授業のスライド）
const texEboard = canvasTex(256, 150, (g, w, h) => {
  g.fillStyle = "#f7f9fc"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#2d6cb5"; g.fillRect(0, 0, w, 26);
  g.fillStyle = "#fff"; g.font = "bold 16px sans-serif"; g.fillText("今日の授業", 10, 19);
  g.fillStyle = "#555";
  for (let i = 0; i < 4; i++) g.fillRect(14, 42 + i * 20, 120 + Math.random() * 80, 6);
  g.fillStyle = "#f2b33d"; g.fillRect(180, 40, 60, 60);
  g.fillStyle = "#4caf7a"; g.fillRect(190, 110, 50, 26);
});

// 掲示板（コルクにプリント）
const texCork = canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = "#b98a57"; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2500, [[80, 50, 20]], 0.15);
  const papers = ["#ffffff", "#fff6c9", "#e8f2ff", "#ffe3e3", "#ffffff"];
  for (let i = 0; i < 9; i++) {
    const x = 8 + (i % 5) * 50 + Math.random() * 6, y = 6 + Math.floor(i / 5) * 46 + Math.random() * 4;
    g.fillStyle = papers[i % papers.length]; g.fillRect(x, y, 38, 36);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let k = 0; k < 5; k++) g.fillRect(x + 4, y + 6 + k * 6, 20 + Math.random() * 10, 2);
    g.fillStyle = "#d33"; g.fillRect(x + 17, y + 1, 4, 4);
  }
});

// 時計の文字盤
const texClock = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#222"; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#222";
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(64 + Math.cos(a) * 48 - 2, 64 + Math.sin(a) * 48 - 2, 4, 4); }
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.moveTo(64, 64); g.lineTo(92, 70); g.stroke();
});

// 引き戸（木の戸に、上の方にガラス）
const texDoor = canvasTex(64, 128, (g, w, h) => {
  // ベージュの引き戸
  g.fillStyle = "#dccbad"; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(120,100,70,0.08)"; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
  g.fillStyle = "#9cc3da"; g.fillRect(10, 12, w - 20, 44);
  g.strokeStyle = "#a8957a"; g.lineWidth = 3; g.strokeRect(10, 12, w - 20, 44);
  g.fillStyle = "#8a7a62"; g.fillRect(w - 12, 70, 4, 16);
});

// カーテン（クリーム色の布のひだ）
const texCurtain = canvasTex(64, 64, (g, w, h) => {
  for (let x = 0; x < w; x++) {
    const v = 225 + Math.sin(x / 3) * 18;
    g.fillStyle = `rgb(${v},${v - 8},${v - 30})`; g.fillRect(x, 0, 1, h);
  }
});

const texShoes = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = "#cfd3d6"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#9aa1a7";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) g.fillRect(c * 16 + 1, r * 16 + 1, 14, 14);
  g.fillStyle = "#e9ecee";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) g.fillRect(c * 16 + 3, r * 16 + 3, 10, 2);
});

export const FLOOR_TEX = {
  wood: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const y = i * 16;
      g.fillStyle = `rgba(120,90,50,${0.06 + Math.random() * 0.08})`;
      g.fillRect(0, y, w, 16);
      g.fillStyle = "rgba(80,60,30,0.18)"; g.fillRect(0, y, w, 1);
      const off = Math.random() * w;
      g.fillRect(off, y, 1, 16);
    }
  }, 1, 1),
  // 体育館の床（写真）：つやのある赤茶色の板の床に、白・青・赤・緑のライン
  gym: canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = "#b8743e"; g.fillRect(0, 0, w, h);
    // 細長い板（少しずつ色がちがう）
    for (let y = 0; y < h; y += 6) for (let x = -Math.random() * 60; x < w; x += 40 + Math.random() * 50) {
      const v = Math.random() * 26 - 13;
      g.fillStyle = `rgb(${186 + v},${118 + v * 0.8},${64 + v * 0.5})`;
      g.fillRect(x, y, 60, 5.4);
    }
    g.save();
    g.scale(w / 35, h / 30);
    // バスケットボールのコート2面（青）
    g.strokeStyle = "#2f6fb8"; g.lineWidth = 0.1;
    for (const cx of [9, 26]) {
      const x0 = cx - 7.5, y0 = 1, y1 = 29, cy = 15;
      g.strokeRect(x0, y0, 15, 28);
      g.beginPath(); g.moveTo(x0, cy); g.lineTo(x0 + 15, cy); g.stroke();
      g.beginPath(); g.arc(cx, cy, 1.8, 0, Math.PI * 2); g.stroke();
      for (const [yb, dir] of [[y0, 1], [y1, -1]]) {
        g.strokeRect(cx - 2.45, dir > 0 ? yb : yb - 5.8, 4.9, 5.8);
        g.beginPath(); g.arc(cx, yb + dir * 5.8, 1.8, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(cx, yb + dir * 1.575, 6.75, dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : Math.PI * 2); g.stroke();
      }
    }
    // バレーボールのコート2面（白）、バドミントン（緑）、ほかのライン（赤）
    g.strokeStyle = "#f2efe6"; g.lineWidth = 0.07;
    for (const cx of [9, 26]) g.strokeRect(cx - 4.5, 15 - 9, 9, 18);
    g.strokeStyle = "#3d8a4f"; g.lineWidth = 0.05;
    for (const cx of [6, 12, 23, 29]) g.strokeRect(cx - 3.05, 15 - 6.7, 6.1, 13.4);
    g.strokeStyle = "#b8343a"; g.lineWidth = 0.06;
    g.strokeRect(1.5, 2, 32, 26);
    g.restore();
  }, 1, 1),
  tatami: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#b9c27a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 256; i += 2) { g.fillStyle = `rgba(90,100,40,${Math.random() * 0.15})`; g.fillRect(0, i, w, 1); }
    g.fillStyle = "#3e4a2a";
    g.fillRect(0, 0, w, 6); g.fillRect(0, 128, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(128, 0, 6, 128); g.fillRect(64, 128, 6, 128); g.fillRect(192, 128, 6, 128);
  }, 1, 1),
  tile: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
  }, 1, 1),
};

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
const MAT = {
  wood: M(0xd2ad7c),
  darkWood: M(0x8a5d3b),
  metal: M(0x9aa2aa, { metalness: 0.4, roughness: 0.5 }),
  black: M(0x2b2d30, { roughness: 0.4 }),
  white: M(0xf2f0ea),
  board: new THREE.MeshStandardMaterial({ map: texBoard, roughness: 0.9 }),
  locker: M(0xc8ccd0),
  steel: M(0xd6d3c8),
  navy: M(0x3c4a63),
  books: new THREE.MeshStandardMaterial({ map: texBooks, roughness: 0.9 }),
  shoes: new THREE.MeshStandardMaterial({ map: texShoes, roughness: 0.9 }),
  screen: M(0xfafafa, { emissive: 0x222222 }),
  green: M(0x2f7d5b),
  sofa: M(0x7b5a4a),
  pink: M(0xe7b8c2),
  blue: M(0xb8cce7),
  kiln: M(0x7c7f82, { metalness: 0.3 }),
  mat: M(0x3d6fb0),
  cork: new THREE.MeshStandardMaterial({ map: texCork, roughness: 0.95 }),
  clock: new THREE.MeshStandardMaterial({ map: texClock, roughness: 0.5 }),
  door: new THREE.MeshStandardMaterial({ map: texDoor, roughness: 0.7 }),
  curtain: new THREE.MeshStandardMaterial({ map: texCurtain, roughness: 1, side: THREE.DoubleSide }),
  transom: new THREE.MeshStandardMaterial({ color: 0x9cc3da, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.7 }),
  bag: M(0xffffff, { roughness: 0.9 }),      // 色は1つずつ変える
  paper: M(0xf5f3ec, { roughness: 0.9 }),
  mirror: M(0xcfd8de, { metalness: 0.9, roughness: 0.1 }),
  red: M(0x9e1f2c, { roughness: 0.9 }),
  vendFace: new THREE.MeshStandardMaterial({ map: texVend, roughness: 0.3, emissive: 0xffffff, emissiveMap: texVend, emissiveIntensity: 0.35 }),
  screenOn: new THREE.MeshStandardMaterial({ map: texEboard, roughness: 0.3, emissive: 0xffffff, emissiveMap: texEboard, emissiveIntensity: 0.55 }),
  gray: M(0x8e98a2),
  tatamiTop: (() => { const t = FLOOR_TEX.tatami.clone(); t.needsUpdate = true; t.repeat.set(1.3, 1.6); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); })(),
  fusuma: new THREE.MeshStandardMaterial({ map: canvasTex(64, 128, (g, w, h) => { g.fillStyle = "#efe8d6"; g.fillRect(0, 0, w, h); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(190,170,120,${Math.random() * 0.06})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 0, 7); g.fill(); } g.fillStyle = "#6b4c2e"; g.fillRect(w - 14, 60, 6, 10); }, 1, 1), roughness: 0.9 }),
  stageWood: M(0xc08a4a, { roughness: 0.5 }),
  greenNet: new THREE.MeshStandardMaterial({ color: 0x2f8a46, transparent: true, opacity: 0.45, roughness: 1, depthWrite: false, side: THREE.DoubleSide }),
  curtainDark: M(0x5c1420, { roughness: 1 }),
  cardboard: M(0xb8935e, { roughness: 1 }),
  stepFloor: M(0xd8cfbf, { roughness: 0.8 }),
  pingBlue: M(0x2a4f9a, { roughness: 0.5 }), // 卓球台（写真では青）
  doorFrame: M(0xc9b796, { roughness: 0.7 }), // ドアと窓の枠もベージュ
  tank: M(0x6d97b8, { roughness: 0.6 }),
  // 図書室：チェックのテーブルクロス、雑誌の表紙、マンガのタグの掲示板、色紙のステンドグラス
  checkPink: new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#f4f0ee"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(196,70,90,0.55)"; for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); } }, 4, 4), roughness: 0.95 }),
  checkBeige: new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#faf3e4"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(226,190,120,0.55)"; for (let i = 0; i < w; i += 8) { g.fillRect(i, 0, 4, h); g.fillRect(0, i, w, 4); } }, 4, 4), roughness: 0.95 }),
  checkYellow: M(0xf2d24e, { roughness: 0.95 }),
  mags: new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (g, w, h) => { g.fillStyle = "#222"; g.fillRect(0, 0, w, h); const cs = ["#e8443a", "#f2f2f2", "#3a6fd8", "#f4c542", "#e98bb4", "#4caf6a", "#ffffff", "#7b4cc9"]; for (let i = 0; i < 6; i++) { g.fillStyle = cs[(i * 3) % cs.length]; g.fillRect(6 + i * 42, 4, 36, 56); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(10 + i * 42, 30, 28, 22); g.fillStyle = "#fff"; g.fillRect(10 + i * 42, 8, 24, 6); } }), roughness: 0.6 }),
  mangaTags: new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (g, w, h) => { g.fillStyle = "#24503a"; g.fillRect(0, 0, w, h); for (let r = 0; r < 5; r++) for (let c = 0; c < 22; c++) { if ((r * 7 + c * 3) % 9 === 0) continue; const x = 6 + c * 11, y = 10 + r * 23; g.fillStyle = ["#e9b6c0", "#f5e6a8", "#ffffff", "#b6d4f0"][(r + c) % 4]; g.fillRect(x, y, 8, 6); g.fillStyle = "#f6d6dc"; g.fillRect(x, y + 7, 8, 9); } g.fillStyle = "#fff"; g.fillRect(4, 4, 10, 10); g.fillRect(4, 50, 10, 10); }), roughness: 0.8 }),
  stained: (() => { const t = canvasTex(128, 96, (g, w, h) => { const cs = ["#f28aa0", "#f6c85a", "#5cc8e8", "#f7a07a", "#e46fd0", "#fbe8a0", "#ffffff"]; for (let i = 0; i < 70; i++) { g.fillStyle = cs[i % cs.length]; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + 10 + Math.random() * 18, y + Math.random() * 14); g.lineTo(x + Math.random() * 12, y + 10 + Math.random() * 16); g.closePath(); g.fill(); } g.strokeStyle = "#1a1a1a"; g.lineWidth = 2; for (let i = 0; i < 26; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); } g.fillStyle = "#1a1a1a"; g.fillRect(w / 2 - 1, 0, 2, h); }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45 }); })(),
};

// ---------- 家具の形（床に置いたとき、正面が -x 向き） ----------
const b = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
const legs = (w, d, h, t = 0.03) => [
  b(t, h, t, -w / 2 + t, 0, -d / 2 + t), b(t, h, t, w / 2 - t, 0, -d / 2 + t),
  b(t, h, t, -w / 2 + t, 0, d / 2 - t), b(t, h, t, w / 2 - t, 0, d / 2 - t),
];
const merge = (list) => mergeGeometries(list);

const SHAPES = {
  desk: [
    [MAT.wood, merge([b(0.45, 0.03, 0.6, 0, 0.68)])],
    [MAT.metal, merge([...legs(0.45, 0.6, 0.68), b(0.4, 0.1, 0.55, 0, 0.56)])],
  ],
  chair: [
    [MAT.wood, merge([b(0.38, 0.03, 0.38, 0, 0.4), b(0.03, 0.3, 0.36, 0.18, 0.5)])],
    [MAT.metal, merge(legs(0.38, 0.38, 0.4))],
  ],
  teacherDesk: [[MAT.darkWood, merge([b(0.6, 0.75, 1.2)])]],
  podium: [[MAT.wood, merge([b(1.0, 0.18, 4.4)])]],
  blackboard: [
    [MAT.board, merge([b(0.04, 1.2, 4.2, 0, 0.8)])],
    [MAT.darkWood, merge([b(0.1, 0.04, 4.3, 0.03, 0.78), b(0.06, 0.06, 4.3, 0, 2.0)])],
  ],
  screenBoard: [[MAT.screen, merge([b(0.04, 1.6, 3.6, 0, 0.9)])]],
  locker: [[MAT.locker, merge([b(0.45, 1.05, 0.95)])]],
  shoeRack: [[MAT.shoes, merge([b(0.4, 1.7, 1.8)])]],
  labBench: [
    [MAT.black, merge([b(1.25, 0.05, 2.2, 0, 0.85)])],
    [MAT.white, merge([b(1.15, 0.85, 2.1)])],
    [MAT.metal, merge([b(0.35, 0.02, 0.35, 0, 0.9, 0.7), b(0.03, 0.3, 0.03, 0, 0.9, 0.85)])],
  ],
  cookBench: [
    [MAT.steel, merge([b(1.25, 0.05, 2.2, 0, 0.82)])],
    [MAT.white, merge([b(1.15, 0.82, 2.1)])],
    [MAT.black, merge([b(0.45, 0.04, 0.5, 0, 0.87, -0.65)])],
    [MAT.metal, merge([b(0.4, 0.02, 0.45, 0, 0.87, 0.6)])],
  ],
  stool: [[MAT.metal, merge([b(0.3, 0.6, 0.3)])]],
  officeDesk: [
    [MAT.steel, merge([b(0.7, 0.72, 1.1)])],
  ],
  officeChair: [[MAT.navy, merge([b(0.45, 0.45, 0.45), b(0.08, 0.45, 0.45, 0.22, 0.45)])]],
  monitor: [[MAT.black, merge([b(0.04, 0.32, 0.5, 0, 0.78), b(0.15, 0.05, 0.15, 0.05, 0.73)])]],
  pc: [[MAT.black, merge([b(0.04, 0.3, 0.45, 0, 0.75), b(0.2, 0.02, 0.4, -0.15, 0.73)])]],
  shelf: [[MAT.books, merge([b(0.35, 1.8, 0.9)])]],
  // 自習用の机（前と左右に白い仕切り板がある。STUDY HALL の写真より）
  carrel: [
    [MAT.white, merge([b(0.6, 0.03, 0.9, 0, 0.72), b(0.03, 1.25, 0.9, -0.3, 0), b(0.6, 1.25, 0.03, 0, 0, -0.45), b(0.6, 1.25, 0.03, 0, 0, 0.45)])],
  ],
  deskLamp: [[MAT.black, merge([b(0.12, 0.02, 0.18, -0.2, 0.75), b(0.02, 0.4, 0.02, -0.22, 0.75), b(0.2, 0.03, 0.05, -0.15, 1.13)])]],
  woodCase: [[MAT.wood, merge([b(0.4, 1.15, 1.0)])], [MAT.books, merge([b(0.42, 0.9, 0.85, 0, 0.12)])]],
  akahon: [[MAT.white, merge([b(0.35, 1.8, 0.9)])], [M(0xd8452f), merge([b(0.3, 0.9, 0.8, 0.03, 0.85)])]],
  lowShelf: [[MAT.books, merge([b(0.35, 1.2, 0.9)])]],
  table: [
    [MAT.wood, merge([b(0.9, 0.04, 1.8, 0, 0.7)])],
    [MAT.metal, merge(legs(0.9, 1.8, 0.7, 0.05))],
  ],
  bigTable: [
    [MAT.wood, merge([b(1.2, 0.05, 2.4, 0, 0.72)])],
    [MAT.darkWood, merge(legs(1.2, 2.4, 0.72, 0.08))],
  ],
  bed: [
    [MAT.white, merge([b(1.95, 0.5, 0.95), b(0.35, 0.1, 0.6, -0.7, 0.5)])],
    [MAT.blue, merge([b(1.2, 0.06, 0.97, 0.3, 0.5)])],
    [MAT.metal, merge([b(0.04, 0.9, 0.95, -0.98)])],
  ],
  curtain: [[MAT.pink, merge([b(0.02, 1.8, 2.0)])]],
  // グランドピアノ：鍵盤は -x 側（弾く人は -x 側に座り、+x の方を向く）。本体は +x へのび、ふたが少し開いている
  piano: [
    [MAT.black, merge([b(1.5, 0.3, 1.45, 0.15, 0.65), b(0.9, 0.3, 1.0, 1.0, 0.65), b(0.08, 0.65, 0.08, -0.45, 0, -0.6), b(0.08, 0.65, 0.08, -0.45, 0, 0.6), b(0.08, 0.65, 0.08, 1.2, 0), b(1.3, 0.04, 1.3, 0.35, 1.25).rotateZ(0.3).translate(0.25, -0.2, 0), b(0.25, 0.35, 1.45, -0.72, 0.7)])],
    [MAT.white || new THREE.MeshStandardMaterial({ color: 0xf5f5f0 }), merge([b(0.22, 0.04, 1.3, -0.72, 0.72)])],
  ],
  pianoBench: [[MAT.black, merge([b(0.4, 0.06, 0.8, 0, 0.45), b(0.05, 0.45, 0.05, -0.15, 0, -0.35), b(0.05, 0.45, 0.05, 0.15, 0, -0.35), b(0.05, 0.45, 0.05, -0.15, 0, 0.35), b(0.05, 0.45, 0.05, 0.15, 0, 0.35)])]],
  kiln: [[MAT.kiln, merge([b(1.0, 1.3, 1.0)])]],
  sofa: [[MAT.sofa, merge([b(0.8, 0.42, 1.9), b(0.2, 0.4, 1.9, 0.3, 0.42)])]],
  lowTable: [[MAT.darkWood, merge([b(0.7, 0.4, 1.2)])]],
  counter: [[MAT.wood, merge([b(0.6, 1.0, 3.0)])]],
  pingpong: [
    [MAT.pingBlue, merge([b(1.525, 0.04, 2.74, 0, 0.72)])],
    [MAT.white, merge([b(1.7, 0.15, 0.02, 0, 0.76)])],
    [MAT.metal, merge(legs(1.4, 2.5, 0.72, 0.06))],
  ],
  hoop: [
    [MAT.white, merge([b(0.05, 1.05, 1.8, 0, 2.9)])],
    [MAT.metal, merge([b(0.2, 3.0, 0.2, -1.2, 0), b(1.2, 0.1, 0.1, -0.6, 3.2)])],
  ],
  stage: [[MAT.darkWood, merge([b(1, 1.0, 1)])]], // あとで大きさを変える
  stall: [[MAT.blue, merge([b(1.4, 1.9, 0.03, 0, 0, 0.45), b(0.03, 1.9, 0.9, -0.7)])]],
  sink: [[MAT.white, merge([b(0.5, 0.85, 1.8)])]],
  weightBench: [[MAT.black, merge([b(1.2, 0.45, 0.35), b(0.06, 1.5, 1.4, 0.4)])]],
  // ---- ウエイトルーム（写真） ----
  // ラックつきのベンチ（黒い座面、緑の脚。頭のほうに2本の受け）。長さは x
  rackBench: [[MAT.black, merge([b(1.2, 0.08, 0.32, 0.05, 0.42)])],
    [M(0x7f9c6c, { roughness: 0.6 }), merge([...[-0.45, 0.5].flatMap((x) => [-0.13, 0.13].map((z) => b(0.04, 0.42, 0.04, x, 0, z))), b(1.0, 0.03, 0.03, 0.02, 0.1, 0), ...[-0.25, 0.25].map((z) => b(0.05, 1.05, 0.05, -0.6, 0, z)), ...[-0.25, 0.25].map((z) => b(0.1, 0.05, 0.1, -0.6, 1.05, z))])]],
  // スミスマシン（白いわく、銀色のバー、中に黒いベンチ）
  smithMachine: [[M(0xeeeeea, { roughness: 0.5 }), merge([...[-0.6, 0.6].flatMap((x) => [-0.5, 0.5].map((z) => b(0.07, 2.2, 0.07, x, 0, z))), ...[-0.5, 0.5].map((z) => b(1.27, 0.07, 0.07, 0, 2.2, z)), ...[-0.6, 0.6].map((x) => b(0.07, 0.07, 1.07, x, 2.2, 0)), b(1.3, 0.05, 1.1)])],
    [MAT.metal, merge([b(1.9, 0.035, 0.035, 0, 1.25, 0)])], [MAT.black, merge([b(1.0, 0.08, 0.3, 0, 0.42, 0), b(0.05, 0.42, 0.25, -0.4, 0, 0), b(0.05, 0.42, 0.25, 0.4, 0, 0)])]],
  // プレートを立てる白いスタンドと、黒いプレート
  plateTree: [[M(0xeeeeea, { roughness: 0.5 }), merge([b(0.7, 0.05, 0.6), b(0.06, 1.0, 0.06)])],
    [M(0x2d2e31, { roughness: 0.6 }), merge([[-0.13, 0.35], [0.13, 0.35], [-0.13, 0.75], [0.13, 0.75]].map(([x, y]) => new THREE.CylinderGeometry(0.22, 0.22, 0.12, 20).rotateX(Math.PI / 2).translate(x, y, 0)))]],
  // ダンベルの棚（緑のわく、3段に黒いダンベル）
  dumbbellRack: [[M(0x6f9a5c, { roughness: 0.6 }), merge([...[0.25, 0.6, 0.95].map((y) => b(1.4, 0.03, 0.4, 0, y)), ...[-0.68, 0.68].flatMap((x) => [-0.18, 0.18].map((z) => b(0.04, 1.0, 0.04, x, 0, z)))])],
    [MAT.black, merge([0.28, 0.63, 0.98].flatMap((y) => [-0.5, -0.25, 0, 0.25, 0.5].map((x) => b(0.12, 0.1, 0.25, x, y, 0))))]],
  // エアロバイク（灰色のわく、黒いサドル、銀色のはずみ車）
  exBike: [[M(0x8a8f96, { roughness: 0.4, metalness: 0.4 }), merge([b(1.0, 0.06, 0.4), b(0.08, 0.9, 0.08, -0.25, 0.05), b(0.08, 1.0, 0.08, 0.3, 0.05), b(0.5, 0.06, 0.06, 0.05, 0.6)])],
    [MAT.black, merge([b(0.28, 0.08, 0.18, -0.25, 0.95), b(0.06, 0.06, 0.45, 0.32, 1.05)])], [MAT.metal, merge([new THREE.CylinderGeometry(0.25, 0.25, 0.06, 24).rotateX(Math.PI / 2).translate(0.05, 0.35, 0)])]],
  // 青い施術台
  treatTable: [[M(0x2b4f9a, { roughness: 0.5 }), merge([b(1.8, 0.1, 0.6, 0, 0.6)])], [MAT.metal, merge([...[-0.8, 0.8].flatMap((x) => [-0.25, 0.25].map((z) => b(0.04, 0.6, 0.04, x, 0, z)))])]],
  // 窓のあいだの赤い柱と、腰の高さまでの黒い壁（北の窓の下）
  redPillar: [[M(0xc0261f, { roughness: 0.6 }), merge([b(0.6, 2.45, 0.4)])]],
  blackLow: [[M(0x1e1f22, { roughness: 0.7 }), merge([b(0.04, 0.95, 1)])]],
  // 南の壁：黒い壁（len で長さ）。ところどころ赤と、白い斜めの線
  blackWall: [[M(0x1e1f22, { roughness: 0.7 }), merge([b(0.04, 2.4, 1)])]],
  redPanel: [[M(0xc0261f, { roughness: 0.6 }), merge([b(0.05, 1.5, 1)])]],
  whiteLine: [[M(0xf2f2ee), merge([b(0.06, 0.06, 1).rotateX(-0.22)])]],
  mat: [[MAT.mat, merge([b(2.0, 0.05, 1.0)])]],
  sewing: [[MAT.white, merge([b(0.2, 0.3, 0.4, 0, 0.72)])]],
  cabinet: [[MAT.locker, merge([b(0.45, 1.8, 0.9)])]],
  // 倉庫などのスチール棚（段ボール箱がのっている）
  rack: [[MAT.metal, merge([b(0.5, 0.03, 1.5, 0, 0.3), b(0.5, 0.03, 1.5, 0, 1.0), b(0.5, 0.03, 1.5, 0, 1.7), ...legs(0.5, 1.5, 1.8, 0.04)])], [MAT.cardboard, merge([b(0.4, 0.3, 0.5, 0, 0.33, -0.4), b(0.4, 0.35, 0.6, 0, 1.03, 0.3), b(0.4, 0.25, 0.45, 0, 1.73, -0.3)])]],
  // 更衣室・部室のロッカー（背の高いもの）
  tallLocker: [[MAT.locker, merge([b(0.5, 1.8, 0.9)])], [MAT.metal, merge([b(0.02, 0.15, 0.04, -0.26, 1.0, 0.2), b(0.02, 0.15, 0.04, -0.26, 1.0, -0.2)])]],
  // 生徒更衣室の真ん中に東西にならぶ、灰色の棚のようなロッカー（両面に、開いた段。1台 0.9m）。東西（x）にならべて使う
  grayShelf: [[M(0x9ea4aa, { roughness: 0.5, metalness: 0.2 }), merge([b(0.9, 1.7, 0.5), ...[0.4, 0.8, 1.2].map((y) => b(0.96, 0.03, 0.54, 0, y))])],
    [M(0x4b5056, { roughness: 0.8 }), merge([0.08, 0.5, 0.9, 1.3].flatMap((y) => [b(0.8, 0.28, 0.02, 0, y, 0.25), b(0.8, 0.28, 0.02, 0, y, -0.25)]))]],
  // 木のベンチ・丸いテーブル
  // 応接室（写真）：明るい木の長机を「ロ」の字にならべる（真ん中があいている。角は四角）。外の大きさ 3.0m×4.6m、机の幅 0.6m
  squareTable: (() => {
    const W = 3.0, D = 4.6, t = 0.6, y = 0.68;
    const top = [b(W, 0.04, t, 0, y, -D / 2 + t / 2), b(W, 0.04, t, 0, y, D / 2 - t / 2), b(t, 0.04, D - 2 * t, -W / 2 + t / 2, y), b(t, 0.04, D - 2 * t, W / 2 - t / 2, y)];
    const lg = [];
    for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) for (const z of [-D / 2 + 0.1, -0.8, 0.8, D / 2 - 0.1]) lg.push(b(0.05, y, 0.05, x, 0, z));
    return [[M(0xd8b98a, { roughness: 0.45 }), merge(top)], [MAT.metal, merge(lg)]];
  })(),
  blueChair: [[M(0x2d5fc4, { roughness: 0.6 }), merge([b(0.45, 0.08, 0.45, 0, 0.44), b(0.08, 0.5, 0.42, 0.22, 0.5)])], [MAT.black, merge([b(0.05, 0.44, 0.05), b(0.5, 0.04, 0.06), b(0.06, 0.04, 0.5)])]],
  // 応接室の長い机（真ん中があいている）。南北（z）に長い。天板の高さ 0.7m（いまは使っていない）
  ovalTable: (() => {
    // 長い辺はまっすぐ、両はしは半円（陸上トラックの形）。真ん中はあいている
    const track = (P, r, h) => { P.moveTo(r, -h); P.lineTo(r, h); P.absarc(0, h, r, 0, Math.PI, false); P.lineTo(-r, -h); P.absarc(0, -h, r, Math.PI, Math.PI * 2, false); };
    const sh = new THREE.Shape(); track(sh, 1.2, 1.4);
    const hole = new THREE.Path(); hole.moveTo(0.55, -1.4); hole.absarc(0, -1.4, 0.55, 0, -Math.PI, true); hole.lineTo(-0.55, 1.4); hole.absarc(0, 1.4, 0.55, Math.PI, 0, true); hole.lineTo(0.55, -1.4); sh.holes.push(hole);
    const top = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 32 });
    top.rotateX(-Math.PI / 2); top.translate(0, 0.68, 0);
    const legs = [[0.9, 0], [-0.9, 0], [0, 2.25], [0, -2.25]].map(([x, z]) => b(0.08, 0.68, 0.08, x, 0, z));
    return [[MAT.darkWood, merge([top])], [MAT.metal, merge(legs)]];
  })(),
  // 壁画（写真をそのまま貼る。len で横の長さ）
  mural: [[new THREE.MeshStandardMaterial({ map: (() => { const t = new THREE.TextureLoader().load("images/mural.jpg"); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.9 }), merge([b(0.03, 2.4, 1, 0, 0.1)])]],
  bench: [[MAT.wood, merge([b(0.4, 0.05, 1.6, 0, 0.42)])], [MAT.metal, merge([b(0.35, 0.42, 0.05, 0, 0, -0.7), b(0.35, 0.42, 0.05, 0, 0, 0.7)])]],
  wallBench: [[MAT.darkWood, merge([b(0.5, 0.42, 1.6)])]], // 壁ぞいの作りつけの木のベンチ
  // 石こうの胸像
  bust: [[MAT.white, merge([new THREE.CylinderGeometry(0.12, 0.15, 0.15, 10).translate(0, 0.075, 0), b(0.2, 0.22, 0.38, 0, 0.15), new THREE.SphereGeometry(0.13, 10, 8).translate(0, 0.5, 0)])]],
  roundTable: [[MAT.white, merge([new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16).translate(0, 0.72, 0)])], [MAT.metal, merge([new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6).translate(0, 0.36, 0)])]],
  // 受水槽・電気室の機械
  tank: [[MAT.tank, merge([b(2.2, 2.0, 3.0)])], [MAT.metal, merge([b(0.3, 0.3, 0.3, 0, 2.0, 0.8)])]],
  panel: [[MAT.gray, merge([b(0.6, 2.0, 1.2)])], [MAT.black, merge([b(0.02, 0.4, 0.3, -0.31, 1.3, -0.25), b(0.02, 0.4, 0.3, -0.31, 1.3, 0.25)])]],
  // 給湯室の流し台
  kitchen: [[MAT.white, merge([b(0.6, 0.85, 1.8)])], [MAT.steel, merge([b(0.62, 0.04, 1.82, 0, 0.85)])]],
  // 正面玄関の傘立て・下駄箱（来客用）
  umbrella: [[MAT.metal, merge([b(0.3, 0.55, 0.9)])]],
  // 作法室の座卓と床の間
  zataku: [[MAT.darkWood, merge([b(0.9, 0.33, 1.6)])]],
  tokonoma: [[MAT.darkWood, merge([b(0.6, 0.15, 1.8)])], [MAT.paper, merge([b(0.02, 1.2, 0.5, -0.28, 0.9)])]],
  // 作法室：畳の小上がり（高さ0.35m。sx・sz で大きさ）、入口の板の間、ふすま（1枚 0.9m）
  tatamiDais: [[MAT.tatamiTop, merge([b(1, 0.35, 1)])]],
  entryFloor: [[MAT.wood, merge([b(1, 0.03, 1)])]],
  fusuma: [[MAT.fusuma, merge([b(0.9, 1.8, 0.04, 0, 0.35)])], [MAT.darkWood, merge([b(0.92, 0.04, 0.06, 0, 2.15), b(0.03, 1.8, 0.06, -0.45, 0.35)])]],
  // 教室の小物
  // 壁にかけた横長の絵（3枚つづき。青い海のような絵）
  painting: [[new THREE.MeshStandardMaterial({ roughness: 0.8, map: (() => { const c = document.createElement("canvas"); c.width = 192; c.height = 48; const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 192, 48); gr.addColorStop(0, "#1f5f80"); gr.addColorStop(0.45, "#6fb3c8"); gr.addColorStop(1, "#d9e6e6"); g.fillStyle = gr; g.fillRect(0, 0, 192, 48); g.fillStyle = "rgba(40,50,60,0.5)"; g.beginPath(); g.ellipse(40, 44, 40, 20, 0, Math.PI, 2 * Math.PI); g.fill(); g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(63, 0, 1, 48); g.fillRect(127, 0, 1, 48); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }), merge([b(0.04, 0.7, 2.8, 0, 1.2)])]],
  bulletin: [[MAT.cork, merge([b(0.03, 0.9, 2.4, 0, 1.25)])], [MAT.darkWood, merge([b(0.05, 0.05, 2.5, 0, 2.15), b(0.05, 0.05, 2.5, 0, 1.2)])]],
  clock: [[MAT.clock, (() => { const g = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24); g.rotateZ(-Math.PI / 2); g.translate(0.03, 2.45, 0); return g; })()]],
  tv: [[MAT.black, merge([b(0.08, 0.62, 1.05, 0.06, 1.75), b(0.05, 0.3, 0.1, 0.02, 2.35)])]],
  // 大型の電子黒板（キャスター付きのスタンドに、横長の画面）。画面は +x（生徒）向き
  eboard: [
    [MAT.screenOn, merge([b(0.04, 0.95, 1.62, 0.06, 0.85)])],
    [MAT.black, merge([b(0.1, 1.03, 1.7, 0, 0.81), b(0.08, 0.85, 0.08, 0, 0, -0.45), b(0.08, 0.85, 0.08, 0, 0, 0.45), b(0.6, 0.06, 1.1, 0, 0.05)])],
  ],
  // 引き戸（壁の両側に見えるよう壁より厚め）と、まわりの枠、上の欄間のガラス
  // 廊下側の壁の上の細長い窓（欄間）と、下の小窓。壁より厚くして両側から見える
  // 事務室の受付の窓（正面玄関から事務室をたずねる窓）：ガラスの引き違い窓と、手前の小さなカウンター
  receptionWindow: [[MAT.transom, merge([b(1.8, 1.0, 0.26, 0, 1.0)])], [MAT.doorFrame, merge([b(1.9, 0.05, 0.28, 0, 2.0), b(1.9, 0.05, 0.28, 0, 0.98), b(0.05, 1.05, 0.28, -0.93, 0.98), b(0.05, 1.05, 0.28, 0.93, 0.98), b(0.04, 1.0, 0.27, 0, 1.0)])], [MAT.wood, merge([b(2.0, 0.05, 0.6, 0, 0.95)])]],
  // 放送室のミキサー室と録音室のあいだの窓（ガラスと枠。壁より厚くして両側から見える）
  studioWindow: [[MAT.transom, merge([b(1.6, 0.85, 0.26, 0, 0.95)])], [MAT.doorFrame, merge([b(1.7, 0.06, 0.3, 0, 1.8), b(1.7, 0.06, 0.3, 0, 0.9), b(0.06, 0.96, 0.3, -0.82, 0.9), b(0.06, 0.96, 0.3, 0.82, 0.9)])]],
  // イーゼルにのせた絵と、ガラスの展示ケース
  easel: [[MAT.wood, merge([b(0.05, 1.6, 0.05, 0, 0, -0.35).rotateX(0.12), b(0.05, 1.6, 0.05, 0, 0, 0.35).rotateX(-0.12), b(0.05, 1.5, 0.05, -0.35, 0).rotateZ(-0.25), b(0.06, 0.04, 0.9, 0.05, 0.75)])], [MAT.white, merge([b(0.04, 0.7, 1.0, 0.08, 0.8)])]],
  showcase: [[MAT.transom, merge([b(0.6, 0.5, 1.8, 0, 0.5)])], [MAT.metal, merge([b(0.6, 0.05, 1.8, 0, 0.45), b(0.04, 0.45, 0.04, -0.28, 0, -0.88), b(0.04, 0.45, 0.04, -0.28, 0, 0.88), b(0.04, 0.45, 0.04, 0.28, 0, -0.88), b(0.04, 0.45, 0.04, 0.28, 0, 0.88)])]],
  // 出張図書館のブックトラック（クリーム色のワゴンに本）
  bookCart: [[M(0xeee0a8), merge([b(0.05, 1.2, 0.5, -0.4, 0.1), b(0.05, 1.2, 0.5, 0.4, 0.1), b(0.8, 0.03, 0.5, 0, 0.3), b(0.8, 0.03, 0.4, 0, 0.75), b(0.8, 0.03, 0.3, 0, 1.15)])], [M(0x4a7fc0), merge([b(0.7, 0.28, 0.05, 0, 0.33, 0.1), b(0.7, 0.28, 0.05, 0, 0.78, 0.05), b(0.7, 0.25, 0.05, 0, 1.18, 0)])], [M(0x333333), merge([-0.35, 0.35].flatMap((x) => [-0.2, 0.2].map((z) => b(0.08, 0.1, 0.08, x, 0, z))))]],
  // 図書室（写真）：黒い枠に本がならぶ背の高い両面の本棚（両はしは木の板）、白と緑の四角い柱、回る丸い本棚、赤いキューブのいす、本をならべた展示テーブル
  tallShelf: [[MAT.books, merge([b(0.7, 2.0, 0.86)])], [M(0x2c2e30), merge([b(0.72, 0.05, 0.88, 0, 2.0)])], [MAT.wood, merge([b(0.76, 2.1, 0.05, 0, 0, -0.45), b(0.76, 2.1, 0.05, 0, 0, 0.45)])]],
  libColumn: [[M(0xf4f2ec), merge([b(0.9, 1.6, 0.9, 0, 1.5)])], [M(0x3f6b55), merge([b(0.92, 1.5, 0.92)])]],
  roundShelf: [[MAT.books, merge([new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16).translate(0, 0.65, 0)])], [M(0xf4f2ec), merge([new THREE.CylinderGeometry(0.58, 0.58, 0.05, 16).translate(0, 1.32, 0), new THREE.CylinderGeometry(0.58, 0.58, 0.05, 16).translate(0, 0.65, 0)])]],
  cubeStool: [[M(0xc8553d), merge([b(0.42, 0.42, 0.42)])]],
  // 保健室（写真）：青い合皮のソファベッド、白い診察台、白い冷蔵庫（上に電子レンジ）、流しのタイル張りカウンター、白い薬品棚、灰色とクリーム色のロッカー、ひざ丈の白いついたて、空気清浄機、扇風機
  blueSofa: [[M(0x2f8fc6, { roughness: 0.5 }), merge([b(0.9, 0.4, 2.0), b(0.25, 0.45, 2.0, 0.3, 0.4)])]],
  examBench: [[M(0xf4f2ec, { roughness: 0.4 }), merge([b(0.6, 0.12, 1.8, 0, 0.45)])], [MAT.darkWood, merge(legs(0.55, 1.75, 0.45, 0.05))]],
  fridge: [[M(0xf4f4f2, { roughness: 0.3 }), merge([b(0.6, 1.4, 0.6), b(0.012, 0.9, 0.35, 0.3, 0.48, 0)])], [M(0xf7f7f5), merge([b(0.5, 0.3, 0.4, 0, 1.4)])], [MAT.black, merge([b(0.02, 0.18, 0.28, 0.255, 1.46, 0)])]],
  tileCounter: [[M(0xf0eee8, { roughness: 0.4 }), merge([b(0.6, 0.85, 1.0)])], [M(0xdadad5, { roughness: 0.3 }), merge([b(0.62, 0.03, 1.02, 0, 0.85), b(0.04, 0.4, 1.02, -0.3, 0.88)])], [M(0xe4ece8), merge([b(0.5, 0.18, 0.6, -0.04, 0.84, 0).translate(0, -0.05, 0)])]],
  medCabinet: [[M(0xf4f4f2, { roughness: 0.4 }), merge([b(0.4, 1.6, 0.9), b(0.4, 0.04, 0.92, 0, 1.6)])], [MAT.transom, merge([b(0.01, 0.9, 0.8, 0.205, 0.6)])], [M(0xe9e0cd), merge([b(0.3, 0.12, 0.35, -0.02, 0.62, -0.2), b(0.3, 0.12, 0.35, -0.02, 0.92, 0.2), b(0.3, 0.12, 0.35, -0.02, 1.22, -0.1)])]],
  tallLocker: [[M(0xcfc6aa, { roughness: 0.5 }), merge([b(0.45, 1.75, 0.45)])], [M(0x9a9690), merge([b(0.01, 0.12, 0.08, 0.23, 1.0, 0.1)])]],
  grayLocker: [[M(0x9b9d96, { roughness: 0.5 }), merge([b(0.5, 1.8, 0.5)])], [M(0x6f716c), merge([b(0.01, 0.1, 0.06, 0.255, 1.0, 0.15)])]],
  screenPanel: [[M(0xe9ecee, { roughness: 0.4 }), merge([b(0.03, 1.5, 0.5), b(0.03, 1.5, 0.5, 0.15, 0, 0.45).rotateY(0.6), b(0.04, 0.04, 1.5, 0, 1.5)])], [MAT.metal, merge([b(0.05, 1.55, 0.05, 0, 0, -0.25), b(0.05, 1.55, 0.05, 0, 0, 0.25)])]],
  // らくらくスペース（写真）：木目の長方形の机（1.8m×0.9m、銀色の脚）、灰色のひじかけ付きいす、白い棚
  meetTable: [[M(0x9a5a34, { roughness: 0.5 }), merge([b(0.9, 0.04, 1.8, 0, 0.7)])], [MAT.metal, merge(legs(0.85, 1.75, 0.7, 0.04))]],
  grayChair: [[M(0x9ea3ad, { roughness: 0.9 }), merge([b(0.48, 0.1, 0.48, 0, 0.42), b(0.08, 0.55, 0.42, 0.22, 0.5)])], [MAT.black, merge([b(0.05, 0.4, 0.05), b(0.55, 0.04, 0.06), b(0.06, 0.04, 0.55), b(0.4, 0.04, 0.05, 0, 0.62, 0.24), b(0.4, 0.04, 0.05, 0, 0.62, -0.24)])]],
  whiteShelf: [[M(0xece4ee, { roughness: 0.6 }), merge([b(0.35, 0.03, 0.9), b(0.35, 0.03, 0.9, 0, 0.45), b(0.35, 0.03, 0.9, 0, 0.9), b(0.35, 0.03, 0.9, 0, 1.35), b(0.35, 0.03, 0.9, 0, 1.75), b(0.35, 1.78, 0.03, 0, 0, -0.45), b(0.35, 1.78, 0.03, 0, 0, 0.45), b(0.02, 1.78, 0.9, 0.17)])]],
  // 武道場（写真）：床の白いライン（細い帯。len で長さ）、紺色の大きな旗、壁の額
  floorLine: [[M(0xf4f4f0, { roughness: 0.6 }), merge([b(1, 0.02, 0.07, 0, 0.03)])]],
  dojoBanner: [[M(0x1f2a52, { roughness: 0.9 }), merge([b(1.6, 1.9, 0.03, 0, 0.9)])], [M(0xf2f2ee), merge([b(0.5, 0.5, 0.035, 0.25, 1.9), b(0.5, 0.5, 0.035, 0.25, 1.25)])]],
  frameRow: [[M(0x5a4a3a, { roughness: 0.6 }), merge(Array.from({ length: 8 }, (_, i) => b(0.3, 0.38, 0.03, (i - 3.5) * 0.45, 1.75)))], [M(0xeeeeea), merge(Array.from({ length: 8 }, (_, i) => b(0.24, 0.3, 0.035, (i - 3.5) * 0.45, 1.79)))]],
  // 部屋を分けるパーティション（灰色のパネルと、銀色の細い枠。sx で長さ）
  partitionWall: [[M(0xb9bcc0, { roughness: 0.7 }), merge([b(1, 2.1, 0.05, 0, 0.05)])], [MAT.metal, merge([b(1, 0.04, 0.07, 0, 2.15), b(1, 0.05, 0.07)])]],
  airPurifier: [[M(0xf6f6f4, { roughness: 0.4 }), merge([b(0.3, 0.65, 0.4)])], [M(0xdcdcd8), merge([b(0.31, 0.04, 0.3, 0, 0.62)])]],
  fan: [[M(0xf4f2ec), merge([new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12).translate(0, 0.015, 0), b(0.03, 1.1, 0.03), new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16).rotateZ(Math.PI / 2).translate(-0.05, 1.2, 0)])], [M(0xe58a3c), merge([new THREE.CylinderGeometry(0.17, 0.17, 0.01, 8).rotateZ(Math.PI / 2).translate(-0.12, 1.2, 0)])]],
  sickBook: [[M(0xcfd6d8), merge([b(0.03, 0.5, 1.4, 0, 1.2)])]],
  displayTable: [[MAT.checkBeige, merge([b(1.8, 0.7, 0.9)])], [MAT.books, merge([b(1.6, 0.06, 0.7, 0, 0.7)])]],
  // 図書室（写真2）：壁ぞいの木の本棚（天井近くまで。上の段はまだ空きが多い）、窓ぎわの白いカウンターと緑の高いいす、
  // 白い脚の木の小さなテーブルと緑の座面の木のいす、白っぽい積み重ねいす、雑誌の黒い棚、マンガの白い棚、黄色のブックトラック、
  // チェックの布をかけた展示テーブル（ピンク・黄色）、柱の白い網のパネル、マンガのタグの緑の掲示板（キャスターつき）、窓のステンドグラス（色紙）
  wallShelf: [[M(0xc89a62), merge([b(0.38, 0.04, 0.92, 0, 0), b(0.38, 0.04, 0.92, 0, 2.46), b(0.38, 2.5, 0.03, 0, 0, -0.45), b(0.38, 2.5, 0.03, 0, 0, 0.45), b(0.03, 2.5, 0.92, 0.18, 0), ...[0.45, 0.8, 1.15, 1.5, 1.85, 2.15].map((y) => b(0.36, 0.025, 0.9, 0, y))])], [MAT.books, merge([b(0.3, 1.38, 0.84, 0.03, 0.06)])]],
  highCounter: [[M(0xf4f3ef), merge([b(0.45, 0.03, 1.5, 0, 1.0), b(0.02, 1.0, 0.02, -0.2, 0, -0.72), b(0.02, 1.0, 0.02, 0.2, 0, -0.72), b(0.02, 1.0, 0.02, -0.2, 0, 0.72), b(0.02, 1.0, 0.02, 0.2, 0, 0.72), b(0.42, 0.02, 0.02, 0, 0.05, -0.72), b(0.42, 0.02, 0.02, 0, 0.05, 0.72)])], [M(0xd9b98a), merge([b(0.45, 0.012, 1.5, 0, 0.99)])]],
  barStool: [[M(0x9aa83c, { roughness: 0.95 }), merge([b(0.4, 0.07, 0.4, 0, 0.7), b(0.07, 0.25, 0.4, 0.17, 0.77)])], [M(0xf4f3ef), merge([b(0.02, 0.7, 0.02, -0.17, 0, -0.17), b(0.02, 0.7, 0.02, 0.17, 0, -0.17), b(0.02, 0.7, 0.02, -0.17, 0, 0.17), b(0.02, 0.7, 0.02, 0.17, 0, 0.17), b(0.38, 0.02, 0.02, 0, 0.25, -0.17), b(0.38, 0.02, 0.02, 0, 0.25, 0.17)])]],
  woodTable: [[M(0xe3cfa8), merge([b(0.8, 0.035, 1.2, 0, 0.72)])], [MAT.black, merge(legs(0.8, 1.2, 0.72, 0.04))]],
  woodChair: [[M(0xd9944e), merge([b(0.04, 0.42, 0.42, 0.2, 0.5)])], [M(0x9aa83c, { roughness: 0.95 }), merge([b(0.42, 0.05, 0.42, 0, 0.44)])], [M(0xf4f3ef), merge(legs(0.4, 0.4, 0.44, 0.025))]],
  stackChair: [[M(0xe9e3d6, { roughness: 0.8 }), merge([b(0.42, 0.05, 0.42, 0, 0.44), b(0.05, 0.3, 0.42, 0.21, 0.58)])], [MAT.black, merge([...legs(0.4, 0.4, 0.44, 0.02), b(0.02, 0.45, 0.02, 0.22, 0.44, -0.2), b(0.02, 0.45, 0.02, 0.22, 0.44, 0.2)])]],
  magRack: [[M(0x262729, { roughness: 0.5 }), merge([b(0.45, 1.9, 1.9), ...[0.3, 0.68, 1.06, 1.44].map((y) => b(0.12, 0.03, 1.86, -0.26, y))])], [MAT.mags, merge([0.32, 0.7, 1.08, 1.46].map((y) => b(0.02, 0.34, 1.8, -0.24, y).rotateZ(0.12)))]],
  mangaRack: [[M(0xf4f4f0), merge([b(0.32, 1.55, 0.03, 0, 0, -0.45), b(0.32, 1.55, 0.03, 0, 0, 0.45), b(0.32, 0.04, 0.92, 0, 0), b(0.32, 0.04, 0.92, 0, 1.52), b(0.03, 1.55, 0.92, 0.15, 0)])], [MAT.books, merge([0.05, 0.42, 0.79, 1.16].map((y) => b(0.2, 0.3, 0.84, 0.03, y + 0.02)))]],
  lowBookcase: [[M(0xa2683a), merge([b(0.38, 0.95, 0.03, 0, 0, -0.45), b(0.38, 0.95, 0.03, 0, 0, 0.45), b(0.38, 0.03, 0.92, 0, 0.93), b(0.38, 0.05, 0.92, 0, 0), b(0.03, 0.95, 0.92, 0.18, 0)])], [MAT.books, merge([b(0.28, 0.85, 0.84, 0.03, 0.06)])]],
  yellowCart: [[M(0xf0d64a), merge([b(0.05, 1.15, 0.55, -0.42, 0.1), b(0.05, 1.15, 0.55, 0.42, 0.1), b(0.84, 0.03, 0.5, 0, 0.32), b(0.84, 0.03, 0.4, 0, 0.75)])], [MAT.books, merge([b(0.78, 0.26, 0.4, 0, 0.35).rotateX(0.15), b(0.78, 0.24, 0.32, 0, 0.78).rotateX(0.15)])], [MAT.black, merge([-0.4, 0.4].flatMap((x) => [-0.22, 0.22].map((z) => b(0.06, 0.1, 0.06, x, 0, z))))]],
  pinkTable: [[MAT.checkPink, merge([b(0.7, 0.74, 1.6)])], [MAT.books, merge([b(0.4, 0.04, 1.4, 0.05, 0.74)])]],
  yellowTable: [[MAT.checkYellow, merge([b(0.6, 0.72, 0.6)])], [MAT.books, merge([b(0.4, 0.04, 0.4, 0, 0.72)])]],
  wirePanel: [[M(0xf6f6f2), merge([...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => b(0.02, 1.3, 0.012, 0, 0.9, -0.5 + k * 0.143)), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => b(0.02, 0.012, 1.0, 0, 0.9 + k * 0.144))])], [MAT.books, merge([b(0.06, 0.24, 0.17, -0.05, 1.7, -0.3), b(0.06, 0.24, 0.17, -0.05, 1.7, 0.1), b(0.06, 0.24, 0.17, -0.05, 1.25, -0.15), b(0.06, 0.24, 0.17, -0.05, 1.25, 0.3)])]],
  mangaBoard: [[MAT.mangaTags, merge([b(0.04, 1.2, 2.4, 0, 0.75)])], [M(0xc8ccd0, { metalness: 0.4, roughness: 0.4 }), merge([b(0.06, 1.95, 0.05, 0, 0, -1.25), b(0.06, 1.95, 0.05, 0, 0, 1.25), b(0.5, 0.04, 0.06, 0, 0.04, -1.25), b(0.5, 0.04, 0.06, 0, 0.04, 1.25), b(0.12, 0.03, 2.4, -0.05, 0.72)])], [MAT.paper, merge([b(0.02, 0.32, 0.45, -0.03, 1.98)])]],
  stainedGlass: [[MAT.stained, merge([b(0.02, 1.1, 1.5, 0, 1.15)])], [MAT.black, merge([b(0.03, 0.04, 1.54, 0, 1.13), b(0.03, 0.04, 1.54, 0, 2.25), b(0.03, 1.1, 0.04, 0, 1.15, 0)])]],
  // 印刷室（写真）：コピー機・印刷機（白い箱に黒いふた）、紙を分ける機械（たてに長い）、机の上のプリンター
  copier: [[M(0xeceae4), merge([b(0.75, 0.95, 0.65)])], [M(0x2c2e30), merge([b(0.75, 0.1, 0.65, 0, 0.95), b(0.35, 0.04, 0.4, 0.5, 0.7)])]],
  riso: [[M(0xeceae4), merge([b(0.7, 1.0, 0.75)])], [M(0x2c2e30), merge([b(0.3, 0.05, 0.5, -0.5, 0.75), b(0.3, 0.05, 0.5, 0.5, 0.6)])]],
  collator: [[M(0xeceae4), merge([b(0.55, 1.65, 0.6)])], [M(0x4a8f9f), merge([0.6, 0.8, 1.0, 1.2, 1.4].map((h) => b(0.3, 0.02, 0.5, 0.35, h)))]],
  printerDesk: [[M(0x9fb8a8), merge([b(0.7, 0.72, 1.6)])], [M(0xf2f2ee), merge([b(0.5, 0.35, 0.5, 0, 0.72, -0.45), b(0.45, 0.25, 0.45, 0, 0.72, 0.4)])]],
  // トイレの入口（写真）：色のついた枠に、1枚の片引き戸（細い窓と下にガラリ）。上に男女のマーク。男子は青緑、女子はピンク
  // 部室の外への入口（写真）：うすいピンクがかった白の両引き戸（上に窓、下にガラリ）と、その上の欄間（ガラリと窓）
  clubDoor: [
    [M(0xead9d2), merge([b(0.88, 2.0, 0.34, -0.45, 0, -0.02), b(0.88, 2.0, 0.34, 0.45, 0, 0.02)])],
    [M(0x8c867c), merge([b(1.96, 0.08, 0.4, 0, 2.0), b(0.06, 2.9, 0.4, -0.95), b(0.06, 2.9, 0.4, 0.95), b(0.03, 2.0, 0.4, 0), b(0.03, 0.08, 0.38, -0.12, 0.95), b(0.03, 0.08, 0.38, 0.78, 0.95)])],
    [MAT.transom, merge([b(0.6, 0.6, 0.36, -0.45, 1.15, -0.02), b(0.6, 0.6, 0.36, 0.45, 1.15, 0.02), b(0.88, 0.5, 0.36, 0.45, 2.3)])],
    [M(0x9a948a), merge([b(0.6, 0.35, 0.37, -0.45, 0.15, -0.02), b(0.6, 0.35, 0.37, 0.45, 0.15, 0.02), b(0.88, 0.5, 0.37, -0.45, 2.3)])],
  ],
  wcDoorM: [[M(0x2f7f8a), merge([b(0.62, 2.0, 0.3, 0.17, 0), b(1.25, 0.12, 0.34, 0, 2.0), b(0.08, 2.12, 0.34, -0.6), b(0.08, 2.12, 0.34, 0.6)])], [MAT.transom, merge([b(0.06, 0.45, 0.32, 0.32, 1.25)])], [M(0xc9ccd0), merge([b(0.22, 0.28, 0.33, 0, 2.25)])], [M(0x1f3d7a), merge([b(0.06, 0.18, 0.34, 0, 2.3)])]],
  wcDoorF: [[M(0xc9787a), merge([b(0.62, 2.0, 0.3, 0.17, 0), b(1.25, 0.12, 0.34, 0, 2.0), b(0.08, 2.12, 0.34, -0.6), b(0.08, 2.12, 0.34, 0.6)])], [MAT.transom, merge([b(0.06, 0.45, 0.32, 0.32, 1.25)])], [M(0xc9ccd0), merge([b(0.22, 0.28, 0.33, 0, 2.25)])], [M(0xc23b3b), merge([b(0.08, 0.18, 0.34, 0, 2.3)])]],
  // パイプいすを折りたたんで、壁に立てかけて積んだ山（黒い座面・背もたれと、銀色のパイプ。7脚）
  chairStack: [[MAT.black, merge(Array.from({ length: 7 }, (_, i) => b(0.05, 0.8, 0.42).rotateZ(-0.22).translate(0, 0, (i - 3) * 0.12)))],
    [MAT.metal, merge(Array.from({ length: 7 }, (_, i) => [-0.2, 0.2].map((dz) => b(0.03, 0.85, 0.03, 0.03, 0, dz).rotateZ(-0.22).translate(0, 0, (i - 3) * 0.12))).flat())]],
  // キャスターつきの台にのせた大きなテレビ
  tvStand: [[MAT.black, merge([b(0.08, 0.75, 1.3, 0, 1.15), b(0.06, 1.15, 0.06, 0.05, 0), b(0.5, 0.04, 0.6, 0.05, 0.05)])]],
  // 台にのった地球儀
  globe: [[M(0x3a7fc8, { roughness: 0.4 }), merge([new THREE.SphereGeometry(0.17, 14, 10).translate(0, 1.15, 0)])], [M(0xb8b8b8, { metalness: 0.5 }), merge([b(0.03, 0.95, 0.03), b(0.25, 0.03, 0.25)])]],
  bioTable: [[M(0x1f2224, { roughness: 0.35 }), merge([b(0.75, 0.05, 1.8, 0, 0.75)])], [M(0xa8643a), merge([b(0.75, 0.08, 1.75, 0, 0.67), ...legs(0.7, 1.7, 0.67, 0.07)])]],
  longBench: [[M(0xa8643a), merge([b(0.28, 0.05, 1.7, 0, 0.42), b(0.06, 0.42, 0.06, 0, 0, -0.75), b(0.06, 0.42, 0.06, 0, 0, 0.75)])]],
  microscope: [[M(0xf2f2ee), merge([b(0.14, 0.04, 0.18, 0, 0.78), b(0.05, 0.25, 0.06, 0.05, 0.8)])], [MAT.black, merge([b(0.12, 0.02, 0.12, 0, 0.92), new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8).rotateZ(0.5).translate(0.02, 1.1, 0)])]],
  sinkCounter: [[M(0xd9d6cf), merge([b(0.6, 0.85, 1.8)])], [M(0xb8bcc0, { metalness: 0.5 }), merge([b(0.45, 0.02, 0.7, 0, 0.86)])]],
  magazineRack: [[M(0xd8d2c0), merge([b(0.35, 1.9, 1.0)])], [MAT.books, merge([0.3, 0.65, 1.0, 1.35, 1.7].map((h) => b(0.06, 0.28, 0.9, -0.18, h)))]],
  pamphletCart: [[M(0xf0ece0), merge([b(0.6, 0.03, 0.9, 0, 0.3), b(0.6, 0.03, 0.9, 0, 0.6), ...legs(0.6, 0.9, 1.0, 0.03)])], [MAT.paper, merge([b(0.5, 0.3, 0.85, 0, 0.95).rotateZ(-0.3)])], [new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d"); const cs = ["#2d6cdf", "#e94f3b", "#f3b73a", "#3aa66b", "#7a4cc9", "#e85fa0"]; for (let i = 0; i < 8; i++) { g.fillStyle = cs[i % cs.length]; g.fillRect(0, i * 8, 64, 7); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.8 }), merge([b(0.52, 0.04, 0.86, 0, 1.1).rotateZ(-0.3)])]],
  cookIsland: [[M(0xf4f2ec), merge([b(1.2, 0.8, 1.8)])], [M(0xe8d5c4), merge([b(1.22, 0.45, 0.5, 0, 0.15, -0.5), b(1.22, 0.45, 0.5, 0, 0.15, 0.5)])], [M(0xb8bcc0, { metalness: 0.6, roughness: 0.3 }), merge([b(1.25, 0.04, 1.85, 0, 0.8)])], [MAT.black, merge([b(0.7, 0.03, 0.45, 0, 0.84, -0.55), b(0.6, 0.06, 0.5, 0, 0.82, 0.5)])]],
  longTable: [[M(0xeceae4), merge([b(0.6, 0.04, 1.75, 0, 0.7)])], [MAT.metal, merge(legs(0.55, 1.7, 0.7, 0.03))]],
  greenStool: [[M(0x5f9a3c), merge([new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12).translate(0, 0.6, 0)])], [MAT.metal, merge([b(0.03, 0.6, 0.03, 0.1, 0, 0.1), b(0.03, 0.6, 0.03, -0.1, 0, -0.1), b(0.03, 0.6, 0.03, 0.1, 0, -0.1), b(0.03, 0.6, 0.03, -0.1, 0, 0.1)])]],
  dishCabinet: [[M(0xb07a4a), merge([b(0.45, 0.9, 0.95), b(0.4, 1.0, 0.95, 0.02, 0.9)])], [MAT.transom, merge([b(0.42, 0.85, 0.85, 0.03, 0.98)])]],
  fridge: [[M(0xdcdcdc, { metalness: 0.3 }), merge([b(0.7, 1.8, 0.7)])]],
  woodDesk: [[M(0x9a5a34, { roughness: 0.6 }), merge([b(0.6, 0.03, 0.45, 0, 0.7)])], [MAT.metal, merge(legs(0.55, 0.4, 0.7, 0.025))]],
  woodChair: [[M(0x7a4a2c), merge([b(0.38, 0.03, 0.38, 0, 0.44), b(0.38, 0.32, 0.03, 0, 0.52, -0.18)])], [MAT.metal, merge(legs(0.34, 0.34, 0.44, 0.02))]],
  greenBoard: [[M(0x2f5a44, { roughness: 0.9 }), merge([b(0.04, 1.4, 3.6, 0, 1.0)])], [M(0xf2f0ea), merge([b(0.05, 0.4, 0.3, -0.02, 1.7, -1.2), b(0.05, 0.4, 0.3, -0.02, 1.7, -0.6), b(0.05, 0.4, 0.5, -0.02, 1.7, 0.2)])]],
  cubby: [[M(0xb07a4a), merge([b(0.4, 1.8, 0.92)])], [M(0x5a3a22), merge([0.35, 0.8, 1.25].map((h) => b(0.38, 0.38, 0.88, 0.02, h)))]],
  // ゆるいスロープ（幅1.5m）：灰色の石の板と、両はしの金属のふち
  ramp: [[M(0x8f8f88, { roughness: 0.5 }), merge([b(1.5, 0.06, 0.9, 0, 0.04).rotateX(0.08)])], [MAT.metal, merge([b(0.05, 0.08, 0.9, 0.75, 0.05).rotateX(0.08), b(0.05, 0.08, 0.9, -0.75, 0.05).rotateX(0.08)])]],
  bustShelf: [[MAT.wood, merge([b(0.4, 1.2, 1.15), b(0.42, 0.04, 1.2, 0, 1.2)])]],
  // パイプいす（黒い座面と背、銀の脚）
  foldChair: [[MAT.black, merge([b(0.4, 0.04, 0.4, 0, 0.44), b(0.04, 0.3, 0.4, 0.2, 0.55)])], [MAT.metal, merge([b(0.03, 0.44, 0.03, -0.18, 0, -0.18), b(0.03, 0.44, 0.03, -0.18, 0, 0.18), b(0.03, 0.85, 0.03, 0.18, 0, -0.18), b(0.03, 0.85, 0.03, 0.18, 0, 0.18)])]],
  // 制服を着せたマネキン（上半身だけ、スタンドつき）
  mannequin: [[MAT.metal, merge([b(0.4, 0.03, 0.4), b(0.03, 1.0, 0.03)])], [MAT.navy, merge([b(0.42, 0.6, 0.25, 0, 1.0)])], [M(0xf0c8a8), merge([b(0.14, 0.14, 0.14, 0, 1.6)])]],
  // ハンガーラック（服がかかっている。白いカバー）
  hangerRack: [[MAT.metal, merge([b(1.2, 0.03, 0.03, 0, 1.7), b(0.03, 1.7, 0.03, -0.58), b(0.03, 1.7, 0.03, 0.58)])], [M(0xeeeeea, { transparent: true, opacity: 0.85 }), merge([b(1.0, 1.3, 0.5, 0, 0.35)])]],
  cardboard: [[MAT.cardboard, merge([b(0.5, 0.35, 0.4), b(0.4, 0.3, 0.35, 0.05, 0.35)])]],
  // 放送室のミキサー卓（クリーム色の台に、つまみとフェーダーの並んだ灰色の機械と、マイク）
  mixerDesk: [[M(0xe8e4d8), merge([b(2.2, 0.72, 0.7), b(2.2, 0.05, 0.75, 0, 0.72)])], [M(0x6a6e72), merge([b(1.2, 0.12, 0.5, -0.3, 0.77)])], [MAT.black, merge([b(0.03, 0.4, 0.03, 0.5, 0.77), b(0.06, 0.05, 0.06, 0.5, 1.17)])], [M(0xd0d4d8), merge([-0.75, -0.55, -0.35, -0.15, 0.05].map((x) => b(0.03, 0.02, 0.3, x, 0.84)))]],
  whiteboard: [[M(0xf6f6f4), merge([b(0.04, 0.9, 1.4, 0, 1.0)])], [MAT.metal, merge([b(0.05, 0.03, 1.45, 0, 1.9), b(0.05, 0.03, 1.45, 0, 0.98), b(0.08, 0.04, 1.3, 0.03, 0.96)])]],
  // 壁にたくさんかけたケーブルの輪
  cableWall: [[MAT.black, merge([0.3, 0.7, 1.1, 1.5].flatMap((h) => [-0.6, -0.2, 0.2, 0.6].map((z) => new THREE.TorusGeometry(0.16, 0.025, 6, 14).rotateY(Math.PI / 2).translate(0.03, h, z).toNonIndexed())))]],
  micStand: [[MAT.metal, merge([new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6).translate(0, 0.8, 0), b(0.3, 0.02, 0.3)])], [MAT.black, merge([b(0.04, 0.12, 0.04, 0, 1.6)])]],
  printer: [[M(0xf2f2ee), merge([b(0.45, 0.2, 0.4, 0, 0.74)])], [MAT.black, merge([b(0.35, 0.03, 0.3, 0, 0.94)])]],
  // 職員室の机（写真）：木の天板、白い引き出しと脚。座る人は +x 側。deskPanel は向かい側のふちの白い仕切り
  staffDesk: [[M(0xd9c4a2, { roughness: 0.6 }), merge([b(0.7, 0.03, 1.04, 0, 0.72)])], [M(0xeeeeea), merge([b(0.6, 0.7, 0.4, 0, 0, 0.3), b(0.6, 0.7, 0.04, 0, 0, -0.5), b(0.04, 0.5, 1.0, -0.33, 0.2)])]],
  lowCab: [[M(0xe6e6e0), merge([b(0.45, 0.9, 0.9)])], [M(0x9aa0a6), merge([b(0.46, 0.02, 0.88, 0, 0.45)])]],
  hallWindow: [[MAT.transom, merge([b(1.7, 0.42, 0.24, 0, 1.92), b(1.7, 0.32, 0.24, 0, 0.12)])], [MAT.doorFrame, merge([b(1.78, 0.04, 0.26, 0, 2.34), b(1.78, 0.04, 0.26, 0, 1.88), b(0.04, 0.46, 0.26, 0, 1.88)])]],
  // 壁より厚くして、教室の中からも廊下からも見えるようにする
  // 4枚の大きな両引き戸（体育館の入口）。ガラスの入ったアルミの戸
  door4: [[MAT.gray, merge([b(0.95, 2.2, 0.3, -1.42, 0, -0.03), b(0.95, 2.2, 0.3, -0.47, 0, 0.03), b(0.95, 2.2, 0.3, 0.47, 0, 0.03), b(0.95, 2.2, 0.3, 1.42, 0, -0.03)])], [MAT.transom, merge([-1.42, -0.47, 0.47, 1.42].map((x) => b(0.7, 1.4, 0.34, x, 0.6)))], [MAT.metal, merge([b(4.0, 0.1, 0.36, 0, 2.2), b(0.1, 2.3, 0.36, -1.95), b(0.1, 2.3, 0.36, 1.95)])]],
  // 内側に開く押し扉（1枚。取っ手と細い窓つき）。床に、開くときに通る弧をうすく描く（部屋の内側 +z）
  swing: [
    [MAT.door, merge([b(0.92, 2.0, 0.3, 0, 0)])],
    [MAT.doorFrame, merge([b(1.02, 0.07, 0.34, 0, 2.0), b(0.06, 2.07, 0.34, -0.49), b(0.06, 2.07, 0.34, 0.49), b(0.1, 0.03, 0.4, 0.33, 0.98)])],
    [MAT.transom, merge([b(0.14, 0.7, 0.32, 0.18, 1.1)])],
    [new THREE.MeshBasicMaterial({ color: 0x9a948a, transparent: true, opacity: 0.55 }), merge([
      new THREE.RingGeometry(0.88, 0.92, 16, 1, -Math.PI / 2, Math.PI / 2).rotateX(-Math.PI / 2).translate(-0.46, 0.02, 0.2).toNonIndexed(),
      new THREE.BoxGeometry(0.03, 0.01, 0.9).translate(-0.46, 0.02, 0.65).toNonIndexed(),
    ].map((g) => g.index ? g.toNonIndexed() : g))],
  ],
  // 2枚の引き戸（少し前後にずらして重ねる）
  door: [[MAT.door, merge([b(0.9, 1.95, 0.3, -0.45, 0, -0.02), b(0.9, 1.95, 0.3, 0.45, 0, 0.02)])], [MAT.doorFrame, merge([b(1.96, 0.07, 0.34, 0, 1.95), b(0.07, 2.02, 0.34, -0.95), b(0.07, 2.02, 0.34, 0.95), b(0.03, 1.95, 0.35, 0)])], [MAT.transom, merge([b(1.8, 0.35, 0.26, 0, 2.03)])]],
  curtainPanel: [[MAT.curtain, merge([b(0.7, 2.05, 0.05, 0, 0.3)])]],
  cleanLocker: [[MAT.gray, merge([b(0.45, 1.8, 0.6)])]],
  bag: [[MAT.bag, merge([b(0.1, 0.3, 0.34, 0, 0.32)])]],
  books: [[MAT.paper, merge([b(0.21, 0.035, 0.3, 0, 0.71)])]],
  laptop: [[MAT.black, merge([b(0.25, 0.02, 0.34, 0, 0.76), b(0.02, 0.22, 0.34, -0.12, 0.77)])]],
  urinal: [[MAT.white, merge([b(0.32, 0.65, 0.38, 0, 0.4)])]],
  mirror: [[MAT.mirror, merge([b(0.02, 0.8, 1.6, 0, 1.15)])]],
  stageCurtain: [[MAT.curtainDark, merge([b(0.3, 4.2, 1.0)])]],
  // 体育館の壁ぞいにたらした緑のネット、壁につけたバスケットのゴール
  gymNet: [[MAT.greenNet, merge([b(0.05, 6.0, 1.0, 0, 0.3)])]],
  lectern: [[MAT.darkWood, merge([b(0.5, 1.1, 0.7)])]],
  // ステージまわり（len で横の長さをのばす。rot: π/2 で東西向き）
  stageHeader: [[MAT.stageWood, merge([b(0.5, 0.35, 1.0, 0, 5.2)])], [MAT.curtainDark, merge([b(0.12, 0.6, 1.0, 0.2, 4.6)])]], // 舞台の上の木の額ぶちと、えんじ色の横幕（写真）
  stageBackdrop: [[M(0x8e9294, { roughness: 1 }), merge([b(0.12, 3.6, 1.0)])]],   // 奥の灰色の幕（写真）
  stageValance: [[MAT.curtainDark, merge([b(0.15, 1.3, 1.0, 0, 3.0)])]],     // 上の横幕（えんじ色で背が高い。写真）
  stageEmblem: [[M(0xc9a23a, { roughness: 0.4, metalness: 0.6 }), merge([b(0.05, 0.45, 0.45, -0.1, 3.4)])]], // 横幕の校章（金色）
  stageScreen: [[M(0xf6f6f2, { emissive: 0x333333 }), merge([b(0.03, 1.9, 2.6, 0, 0.9)])], [MAT.black, merge([b(0.05, 0.06, 2.7, 0, 2.8)])]], // つるしたスクリーン
  stagePodium: [[M(0xf0f0ec), merge([b(0.45, 0.95, 0.6)])]], // 白い小さな演台
  stageSteps: [[MAT.darkWood, merge([b(0.9, 0.33, 1.2, 0, 0), b(0.6, 0.33, 1.2, -0.15, 0.33), b(0.3, 0.33, 1.2, -0.3, 0.66)])]],
  stagePillar: [[MAT.stageWood, merge([b(0.4, 5.55, 0.35)])]], // 木の額ぶちの柱
  flowerStand: [[MAT.darkWood, merge([b(0.4, 0.8, 0.4)])], [MAT.green, merge([b(0.7, 0.5, 0.7, 0, 0.8)])], [MAT.pink, merge([b(0.5, 0.25, 0.5, 0, 1.3)])]],
  // 自動販売機（正面が -x）
  vending: [[MAT.white, merge([b(0.75, 1.83, 1.0)])], [MAT.vendFace, merge([b(0.03, 1.2, 0.85, -0.38, 0.5)])], [MAT.red, merge([b(0.04, 0.25, 1.0, -0.37, 1.6)])]],
  // 長机（長さは1mの形を len 倍にのばす）と、跳ね上げ椅子（座面が上がった形）
  // 視聴覚教室の段（1段 0.2m の高さ×奥行き1m。len で横にのばす）と、壁に埋めこんだ大きなスクリーン
  tier: [[MAT.wood, merge([b(1.0, 0.2, 1.0)])]],
  step: [[MAT.stepFloor, merge([b(1.0, 0.2, 1.0)])]],
  // コモンスペースの階段の南の、段にそって斜めの手すり壁（長さ2.1m、高さ1.05m上がる）
  stairRail: [[MAT.white, (() => { const g = b(2.1, 1.0, 0.12, 0, 0.1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 1.05 * (1.05 - p.getX(i)) / 2.1); g.computeVertexNormals(); return g; })()]],
  bigScreen: [[MAT.screen, merge([b(0.03, 2.2, 4.4, 0, 0.75)])], [MAT.black, merge([b(0.05, 2.4, 4.6, -0.02, 0.65)])]],
  longDesk: [[MAT.wood, merge([b(0.45, 0.04, 1, 0, 0.7)])], [MAT.metal, merge([b(0.04, 0.7, 0.04, 0.18, 0, -0.48), b(0.04, 0.7, 0.04, 0.18, 0, 0.48), b(0.03, 0.3, 1, 0.2, 0.35)])]],
  flipSeat: [[MAT.navy, merge([b(0.08, 0.45, 0.44, 0.2, 0.45), b(0.05, 0.42, 0.42, 0.05, 0.35)])], [MAT.metal, merge([b(0.05, 0.42, 0.05, 0.15, 0, -0.22), b(0.05, 0.42, 0.05, 0.15, 0, 0.22)])]],
};

// ---------- 置き方 ----------
// out には {t: 種類, x, z, rot, y?, sx?, sz?} を入れる。rot=0 は「正面が -x（左）」
function grid(out, t, x0, x1, z0, z1, nx, nz, rot = 0, y = 0) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    out.push({ t, x: x0 + (x1 - x0) * (nx === 1 ? 0.5 : i / (nx - 1)), z: z0 + (z1 - z0) * (nz === 1 ? 0.5 : j / (nz - 1)), rot, y });
  }
}
const along = (out, t, x, z0, z1, step, rot = 0) => {
  const n = Math.max(1, Math.floor((z1 - z0) / step));
  for (let i = 0; i < n; i++) out.push({ t, x, z: z0 + step * (i + 0.5) + ((z1 - z0) - n * step) / 2, rot });
};
const alongX = (out, t, z, x0, x1, step, rot = Math.PI / 2) => {
  const n = Math.max(1, Math.floor((x1 - x0) / step));
  for (let i = 0; i < n; i++) out.push({ t, x: x0 + step * (i + 0.5) + ((x1 - x0) - n * step) / 2, z, rot });
};

// 普通教室：前（-x側）に黒板と教卓、後ろにロッカー、机は 6列 × 7行
// 普通教室は40人（6列×7行から、いちばん後ろの両はしの2席を除く）
// cols：横の列の数、rows：縦の列の数、back：後ろに空けるスペース（部屋の奥行きに対する割合）
function classroom(out, R, { cols = 6, rows = 7, seats = 40, eboard = true, back = 0, doorT = "door", gap = 0.95, empty = false, deskX0 = 2.2, backDoor = true } = {}) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  // 教壇は窓側の壁からドア側の壁まで、部屋の幅いっぱい
  out.push({ t: "podium", x: x0 + 0.65, z: (z0 + z1) / 2, rot: 0, len: (z1 - z0 + 0.3) / 4.4 });
  out.push({ t: "teacherDesk", x: x0 + 1.35, z: (z0 + z1) / 2, rot: 0, y: 0.18 });
  // 後ろのロッカー、廊下側（北）の角に掃除用具入れ
  along(out, "locker", x1 - 0.35, z0 + 0.9, z1 - 0.3, 0.95, Math.PI);
  out.push({ t: "cleanLocker", x: x1 - 0.35, z: z0 + 0.45, rot: 0 });
  // 黒板の上の時計、左前（窓側の前）の大型の電子黒板、後ろの掲示板、教卓のパソコン
  out.push({ t: "clock", x: x0 + 0.08, z: (z0 + z1) / 2, rot: 0 });
  // 電子黒板は教壇（段）の窓側のはしの外に置く
  if (eboard) out.push({ t: "eboard", x: x0 + 0.5, z: Math.max((z0 + z1) / 2 + 2.2 + 0.9, z1 - 0.9), rot: 0, y: 0.18 }); // 教壇の上
  out.push({ t: "bulletin", x: x1 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "laptop", x: x0 + 1.35, z: (z0 + z1) / 2 + 0.2, rot: 0, y: 0.18 });
  // 廊下側（北）の前と後ろの引き戸
  // 前のドアは少し前寄り（教壇に少しかかる）
  out.push({ t: doorT, x: x0 + 1.6, z: z0 - 0.2, rot: 0 }); // 壁のまんなか。教壇に少しかかる
  if (backDoor) out.push({ t: doorT, x: x1 - 1.2, z: z0 - 0.2, rot: 0 });
  // 2つのドアのあいだの、廊下側の窓
  for (let x = x0 + 3.5; x < x1 - 2.9; x += 1.85) out.push({ t: "hallWindow", x, z: z0 - 0.2, rot: 0 });
  // 窓側（南）のカーテン（柱のところにまとめてある）
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 2.25) out.push({ t: "curtainPanel", x, z: z1 + 0.1, rot: 0 });
  const dx0 = x0 + deskX0, dx1 = x1 - 1.3 - (x1 - x0) * back;
  const dz0 = z0 + 0.7, dz1 = z1 - 0.7;
  const rr = rows, cc = cols;
  const skip = rr * cc - seats; // いちばん後ろの列の両はしから空ける
  for (let i = 0; i < rr; i++) for (let j = 0; j < cc; j++) {
    if (i === rr - 1 && skip > 0 && (j < Math.ceil(skip / 2) || j >= cc - Math.floor(skip / 2))) continue;
    const x = dx0 + Math.min(gap, (dx1 - dx0) / Math.max(1, rr - 1)) * i;
    const z = dz0 + (dz1 - dz0) * (j / (cc - 1));
    // 椅子は少しずつずらして、使っている感じを出す
    const k = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, rnd = k - Math.floor(k);
    out.push({ t: "desk", x, z, rot: 0 });
    out.push({ t: "chair", x: x + 0.42 + rnd * 0.12, z: z + (rnd - 0.5) * 0.08, rot: (rnd - 0.5) * 0.3 });
    if (!empty && rnd < 0.55) out.push({ t: "bag", x: x + 0.05, z: z + 0.33, rot: 0, col: BAG_COLORS[Math.floor(rnd * 97) % BAG_COLORS.length] });
    if (!empty && rnd > 0.35) out.push({ t: "books", x: x - 0.02, z: z + (rnd - 0.5) * 0.15, rot: (rnd - 0.5) * 0.4 });
  }
}
const BAG_COLORS = [0x1f2a44, 0x2b2b2b, 0x3a5a8c, 0x6b2e2e, 0x2f4f3f, 0x444c56];

// lengthwise：台を縦長（前後にのびる向き）に置き、長い辺の両側に椅子を2つずつ（調理室・被服室）
function lab(out, R, bench = "labBench", lengthwise = false) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.1, z: (z0 + z1) / 2, rot: 0 });
  const nx = Math.max(1, Math.floor((x1 - x0 - 2.5) / (lengthwise ? 3.2 : 2.4)));
  const nz = Math.max(1, Math.floor((z1 - z0 - 1.0) / (lengthwise ? 3.0 : 2.9)));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + 2.8 + (i + 0.5) * ((x1 - x0 - 3.2) / nx);
    const z = z0 + 0.5 + (j + 0.5) * ((z1 - z0 - 1.0) / nz);
    if (lengthwise) {
      out.push({ t: bench, x, z, rot: Math.PI / 2 });
      for (const s of [-1, 1]) for (const k of [-0.55, 0.55]) out.push({ t: "stool", x: x + k, z: z + s * 0.95, rot: 0 });
    } else {
      out.push({ t: bench, x, z, rot: 0 });
      for (const s of [-1, 1]) for (const k of [-0.6, 0.6]) out.push({ t: "stool", x: x + s * 0.9, z: z + k, rot: 0 });
    }
  }
}

function office(out, R, perIsland = 6) {
  const { x0, x1, z0, z1 } = R;
  // 机を向かい合わせにした「島」をならべる
  const islandsX = Math.max(1, Math.floor((x1 - x0 - 1) / 3.4));
  const islandsZ = Math.max(1, Math.floor((z1 - z0 - 1) / 3.6));
  const half = perIsland / 2;
  for (let i = 0; i < islandsX; i++) for (let j = 0; j < islandsZ; j++) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / islandsX);
    const cz = z0 + (j + 0.5) * ((z1 - z0) / islandsZ);
    for (let k = 0; k < half; k++) {
      const x = cx - (half - 1) * 0.55 + k * 1.1;
      for (const s of [-1, 1]) {
        out.push({ t: "officeDesk", x, z: cz + s * 0.36, rot: Math.PI / 2 });
        out.push({ t: "monitor", x, z: cz + s * 0.2, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
        out.push({ t: "officeChair", x, z: cz + s * 1.15, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    }
  }
}

// 事務室：北東に6人がけの島が1つ（南北に長い）。島の南のはし（お誕生日席）に、北を向いた事務長席
function jimu(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cx = x1 - 1.9, cz = z0 + 2.2;
  for (let k = 0; k < 3; k++) {
    const z = cz - 1.1 + k * 1.1;
    for (const s of [-1, 1]) {
      out.push({ t: "officeDesk", x: cx + s * 0.36, z, rot: s > 0 ? Math.PI : 0 });
      out.push({ t: "monitor", x: cx + s * 0.2, z, rot: s > 0 ? 0 : Math.PI });
      out.push({ t: "officeChair", x: cx + s * 1.15, z, rot: s > 0 ? 0 : Math.PI });
    }
  }
  const zc = cz + 1.1 + 0.95, R90 = Math.PI * 1.5;
  out.push({ t: "officeDesk", x: cx, z: zc, rot: R90 }, { t: "monitor", x: cx, z: zc - 0.15, rot: Math.PI / 2 });
  out.push({ t: "officeChair", x: cx, z: zc + 0.8, rot: R90 });
}

// 職員室：西側は、北から「通路・ロッカー・机・椅子・通路・椅子・机・机・椅子・通路」の列が東西にのびる（4つずつ3まとまり）
// 東側は「椅子・机・机・椅子」が南北にならぶ列が2本（東の列は北のL字の部分から続く）。西の列の南のはしは、東西にならぶ机4つ
const PAIR_W = 2.9; // 「椅子・机・机・椅子」1列の幅
function pairColumn(out, cx, za, zb, step = 1.1) {
  for (let z = za; z <= zb + 0.01; z += step) {
    out.push({ t: "officeDesk", x: cx - 0.35, z, rot: 0 }, { t: "laptop", x: cx - 0.35, z, rot: Math.PI, y: 0 });
    out.push({ t: "officeDesk", x: cx + 0.35, z, rot: Math.PI }, { t: "laptop", x: cx + 0.35, z, rot: 0, y: 0 });
    out.push({ t: "officeChair", x: cx - 1.05, z, rot: Math.PI }, { t: "officeChair", x: cx + 1.05, z, rot: 0 });
  }
}
// 職員室（配置図と写真）：配置図の寸法（東西24m × 南北7.4m）を、模型の部屋の大きさに合わせて置く。
// 西から1年・2年の机のまとまり（北の壁ぎわに北を向く1列と、くっついた背中合わせの2列の島）、東に業務アシスタントの机と、
// 南北にのびる3年の机の列（北のL字の部分まで続く）。机は白い脚と木の天板で、仕切りはない。いすは机の下に入れてある。戸棚は机より高い
function staffRoom(out, R) {
  const { x0, x1, z0, z1 } = R, sx = (x1 - x0) / 24, sz = (z1 - z0) / 7.4;
  const P = (xm, zm) => [x0 + xm * sx, z0 + zm * sz];
  const N = -Math.PI / 2, S = Math.PI / 2, W = 0, E = Math.PI; // 座った人が向く方向
  const unit = (xm, zm, face, panel = false) => {
    const [x, z] = P(xm, zm);
    out.push({ t: "staffDesk", x, z, rot: face });
    out.push({ t: "officeChair", x: x + Math.cos(face) * 0.3, z: z - Math.sin(face) * 0.3, rot: face }); // いすは机の下に入れてある
  };
  const row = (xs, zm, face) => xs.forEach((xm) => unit(xm, zm, face));
  // 背中合わせの2列は、机どうしがくっついている（まんなかの線 zm から、机の奥行き0.7mの半分ずつ）
  const D = 0.35 / sz, pairRows = (xs, zm) => { row(xs, zm - D, S); row(xs, zm + D, N); };
  // 1年（西）
  row([3.98, 4.99, 6.0, 7.02, 8.47], 2.53, N);
  pairRows([3.98, 4.99, 6.0, 7.02, 8.47, 9.46], 5.0);
  // 2年（まんなか）
  row([9.58, 10.52, 11.5, 13.36, 14.4, 15.39, 16.4], 2.53, N);
  pairRows([10.59, 11.58, 13.1, 14.1, 15.08], 5.0);
  // 業務アシスタント（2つ）と、3年（東。北のL字の部分まで南北に続く）
  for (const zm of [3.0, 4.1]) unit(18.28, zm, E);
  for (const zm of [1.94, 2.88, 3.83]) unit(18.9, zm, W);
  const Dx = 0.35 / sx;
  for (const zm of [-0.71, 0.24, 1.18, 2.72, 3.66, 4.66, 5.63]) { unit(21.62 - Dx, zm, E); unit(21.62 + Dx, zm, W); }
  // 打ち合わせのテーブル（業務アシスタントの南）といす
  for (const xm of [16.95, 18.85]) { const [x, z] = P(xm, 5.48); out.push({ t: "table", x, z, rot: Math.PI / 2 }); }
  for (const xm of [18.0, 19.2]) { const [x, z] = P(xm, 6.1); out.push({ t: "officeChair", x, z, rot: N }); } // いす
  // 北の壁ぎわの白い戸棚（引き違い戸）と、1年・2年の北の列のうしろの低い棚
  for (const [a, b] of [[2.3, 4.4], [5.7, 7.8], [9.9, 11.9]]) for (let xm = a + 0.45; xm < b; xm += 0.95) { const [x, z] = P(xm, 0.25); out.push({ t: "lowCab", x, z, rot: S, sy: 1.35 }); }
  for (const [a, b] of [[3.4, 9.0], [9.1, 11.9], [12.8, 16.9]]) for (let xm = a + 0.45; xm < b; xm += 0.95) { const [x, z] = P(xm, 1.95); out.push({ t: "lowCab", x, z, rot: S, sy: 1.35 }); }
  // 南の窓の下の低い戸棚（柱のところはあける）と、西のはしの流し台
  for (let xm = 4.5; xm < 23.4; xm += 0.95) { if ([[9.1, 10.0], [13.9, 14.8], [18.6, 19.5]].some(([a, b]) => xm > a && xm < b)) continue; const [x, z] = P(xm, 7.15); out.push({ t: "lowCab", x, z, rot: N }); }
  { const [x, z] = P(2.6, 7.05); out.push({ t: "kitchen", x, z, rot: Math.PI / 2 }); }
  // 東の壁ぎわの戸棚
  for (let zm = 2.1; zm < 6.2; zm += 0.92) { const [x, z] = P(23.75, zm); out.push({ t: "cabinet", x, z, rot: E }); }
}
// 職員室の東のはしで北へ折れるL字の部分：3年の机の列は職員室のほうで置く。北の壁ぎわに戸棚
function staffRoomL(out, R) {
  // 図面：共用スペースは東西 14.3m〜24m（職員室の西のはしから）。北の壁ぎわの戸棚は 16.9m〜23.0m（両はしは更衣室の入口）
  const { x0, x1, z0 } = R, sx = (x1 - x0) / (24 - 14.3), X = (m) => x0 + (m - 14.3) * sx;
  for (let x = X(16.9) + 0.45; x < X(23.0); x += 0.95) out.push({ t: "lowCab", x, z: z0 + 0.25, rot: Math.PI / 2, sy: 1.35 });
}

// STUDY HALL（写真）：仕切り板とデスクライトのついた自習机。西の窓ぎわと北のガラスぎわに壁を向いた机。
// まんなかには背中合わせの机のかたまりが東西にのびる（机は南北を向く）。かたまりの東のはしに、机にくっついて廊下を向いた木の本棚。
// 赤本の白い本棚は西の窓ぎわのまんなか。南の壁ぎわは作りつけの長いベンチで、その前に長い大きな机が2つ
function studyHall(out, R) {
  const { x0, x1, z0, z1 } = R, d = z1 - z0, zm = z0 + d * 0.5;
  // 1つの机：rot は向いている方向（0=西、-π/2=北、π/2=南、π=東）。いすは反対側
  const unit = (x, z, rot) => {
    out.push({ t: "carrel", x, z, rot }, { t: "deskLamp", x, z, rot });
    out.push({ t: "chair", x: x + Math.cos(rot) * 0.55, z: z - Math.sin(rot) * 0.55, rot });
  };
  // 西の窓ぎわ（まんなかは赤本の棚）
  for (let z = z0 + 1.3; z < z1 - 3.4; z += 0.95) if (Math.abs(z - zm) > 1.0) unit(x0 + 0.35, z, 0);
  for (const k of [-0.48, 0.48]) out.push({ t: "akahon", x: x0 + 0.3, z: zm + k, rot: 0 });
  for (let x = x0 + 1.5; x < x1 - 0.7; x += 0.95) unit(x, z0 + 0.35, -Math.PI / 2); // 北のガラスぎわ
  // まんなかの背中合わせのかたまり（東西にのびる、2列）
  for (const f of [0.34, 0.56]) {
    const zc = z0 + d * f;
    let xe = x0;
    for (let x = x0 + 2.0; x < x1 - 1.6; x += 0.95) { unit(x, zc - 0.31, Math.PI / 2); unit(x, zc + 0.31, -Math.PI / 2); xe = x; }
    // 木の本棚：かたまりの東のはしの机にくっつけて、廊下（東）のほうを向く。幅はかたまりの幅いっぱい
    out.push({ t: "woodCase", x: xe + 0.45 + 0.2, z: zc, rot: 0, sz: 1.22 });
  }
  // 南：壁ぎわの長いベンチと、その前の長い大きな机2つ
  alongX(out, "wallBench", z1 - 0.3, x0 + 0.6, x1 - 0.6, 1.6, Math.PI / 2);
  const wt = (x1 - x0 - 1.6) / 2;
  for (const k of [0, 1]) {
    const x = x0 + 0.8 + wt * (k + 0.5);
    out.push({ t: "bigTable", x, z: z1 - 1.25, rot: Math.PI / 2, sz: Math.max(1, (wt - 0.4) / 2.4) });
    alongX(out, "chair", z1 - 2.0, x - wt / 2 + 0.4, x + wt / 2 - 0.4, 0.75, Math.PI / 2);
  }
}

// 会議室：長い机が2列（部屋の長い方向にのびる）。机の両側に椅子
function meeting(out, R) {
  const { x0, x1, z0, z1 } = R;
  const long = x1 - x0 >= z1 - z0;
  const L0 = long ? x0 : z0, L1 = long ? x1 : z1, S0 = long ? z0 : x0, S1 = long ? z1 : x1;
  const n = Math.max(1, Math.floor((L1 - L0 - 1.6) / 1.85));
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 }); // 西の壁に黒板
  for (const f of [0.3, 0.7]) {
    const s = S0 + (S1 - S0) * f;
    for (let i = 0; i < n; i++) {
      const l = (L0 + L1) / 2 - ((n - 1) * 1.85) / 2 + i * 1.85;
      const [x, z] = long ? [l, s] : [s, l];
      out.push({ t: "table", x, z, rot: long ? Math.PI / 2 : 0 });
      for (const side of [-1, 1]) for (const k of [-0.45, 0.45]) {
        const [cx, cz] = long ? [x + k, z + side * 0.85] : [x + side * 0.85, z + k];
        out.push({ t: "officeChair", x: cx, z: cz, rot: long ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0) });
      }
    }
  }
}

// 図書室（写真）：西は大きな窓（窓ぎわにカウンター席）、北の壁は天井近くまでの木の本棚（まんなかにステンドグラスの窓）、
// 東半分に黒い背の高い本棚が南北にならぶ。西半分に木の大きな閲覧テーブル。まんなかの柱のまわりに展示、南（廊下側）に雑誌・マンガ
// rot：0 は正面が西（-x）、π/2 は南（+z）、-π/2 は北（-z）、π は東（+x）
function library(out, R) {
  const { x0, x1, z0, z1 } = R;
  const xm = x0 + (x1 - x0) * 0.45, zs = z1 - 3.4; // zs：南（廊下側）の、新着本などの展示のところ
  const xw = x0 + (x1 - x0) * 0.5;
  // 北の壁：木の本棚（000 総記から順に）。まんなかの窓はステンドグラス（色紙）で、下に低い本棚
  alongX(out, "wallShelf", z0 + 0.2, x0 + 0.3, xw - 1.0, 0.92, Math.PI / 2);
  alongX(out, "wallShelf", z0 + 0.2, xw + 1.0, x1 - 0.5, 0.92, Math.PI / 2);
  out.push({ t: "stainedGlass", x: xw, z: z0 + 0.06, rot: Math.PI / 2 });
  alongX(out, "lowBookcase", z0 + 0.2, xw - 0.95, xw + 0.95, 0.92, Math.PI / 2);
  // 東の壁：北半分は木の本棚、南は窓（窓ぎわに文房具の机とパソコンの机）
  along(out, "wallShelf", x1 - 0.2, z0 + 0.6, zs - 0.6, 0.92, 0);
  // 東半分：背の高い黒い両面の本棚が南北にならぶ。北のはしに赤いキューブのいす
  const rows = [];
  for (let x = xm + 1.6; x < x1 - 1.3; x += 1.75) { rows.push(x); along(out, "tallShelf", x, z0 + 1.6, zs - 0.6, 0.88, 0); out.push({ t: "cubeStool", x, z: z0 + 1.32, rot: 0 }); }
  // 本棚の南のはしの、黄色い布の小さな展示テーブル
  for (const x of rows.slice(1, 3)) out.push({ t: "yellowTable", x: x + 0.87, z: zs - 0.2, rot: 0 });
  // 西の窓ぎわ：白いカウンターに緑の高いいす（2つずつ）
  for (let z = z0 + 1.4; z < z1 - 1.0; z += 2.0) {
    out.push({ t: "highCounter", x: x0 + 0.35, z, rot: 0 });
    for (const k of [-0.38, 0.38]) out.push({ t: "barStool", x: x0 + 0.85, z: z + k, rot: 0 });
  }
  // 窓の近く：白い脚の木のテーブルと、緑の座面の木のいす
  for (const z of [z0 + 2.0, z0 + 4.6]) {
    out.push({ t: "woodTable", x: x0 + 2.4, z, rot: 0 });
    for (const s of [-1, 1]) for (const k of [-0.3, 0.3]) out.push({ t: "woodChair", x: x0 + 2.4 + s * 0.62, z: z + k, rot: s > 0 ? 0 : Math.PI });
  }
  // 西半分：木の大きな閲覧テーブル（東西に長い）と、白っぽい積み重ねいす
  for (const tx of [x0 + 5.0, x0 + 7.9]) for (const tz of [z0 + 2.0, z0 + 4.6, z0 + 7.2]) {
    out.push({ t: "bigTable", x: tx, z: tz, rot: Math.PI / 2 });
    for (const s of [-1, 1]) for (const k of [-0.75, 0, 0.75]) out.push({ t: "stackChair", x: tx + k, z: tz + s * 0.85, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  // 南西：木の低い本棚の前に赤いキューブのいす3つ。廊下側の壁に雑誌の黒い棚とマンガの白い棚
  out.push({ t: "lowBookcase", x: x0 + 2.4, z: z0 + 7.1, rot: Math.PI / 2 });
  for (const k of [-0.44, 0, 0.44]) out.push({ t: "cubeStool", x: x0 + 2.4 + k, z: z0 + 7.85, rot: 0 });
  out.push({ t: "mangaRack", x: x0 + 1.2, z: z1 - 0.3, rot: -Math.PI / 2 });
  out.push({ t: "magRack", x: x0 + 3.4, z: z1 - 0.3, rot: -Math.PI / 2 });
  // マンガのタグの緑の掲示板（キャスターつき）
  out.push({ t: "mangaBoard", x: xm - 1.6, z: z1 - 0.5, rot: -Math.PI / 2 });
  // まんなかの四角い柱（下が緑）：西の面に白い網のパネル、前にピンクのチェックの布のテーブル（図書委員のおすすめ）
  out.push({ t: "libColumn", x: xm + 0.4, z: zs + 0.4, rot: 0 });
  out.push({ t: "wirePanel", x: xm - 0.07, z: zs + 0.4, rot: 0 });
  out.push({ t: "pinkTable", x: xm - 0.5, z: zs + 0.4, rot: 0 });
  // 南：新着本・話題の本のテーブル（ベージュのチェック）と黄色いブックトラック、回る丸い本棚、赤いキューブのいす
  out.push({ t: "displayTable", x: xm + 2.2, z: zs + 1.6, rot: Math.PI / 2 });
  for (const k of [0, 1]) out.push({ t: "yellowCart", x: xm + 0.6 + k * 0.75, z: zs + 1.6, rot: Math.PI / 2 });
  out.push({ t: "roundShelf", x: xm + 4.4, z: zs + 1.2, rot: 0 });
  for (const [dx, dz] of [[5.3, 1.8], [5.8, 1.3], [5.8, 2.2]]) out.push({ t: "cubeStool", x: xm + dx, z: zs + dz, rot: 0 });
  // 東の窓ぎわ：パソコンの机と、文房具・おりがみの机
  for (const k of [0, 1]) {
    out.push({ t: "officeDesk", x: x1 - 0.5, z: zs + 0.9 + k * 1.3, rot: Math.PI });
    out.push({ t: "pc", x: x1 - 0.45, z: zs + 0.9 + k * 1.3, rot: Math.PI });
    out.push({ t: "officeChair", x: x1 - 1.3, z: zs + 0.9 + k * 1.3, rot: 0 });
  }
  out.push({ t: "officeDesk", x: x1 - 0.5, z: zs - 0.2, rot: Math.PI });
  // 南東（入口の近く）：ライトノベルのコーナーの白い棚
  alongX(out, "mangaRack", z1 - 0.25, xm + 3.0, x1 - 1.8, 0.95, -Math.PI / 2);
  // 廊下側の壁の、本を見せるガラスの飾り棚
  out.push({ t: "showcase", x: xm, z: z1 - 0.35, rot: Math.PI / 2 });
}

function music(out, R) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "piano", x: x0 + 1.6, z: z0 + 1.6, rot: 0 });
  const cx = x0 + 1.2, cz = (z0 + z1) / 2;
  // 扇形にならべた椅子
  for (let ring = 0; ring < 5; ring++) {
    const rad = 3.0 + ring * 1.0;
    const n = 7 + ring * 2;
    for (let k = 0; k < n; k++) {
      const a = -0.95 + (1.9 * k) / (n - 1);
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      if (x > x1 - 0.5 || z < z0 + 0.4 || z > z1 - 0.4) continue;
      out.push({ t: "chair", x, z, rot: -a });
    }
  }
}

// 視聴覚教室：前方の半分は広いスペース。後ろ半分に大学のような長机と跳ね上げ椅子が5列
// 視聴覚教室：前に教壇と、壁に埋めこんだ大きなスクリーン。前半分は平らで、うしろ半分は
// うしろほど高くなる段（5段）に、長机と折りたたみの椅子
function theater(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cz = (z0 + z1) / 2, W = z1 - z0;
  out.push({ t: "bigScreen", x: x0 + 0.04, z: cz, rot: 0 });
  out.push({ t: "podium", x: x0 + 0.65, z: cz, rot: 0, len: (W - 1.0) / 4.4 });
  out.push({ t: "lectern", x: x0 + 1.4, z: z0 + 1.6, rot: 0, y: 0.18 });
  // 壁ぎわに積んだパイプいす（写真：前の両はし）
  for (const [x, z, r] of [[x0 + 2.2, z0 + 0.45, 0], [x0 + 3.0, z0 + 0.45, 0], [x0 + 2.4, z1 - 0.45, Math.PI], [x0 + 1.6, z1 - 0.45, Math.PI]]) out.push({ t: "chairStack", x, z, rot: r });
  const xs = x0 + (x1 - x0) * 0.5, xe = x1 - 0.5, n = 5, step = (xe - xs) / n;
  for (let i = 0; i < n; i++) {
    const xa = xs + step * i, h = 0.2 * (i + 1);
    // 段（床から積み上げる）
    for (let k = 0; k <= i; k++) out.push({ t: "tier", x: xa + step / 2, z: cz, rot: 0, y: 0.2 * k - 0.15, sx: step, sz: W });
    const x = xa + step * 0.35;
    for (const [za, zb] of [[z0 + 0.5, cz - 0.6], [cz + 0.6, z1 - 0.5]]) {
      out.push({ t: "longDesk", x, z: (za + zb) / 2, rot: 0, len: zb - za, y: h });
      for (let z = za + 0.35; z < zb - 0.2; z += 0.6) out.push({ t: "flipSeat", x: x + 0.5, z, rot: 0, y: h });
    }
  }
}

// パソコン教室：横6列×縦7列。前に先生のパソコンと、その横の大きめの机
function computers(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cz = (z0 + z1) / 2;
  out.push({ t: "screenBoard", x: x0 + 0.12, z: cz, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.2, z: cz - 0.7, rot: 0 });
  out.push({ t: "pc", x: x0 + 1.05, z: cz - 0.7, rot: 0, y: 0.05 });
  out.push({ t: "officeChair", x: x0 + 1.9, z: cz - 0.7, rot: 0 });
  out.push({ t: "bigTable", x: x0 + 1.2, z: cz + 1.4, rot: 0 });
  const cols = 6, rows = 7;
  // うしろ4分の1くらいは空けておく
  const dx0 = x0 + 3.0, dx1 = x1 - 0.9 - (x1 - x0) * 0.25, dz0 = z0 + 0.6, dz1 = z1 - 0.6;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = dx0 + ((dx1 - dx0) * i) / (rows - 1), z = dz0 + ((dz1 - dz0) * j) / (cols - 1);
    out.push({ t: "desk", x, z, rot: 0 });
    out.push({ t: "pc", x: x - 0.1, z, rot: 0 });
    out.push({ t: "officeChair", x: x + 0.5, z, rot: 0 });
  }
}

// 美術教室・工芸教室：前に黒板。黒板に対して横長の大きい机に、2人ずつ向かい合って座る（4人）。その机が横2列×縦3列
function artroom(out, R, kiln = false) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.0, z: (z0 + z1) / 2, rot: 0 });
  const xa = x0 + 2.2, xb = x1 - (kiln ? 2.2 : 1.1), w = z1 - z0;
  for (let i = 0; i < 3; i++) {
    const x = xa + ((xb - xa) * (i + 0.5)) / 3;
    for (const f of [0.27, 0.73]) {
      const z = z0 + w * f;
      // 机は東西に長く置き、椅子は東西の向き（机の東と西の側）に2つずつ（部屋は南が前なので、ここでは z が東西）
      out.push({ t: "bigTable", x, z, rot: Math.PI / 2 });
      for (const sd of [-1, 1]) for (const k of [-0.6, 0.6]) out.push({ t: "stool", x: x + k, z: z + sd * 0.9, rot: 0 });
    }
  }
  along(out, "cabinet", x1 - 0.3, z0 + (kiln ? 2.8 : 0.5), z1 - 0.5, 0.95, Math.PI);
  if (kiln) { out.push({ t: "kiln", x: x1 - 0.8, z: z0 + 0.8, rot: 0 }); out.push({ t: "kiln", x: x1 - 0.8, z: z0 + 2.0, rot: 0 }); } // 窯は教室のすみ
}

// 美術教室（写真）：ふつうの机を4つくっつけた島が、横3列×縦3列。向かい合って座る。
// 黒板の側の壁ぞいに石こう像の棚、横の壁ぞいに作品の棚
// 美術教室（写真）：前は黒板とテレビ・先生の机。後ろの壁は緑の掲示板で、その前に石こう像をならべた棚と作品の乾燥棚。
// 廊下側の壁ぞいに木の棚（作品や道具）。机は茶色の木の机を4つ合わせた島で、3列×3つ
function artIslands(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cz = (z0 + z1) / 2;
  out.push({ t: "blackboard", x: x0 + 0.12, z: cz, rot: 0 });
  out.push({ t: "tvStand", x: x0 + 0.6, z: cz - 2.6, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.0, z: cz + 2.2, rot: 0 });
  // 後ろ：緑の掲示板と、石こう像の棚、乾燥棚
  out.push({ t: "greenBoard", x: x1 - 0.08, z: cz - 0.6, rot: Math.PI });
  for (const k of [-2.4, -1.2, 0]) out.push({ t: "bustShelf", x: x1 - 0.35, z: cz + k, rot: 0 }, { t: "bust", x: x1 - 0.35, z: cz + k - 0.25, rot: Math.PI, y: 1.2 }, { t: "bust", x: x1 - 0.35, z: cz + k + 0.25, rot: Math.PI, y: 1.2 });
  out.push({ t: "rack", x: x1 - 0.4, z: cz + 1.3, rot: 0 });
  const xa = x0 + 2.4, xb = x1 - 1.4, za = z0 + 1.2, zb = z1 - 0.9;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = xa + ((xb - xa) * (i + 0.5)) / 3, z = za + ((zb - za) * (j + 0.5)) / 3;
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      out.push({ t: "woodDesk", x: x + dx * 0.31, z: z + dz * 0.24, rot: Math.PI / 2 });
      out.push({ t: "woodChair", x: x + dx * 0.31, z: z + dz * 0.68, rot: dz > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  // 廊下側の壁ぞいの木の棚
  alongX(out, "cubby", z0 + 0.25, x0 + 2.2, x1 - 1.0, 0.95, -Math.PI / 2);
}

function prep(out, R) {
  const { x0, x1, z0, z1 } = R;
  if (x1 - x0 < 2.5 && z1 - z0 < 2.5) return;
  along(out, "cabinet", x1 - 0.3, z0 + 0.3, z1 - 0.3, 0.95, Math.PI);
  const n = Math.max(1, Math.min(4, Math.floor((z1 - z0 - 1) / 1.2)));
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.8 + i * 1.2;
    out.push({ t: "officeDesk", x: x0 + 0.7, z, rot: 0 });
    out.push({ t: "officeChair", x: x0 + 1.4, z, rot: 0 });
  }
}

function toilet(out, R) {
  const { x0, x1, z0, z1 } = R;
  if (z1 - z0 >= x1 - x0) {
    for (let z = z0 + 0.6; z < z1 - 1.2; z += 1.0) out.push({ t: "stall", x: x1 - 0.75, z, rot: Math.PI, y: 0.1 });
    out.push({ t: "sink", x: x0 + 0.35, z: (z0 + z1) / 2, rot: 0 });
    out.push({ t: "mirror", x: x0 + 0.02, z: (z0 + z1) / 2, rot: 0 });
  } else {
    for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.0) out.push({ t: "stall", x, z: z1 - 0.75, rot: -Math.PI / 2, y: 0.1 });
  }
}

// 小便器（男子トイレ。手洗いと反対側の壁に、ならべる）
function urinals(out, R) {
  const { x0, x1, z0, z1 } = R;
  if (z1 - z0 >= x1 - x0) for (let z = z1 - 0.6; z > z0 + 1.2 && z > z1 - 3.4; z -= 0.8) out.push({ t: "urinal", x: x0 + 0.25, z, rot: 0 });
}

// 体育館のステージ（赤い幕と演台）。正面は南（体育館の側）
function stage(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cx = (x0 + x1) / 2, W = x1 - x0, top = 0.85; // ステージの床の上
  const P = Math.PI / 2;
  // 奥の幕と上の横幕（ステージの幅いっぱい）
  out.push({ t: "stageBackdrop", x: cx, z: z0 + 0.15, rot: P, y: top, len: W });
  out.push({ t: "stageValance", x: cx, z: z1 - 0.3, rot: P, y: top, len: W - 2.4 });
  // 両そでの、開けてある幕
  for (let x = x0 + 0.5; x < x0 + 2.2; x += 0.9) out.push({ t: "stageCurtain", x, z: z1 - 0.3, rot: P, y: top });
  for (let x = x1 - 0.5; x > x1 - 2.2; x -= 0.9) out.push({ t: "stageCurtain", x, z: z1 - 0.3, rot: P, y: top });
  // 舞台の口の額ぶち（両はしの柱と上の梁）。体育館の床から立つ
  out.push({ t: "stagePillar", x: x0 - 0.3, z: z1 + 0.1, rot: 0, y: -0.15 }, { t: "stagePillar", x: x1 + 0.3, z: z1 + 0.1, rot: 0, y: -0.15 });
  out.push({ t: "stageHeader", x: cx, z: z1 + 0.1, rot: P, y: -0.15, len: W + 1.6 });
  // 横幕の校章、まんなかにつるしたスクリーン、右はしに白い小さな演台（写真）
  out.push({ t: "stageEmblem", x: cx, z: z1 - 0.3, rot: P, y: top });
  out.push({ t: "stageScreen", x: cx, z: z1 - 1.8, rot: P, y: top + 0.4 });
  out.push({ t: "stagePodium", x: x1 - 3.0, z: z1 - 1.0, rot: 0, y: top });
  // 体育館の床からステージへ上がる階段（左右のはし）
  out.push({ t: "stageSteps", x: x0 + 1.2, z: z1 + 0.65, rot: P, y: -0.15 }, { t: "stageSteps", x: x1 - 1.2, z: z1 + 0.65, rot: P, y: -0.15 });
}

// 保健室（写真）。窓は南（植え込みの中庭）。西の壁ぞいに、北から冷蔵庫・薬品棚・ロッカーと、流しのタイルカウンター。
// 北の壁に診察台とドア、その東にロッカー。東の壁ぞいにベッド2床（カーテン）・本棚・机（養護の先生）、まんなかに茶色の長机と折りたたみいす
function infirmary(out, R) {
  const { x0, x1, z0, z1 } = R, W = x1 - x0, D = z1 - z0;
  // 西の壁（x0）：ロッカー・薬品棚・冷蔵庫・流し（正面は東向き）
  out.push({ t: "grayLocker", x: x0 + 0.3, z: z0 + 0.4, rot: Math.PI });
  out.push({ t: "medCabinet", x: x0 + 0.25, z: z0 + 1.4, rot: Math.PI });
  out.push({ t: "fridge", x: x0 + 0.4, z: z0 + 2.3, rot: Math.PI });
  out.push({ t: "tileCounter", x: x0 + 0.4, z: z0 + 3.3, rot: Math.PI }, { t: "tileCounter", x: x0 + 0.4, z: z0 + 4.3, rot: Math.PI });
  // 北の壁（z0）：診察台とソファベッド、ドアの東にロッカー2本とついたて
  out.push({ t: "examBench", x: x0 + 3.2, z: z0 + 0.5, rot: Math.PI / 2 });
  out.push({ t: "blueSofa", x: x0 + 3.2, z: z0 + 2.0, rot: Math.PI / 2 });
  out.push({ t: "tallLocker", x: x1 - 1.6, z: z0 + 0.3, rot: Math.PI / 2 }, { t: "tallLocker", x: x1 - 1.1, z: z0 + 0.3, rot: Math.PI / 2 }, { t: "grayLocker", x: x1 - 0.5, z: z0 + 0.3, rot: Math.PI / 2 });
  out.push({ t: "screenPanel", x: x0 + 5.3, z: z0 + 0.9, rot: 0 });
  out.push({ t: "airPurifier", x: x1 - 0.4, z: z0 + 1.2, rot: Math.PI }, { t: "airPurifier", x: x0 + 0.4, z: z1 - 0.4, rot: 0 });
  // 東の壁（x1）：ベッド2床（頭を東の壁に。カーテン）
  for (let i = 0; i < 2; i++) {
    const z = z0 + 2.4 + i * 1.35;
    out.push({ t: "bed", x: x1 - 1.0, z, rot: Math.PI });
    out.push({ t: "curtain", x: x1 - 1.0, z: z + 0.67, rot: Math.PI / 2 });
  }
  // 南（窓側）：養護の先生の机（灰色の事務机、青いいす2つ、プリンター）、本棚・書類の棚、東のすみの引き出しの棚
  out.push({ t: "teacherDesk", x: x0 + 6.0, z: z1 - 1.1, rot: Math.PI / 2 }, { t: "teacherDesk", x: x0 + 6.0, z: z1 - 1.9, rot: Math.PI / 2 });
  out.push({ t: "officeChair", x: x0 + 6.0, z: z1 - 2.8, rot: Math.PI / 2 }, { t: "officeChair", x: x0 + 6.6, z: z1 - 2.6, rot: Math.PI / 2 });
  out.push({ t: "woodCase", x: x1 - 0.3, z: z1 - 1.0, rot: Math.PI }, { t: "locker", x: x1 - 0.3, z: z1 - 0.2, rot: Math.PI });
  out.push({ t: "fan", x: x0 + 1.6, z: z1 - 0.8, rot: 0 });
  // まんなか：茶色の長机2つをくっつけ、折りたたみいす
  out.push({ t: "bigTable", x: x0 + 3.0, z: z0 + 4.3, rot: Math.PI / 2 }, { t: "bigTable", x: x0 + 3.0, z: z0 + 5.5, rot: Math.PI / 2 });
  for (const [dx, dz] of [[-0.8, 3.8], [0.8, 3.8], [-0.8, 4.8], [0.8, 4.8]]) out.push({ t: "foldChair", x: x0 + 3.0 + dx, z: z0 + dz, rot: dx < 0 ? Math.PI : 0 });
}

function reception(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  out.push({ t: "lowTable", x: cx, z: cz, rot: Math.PI / 2 });
  out.push({ t: "sofa", x: cx, z: cz - 1.1, rot: Math.PI / 2 });
  out.push({ t: "sofa", x: cx, z: cz + 1.1, rot: -Math.PI / 2 });
}

function principal(out, R) {
  const { x0, x1, z0, z1 } = R;
  // 校長の机は南の窓の近く（西を向いて座る）。応接セットは北側
  const dz = z1 - 1.0;
  out.push({ t: "teacherDesk", x: x1 - 1.3, z: dz, rot: Math.PI }, { t: "monitor", x: x1 - 1.2, z: dz + 0.3, rot: 0, y: 0.03 });
  out.push({ t: "officeChair", x: x1 - 0.55, z: dz, rot: 0 });
  reception(out, { x0, x1, z0, z1: z1 - 1.8 });
}

function entrance(out, R) {
  const { x0, x1, z0, z1 } = R;
  // 下駄箱は3列（列のあいだを広くあける）
  const n = 3, step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + step * (i + 0.5);
    for (let z = z0 + 1.2; z < z1 - 1.0; z += 1.9) out.push({ t: "shoeRack", x, z, rot: 0 });
  }
  // スロープ（写真）：土間（下駄箱のところ）から校舎の床へ上がるところ。南の昇降口は西の窓ぎわのはし、北の昇降口は東の窓ぎわのはし
  const north = (z0 + z1) / 2 < 0, zr = north ? z0 + 0.5 : z1 - 0.5;
  out.push({ t: "ramp", x: north ? x1 - 1.0 : x0 + 1.0, z: zr, rot: 0 });
}

function pingpong(out, R) {
  const { x0, x1, z0, z1 } = R;
  const nx = Math.max(1, Math.floor((x1 - x0) / 3.8));
  const nz = Math.max(1, Math.floor((z1 - z0) / 4.5));
  grid(out, "pingpong", x0 + 2, x1 - 2, z0 + 2.3, z1 - 2.3, nx, nz, 0);
}

// ウエイトルーム（写真）：東西に細長い部屋。北に窓が並び、窓のあいだは赤い柱、窓の下は黒い壁。南の壁は黒（ところどころ赤と白い斜めの線）。
// 床は黒いゴムマット。窓ぎわにラックつきのベンチ・スミスマシン・プレート立て、南の壁ぞいにダンベルの棚とパイプいす。東のはしに施術台・エアロバイク・机
function weights(out, R) {
  const { x0, x1, z0, z1 } = R, L = x1 - x0, cz = (z0 + z1) / 2;
  // 壁：北の赤い柱と窓の下の黒い壁、南の黒い壁
  for (let x = x0 + 3; x < x1 - 1; x += 4.5) out.push({ t: "redPillar", x, z: z0 + 0.2, rot: 0 });
  out.push({ t: "blackLow", x: (x0 + x1) / 2, z: z0 + 0.03, rot: Math.PI / 2, len: L - 0.2 });
  out.push({ t: "blackWall", x: (x0 + x1) / 2, z: z1 - 0.03, rot: Math.PI / 2, len: L - 0.2 });
  out.push({ t: "redPanel", x: x0 + L * 0.62, z: z1 - 0.06, rot: Math.PI / 2, len: 2.2 });
  out.push({ t: "whiteLine", x: x0 + L * 0.5, z: z1 - 0.07, rot: Math.PI / 2, len: 6, y: 1.4 });
  // 窓ぎわ：ラックつきのベンチ（窓に向かって）、スミスマシン、プレート立て
  for (const k of [0.08, 0.16, 0.24, 0.34, 0.44]) out.push({ t: "rackBench", x: x0 + L * k, z: cz - 0.2, rot: -Math.PI / 2 });
  out.push({ t: "smithMachine", x: x0 + L * 0.56, z: z0 + 0.8, rot: 0 });
  out.push({ t: "plateTree", x: x0 + L * 0.66, z: z0 + 0.7, rot: 0 });
  // 南の壁ぞい：ダンベルの棚とパイプいす
  for (const k of [0.3, 0.5]) out.push({ t: "dumbbellRack", x: x0 + L * k, z: z1 - 0.35, rot: 0 });
  out.push({ t: "chair", x: x0 + L * 0.4, z: z1 - 0.4, rot: Math.PI });
  // 東のはし：エアロバイク、青い施術台、窓ぎわの机
  out.push({ t: "exBike", x: x1 - 5.2, z: cz, rot: 0 });
  out.push({ t: "treatTable", x: x1 - 2.6, z: z1 - 0.6, rot: 0 });
  for (const x of [x1 - 4.2, x1 - 3.5, x1 - 2.8]) out.push({ t: "desk", x, z: z0 + 0.45, rot: Math.PI });
}

function shop(out, R, reception = false) {
  const { x0, x1, z0, z1 } = R;
  if (reception) out.push({ t: "receptionWindow", x: (x0 + x1) / 2, z: z0 - 0.2, rot: 0 }); // 正面玄関側（北）の壁に受付の窓
  out.push({ t: "counter", x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: Math.PI / 2 });
}

function sewing(out, R) {
  lab(out, R, "bigTable", true);
  for (const o of out.filter((p) => p.t === "bigTable" && p.x >= R.x0 && p.x <= R.x1 && p.z >= R.z0 && p.z <= R.z1)) {
    for (const k of [-0.6, 0.6]) for (const s of [-1, 1]) out.push({ t: "sewing", x: o.x + k, z: o.z + s * 0.35, rot: s > 0 ? Math.PI : 0 });
  }
}

function gym(out, R) {
  const { x0, x1, z0, z1 } = R;
  // 東と西の壁ぞいに、まとめてたらした緑のネット（写真）
  for (const x of [x0 + 0.3, x1 - 0.3]) for (const k of [0.15, 0.5, 0.85]) out.push({ t: "gymNet", x, z: z0 + (z1 - z0) * k, rot: 0, len: 2.0 });
  // 横向きのコート2面：東と西の壁ぎわに、ゴールが2つずつ
  for (const k of [9 / 35, 26 / 35]) {
    const z = z0 + (z1 - z0) * k;
    out.push({ t: "hoop", x: x0 + 1.3, z, rot: 0 });
    out.push({ t: "hoop", x: x1 - 1.3, z, rot: Math.PI });
  }
}

// 部屋の名前 → 置き方
const LAYOUTS = [
  [/年\d+組/, classroom],
  // 選択第1教室：横6列×縦5列、後ろに少しスペース。社会科教室：横6列×縦7列、後ろ3分の1が空いている
  [/選択第１教室|選択第1教室/, (o, R) => classroom(o, R, { cols: 6, rows: 5, seats: 30, eboard: false, back: 0.12 })],
  // 社会科教室（写真）：机は横7列×縦6列で、間隔が広い。前の黒板の窓側に大きなテレビ。後ろは広くあいていて、
  // 後ろの壁にも黒板と地図、その前に地球儀と木の戸棚、廊下側の後ろのすみに金属の棚
  [/社会科教室/, (o, R) => {
    classroom(o, R, { cols: 7, rows: 6, seats: 42, eboard: false, back: 0.3, gap: 1.2, empty: true });
    const { x0, x1, z0, z1 } = R, zc = (z0 + z1) / 2;
    for (let i = o.length - 1; i >= 0; i--) if (o[i].t === "locker" || o[i].t === "bulletin") o.splice(i, 1);
    o.push({ t: "tvStand", x: x0 + 0.6, z: zc + 2.6, rot: 0 });
    o.push({ t: "blackboard", x: x1 - 0.12, z: zc, rot: Math.PI });
    for (const k of [-1, 0, 1]) o.push({ t: "globe", x: x1 - 0.7, z: zc + k * 0.9 - 0.4, rot: 0 });
    o.push({ t: "cabinet", x: x1 - 0.35, z: zc + 1.6, rot: Math.PI }, { t: "cabinet", x: x1 - 0.35, z: zc + 2.4, rot: Math.PI });
    o.push({ t: "rack", x: x1 - 1.6, z: z0 + 0.35, rot: Math.PI / 2 });
  }],
  // オーラル教室：もとは生徒会室と1つの大きな教室で、パーティションで分けている。うしろ（生徒会室の側）には扉がない
  [/オーラル/, (o, R) => classroom(o, R, { cols: 5, rows: 6, seats: 30, eboard: false, backDoor: false })],
  [/選択/, (o, R) => classroom(o, R, { cols: 5, rows: 6, seats: 30, eboard: false })],
  [/STUDY HALL/, studyHall],
  // 生物実験室（写真）：黒い天板の木の実験机（黒板と平行に長い）が2列×5列。机の前後に長いベンチ、机の上に顕微鏡。
  // 窓ぎわに流しのカウンター、前（黒板の前）に段ボールや道具、後ろのすみに顕微鏡保管庫
  [/生物実験室/, (o, R) => {
    const { x0, x1, z0, z1 } = R, zm = (z0 + z1) / 2;
    o.push({ t: "blackboard", x: x0 + 0.12, z: zm, rot: 0 }, { t: "teacherDesk", x: x0 + 0.9, z: zm, rot: 0 });
    for (const k of [-1.6, 1.6]) o.push({ t: "rack", x: x0 + 0.4, z: zm + k, rot: 0 });
    const n = Math.max(3, Math.floor((x1 - x0 - 2.6) / 1.45));
    for (let i = 0; i < n; i++) {
      const x = x0 + 2.4 + i * ((x1 - x0 - 3.2) / Math.max(1, n - 1)) * 0.92;
      for (const zc of [z0 + (z1 - z0) * 0.28, z0 + (z1 - z0) * 0.66]) {
        o.push({ t: "bioTable", x, z: zc, rot: 0 }, { t: "longBench", x: x + 0.62, z: zc, rot: 0 });
        for (const k of [-0.6, 0, 0.6]) o.push({ t: "microscope", x: x - 0.1, z: zc + k, rot: 0 });
      }
    }
    for (let x = x0 + 2.2; x < x1 - 1.4; x += 1.8) o.push({ t: "sinkCounter", x, z: z1 - 0.32, rot: Math.PI / 2 }); // 窓ぎわの流し
    o.push({ t: "cabinet", x: x1 - 0.3, z: z1 - 0.8, rot: Math.PI }); // 顕微鏡保管庫
  }],
  [/化学実験室|物理実験室|生物実験室/, (o, R) => lab(o, R)],
  // 調理室（写真）：前（黒板側）の半分に、流しとガスコンロのついた白い調理台が2列×3つ。後ろの半分は白い長机と緑の丸いすで、
  // 窓側に2列・廊下側に1列。廊下側の壁ぞいに木の食器棚、前のすみに冷蔵庫、窓側にテレビ
  [/調理室/, (o, R) => {
    const { x0, x1, z0, z1 } = R, L = x1 - x0, W = z1 - z0;
    o.push({ t: "blackboard", x: x0 + 0.12, z: z0 + W * 0.55, rot: 0 });
    o.push({ t: "fridge", x: x0 + 0.4, z: z0 + 0.5, rot: 0 }, { t: "fridge", x: x0 + 0.4, z: z0 + 1.3, rot: 0 });
    const xm = x0 + L * 0.48;
    for (let i = 0; i < 3; i++) for (const f of [0.4, 0.72]) {
      const x = x0 + 2.0 + i * ((xm - x0 - 2.4) / 2), z = z0 + W * f;
      o.push({ t: "cookIsland", x, z, rot: 0 });
    }
    for (const f of [0.84, 0.6, 0.26]) {
      const z = z0 + W * f;
      for (let x = xm + 0.9; x < x1 - 0.9; x += 1.8) {
        o.push({ t: "longTable", x, z, rot: Math.PI / 2 }); // 長机は部屋の長い向き（前後）にならぶ
        for (const sd of [-1, 1]) for (const k of [-0.45, 0.45]) o.push({ t: "greenStool", x: x + k, z: z + sd * 0.5, rot: 0 });
      }
    }
    for (let x = xm + 0.4; x < x1 - 0.5; x += 1.0) o.push({ t: "dishCabinet", x, z: z0 + 0.3, rot: Math.PI / 2 });
    o.push({ t: "tvStand", x: xm - 0.3, z: z1 - 0.6, rot: 0 });
  }],
  [/被服室/, sewing],
  [/コンピューター/, computers],
  [/視聴覚/, theater],
  // 音楽室：横8列×縦5列の机、黒板は北側、前のすみにピアノ
  [/練習室/, () => {}], // 空っぽ
  [/音楽室/, (o, R) => { classroom(o, R, { cols: 8, rows: 5, seats: 40, eboard: false, doorT: "swing", deskX0: 4.6 }); // 机は後ろへ（ピアノは前のまま）
    // ピアノは前のまんなか。先生は黒板側に座り、生徒の方を向いて弾く。教卓は窓側へよける
    const zc = (R.z0 + R.z1) / 2;
    // ピアノと重なる前の机・椅子はどける
    for (let i = o.length - 1; i >= 0; i--) { const it = o[i]; if (!["blackboard", "podium", "teacherDesk", "laptop", "clock", "bulletin", "swing", "hallWindow", "curtainPanel", "locker", "cleanLocker"].includes(it.t) && it.x < R.x0 + 3.7 && Math.abs(it.z - zc) < 1.3) o.splice(i, 1); }
    for (const it of o) if ((it.t === "teacherDesk" || it.t === "laptop") && Math.abs(it.z - zc) < 0.5) it.z += 2.6;
    o.push({ t: "piano", x: R.x0 + 1.75, z: zc, rot: 0, y: 0.18 }, { t: "pianoBench", x: R.x0 + 0.65, z: zc, rot: 0, y: 0.18 }); }],
  [/美術教室/, artIslands],
  [/工芸教室/, (o, R) => artroom(o, R, true)],
  [/^窯$/, (o, R) => o.push({ t: "kiln", x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2, rot: 0 })],
  [/図書室/, library],
  // 第2職員室：縦長の机をつなげ、両側に椅子を5つずつ
  [/第２職員室/, (o, R) => {
    const cx = (R.x0 + R.x1) / 2, n = 5, zs = R.z0 + 0.8, ze = R.z1 - 0.8;
    for (let i = 0; i < 3; i++) o.push({ t: "table", x: cx, z: zs + ((ze - zs) * (i + 0.5)) / 3, rot: 0, len: 1 });
    for (let i = 0; i < n; i++) { const z = zs + ((ze - zs) * (i + 0.5)) / n; for (const s of [-1, 1]) o.push({ t: "officeChair", x: cx + s * 0.85, z, rot: s > 0 ? 0 : Math.PI }); }
  }],
  [/^職員室$/, staffRoom],
  [/^職員室（L字）$/, staffRoomL],
  [/^事務室$/, jimu],
  [/職員室|事務室/, (o, R) => office(o, R)],
  [/会議室/, meeting],
  [/校長室/, principal],
  // 応接室（写真）：明るい木の長机を「ロ」の字にならべ、まわりに青いいす（みんな机のほうを向く）。壁に額がならぶ
  [/応接室/, (o, R) => {
    const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    o.push({ t: "squareTable", x: cx, z: cz, rot: 0 });
    for (const sx of [-1, 1]) for (const dz of [-1.5, -0.75, 0, 0.75, 1.5]) o.push({ t: "blueChair", x: cx + sx * 1.85, z: cz + dz, rot: sx > 0 ? 0 : Math.PI });
    for (const sz of [-1, 1]) for (const dx of [-0.8, 0, 0.8]) o.push({ t: "blueChair", x: cx + dx, z: cz + sz * 2.65, rot: sz < 0 ? Math.PI / 2 : -Math.PI / 2 });
    o.push({ t: "frameRow", x: cx, z: R.z0 + 0.05, rot: 0 });
  }],
  [/保健室/, infirmary],
  // 売店：西の廊下側に窓口。窓口の内側にカウンター、奥（東）の壁ぞいに商品の棚
  [/売店/, (o, R) => { o.push({ t: "counter", x: R.x0 + 0.5, z: (R.z0 + R.z1) / 2, rot: 0 }); along(o, "shelf", R.x1 - 0.25, R.z0 + 0.3, R.z1 - 0.3, 0.92, Math.PI); }],
  [/昇降口/, entrance],
  // 技能員室：部屋の少し東寄りに、東西に向かい合った机が2つ
  [/技能員室/, (o, R) => {
    const cx = (R.x0 + R.x1) / 2 + (R.x1 - R.x0) * 0.15, cz = (R.z0 + R.z1) / 2;
    o.push({ t: "officeDesk", x: cx - 0.36, z: cz, rot: 0 }, { t: "officeChair", x: cx - 1.1, z: cz, rot: Math.PI });
    o.push({ t: "officeDesk", x: cx + 0.36, z: cz, rot: Math.PI }, { t: "officeChair", x: cx + 1.1, z: cz, rot: 0 });
    along(o, "cabinet", R.x0 + 0.3, R.z0 + 0.6, R.z1 - 0.6, 0.95, 0);
  }],
  // 生徒指導室（写真）：長机を「ロ」の字にならべ、まわりにパイプいす。黒板側（北）に小さな机、北の壁ぞいに書類の棚、東の壁ぞいにロッカー、
  // 窓ぎわ（南）にハンガーラックと制服のマネキン、入口の近くに段ボール
  [/生徒指導室/, (o, R) => {
    const { x0, x1, z0, z1 } = R, cx = (x0 + x1) / 2 + 0.1, cz = (z0 + z1) / 2 + 0.5;
    o.push({ t: "blackboard", x: x0 + 0.12, z: cz - 1.6, rot: 0 });
    // 長机を「ロ」の字に（長い辺が前後にのびる2本と、それをつなぐ2本）。まわりにパイプいす10脚
    o.push({ t: "longTable", x: cx - 0.9, z: cz, rot: 0 }, { t: "longTable", x: cx + 0.9, z: cz, rot: 0 });
    o.push({ t: "longTable", x: cx, z: cz - 1.2, rot: Math.PI / 2 }, { t: "longTable", x: cx, z: cz + 1.2, rot: Math.PI / 2 });
    for (const k of [-0.6, 0.6]) { o.push({ t: "foldChair", x: cx + k, z: cz - 1.85, rot: -Math.PI / 2 }, { t: "foldChair", x: cx + k, z: cz + 1.85, rot: Math.PI / 2 }); }
    for (const k of [-0.9, 0, 0.9]) { o.push({ t: "foldChair", x: cx - 1.6, z: cz + k, rot: Math.PI }, { t: "foldChair", x: cx + 1.6, z: cz + k, rot: 0 }); }
    o.push({ t: "desk", x: x0 + 0.5, z: cz - 0.5, rot: 0 }); // 黒板の下の小さな机
    along(o, "cabinet", x0 + 0.3, z0 + 0.4, cz - 2.2, 0.95, 0); // 北西の書類の棚
    o.push({ t: "mannequin", x: cx + 0.4, z: z1 - 0.5, rot: Math.PI / 2 }, { t: "hangerRack", x: cx - 1.2, z: z1 - 0.6, rot: 0 });
    for (let z = z0 + 0.8; z < z1 - 0.6; z += 1.0) o.push({ t: "cabinet", x: x1 - 0.3, z, rot: Math.PI });
    o.push({ t: "cardboard", x: x0 + 0.6, z: z0 + 0.4, rot: 0 }, { t: "cardboard", x: x0 + 1.2, z: z0 + 0.35, rot: 0.3 });
  }],
  // 放送室のミキサー室（写真）：録音室との窓の下（南）にミキサー卓、東の壁ぞいに机とパソコン、いすが3つ。西の壁にホワイトボードとケーブルのかかった壁、北東のすみに棚と段ボール
  [/放送室（ミキサー室）/, (o, R) => {
    const { x0, x1, z0, z1 } = R, cx = (x0 + x1) / 2;
    o.push({ t: "mixerDesk", x: cx - 0.6, z: z1 - 0.45, rot: 0 });
    o.push({ t: "officeDesk", x: x1 - 0.45, z: z1 - 1.5, rot: Math.PI }, { t: "monitor", x: x1 - 0.5, z: z1 - 1.5, rot: Math.PI }, { t: "officeDesk", x: x1 - 0.45, z: z1 - 2.6, rot: Math.PI });
    o.push({ t: "officeChair", x: cx - 1.2, z: z1 - 1.2, rot: Math.PI / 2 }, { t: "officeChair", x: cx + 0.1, z: z1 - 1.2, rot: Math.PI / 2 }, { t: "officeChair", x: x1 - 1.2, z: z1 - 1.5, rot: 0 });
    o.push({ t: "whiteboard", x: x0 + 0.1, z: z0 + (z1 - z0) * 0.55, rot: 0 }, { t: "cableWall", x: x0 + 0.08, z: z0 + 1.0, rot: 0 });
    o.push({ t: "rack", x: x1 - 0.4, z: z0 + 1.0, rot: Math.PI }, { t: "cardboard", x: x1 - 1.2, z: z0 + 0.5, rot: 0 });
  }],
  // 放送室の録音室（写真）：まんなかに机を2つ合わせ、いす2つ。窓ぎわ（南）に長机、東の壁ぞいに金属の棚、マイクスタンドの束
  [/放送室（録音室）/, (o, R) => {
    const { x0, x1, z0, z1 } = R, cx = (x0 + x1) / 2 - 0.3, cz = (z0 + z1) / 2;
    o.push({ t: "desk", x: cx - 0.33, z: cz, rot: 0 }, { t: "desk", x: cx + 0.33, z: cz, rot: 0 });
    o.push({ t: "chair", x: cx - 0.33, z: cz + 0.6, rot: -Math.PI / 2 }, { t: "chair", x: cx + 0.33, z: cz - 0.6, rot: Math.PI / 2 });
    o.push({ t: "longTable", x: x0 + 1.6, z: z1 - 0.4, rot: Math.PI / 2 }, { t: "printer", x: x0 + 2.2, z: z1 - 0.4, rot: 0 });
    o.push({ t: "rack", x: x1 - 0.4, z: cz - 0.5, rot: Math.PI }, { t: "rack", x: x1 - 0.4, z: cz + 1.05, rot: Math.PI }); // 南の壁から出ないように
    for (const k of [0, 0.25, 0.5]) o.push({ t: "micStand", x: x1 - 0.9 - k * 0.6, z: z0 + 0.5 + k, rot: 0 });
    o.push({ t: "cardboard", x: x0 + 0.5, z: z1 - 1.1, rot: 0 });
  }],
  // 生徒会室：北のオーラル教室とのあいだは壁ではなく、灰色のパーティション
  [/^生徒会室$/, (o, R) => { prep(o, R); o.push({ t: "partitionWall", x: (R.x0 + R.x1) / 2, z: R.z0, rot: 0, sx: R.x1 - R.x0 - 0.1 }); }],
  [/準備室|生徒会室|進路資料室|整理室|資料室/, prep],
  [/男子トイレ/, (o, R) => { toilet(o, R); urinals(o, R); }],
  [/トイレ/, toilet],
  [/ステージ/, stage],
  [/卓球場/, pingpong],
  [/ウエイトルーム/, weights],
  [/^体育館$/, gym],
  [/受付カウンター/, (o, R) => shop(o, R, true)],
  // ここから下は、図面では中身がわからない部屋に、それらしい物を少しだけ置く
  [/倉庫|器具庫|器具室|保管室/, (o, R) => { along(o, "rack", R.x0 + 0.3, R.z0 + 0.9, R.z1 - 0.9, 1.6, 0); along(o, "rack", R.x1 - 0.3, R.z0 + 0.9, R.z1 - 0.9, 1.6, Math.PI); }],
  [/^部室（|^部室(9|10)$/, (o, R) => along(o, "tallLocker", R.x1 - 0.3, R.z0 + 0.5, R.z1 - 0.5, 0.92, Math.PI)], // 西の部室：入口が西なのでロッカーは東の壁
  // 生徒更衣室：ドアは東。まんなかに、灰色の棚のようなロッカーが東西にのびる
  [/^生徒更衣室$/, (o, R) => alongX(o, "grayShelf", (R.z0 + R.z1) / 2, R.x0 + 0.8, R.x1 - 1.6, 0.9, 0)],
  [/更衣室|部室/, (o, R) => { along(o, "tallLocker", R.x0 + 0.3, R.z0 + 0.6, R.z1 - 0.6, 0.92, 0); if (R.x1 - R.x0 > 3) o.push({ t: "bench", x: (R.x0 + R.x1) / 2 + 0.3, z: (R.z0 + R.z1) / 2, rot: 0 }); }],
  [/受水槽/, (o, R) => o.push({ t: "tank", x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2, rot: 0 })],
  [/電気室/, (o, R) => along(o, "panel", R.x0 + 0.35, R.z0 + 0.8, R.z1 - 0.8, 1.25, 0)],
  [/給湯室/, (o, R) => o.push({ t: "kitchen", x: R.x0 + 0.35, z: (R.z0 + R.z1) / 2, rot: 0 })],
  // ラウンジ：壁ぞいにL字の木のベンチ、まんなかに長いテーブル2つとベンチ（写真）
  [/展示スペース/, (o, R) => {
    const { x0, x1, z0, z1 } = R, zc = (z0 + z1) / 2;
    for (const k of [-0.9, 0.2, 1.3]) o.push({ t: "easel", x: x0 + 0.7, z: zc + k * 1.1 - 0.4, rot: 0 });
    o.push({ t: "showcase", x: x1 - 0.6, z: zc, rot: 0 });
  }],
  // 印刷室（写真）：南が窓。まんなかに印刷機とコピー機がならび、東の壁ぞいにプリンターをのせた机と棚・ロッカー、西の窓ぎわに紙を分ける機械と作業台
  [/印刷室/, (o, R) => {
    const { x0, x1, z0, z1 } = R, cx = (x0 + x1) / 2;
    o.push({ t: "riso", x: cx - 0.2, z: z0 + (z1 - z0) * 0.45, rot: Math.PI / 2 }, { t: "riso", x: cx - 0.2, z: z0 + (z1 - z0) * 0.62, rot: Math.PI / 2 });
    o.push({ t: "copier", x: cx + 0.1, z: z0 + (z1 - z0) * 0.28, rot: Math.PI / 2 });
    o.push({ t: "printerDesk", x: x1 - 0.4, z: z0 + (z1 - z0) * 0.62, rot: 0 });
    o.push({ t: "shelf", x: x1 - 0.25, z: z0 + (z1 - z0) * 0.28, rot: Math.PI }, { t: "cabinet", x: x1 - 0.3, z: z0 + 0.7, rot: Math.PI });
    o.push({ t: "collator", x: x0 + 0.5, z: z1 - 1.0, rot: 0 }, { t: "table", x: x0 + 0.5, z: z1 - 2.3, rot: 0 }, { t: "officeChair", x: x0 + 0.6, z: z0 + (z1 - z0) * 0.4, rot: Math.PI / 2 });
  }],
  // 進路情報コーナー（写真）：東の壁ぞいに、本を見せる棚、パンフレットのワゴン（専門学校・大学）、上に緑の掲示板
  [/進路情報コーナー/, (o, R) => {
    const { x1, z0, z1 } = R, x = x1 - 0.3;
    o.push({ t: "magazineRack", x, z: z0 + 0.6, rot: Math.PI });
    for (let z = z0 + 1.6; z < z1 - 0.4; z += 1.0) o.push({ t: "pamphletCart", x: x - 0.1, z, rot: Math.PI });
    o.push({ t: "bulletin", x: x1 + 0.1, z: (z0 + 1.6 + z1) / 2, rot: Math.PI });
  }],
  [/ラウンジ/, (o, R) => {
    const { x0, x1, z0, z1 } = R;
    if (R.floor === 2) {
      // 2階のラウンジ（写真）：西の壁と北の窓の下に作りつけの木のベンチ。西の壁に横長の絵、東の壁に掲示板。
      // テーブル2つは少しずらして置き、それぞれ両側にベンチ
      along(o, "wallBench", x0 + 0.25, z0 + 0.4, z1 - 0.4, 1.6, 0);
      alongX(o, "wallBench", z0 + 0.25, x0 + 0.8, x1 - 0.5, 1.6, Math.PI / 2);
      o.push({ t: "painting", x: x0 + 0.02, z: z0 + (z1 - z0) * 0.45, rot: 0 });
      for (const f of [0.3, 0.68]) o.push({ t: "bulletin", x: x1 + 0.12, z: z0 + (z1 - z0) * f, rot: 0 });
      const w = x1 - x0;
      for (const [fx, fz] of [[0.6, 0.38], [0.45, 0.72]]) {
        const x = x0 + w * fx, z = z0 + (z1 - z0) * fz;
        o.push({ t: "table", x, z, rot: 0 });
        for (const sd of [-1, 1]) o.push({ t: "bench", x: x + sd * 0.85, z, rot: 0 });
      }
      return;
    }
    along(o, "wallBench", x0 + 0.25, z0 + 0.4, z1 - 0.6, 1.6, 0);
    alongX(o, "wallBench", z0 + 0.25, x0 + 0.8, x1 - 0.4, 1.6, Math.PI / 2);
    const cx = (x0 + x1) / 2 + 0.2;
    for (const f of [0.38, 0.72]) {
      const z = z0 + (z1 - z0) * f;
      o.push({ t: "table", x: cx, z, rot: 0 });
      for (const s of [-1, 1]) o.push({ t: "bench", x: cx + s * 0.85, z, rot: 0 });
    }
  }],
  // コミュニティルーム：西の壁ぞいに書棚、まんなかに長方形の机、椅子は両側に4つずつ
  [/コミュニティルーム/, (o, R) => {
    const { x0, x1, z0, z1 } = R, cx = (x0 + x1) / 2 + 0.3, cz = (z0 + z1) / 2;
    along(o, "shelf", x0 + 0.25, z0 + 0.5, z1 - 0.5, 0.92, 0);
    const long = z1 - z0 >= x1 - x0; // 部屋の長い方向に机をのばす
    for (const k of [-0.95, 0.95]) o.push({ t: "table", x: long ? cx : cx + k, z: long ? cz + k : cz, rot: long ? 0 : Math.PI / 2 });
    for (let i = 0; i < 4; i++) {
      const t = -1.35 + i * 0.9;
      for (const sd of [-1, 1]) o.push(long ? { t: "chair", x: cx + sd * 0.8, z: cz + t, rot: sd > 0 ? 0 : Math.PI } : { t: "chair", x: cx + t, z: cz + sd * 0.8, rot: sd > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }],
  // コモンスペース：北の壁に壁画、テーブル2つと長椅子、西のはしに渡り廊下へ少し上がる階段（北へ上る）
  [/コモンスペース/, (o, R) => {
    const { x0, x1, z0, z1 } = R, cz = (z0 + z1) / 2 + 0.8;
    // 壁画は音楽準備室の南の壁の分だけ（図面で準備室は c33〜39、コモンスペースは c33〜41 なので西から 7/9）
    const xm = x0 + (x1 - x0) * 7 / 9 - 0.1;
    o.push({ t: "mural", x: (x0 + xm) / 2, z: z0 + 0.05, rot: Math.PI / 2, len: xm - x0 });
    for (const x of [x0 + (x1 - x0) * 0.28, x0 + (x1 - x0) * 0.5]) { // テーブルは西寄り（階段の手前）
      o.push({ t: "table", x, z: cz, rot: Math.PI / 2 });
      for (const sd of [-1, 1]) o.push({ t: "bench", x, z: cz + sd * 0.75, rot: Math.PI / 2 });
    }
    // 渡り廊下へ上がる階段：壁画の壁にくっついて、西へ7段上がり、そのまま渡り廊下へ。南側に斜めの手すり壁
    const sw = 2.4, n = 7, rise = 0.15, tread = 0.3, xs = x0 + n * tread;
    for (let k = 0; k < n; k++) o.push({ t: "step", x: xs - (k + 0.5) * tread, z: z0 + sw / 2 + 0.05, rot: 0, y: -0.15, sx: tread, sy: (rise * (k + 1)) / 0.2, sz: sw });
    o.push({ t: "stairRail", x: xs - (n * tread) / 2, z: z0 + sw + 0.1, rot: 0 });
    o.push({ t: "bookCart", x: xm + 0.6, z: z0 + 0.6, rot: 0 }); // 出張図書館（壁画の東のはしの前）
  }],
  // らくらくスペース（写真）：窓（北）の下に青いソファと空気清浄機、北西のすみに事務机。まんなかに木目の机と、灰色のいすが6つ。
  // 東の壁ぞいに白い棚。入口（南）のそばに、目かくしのついたて
  // 武道場（写真）：木の床に、試合場の白いライン（正方形が2つ）。壁に紺色の旗と、額がならぶ
  [/^武道場$/, (o, R) => {
    const W = R.x1 - R.x0, cz = (R.z0 + R.z1) / 2, S = Math.min(10, R.z1 - R.z0 - 2, W / 2 - 1.5);
    for (const cx of [R.x0 + W * 0.27, R.x0 + W * 0.73]) {
      o.push({ t: "floorLine", x: cx, z: cz - S / 2, rot: 0, sx: S }, { t: "floorLine", x: cx, z: cz + S / 2, rot: 0, sx: S });
      o.push({ t: "floorLine", x: cx - S / 2, z: cz, rot: Math.PI / 2, sx: S }, { t: "floorLine", x: cx + S / 2, z: cz, rot: Math.PI / 2, sx: S });
      o.push({ t: "floorLine", x: cx, z: cz, rot: 0, sx: 0.5 }); // まんなかの短い線
    }
    o.push({ t: "dojoBanner", x: R.x0 + 3, z: R.z0 + 0.05, rot: 0 });
    o.push({ t: "frameRow", x: R.x0 + 7.5, z: R.z0 + 0.05, rot: 0 });
  }],
  [/らくらくスペース/, (o, R) => {
    const cx = (R.x0 + R.x1) / 2 - 0.4, cz = (R.z0 + R.z1) / 2 + 0.4;
    o.push({ t: "meetTable", x: cx, z: cz, rot: 0 });
    for (const dz of [-0.6, 0, 0.6]) o.push({ t: "grayChair", x: cx - 0.75, z: cz + dz, rot: Math.PI }, { t: "grayChair", x: cx + 0.75, z: cz + dz, rot: 0 });
    o.push({ t: "blueSofa", x: R.x1 - 2.0, z: R.z0 + 0.5, rot: Math.PI / 2 });
    o.push({ t: "airPurifier", x: R.x0 + 2.4, z: R.z0 + 0.3, rot: 0 });
    o.push({ t: "officeDesk", x: R.x0 + 0.8, z: R.z0 + 0.5, rot: 0 });
    o.push({ t: "whiteShelf", x: R.x1 - 0.25, z: (R.z0 + R.z1) / 2, rot: 0 });
    o.push({ t: "screenPanel", x: R.x1 - 1.0, z: R.z1 - 1.2, rot: 0 });
  }],
  // 作法室：机や椅子はない。入口（北の廊下側）に小さな板の間があり、ふすまで仕切られた奥が畳の小上がり。奥に床の間
  [/作法室/, (o, R) => {
    const { x0, x1, z0, z1 } = R, W = x1 - x0, cx = (x0 + x1) / 2, ze = z0 + 1.3;
    o.push({ t: "entryFloor", x: cx, z: (z0 + ze) / 2, rot: 0, sx: W, sz: ze - z0 });
    o.push({ t: "tatamiDais", x: cx, z: (ze + z1) / 2, rot: 0, sx: W, sz: z1 - ze });
    for (let x = x0 + 0.45; x < x1 - 0.3; x += 0.9) if (Math.abs(x - (cx + 0.45)) > 0.5) o.push({ t: "fusuma", x, z: ze, rot: 0 }); // まんなかの1枚分は開けてある
    o.push({ t: "tokonoma", x: cx, z: z1 - 0.3, rot: Math.PI / 2, y: 0.35 });
  }],
  // 正面玄関：西の壁ぞいいっぱいに下駄箱、東（入口）側に丸テーブルと椅子4つ、北東のすみに傘立て
  [/正面玄関/, (o, R) => {
    o.push({ t: "umbrella", x: R.x1 - 0.5, z: R.z0 + 0.8, rot: Math.PI });
    along(o, "shoeRack", R.x0 + 0.3, R.z0 + 0.9, R.z1 - 0.9, 1.8, 0);
    const tx = R.x1 - 2.4, tz = R.z0 + 1.1; // 北の壁ぎわまで寄せる
    o.push({ t: "roundTable", x: tx, z: tz, rot: 0 });
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) o.push({ t: "chair", x: tx + Math.cos(a) * 0.75, z: tz + Math.sin(a) * 0.75, rot: a });
  }],
];

// 黒板・教卓を北側に置く特別教室（普通教室は図面の左＝西側が前）
const NORTH_FRONT = /選択|オーラル|社会科教室|視聴覚|音楽室/;
// 先生の机・黒板が南側にある特別教室
const SOUTH_FRONT = /選択第２教室|選択第2教室|美術教室|工芸教室/; // 美術・工芸は黒板が南側
// 東側を向いて授業を受ける部屋（被服室は西向きなので、ふつうの教室と同じ）
const EAST_FRONT = /調理室|コンピューター|実験室/; // 物理・化学・生物の実験室も、教卓は東側

// 床の模様
export function floorStyle(name) {
  if (/^体育館$/.test(name)) return "gym";
  if (/武道場/.test(name)) return "flooring";
  if (/作法室/.test(name)) return "tatami";
  if (/トイレ|シャワー|調理室|実験室|昇降口|玄関|ホール|コンピューター/.test(name)) return "tile"; // コンピューター教室は青いタイルカーペット
  return "wood";
}

// rooms: その階の部屋の配列（cx, cz, w, d, name を持つ）, y: 床の高さ
export function buildFurniture(rooms, y) {
  const items = [];
  for (const r of rooms) {
    // 自動販売機（壁ぎわ。正面は部屋の内側）
    if (r.vending) {
      // vendingShift：壁が部屋の外にあるときに、その分だけ外へずらす（図面の単位）。vendingN：台数
      const sh = r.vendingShift || 0, n = r.vendingN || 2;
      const pos = { e: [r.cx + r.w / 2 - 0.55 + sh, r.cz, 0], w: [r.cx - r.w / 2 + 0.55 - sh, r.cz, Math.PI], n: [r.cx, r.cz - r.d / 2 + 0.55 - sh, -Math.PI / 2], s: [r.cx, r.cz + r.d / 2 - 0.55 + sh, Math.PI / 2] }[r.vending];
      const along = r.vending === "e" || r.vending === "w";
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 1.05;
        items.push({ t: "vending", x: pos[0] + (along ? 0 : o), z: pos[1] + (along ? o : 0), rot: pos[2] });
      }
    }
    // 外への出入口の両引き戸（doors: 向きのリスト）。壁のまんなかに置く
    // "s:door4" のように書くと、4枚の大きな両引き戸
    // "e:swing" は内側に開く押し扉
    // "n2" のように2をつけると、その壁の前と後ろ（両はし寄り）に2つ
    for (const dd of r.doors || []) {
      const [d0, t = "door"] = dd.split(":");
      const d = d0[0], two = d0.endsWith("2"), at = d0.includes("@") ? Number(d0.split("@")[1]) : 0; // "n@-0.35"：壁の長さに対する位置（まんなか0、はし±0.5）
      const p = { n: [r.cx, r.cz - r.d / 2, 0], s: [r.cx, r.cz + r.d / 2, Math.PI], e: [r.cx + r.w / 2, r.cz, -Math.PI / 2], w: [r.cx - r.w / 2, r.cz, Math.PI / 2] }[d]; // 向き：ドアの +z が部屋の内側
      const along = d === "n" || d === "s", half = (along ? r.w : r.d) / 2 - 1.3;
      // 外への入口（部室）は外壁の外側に少し出す（外壁にかくれないように）
      const out = t === "clubDoor" ? 0.22 : 0, ox = { e: out, w: -out }[d] || 0, oz = { n: -out, s: out }[d] || 0;
      for (const o of two ? [-half, half] : [at * (along ? r.w : r.d)]) items.push({ t, x: p[0] + (along ? o : 0) + ox, z: p[1] + (along ? 0 : o) + oz, rot: p[2] });
    }
    const fn = LAYOUTS.find(([re]) => re.test(r.name));
    if (!fn) continue;
    const list = [];
    if (EAST_FRONT.test(r.name)) {
      // 「正面が -x」の置き方を、部屋の中心のまわりで180度回す
      fn[1](list, { x0: -r.w / 2 + 0.2, x1: r.w / 2 - 0.2, z0: -r.d / 2 + 0.2, z1: r.d / 2 - 0.2 });
      for (const it of list) {
        it.x = r.cx - it.x;
        it.z = r.cz - it.z;
        it.rot = (it.rot || 0) + Math.PI;
      }
    } else if (SOUTH_FRONT.test(r.name)) {
      // 南側（+z）が前。「正面が -x」の置き方を +90度回して使う
      fn[1](list, { x0: -r.d / 2 + 0.2, x1: r.d / 2 - 0.2, z0: -r.w / 2 + 0.2, z1: r.w / 2 - 0.2 });
      for (const it of list) {
        const { x, z } = it;
        it.x = r.cx + z;
        it.z = r.cz - x;
        it.rot = (it.rot || 0) + Math.PI / 2;
      }
    } else if (NORTH_FRONT.test(r.name)) {
      // 特別教室は、黒板・教卓・教壇を北側（-z）に置く。
      // 置き方の関数は「正面が -x」で書いてあるので、部屋の中心のまわりで -90度回して使う
      fn[1](list, { x0: -r.d / 2 + 0.2, x1: r.d / 2 - 0.2, z0: -r.w / 2 + 0.2, z1: r.w / 2 - 0.2 });
      for (const it of list) {
        const { x, z } = it;
        it.x = r.cx - z;
        it.z = r.cz + x;
        it.rot = (it.rot || 0) - Math.PI / 2;
      }
    } else {
      fn[1](list, { x0: r.cx - r.w / 2 + 0.2, x1: r.cx + r.w / 2 - 0.2, z0: r.cz - r.d / 2 + 0.2, z1: r.cz + r.d / 2 - 0.2, floor: r.floor });
    }
    items.push(...list);
  }
  const group = new THREE.Group();
  const byType = {};
  for (const it of items) (byType[it.t] ||= []).push(it);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [t, list] of Object.entries(byType)) {
    for (const [mat, geo] of SHAPES[t]) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        p.set(it.x, y + 0.15 + (it.y || 0), it.z);
        q.setFromAxisAngle(up, it.rot || 0);
        s.set(it.sx || 1, it.sy || 1, it.sz || it.len || 1); // sx・sy・sz：箱の大きさを変える（段など）
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        if (it.col !== undefined) im.setColorAt(i, new THREE.Color(it.col));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      group.add(im);
    }
  }
  return group;
}
