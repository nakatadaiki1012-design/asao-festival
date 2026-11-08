// 模様づくりの道具（読み込みを速くするため、細かい粒は1つずつ描かずに、画素を直接書きかえる）

// 細かい粒をたくさん散らす。colors：[r, g, b] の候補、alphaMax：いちばん濃いときの濃さ（0〜1）、sw・sh：粒の幅と高さ（高さは関数でもよい）
export function speckle(ctx, W, H, n, colors, alphaMax, sw = 2, sh = 2) {
  // 粒だけを透明な画像に書き、それを上から重ねる（もとの絵を読み出さないので速い）
  const img = new ImageData(W, H), d = img.data;
  for (let i = 0; i < n; i++) {
    const c = colors[(Math.random() * colors.length) | 0], a = (Math.random() * alphaMax * 255) | 0;
    const x0 = (Math.random() * W) | 0, y0 = (Math.random() * H) | 0, h = typeof sh === "function" ? sh() : sh;
    for (let y = y0; y < y0 + h && y < H; y++) for (let x = x0; x < x0 + sw && x < W; x++) {
      const k = (y * W + x) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = a;
    }
  }
  const tmp = document.createElement("canvas");
  tmp.width = W; tmp.height = H;
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

// hsl（色相0〜360、彩度・明るさ0〜100）を [r, g, b] に
export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
