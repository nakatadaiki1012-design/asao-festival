// 部屋の一覧（図面の部屋 ＋ 分けた部屋 ＋ 追加した部屋、書きかえを反映したもの）。
// 3D表示（app.js）と管理画面（admin.html）の両方で同じ一覧を使う。
import { ROOMS_RAW } from "./data.js";
import { describe, ROOM_EDITS, EXTRA_ROOMS, ROOM_SPLITS } from "./info.js";

export function baseRooms() {
  const splitRooms = ROOMS_RAW.filter((r) => r.name !== "窯").flatMap((r) => { // 窯は工芸教室の中の家具にする
    const sp = ROOM_SPLITS.find((x) => x.name === r.name && x.floor === r.floor && x.r0 === r.r0);
    if (!sp) return [r];
    const w = (r.c1 - r.c0 + 1) / sp.n;
    return Array.from({ length: sp.n }, (_, i) => ({ ...r, id: `${r.id}-${i + 1}`, name: sp.names?.[i] ?? `${r.name}${i + 1}`, c0: r.c0 + w * i, c1: r.c0 + w * (i + 1) - 1 }));
  });
  return [...splitRooms, ...EXTRA_ROOMS].map((r) => {
    const ed = ROOM_EDITS.find((e) => e.name === r.name && e.floor === r.floor && (e.at === undefined || e.at === r.c0) && (e.atR === undefined || e.atR === r.r0)); // atR：図面の上の行で区別
    if (ed) r = { ...r, ...ed.set };
    const d = describe(r.name);
    return { ...r, ...d, ...(r.desc ? { desc: r.desc } : {}), kind: "room" }; // ROOM_EDITS で紹介文を書いたときはそれを使う
  }).filter((r) => !r.remove); // ROOM_EDITS の remove: true で消す部屋
}
