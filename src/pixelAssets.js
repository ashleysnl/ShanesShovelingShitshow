const palette = {
  outline: '#20394f',
  snowA: '#f3fbff',
  snowB: '#d8ecf7',
  snowC: '#b3d4e6',
  coat: '#7a9fb6',
  coatDark: '#5f7e95',
  skin: '#f6c39e',
  shovel: '#d68548',
  metal: '#c5d7e4',
  plowBody: '#ffd742',
  plowDark: '#e59f00',
  plowBlade: '#d2e3ee',
  uiA: '#ffd676',
  uiB: '#d58f65'
};

const ART_SOURCES = {
  shane: 'assets/Shane.webp',
  plough: 'assets/Plough.webp',
  scoop: 'assets/Scoop.webp',
  honda: 'assets/Honda.webp',
  higdon: 'assets/Higdon.webp',
  snowman: 'assets/Snowman.webp',
  snowburst: 'assets/Snowburst.webp',
  house: 'assets/House.webp',
  driveway: 'assets/Driveway.webp'
};

const BLACK_KEYED = new Set(['shane', 'plough', 'scoop', 'honda', 'higdon', 'snowman', 'snowburst']);

const FRAMES = {
  shane: { x: 0, y: 0, w: 270, h: 417 },
  plough: { x: 4, y: 8, w: 1068, h: 480 },
  scoop: { x: 68, y: 54, w: 690, h: 788 },
  honda: { x: 18, y: 30, w: 576, h: 562 },
  higdon: { x: 0, y: 0, w: 410, h: 845 },
  snowman: { x: 616, y: 6, w: 344, h: 386 },
  snowburst: { x: 0, y: 0, w: 416, h: 382 }
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
  '...oooo.....',
  '..osssso....',
  '.osccccso...',
  '.osccccso...',
  '.osccccsohhh',
  '..sccccsmhhm',
  '..sddddsmhmm',
  '.osddddso...',
  '.o.d..d.o...',
  '.o.d..d.o...',
  '..o....o....',
  '............'
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

function keyOutNearBlack(image, threshold = 22) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= threshold && g <= threshold && b <= threshold) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function cropCanvas(image, frame) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  return canvas;
}

export function createSprites() {
  const player = makeSprite(64, 64, (ctx) => {
    drawPixels(ctx, playerPattern, 4, 7, 4, {
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

  const art = { raw: {}, processed: {}, frames: {} };

  Object.entries(ART_SOURCES).forEach(([name, src]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    art.raw[name] = image;

    image.addEventListener('load', () => {
      const keyed = BLACK_KEYED.has(name) ? keyOutNearBlack(image) : image;
      art.processed[name] = keyed;
      art.frames[name] = FRAMES[name] ? cropCanvas(keyed, FRAMES[name]) : keyed;
    });
  });

  return { palette, player, plow, snowChunk, spark, art };
}
