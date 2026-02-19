const palette = {
  outline: '#0e1f3b',
  snowA: '#e9f7ff',
  snowB: '#cae8ff',
  snowC: '#8dc8f7',
  coat: '#ff4c6d',
  coatDark: '#b22d4a',
  skin: '#ffc189',
  shovel: '#f6b73c',
  metal: '#d7e8ff',
  plowBody: '#ffd742',
  plowDark: '#e59f00',
  plowBlade: '#c7d6ef',
  uiA: '#ffea73',
  uiB: '#ff8f66'
};

function drawPixels(ctx, pattern, x, y, scale, colors) {
  for (let row = 0; row < pattern.length; row += 1) {
    const line = pattern[row];
    for (let col = 0; col < line.length; col += 1) {
      const key = line[col];
      if (key === '.') continue;
      ctx.fillStyle = colors[key];
      ctx.fillRect(Math.round(x + col * scale), Math.round(y + row * scale), scale, scale);
    }
  }
}

const playerPattern = [
  '..ooo...',
  '.osss...',
  '.sccsmmm',
  'osccsshm',
  'osccsshm',
  '.sddssm.',
  '.d..d...',
  '.d..d...'
];

const plowPattern = [
  '...yyyyyyyyyy....',
  '..yydyyyyyyydd...',
  '.yddyyyyyyyyydd..',
  'yyyddyyydddyddddd',
  'yyyddyyyyyyyyyddd',
  '.bbbbbbbbbbbbbb..',
  '..w...w.....w....'
];

const snowChunkPattern = [
  '.aa.',
  'abca',
  'acba',
  '.aa.'
];

const sparkPattern = [
  '.u.',
  'uuu',
  '.u.'
];

function makeSprite(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return canvas;
}

export function createSprites() {
  const player = makeSprite(64, 64, (ctx) => {
    drawPixels(ctx, playerPattern, 4, 8, 6, {
      o: palette.outline,
      s: palette.skin,
      c: palette.coat,
      d: palette.coatDark,
      h: palette.shovel,
      m: palette.metal
    });
  });

  const plow = makeSprite(196, 96, (ctx) => {
    drawPixels(ctx, plowPattern, 2, 12, 10, {
      y: palette.plowBody,
      d: palette.plowDark,
      b: palette.plowBlade,
      w: palette.outline
    });
  });

  const snowChunk = makeSprite(32, 32, (ctx) => {
    drawPixels(ctx, snowChunkPattern, 0, 0, 8, {
      a: palette.snowA,
      b: palette.snowB,
      c: palette.snowC
    });
  });

  const spark = makeSprite(24, 24, (ctx) => {
    drawPixels(ctx, sparkPattern, 0, 0, 8, {
      u: palette.uiA
    });
  });

  return { palette, player, plow, snowChunk, spark };
}
