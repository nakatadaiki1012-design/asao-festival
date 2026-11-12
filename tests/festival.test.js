// 出し物データがこわれないことを確かめるテスト。実行：npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, tableToExhibits, mergeForms, matchPlace, resolveExhibits, clean, imageUrl, imageList, categoryOf, sheetCsvUrl, loadExhibits, rowWarnings, MAX_ROWS } from "../js/festival.js";
import { baseRooms } from "../js/rooms.js";
import { SITE_INFO, SITE } from "../js/info.js";

const rooms = baseRooms();
const sites = SITE_INFO.filter((it) => !it.key || SITE[it.key]);
const HEAD = "場所,団体名,出し物名,ジャンル,時間,説明,画像,非表示";

test("リポジトリの data/exhibits.csv は、全部の行が地図の場所に結びつく", () => {
  const t = tableToExhibits(parseCsv(readFileSync(new URL("../data/exhibits.csv", import.meta.url), "utf8")));
  assert.equal(t.error, "");
  assert.ok(t.list.length > 0);
  for (const e of resolveExhibits(t.list, rooms, sites)) assert.ok(e.room || e.site, `${e.line}行目「${e.place}」が見つからない`);
});

test("CSV：引用符の中のカンマ・改行・引用符をこわさない", () => {
  const rows = parseCsv(`a,b\n"1,2","x\n""y"""\r\n`);
  assert.deepEqual(rows, [["a", "b"], ["1,2", 'x\n"y"']]);
});

test("見出しが消えた・ずれた表は使わない（地図をこわさない）", () => {
  assert.ok(tableToExhibits(parseCsv("2-4,2年4組,お化け屋敷\n")).error);
  assert.ok(tableToExhibits(parseCsv("団体名,説明\nA,B\n")).error, "場所の列がない");
  assert.ok(tableToExhibits([]).error, "空の表");
  assert.equal(tableToExhibits(parseCsv(`${HEAD}\n2-4,2年4組,お化け屋敷,お化け屋敷,,,,\n`)).error, "");
});

test("見出しの順番が入れかわっても、正しい項目に入る", () => {
  const { list } = tableToExhibits(parseCsv("出し物名,場所,団体名\nたこ焼き,屋外テント,1年3組\n"));
  assert.deepEqual([list[0].title, list[0].place, list[0].group], ["たこ焼き", "屋外テント", "1年3組"]);
});

test("「紹介画像」は画像、「紹介文」は説明に入る（フォームの見出し）", () => {
  const { list } = tableToExhibits(parseCsv("タイムスタンプ,団体名,紹介文,紹介画像\n1,2年4組,こんにちは,https://example.com/a.jpg\n"), "form");
  assert.equal(list[0].desc, "こんにちは");
  assert.equal(list[0].image, "https://example.com/a.jpg");
});

test("非表示の行・空の行は出さない", () => {
  const { list } = tableToExhibits(parseCsv(`${HEAD}\n2-4,A,a,,,,,○\n,,,,,,,\n2-3,B,b,,,,,\n`));
  assert.deepEqual(list.map((e) => e.group), ["B"]);
});

test("値をきれいにする：見えない文字をのぞき、長すぎるものは切る", () => {
  assert.equal(clean("  あ​い\u0007  "), "あい");
  assert.equal(clean("a\n\n\n\nb"), "a\n\nb");
  assert.equal([...clean("あ".repeat(100), 10)].length, 11);
  const { list } = tableToExhibits(parseCsv(`${HEAD}\n2-4,A,${"長".repeat(200)},,,,,\n`));
  assert.ok([...list[0].title].length <= 61);
});

test("行が多すぎるときは、上限で止める", () => {
  const body = Array.from({ length: MAX_ROWS + 20 }, (_, i) => `2-4,G${i},t,,,,,`).join("\n");
  const t = tableToExhibits(parseCsv(`${HEAD}\n${body}\n`));
  assert.equal(t.list.length, MAX_ROWS);
  assert.ok(t.warnings.length);
});

