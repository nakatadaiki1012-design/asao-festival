// 文化祭の出し物データ：読み込み（Google スプレッドシート または data/exhibits.csv）と、場所の名前から部屋を探す処理。
// 地図（app.js）・パンフレット（pamphlet.html）・管理画面（admin.html）のすべてで、ここだけを使う。
import { FESTIVAL } from "./festival-config.js";

export { FESTIVAL };
export const LOCAL_CSV = "data/exhibits.csv";

// ============================================================================
// 出し物データの読み込み
//   データがこわれないための決まり：
//   ・読み込んだ表は「見出し」を確かめる。必要な列（場所・出し物名）がない表は使わない（列がずれた表で地図をこわさない）
//   ・1つ1つの値は、制御文字をのぞき、長すぎるものは切る（表示がくずれない）
//   ・読みこめなかったときは、前に読めたデータ（このブラウザに保存）を使う。見本の CSV で上書きしない
//   ・元のデータは書きかえない（フォームをかさねるときも、新しい配列を作る）
// ============================================================================

// スプレッドシートの URL を、CSV（表のデータ）を取り出す URL に変える
export function sheetCsvUrl(url) {
  if (!url) return "";
  if (/output=csv|tqx=out:csv/.test(url)) return url; // すでに CSV の URL
  const m = url.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (!m || m[1] === "e") return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  // headers=1：1行目だけを見出しにする（Google が見出しの行を勝手にまとめてしまうのを防ぐ）
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&headers=1${gid ? `&gid=${gid}` : ""}`;
}

// CSV（カンマ区切りの表）を行の配列にする。"..." の中のカンマ・改行もあつかう
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = String(text ?? "").replace(/^\uFEFF/, "");
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

// 表の見出し（1行目）の名前 → データの項目。見出しは多少ちがっても読めるようにする。
// 上から順に決める（「紹介画像」は画像、「紹介文」は説明、のように、先に決まった列は使わない）
const COLS = [
  ["place", /場所|教室|部屋|会場/],
  ["group", /団体|クラス|部活|出展者/],
  ["title", /出し物|企画名|タイトル|名前|企画/],
  ["genre", /ジャンル|種類|分類/],
  ["time", /時間|日時|日程/],
  ["image", /画像|写真/],
  ["desc", /説明|紹介|内容|PR|ＰＲ/],
  ["hide", /非表示|かくす|隠す/],
];
const FIELDS = COLS.map(([k]) => k);
// 1つの値の長さの上限（これより長い分は切る）
const MAX = { place: 40, group: 40, title: 60, genre: 20, time: 120, image: 2000, desc: 1200, hide: 10 };
export const MAX_ROWS = 500;

// 値をきれいにする：制御文字（目に見えない文字）をのぞく、前後の空白をとる、改行は3つまで、長さを切る
export function clean(v, max = 200) {
  let s = String(v ?? "").normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n").replace(/[ \t\u3000]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if ([...s].length > max) s = [...s].slice(0, max).join("") + "…";
  return s;
}
const isHidden = (v) => /^(true|1|○|〇|◯|はい|yes|x|×|✕|✓|✔)$/i.test(String(v).normalize("NFKC").trim());

// 見出しから、どの列がどの項目かを決める
export function headerMap(head) {
  const h = head.map((x) => clean(x, 60));
  const idx = {}, used = new Set();
  for (const [k, re] of COLS) {
    const i = h.findIndex((x, j) => !used.has(j) && re.test(x));
    if (i >= 0) { idx[k] = i; used.add(i); }
  }
  return idx;
}

// 表（行の配列）→ 出し物の一覧。表がおかしいときは error を返す（その表は使わない）
//   kind："main"（出し物の表：場所と出し物名か団体名が必要） / "form"（フォームの回答：団体名が必要）
export function tableToExhibits(rows, kind = "main") {
  if (!rows.length) return { list: [], warnings: [], error: "表が空です" };
  const idx = headerMap(rows[0]);
  const need = kind === "form" ? ["group"] : ["place"];
  const miss = need.filter((k) => idx[k] === undefined);
  if (miss.length || (kind === "main" && idx.title === undefined && idx.group === undefined)) {
    return { list: [], warnings: [], error: `1行目の見出しに「${kind === "form" ? "団体名" : "場所」「出し物名"}」がありません。見出しの名前を変えたり、行を消したりしていないか確かめてください` };
  }
  const warnings = [];
  let body = rows.slice(1);
  if (body.length > MAX_ROWS) { warnings.push(`行が多すぎるので、はじめの ${MAX_ROWS} 行だけ使います`); body = body.slice(0, MAX_ROWS); }
  const list = [];
  body.forEach((r, n) => {
    const o = { line: n + 2 };
    for (const k of FIELDS) o[k] = idx[k] !== undefined ? clean(r[idx[k]], MAX[k]) : "";
    if (!(o.place || o.title || o.group) || isHidden(o.hide)) return;
    delete o.hide;
    list.push(Object.freeze(o));
  });
  return { list, warnings, error: "" };
}
// 前と同じ使い方用（見出しがおかしいときは空の一覧）
export const rowsToExhibits = (rows) => tableToExhibits(rows).list;

// 1行ずつの注意（管理画面に出す）
export function rowWarnings(e) {
  const w = [];
  if (!e.title) w.push("出し物名が空です");
  if (!e.place) w.push("場所が空です");
  if (e.genre && !FESTIVAL.genres[e.genre]) w.push(`ジャンル「${e.genre}」は色分けにないので「その他」の色になります`);
  if (e.image) {
    const bad = String(e.image).split(/[\s,、]+/).filter((u) => u && !imageUrl(u));
    if (bad.length) w.push(`画像の URL として読めないものがあります（${bad.slice(0, 2).join("、")}）`);
  }
  return w;
}

// 出し物の種類（パンフレットの章）："stage"（ステージ） / "food"（飲食） / "exhibit"（展示企画・そのほか）
export function categoryOf(genre) {
  const g = String(genre || "");
  if (/ステージ|演奏|ライブ|発表|演劇|ダンス/.test(g)) return "stage";
  if (/飲食|食べ|フード|カフェ|喫茶/.test(g)) return "food";
  return "exhibit";
}

async function fetchTable(u, kind) {
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error("スプレッドシートが公開されていないようです（共有を「リンクを知っている全員」にしてください）");
  const t = tableToExhibits(parseCsv(text), kind);
  if (t.error) throw new Error(t.error);
  return t;
}

// 団体名をくらべるための形（空白・記号のちがいを気にしない）
export const groupKey = (s) => norm(s).replace(/[()（）「」『』・,、.。!！?？]/g, "");

// フォームの回答を、出し物の表に「団体名」でかさねる（元の一覧は変えずに、新しい一覧を返す）。
// 同じ団体が何回も送ったときは、あとの回答が勝つ（書いた項目だけ上書き）。場所とジャンルは表のまま
export function mergeForms(list, forms) {
  const out = list.map((e) => ({ ...e }));
  const byKey = new Map(); // 同じ団体が何行もあるとき（ステージの1日目・2日目など）は、全部の行にかさねる
  for (const e of out) { const k = groupKey(e.group); if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); }
  const unmatched = [];
  for (const f of forms) {
    const es = f.group && byKey.get(groupKey(f.group));
    if (!es) { unmatched.push(f); continue; }
    for (const e of es) {
      for (const k of ["desc", "image"]) if (f[k]) e[k] = f[k];
      if (es.length === 1) for (const k of ["title", "time"]) if (f[k]) e[k] = f[k]; // 時間・名前は1行だけのときに上書き
      e.fromForm = (e.fromForm || 0) + 1;
    }
  }
  return { list: out.map((e) => Object.freeze(e)), unmatched };
}

// 前に読めたデータを、このブラウザにとっておく（ネットが切れたり、表が一時的におかしくなったりしたときに使う）
const CACHE_KEY = "festival-exhibits-v1";
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), url: FESTIVAL.sheetUrl || "", ...data })); } catch { /* 保存できなくても動く */ }
}
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || !Array.isArray(c.list) || (c.url || "") !== (FESTIVAL.sheetUrl || "")) return null; // 別のシートのデータは使わない
    return c;
  } catch { return null; }
}

// 出し物データを読む。
//   シートがあるとき：シート → （だめなら）前に読めたデータ → （それもなければ）data/exhibits.csv
//   シートがないとき：data/exhibits.csv → （だめなら）前に読めたデータ
//   フォームの回答のシートがあれば、それもかさねる（フォームが読めなくても、出し物の表はそのまま出す）
//   返り値の ok が false のときは、最新のデータではない（source でどこから読んだかがわかる）
export async function loadExhibits({ useCache = true } = {}) {
  const url = sheetCsvUrl(FESTIVAL.sheetUrl);
  const tries = url ? [["sheet", url], ["cache"], ["local", LOCAL_CSV]] : [["local", LOCAL_CSV], ["cache"]];
  let error = "", base = null, source = "none", warnings = [], cachedAt = 0;
  for (const [src, u] of tries) {
    if (src === "cache") {
      const c = useCache && loadCache();
      if (c) { base = c.list; source = "cache"; cachedAt = c.at; break; }
      continue;
    }
    try { const t = await fetchTable(u, "main"); base = t.list; warnings = t.warnings; source = src; break; }
    catch (e) { error = error || String(e.message || e); }
  }
  let list = base || [];
  let forms = [], formError = "", unmatched = [];
  const furl = sheetCsvUrl(FESTIVAL.formSheetUrl);
  if (furl && source !== "cache") {
    try { forms = (await fetchTable(furl, "form")).list; ({ list, unmatched } = mergeForms(list, forms)); }
    catch (e) { formError = String(e.message || e); }
  }
  const ok = source === (url ? "sheet" : "local") && !formError;
  if (ok) saveCache({ list });
  return { list, source, ok, error, warnings, forms, formError, unmatched, cachedAt };
}

// 出し物に、地図の上の場所（部屋・屋外）を結びつけた、新しい一覧を作る（元の一覧・部屋のデータは変えない）
export function resolveExhibits(list, rooms, sites = []) {
  return list.map((e, i) => {
    const m = matchPlace(e.place, rooms, sites);
    return { ...e, key: `${e.line || i}`, room: m?.room || null, site: m?.site || null, alias: m?.alias || "", placeWarn: m?.warn || "" };
  });
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
  // 別名（「屋外テント」など。festival-config.js の placeAliases）
  const base = raw.normalize("NFKC").replace(/\s*\d+$/, ""); // 「屋外テント3」→「屋外テント」
  const alias = Object.entries(FESTIVAL.placeAliases || {}).find(([k]) => norm(k) === norm(raw) || norm(k) === norm(base));
  if (alias) { const m = matchPlace(alias[1], rooms, sites); return m && { ...m, alias: raw }; }
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

// 名前を、読みやすい所（文節の切れ目）だけで改行できる HTML にする。
//   改行してよい所：助詞（の・は・が…）や句読点・！？の後ろ、かっこの前、ひらがなとカタカナ・漢字・英字の変わり目、空白
//   「たこ焼／き」「アズマニ／ア」のような、言葉の途中での改行はしない（CSS の word-break: keep-all と組み合わせて使う）
const SEG = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
const kind = (ch) => !ch ? "" : /[ぁ-ゟ]/.test(ch) ? "h" : /[゠-ヿｦ-ﾟ]/.test(ch) ? (ch === "ー" ? "-" : "k") : /[一-鿿々]/.test(ch) ? "c" : /[A-Za-z0-9]/.test(ch) ? "l" : "p";
const PARTICLE = /^(の|は|が|を|に|で|と|へ|も|や|か|な|ね|よ|から|まで|より|って)$/;
const OPEN = /^[（(「『【〈《［\[]/, CLOSE = /[、。，．！？!?）)」』】〉》］\]・]$/, WAVE = /^[〜～]$/;
export function phraseHtml(text) {
  const t = String(text ?? "");
  if (!SEG) return esc(t);
  const segs = [...SEG.segment(t)].map((x) => x.segment);
  let out = "";
  segs.forEach((cur, i) => {
    out += esc(cur);
    const next = segs[i + 1];
    if (!next || /\s$/.test(cur) || /^\s/.test(next)) return; // 空白はもともと改行できる
    const a = cur.at(-1), b = next[0], ka = kind(a), kb = kind(b);
    let ok = false;
    if (PARTICLE.test(cur) && !CLOSE.test(b) && !PARTICLE.test(next)) ok = true;     // 「本気の／たこ焼き」
    else if (CLOSE.test(a) && !CLOSE.test(b)) ok = true;                                // 「MBTI風！／天星術」
    else if (OPEN.test(b) || (WAVE.test(next) && i + 2 < segs.length)) ok = true;     // 「一本堂？／（いっぽんどう？）」「栁家／～これ…」
    else if (ka && kb && ka !== kb && !(ka === "c" && kb === "h") && kb !== "-" && ka !== "p" && kb !== "p") ok = true; // 「つぶつぶ／プラネット」（「焼き」の送りがなは切らない）
    else if (ka === "k" && kb === "k" && [...cur].length >= 3 && [...next].length >= 3) ok = true; // 「ジュラシック／シンフォニー」
    if (ok) out += "<wbr>";
  });
  return out;
}

// 文節ごとに、途中で改行しないかたまり（<span class="ph">）にした HTML。改行はかたまりのあいだだけでおこる。
// かたまりの幅はブラウザがはかるので、名前の枠は自然にいちばん長い文節より細くならない
export function phraseSpans(text) {
  return phraseHtml(text).split("<wbr>")
    .map((part) => part.split(/(\s+)/).map((x) => (!x ? "" : /^\s+$/.test(x) ? " " : `<span class="ph">${x}</span>`)).join(""))
    .join("<wbr>");
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

// 画像の URL（Google ドライブの共有リンクは、画像として表示できる形に変える）
// 「画像」の欄には何枚でも書ける（改行・カンマ・空白で区切る。フォームで複数アップロードしたときもこの形）
export const imageList = (s) => String(s || "").split(/[\s,、]+/).map(imageUrl).filter(Boolean);

export function imageUrl(u) {
  if (!u) return "";
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return /^https?:\/\/[^\s"'<>]+$|^images\/[\w./-]+$/.test(u) && !/\.\./.test(u) ? u : "";
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
