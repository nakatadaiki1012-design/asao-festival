// 文化祭の出し物データ：読み込み（Google スプレッドシート または data/exhibits.csv）と、場所の名前から部屋を探す処理。
// 3D表示（app.js）と管理画面（admin.html）の両方で使う。
import { FESTIVAL } from "./festival-config.js";

export { FESTIVAL };
export const LOCAL_CSV = "data/exhibits.csv";

// スプレッドシートの URL を、CSV（表のデータ）を取り出す URL に変える
export function sheetCsvUrl(url) {
  if (!url) return "";
  if (/output=csv|tqx=out:csv/.test(url)) return url; // すでに CSV の URL
  const m = url.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (!m || m[1] === "e") return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ""}`;
}

// CSV（カンマ区切りの表）を行の配列にする。"..." の中のカンマ・改行もあつかう
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// 表の見出し（1行目）の名前 → データの項目。見出しは多少ちがっても読めるようにする
const COLS = [
  ["place", /場所|教室|部屋/],
  ["group", /団体|クラス|部活|出展者/],
  ["title", /出し物|企画|タイトル|名前/],
  ["genre", /ジャンル|種類|分類/],
  ["time", /時間|日時|日程/],
  ["image", /画像|写真/],
  ["desc", /説明|紹介|内容|PR|ＰＲ/],
  ["hide", /非表示|かくす|隠す/],
];

export function rowsToExhibits(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  const idx = {};
  for (const [k, re] of COLS) {
    const i = head.findIndex((h, j) => re.test(h) && !Object.values(idx).includes(j));
    if (i >= 0) idx[k] = i;
  }
  return rows.slice(1).map((r, n) => {
    const o = { line: n + 2 };
    for (const [k] of COLS) o[k] = idx[k] !== undefined ? (r[idx[k]] || "").trim() : "";
    return o;
  }).filter((o) => (o.place || o.title || o.group) && !/^(true|1|○|〇|はい|yes|x|×)$/i.test(o.hide));
}

async function fetchCsv(u) {
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error("スプレッドシートが公開されていないようです（共有を「リンクを知っている全員」にしてください）");
  return rowsToExhibits(parseCsv(text));
}

// 団体名をくらべるための形（空白・記号のちがいを気にしない）
export const groupKey = (s) => norm(s).replace(/[()（）「」『』・,、.。!！?？]/g, "");

// フォームの回答を、出し物の表に「団体名」でかさねる。
// 同じ団体が何回も送ったときは、あとの回答が勝つ（書いた項目だけ上書き）。場所とジャンルは表のまま
export function mergeForms(list, forms) {
  const byKey = new Map(); // 同じ団体が何行もあるとき（ステージの1日目・2日目など）は、全部の行にかさねる
  for (const e of list) { const k = groupKey(e.group); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); }
  const unmatched = [];
  for (const f of forms) {
    const es = byKey.get(groupKey(f.group));
    if (!f.group || !es) { unmatched.push(f); continue; }
    for (const e of es) {
      for (const k of ["desc", "image"]) if (f[k]) e[k] = f[k];
      if (es.length === 1) for (const k of ["title", "time"]) if (f[k]) e[k] = f[k]; // 時間・名前は1行だけのときに上書き
      e.fromForm = (e.fromForm || 0) + 1;
    }
  }
  return unmatched;
}

// 出し物データを読む。シートが読めないときは data/exhibits.csv を読む。
// フォームの回答のシートがあれば、それもかさねる
export async function loadExhibits() {
  const url = sheetCsvUrl(FESTIVAL.sheetUrl);
  const tries = url ? [["sheet", url], ["local", LOCAL_CSV]] : [["local", LOCAL_CSV]];
  let error = "", list = [], source = "none";
  for (const [src, u] of tries) {
    try { list = await fetchCsv(u); source = src; break; }
    catch (e) { error = error || String(e.message || e); }
  }
  let forms = [], formError = "", unmatched = [];
  const furl = sheetCsvUrl(FESTIVAL.formSheetUrl);
  if (furl) {
    try { forms = await fetchCsv(furl); unmatched = mergeForms(list, forms); }
    catch (e) { formError = String(e.message || e); }
  }
  return { list, source, error, forms, formError, unmatched };
}

// ---------- 場所の名前から、部屋（または屋外の場所）を探す ----------
export const norm = (s) => String(s || "").normalize("NFKC").toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/\s/g, "").replace(/[ー－‐−-]/g, "-");

const placeRooms = (rooms) => rooms.filter((r) => r.kind === "room");

// rooms：部屋の一覧、sites：屋外の場所（SITE_INFO）
// 返り値：{ room } か { site } か null。あいまいなときは warn に注意を書く
export function matchPlace(text, rooms, sites = []) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const list = placeRooms(rooms);
  const byId = list.find((r) => r.id === raw);
  if (byId) return { room: byId };
  let q = norm(raw);
  // 「2階 化学実験室」「3F 音楽室」のように、はじめに階を書いてもよい
  let floor = null;
  const fm = q.match(/^([123])(階|f)[:：・-]?/);
  if (fm) { floor = Number(fm[1]); q = q.slice(fm[0].length); }
  const onFloor = (r) => floor === null || r.floor === floor;
  // 「2-4」「2年4組」「2の4」→ 2年4組の教室
  const cm = q.match(/^([1-3])(?:-|年|の)([1-9])(組|組教室|教室)?$/);
  if (cm) {
    const r = list.find((x) => x.grade === Number(cm[1]) && x.cls === Number(cm[2]));
    if (r) return { room: r };
  }
  const core = (s) => s.replace(/(実験)?(教)?室$/, "");
  const find = (on) => {
    // 名前がぴったり同じ部屋
    const exact = list.filter((r) => on(r) && norm(r.name) === q);
    if (exact.length) {
      const fl = [...new Set(exact.map((r) => r.floor))];
      return { room: exact[0], warn: exact.length < 2 ? "" : fl.length > 1
        ? `「${raw}」は${fl.map((f) => f + "階").join("・")}にあります。${exact[0].floor}階にしました。ちがうときは「${fl[1]}階 ${raw}」のように階も書いてください。`
        : `「${raw}」は${exact[0].floor}階に${exact.length}か所あります。1つ目にしました。決めたいときは、管理画面の「場所の一覧」の記号（${exact.map((r) => r.id).join("、")}）を書いてください。` };
    }
    // 屋外の場所
    const site = sites.find((s) => norm(s.name) === q) || sites.find((s) => norm(s.name).includes(q) || (q.length >= 2 && q.includes(norm(s.name))));
    if (site) return { site };
    // 「化学室」→「化学実験室」のように、名前の一部だけのとき
    const part = list.filter((r) => on(r) && (norm(r.name).includes(q) || core(norm(r.name)) === core(q)));
    if (part.length === 1) return { room: part[0], warn: `「${raw}」は「${part[0].name}」（${part[0].floor}階）のことだと判断しました。` };
    if (part.length > 1) return { room: part[0], warn: `「${raw}」にあてはまる場所が${part.length}か所あります（${part.slice(0, 4).map((r) => `${r.floor}階 ${r.name}`).join("、")}${part.length > 4 ? "…" : ""}）。1つ目にしました。管理画面の「場所の一覧」の名前をそのまま書くと確実です。` };
    return null;
  };
  const hit = find(onFloor);
  if (hit || floor === null) return hit;
  // 書いた階に見つからないときは、ほかの階もさがす
  const other = find(() => true);
  if (other?.room) other.warn = `「${raw}」は${floor}階にはありません。${other.room.floor}階の「${other.room.name}」にしました。` + (other.warn ? " " + other.warn : "");
  return other;
}

export const genreColor = (g) => FESTIVAL.genres[g] || FESTIVAL.genres["その他"] || "#868e96";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

// 画像の URL（Google ドライブの共有リンクは、画像として表示できる形に変える）
// 「画像」の欄には何枚でも書ける（改行・カンマ・空白で区切る。フォームで複数アップロードしたときもこの形）
export const imageList = (s) => String(s || "").split(/[\s,、]+/).map(imageUrl).filter(Boolean);

export function imageUrl(u) {
  if (!u) return "";
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return /^(https?:)?\/\/|^images\//.test(u) ? u : "";
}

// 写真：1枚目は大きく、2枚目からは小さく。押すと画面いっぱいに大きく見られる（地図の部屋の写真と同じしくみ）
function photos(list, name) {
  if (!list.length) return "";
  const img = (src, i, cls) => `<img class="${cls}" src="${esc(src)}" data-i="${i}" alt="${esc(name)}の写真" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
  return `<div class="photos" data-srcs="${esc(list.join("|"))}">${img(list[0], 0, "room-photo ex-img")}${list.length > 1 ? `<div class="thumbs">${list.slice(1).map((src, i) => img(src, i + 1, "thumb")).join("")}</div>` : ""}</div>`;
}

// パネル（紹介の欄）に出す出し物のカード
export function exhibitCardsHtml(list) {
  if (!list?.length) return "";
  return `<div class="ex-cards">${list.map((e) => `
    <div class="ex-card" style="--g:${genreColor(e.genre)}">
      ${e.genre ? `<span class="ex-genre">${esc(e.genre)}</span>` : ""}
      <h3>🎪 ${esc(e.title || "（出し物名未定）")}</h3>
      ${e.group ? `<p class="ex-group">${esc(e.group)}</p>` : ""}
      ${e.time ? `<p class="ex-time">🕒 ${esc(e.time)}</p>` : ""}
      ${photos(imageList(e.image), e.title)}
      ${e.desc ? `<p class="ex-desc">${esc(e.desc).replace(/\n/g, "<br>")}</p>` : ""}
    </div>`).join("")}</div>`;
}