test("読み込んだデータは書きかえられない（こわれない）", () => {
  const { list } = tableToExhibits(parseCsv(`${HEAD}\n2-4,A,a,,,,,\n`));
  assert.throws(() => { "use strict"; list[0].title = "x"; });
});

test("フォームをかさねても、元の一覧は変わらない", () => {
  const { list } = tableToExhibits(parseCsv(`${HEAD}\n2-4,2年4組,お化け屋敷,,,もとの説明,,\n`));
  const forms = tableToExhibits(parseCsv("団体名,紹介文\n2年４組,新しい説明\n知らない団体,x\n"), "form").list;
  const r = mergeForms(list, forms);
  assert.equal(list[0].desc, "もとの説明");
  assert.equal(r.list[0].desc, "新しい説明");
  assert.equal(r.list[0].place, "2-4", "場所はフォームで変わらない");
  assert.equal(r.unmatched.length, 1);
});

test("場所の書き方のゆれ", () => {
  const at = (p) => { const m = matchPlace(p, rooms, sites); return m?.room ? `${m.room.floor}:${m.room.name}` : m?.site?.name; };
  assert.equal(at("2-4"), at("2年4組"));
  assert.equal(at("２－４"), at("2-4"));
  assert.equal(at("屋外テント3"), "1号館と2号館のあいだ");
  assert.equal(at("中庭"), "中庭");
  assert.equal(at("存在しない部屋"), undefined);
});

test("画像の URL：安全な形だけ使う", () => {
  assert.equal(imageUrl("javascript:alert(1)"), "");
  assert.equal(imageUrl('https://a.jp/x.jpg" onerror="x'), "");
  assert.equal(imageUrl("images/../../secret"), "");
  assert.equal(imageUrl("images/2026/1-1.jpg"), "images/2026/1-1.jpg");
  assert.match(imageUrl("https://drive.google.com/file/d/ABC_def-1/view?usp=sharing"), /thumbnail\?id=ABC_def-1/);
  assert.equal(imageList("images/a.jpg, images/b.jpg\nhttps://x.jp/c.png").length, 3);
});

test("ジャンルから、パンフレットの章を決める", () => {
  assert.equal(categoryOf("ステージ"), "stage");
  assert.equal(categoryOf("飲食"), "food");
  assert.equal(categoryOf("お化け屋敷"), "exhibit");
  assert.equal(categoryOf(""), "exhibit");
});

test("1行ずつの注意", () => {
  assert.ok(rowWarnings({ title: "", place: "2-4", genre: "なぞ" }).length >= 2);
  assert.equal(rowWarnings({ title: "a", place: "2-4", genre: "飲食", image: "images/a.jpg" }).length, 0);
});

test("スプレッドシートの URL → CSV の URL（見出しは1行目だけ）", () => {
  assert.equal(sheetCsvUrl("https://docs.google.com/spreadsheets/d/AbC-1_x/edit#gid=42"), "https://docs.google.com/spreadsheets/d/AbC-1_x/gviz/tq?tqx=out:csv&headers=1&gid=42");
});

test("読み込みに失敗しても、前に読めたデータを使う", async () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  const csv = `${HEAD}\n2-4,2年4組,お化け屋敷,,,,,\n`;
  globalThis.fetch = async () => new Response(csv);
  const a = await loadExhibits();
  assert.equal(a.ok, true);
  assert.equal(a.list.length, 1);
  // こんどは見出しがこわれた表が返ってくる
  globalThis.fetch = async () => new Response("2-4,2年4組\n");
  const b = await loadExhibits();
  assert.equal(b.ok, false);
  assert.equal(b.source, "cache");
  assert.equal(b.list[0].title, "お化け屋敷");
  // ネットが切れた
  globalThis.fetch = async () => { throw new Error("offline"); };
  const c = await loadExhibits();
  assert.equal(c.source, "cache");
  assert.equal(c.list.length, 1);
  // 管理画面（useCache:false）は、こわれていることをそのまま見せる
  const d = await loadExhibits({ useCache: false });
  assert.equal(d.ok, false);
  assert.equal(d.list.length, 0);
  assert.ok(d.error);
});
