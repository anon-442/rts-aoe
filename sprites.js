// ============================================================
// AGE OF PIXELS — procedural pixel-art sprites
// Everything is drawn in code onto offscreen canvases, so the
// game needs zero image assets. 1 ascii char / chunk = 2 screen px.
// ============================================================

const Sprites = (() => {
  const PX = 2; // pixel chunk size
  const cache = {};

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return c;
  }

  // Draw an ascii-map sprite. pal maps char -> color. 'T'/'t' = team colors.
  function fromAscii(rows, pal, team, flip) {
    const w = rows[0].length, h = rows.length;
    const c = mkCanvas(w * PX, h * PX);
    const ctx = c.getContext('2d');
    const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][flip ? w - 1 - x : x];
        if (ch === '.' || ch === ' ') continue;
        let col = pal[ch];
        if (ch === 'T') col = tc.main;
        if (ch === 't') col = tc.dark;
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    return c;
  }

  // Common palette
  const P = {
    o: '#1b1b29',  // outline
    S: '#e8b88a', s: '#c08b5c',          // skin
    B: '#8a5a2b', b: '#5e3c1c',          // brown wood/leather
    G: '#9aa3ad', g: '#5c646e',          // metal
    W: '#e8e4d8', w: '#b8b2a0',          // cloth light
    Y: '#e8c84a', y: '#b08f1e',          // gold
    R: '#c23b2e',                        // red accent
    H: '#6e4a2e', h: '#4a3220',          // horse
    D: '#3a3a4a',                        // dark grey
  };

  // ---------------- Unit ascii art (facing right) ----------------
  const UNIT_ART = {
    villager: [
      '....ooo.....',
      '...oSSSo....',
      '...oSsSo....',
      '....oso..o..',
      '...oTTTo.Bo.',
      '..oTTTTToBo.',
      '..oToTTo.Bo.',
      '...oTTo..o..',
      '...obbo.....',
      '...oBBo.....',
      '...oBoBo....',
      '...ob.obo...',
      '....o...o...',
    ],
    infantry: [
      '....oGGo....',
      '...oGGGGo...',
      '...oGSsGo...',
      '....oso.oGo.',
      '..ooTTTo.Go.',
      '.oWoTTTToGo.',
      '.oWWoTTo.Go.',
      '.oWWoTTo.o..',
      '..ooobbo....',
      '...oGGGo....',
      '...oGoGo....',
      '...og.ogo...',
      '....o...o...',
    ],
    archer: [
      '....ooo..o..',
      '...oTTTo.Bo.',
      '...oSsSoB.o.',
      '....oso.B.o.',
      '...oTTToB.o.',
      '..oTTTTTB.o.',
      '..oToTToB.o.',
      '...oTTo.B.o.',
      '...obbo..o..',
      '...oBBo.....',
      '...oBoBo....',
      '...ob.obo...',
      '....o...o...',
    ],
    knight: [
      '......oGo.......',
      '.....oGGGo..o...',
      '.....oGsGo.oGo..',
      '....ooToo..oGo..',
      '..ooTTTTToooGo..',
      '.oTTtTTtTTToGo..',
      '.oTtHHHHHHtoo...',
      '.oToHHHHHHHHo...',
      '..ooHhHHHhHHHo..',
      '...oHHoHHHoHHo..',
      '...oHo..oHo.oo..',
      '...oho..oho.....',
      '....o....o......',
    ],
    ram: [
      '..oooooooooooo..',
      '.oBBBBBBBBBBBBo.',
      'oBbBBbBBbBBbBBBo',
      'oBBBBBBBBBBBBBBo',
      '.obbbbbbbbbbbbo.',
      '..oBo.oBo.oBo...',
      'ooBBooBBooBBoooo',
      'obbbbbbbbbbbbggo',
      '..oo..oo..oo.oo.',
    ],
    catapult: [
      '......o.........',
      '.....oBo....o...',
      '.....oBo...oYo..',
      '.....oBBo..oo...',
      '......oBBoo.....',
      '.......oBBo.....',
      '..oo....oBBo....',
      '.oBBoooooBBBo...',
      'oBbBBBBBBBBbBo..',
      'obBBBBBBBBBBbo..',
      '.oo.oo..oo.oo...',
    ],
  };

  // Walk animation: frame 1 mirrors the leg rows (alternate stride)
  const LEG_ROWS = { villager: 3, infantry: 3, archer: 3, knight: 3, ram: 2, catapult: 2 };

  function unitRows(key, frame) {
    const rows = UNIT_ART[key];
    if (!frame) return rows;
    const n = LEG_ROWS[key] || 0;
    const out = rows.slice();
    for (let i = rows.length - n; i < rows.length; i++) {
      out[i] = rows[i].split('').reverse().join('');
    }
    return out;
  }

  function unit(key, team, flip, frame) {
    frame = frame || 0;
    const ck = 'u_' + key + '_' + team + '_' + (flip ? 1 : 0) + '_' + frame;
    if (!cache[ck]) cache[ck] = fromAscii(unitRows(key, frame), P, team, flip);
    return cache[ck];
  }

  // ---------------- Animated team flag (2 frames, waving) ----------------
  function flag(team, frame) {
    const ck = 'fl_' + team + '_' + frame;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(18, 26);
    const p = chunk(c.getContext('2d'));
    const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
    p(0, 0, 1, 13, '#2c2c3a');           // pole
    p(0, 0, 1, 1, '#e8c84a');            // gold finial
    if (frame === 0) {
      p(1, 1, 6, 2, tc.main);
      p(1, 3, 5, 2, tc.main);
      p(1, 5, 3, 1, tc.dark);
    } else {
      p(1, 1, 4, 2, tc.main); p(5, 2, 2, 1, tc.main);
      p(1, 3, 6, 2, tc.main);
      p(2, 5, 3, 1, tc.dark);
    }
    cache[ck] = c;
    return c;
  }

  // ---------------- Terrain tiles ----------------
  // A 64x32 diamond. variant 0..7 = 4 shades x 2 jitter patterns
  const GRASS_SHADES = [
    ['#3f7430', '#356428', '#4d8a3c'],   // dark patch
    ['#488138', '#3a7030', '#579645'],
    ['#508c3e', '#427a34', '#62a44e'],
    ['#5a9846', '#4a863a', '#6fae52'],   // light patch
  ];
  function grassTile(variant) {
    const ck = 'grass' + variant;
    if (cache[ck]) return cache[ck];
    const [base, dark, light] = GRASS_SHADES[variant >> 1];
    const c = mkCanvas(CFG.TILE_W, CFG.TILE_H);
    const ctx = c.getContext('2d');
    diamondPath(ctx, 0, 0, CFG.TILE_W, CFG.TILE_H);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    diamondPath(ctx, 0, 0, CFG.TILE_W, CFG.TILE_H);
    ctx.clip();
    // strong dithering + short grass blades, deterministic per variant
    let seed = 7 + variant * 131;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    ctx.fillStyle = light;
    for (let i = 0; i < 30; i++) ctx.fillRect((rnd() * 62 | 0) & ~1, (rnd() * 30 | 0) & ~1, 2, 2);
    ctx.fillStyle = dark;
    for (let i = 0; i < 26; i++) ctx.fillRect((rnd() * 62 | 0) & ~1, (rnd() * 30 | 0) & ~1, 2, 2);
    for (let i = 0; i < 7; i++) ctx.fillRect((rnd() * 60 | 0) & ~1, (rnd() * 26 | 0) & ~1, 2, 4); // blades
    ctx.restore();
    // micro-relief: light NW edge, dark SE edge
    ctx.strokeStyle = 'rgba(255,255,220,0.10)';
    ctx.beginPath();
    ctx.moveTo(1, CFG.TILE_H / 2); ctx.lineTo(CFG.TILE_W / 2, 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,20,0.22)';
    ctx.beginPath();
    ctx.moveTo(CFG.TILE_W - 1, CFG.TILE_H / 2); ctx.lineTo(CFG.TILE_W / 2, CFG.TILE_H - 1);
    ctx.stroke();
    cache[ck] = c;
    return c;
  }

  // animated water tile (3 frames cycled for shimmer)
  function waterTile(frame) {
    const ck = 'water' + frame;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(CFG.TILE_W, CFG.TILE_H);
    const ctx = c.getContext('2d');
    diamondPath(ctx, 0, 0, CFG.TILE_W, CFG.TILE_H);
    ctx.fillStyle = '#2c5c92';
    ctx.fill();
    ctx.save();
    diamondPath(ctx, 0, 0, CFG.TILE_W, CFG.TILE_H);
    ctx.clip();
    let seed = 31 + frame * 157;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    ctx.fillStyle = '#3a73ae';
    for (let i = 0; i < 12; i++) ctx.fillRect((rnd() * 58 | 0) & ~1, (rnd() * 28 | 0) & ~1, 8, 2);
    ctx.fillStyle = '#234a78';
    for (let i = 0; i < 9; i++) ctx.fillRect((rnd() * 58 | 0) & ~1, (rnd() * 28 | 0) & ~1, 6, 2);
    ctx.fillStyle = '#8ab8e0'; // sparkles
    for (let i = 0; i < 5; i++) ctx.fillRect((rnd() * 58 | 0) & ~1, (rnd() * 28 | 0) & ~1, 4, 2);
    ctx.restore();
    // darker shoreline
    diamondPath(ctx, 0, 0, CFG.TILE_W, CFG.TILE_H);
    ctx.strokeStyle = 'rgba(10,24,46,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    cache[ck] = c;
    return c;
  }

  // impassable mountain peak (2 variants)
  function mountain(variant) {
    const ck = 'mtn' + variant;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(56, 60);
    const p = chunk(c.getContext('2d'));
    const o = '#1d2026', d = '#4a525c', m = '#5e6670', l = '#737d88', s = '#e8edf4';
    // silhouette outline
    p(2, 16, 24, 12, o);
    p(6, 8, 16, 10, o);
    p(10, 3, 8, 7, o);
    // rock body
    p(3, 17, 22, 10, d);
    p(7, 9, 14, 9, m);
    p(11, 4, 6, 6, m);
    // lit north-west faces
    p(11, 5, 3, 5, l); p(8, 10, 5, 7, l); p(5, 18, 6, 7, l);
    // crags
    p(14, 12, 1, 8, d); p(18, 15, 1, 9, d); p(9, 20, 1, 6, '#3c434c');
    // snow cap
    p(11, 3, 6, 2, s); p(12, 5, 3, 2, s); p(15, 6, 2, 1, s);
    if (variant === 1) {
      p(20, 12, 4, 4, m); p(21, 10, 2, 2, m); p(21, 10, 2, 1, s); // secondary peak
    }
    p(2, 26, 24, 2, '#3c434c'); // rocky base
    cache[ck] = c;
    return c;
  }

  // crop overlay for farms: stage 1 sprouts, 2 young plants, 3 golden wheat
  function crops(stage) {
    const ck = 'crops' + stage;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(128, 64);
    const ctx = c.getContext('2d');
    ctx.save();
    diamondPath(ctx, 4, 2, 120, 60);
    ctx.clip();
    let seed = 41 + stage * 97;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 84; i++) {
      const x = (8 + rnd() * 110 | 0) & ~1, y = (4 + rnd() * 52 | 0) & ~1;
      if (stage === 1) {
        ctx.fillStyle = '#5aa040';
        ctx.fillRect(x, y + 4, 2, 2);
      } else if (stage === 2) {
        ctx.fillStyle = '#3d8a36';
        ctx.fillRect(x, y + 1, 2, 5);
        ctx.fillStyle = '#56a648';
        ctx.fillRect(x, y + 1, 2, 2);
      } else {
        ctx.fillStyle = '#b08f1e';
        ctx.fillRect(x, y + 2, 2, 5);
        ctx.fillStyle = '#e8c84a';
        ctx.fillRect(x - 2, y, 4, 3);
        ctx.fillStyle = '#f0da7a';
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.restore();
    cache[ck] = c;
    return c;
  }

  // small ground decorations scattered on tiles
  function decal(kind) {
    const ck = 'dec' + kind;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(28, 14);
    const p = chunk(c.getContext('2d'));
    if (kind === 1) {        // flowers
      p(2, 3, 1, 1, '#e8e4d8'); p(3, 2, 1, 1, '#e8c84a');
      p(9, 4, 1, 1, '#e89ab0'); p(10, 3, 1, 1, '#e8e4d8');
      p(6, 5, 1, 1, '#e8c84a');
    } else if (kind === 2) { // grass tuft
      p(3, 3, 1, 3, '#2e5c24'); p(5, 2, 1, 4, '#356428');
      p(7, 3, 1, 3, '#2e5c24'); p(4, 5, 4, 1, '#2e5c24');
    } else {                 // pebbles
      p(3, 4, 3, 2, '#8a8f98'); p(4, 3, 2, 1, '#9aa3ad');
      p(8, 5, 2, 1, '#7a8088'); p(3, 6, 4, 1, 'rgba(0,0,0,0.25)');
    }
    cache[ck] = c;
    return c;
  }

  // 1px dark outline around a sprite's silhouette (pseudo-depth pop)
  function outline(src) {
    const w = src.width, h = src.height;
    const out = mkCanvas(w, h);
    const octx = out.getContext('2d');
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    octx.fillStyle = '#14101c';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 0) continue; // opaque already
        const solid =
          (x > 0 && d[(y * w + x - 1) * 4 + 3] > 0) ||
          (x < w - 1 && d[(y * w + x + 1) * 4 + 3] > 0) ||
          (y > 0 && d[((y - 1) * w + x) * 4 + 3] > 0) ||
          (y < h - 1 && d[((y + 1) * w + x) * 4 + 3] > 0);
        if (solid) octx.fillRect(x, y, 1, 1);
      }
    }
    octx.drawImage(src, 0, 0);
    return out;
  }

  function diamondPath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  }

  // Chunky pixel helper for programmatic sprites
  function chunk(ctx) {
    return (x, y, w, h, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x * PX, y * PX, (w || 1) * PX, (h || 1) * PX);
    };
  }

  // ---------------- Map features ----------------
  function tree(variant) {
    const ck = 'tree' + variant;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(44, 56);
    const p = chunk(c.getContext('2d'));
    const g0 = '#1d4517', g1 = '#2e6b2a', g2 = '#3d8a36', g3 = '#56a648';
    // trunk
    p(9, 19, 3, 8, '#5e3c1c'); p(9, 19, 1, 8, '#7a5028');
    p(8, 26, 6, 1, '#3a2812');
    // dark canopy silhouette (outline)
    p(3, 3, 15, 14, g0);
    p(2, 6, 17, 8, g0);
    p(6, 1, 9, 3, g0);
    // body
    p(4, 4, 13, 12, g1);
    p(3, 7, 15, 6, g1);
    p(7, 2, 7, 3, g2);
    p(5, 5, 9, 8, g2);
    p(6, 4, 5, 5, g3);
    p(12, 7, 3, 3, g3);
    if (variant === 1) { p(2, 9, 2, 3, g1); p(17, 8, 2, 3, g1); p(8, 3, 3, 2, '#6cb858'); }
    cache[ck] = c;
    return c;
  }

  function stump() {
    if (cache.stump) return cache.stump;
    const c = mkCanvas(20, 12);
    const p = chunk(c.getContext('2d'));
    p(3, 2, 4, 2, '#8a5a2b'); p(3, 1, 4, 1, '#c89858'); p(2, 4, 6, 1, '#4a3015');
    cache.stump = c;
    return c;
  }

  function goldMine() {
    if (cache.gold) return cache.gold;
    const c = mkCanvas(52, 34);
    const p = chunk(c.getContext('2d'));
    // dark base outline
    p(1, 9, 24, 6, '#2a2e34');
    p(3, 4, 20, 7, '#3c424a');
    p(4, 6, 18, 8, '#6e7680');
    p(6, 4, 14, 4, '#828a94');
    p(8, 3, 9, 2, '#9aa3ad');
    p(2, 10, 22, 4, '#5c646e');
    // gold veins
    p(8, 6, 3, 2, '#e8c84a'); p(14, 8, 3, 2, '#e8c84a');
    p(10, 11, 2, 2, '#e8c84a'); p(17, 5, 2, 2, '#f0da7a');
    p(5, 9, 2, 2, '#f0da7a'); p(12, 5, 1, 1, '#fff2b0');
    cache.gold = c;
    return c;
  }

  function berryBush() {
    if (cache.berry) return cache.berry;
    const c = mkCanvas(40, 28);
    const p = chunk(c.getContext('2d'));
    // dark outline so it pops against grass
    p(2, 3, 16, 9, '#142e10');
    p(4, 2, 12, 2, '#142e10');
    p(3, 4, 14, 6, '#235c1e');
    p(5, 3, 10, 3, '#2e7527');
    p(6, 4, 6, 2, '#3a8a30');
    // big bright berries
    p(5, 5, 2, 2, '#e0524a'); p(10, 4, 2, 2, '#e0524a');
    p(14, 6, 2, 2, '#c23b2e'); p(7, 8, 2, 2, '#c23b2e');
    p(12, 8, 2, 2, '#e0524a'); p(3, 7, 2, 2, '#c23b2e');
    cache.berry = c;
    return c;
  }

  // ---------------- Buildings: medieval pixel architecture ----------------
  // Each returns {img, ax, ay, flagX?, flagY?, smokeX?, smokeY?}
  // ax/ay anchor = ground-center of the footprint (in canvas px).
  // flagX/flagY = pole base (px), smokeX/smokeY = chimney mouth (px).
  function building(key, team) {
    const ck = 'b_' + key + '_' + team;
    if (cache[ck]) return cache[ck];
    const tc = TEAM_COLORS[team] || TEAM_COLORS[0];
    let c, p, ctx;
    const make = (w, h) => { c = mkCanvas(w, h); ctx = c.getContext('2d'); p = chunk(ctx); };

    // seeded speckle so every cached canvas is stable
    let seed = 9;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const speckle = (x, y, w, h, colors, n) => {
      for (let i = 0; i < n; i++) {
        p(x + (rnd() * w | 0), y + (rnd() * h | 0), 1, 1, colors[(rnd() * colors.length) | 0]);
      }
    };
    // dressed stone with mortar courses + staggered joints
    const stone = (x, y, w, h, base) => {
      p(x, y, w, h, base || '#7e848e');
      for (let row = 0; ; row++) {
        const my = y + row * 3 + 2;
        if (my >= y + h) break;
        p(x, my, w, 1, '#5a606a');
        const off = row % 2 ? 2 : 0;
        for (let jx = x + off; jx < x + w; jx += 4) {
          p(jx, y + row * 3, 1, 2, '#6a707a');
        }
      }
      speckle(x, y, w, h, ['#8e949e', '#9aa3ad'], (w * h / 6) | 0);
      p(x, y, 1, h, '#5a606a'); p(x + w - 1, y, 1, h, '#4a505a'); // edge shading
    };
    // wattle & daub plaster
    const plaster = (x, y, w, h) => {
      p(x, y, w, h, '#d8cba8');
      speckle(x, y, w, h, ['#cabd9a', '#e2d6b6', '#c2b592'], (w * h / 4) | 0);
    };
    const BEAM = '#4a3220';
    // stepped shingle roof (widens 1 chunk per row each side)
    const roof = (xTop, yTop, wTop, rows, c1, c2) => {
      c1 = c1 || '#a04434'; c2 = c2 || '#b85440';
      for (let i = 0; i < rows; i++) {
        const ry = yTop + i, rx = xTop - i, rw = wTop + 2 * i;
        p(rx, ry, rw, 1, i % 2 ? c1 : c2);
        if (i % 2 === 0) for (let sx = rx + 2; sx < rx + rw - 1; sx += 4) p(sx, ry, 1, 1, '#7a3428');
      }
      p(xTop - 1, yTop - 1, wTop + 2, 1, '#5e2018');                       // ridge cap
      p(xTop - rows, yTop + rows, wTop + 2 * rows, 1, '#3a1410');           // eaves shadow
    };
    // crenellated parapet
    const crenel = (x, y, w) => {
      p(x, y, w, 2, '#6a707a');
      for (let mx = x; mx < x + w; mx += 3) p(mx, y - 2, 2, 2, '#7e848e');
      p(x, y + 1, w, 1, '#4a505a');
    };
    const door = (x, y, w, h) => {
      p(x, y - 1, w, 1, '#2c2218');                  // arch lintel
      p(x, y, w, h, '#4a3220');
      for (let dx = x + 1; dx < x + w; dx += 2) p(dx, y, 1, h, '#3a2812'); // planks
      p(x + 1, y + (h >> 1), 1, 1, '#9aa3ad');       // iron handle
    };
    const window2 = (x, y) => {
      p(x, y, 3, 3, '#241a10');
      p(x - 1, y, 1, 3, '#6e4a2e'); p(x + 3, y, 1, 3, '#6e4a2e'); // shutters
      p(x, y - 1, 3, 1, BEAM);
    };
    const banner = (x, y, h) => {
      p(x, y, 4, h, tc.main);
      p(x, y + h - 1, 1, 1, tc.dark); p(x + 3, y + h - 1, 1, 1, tc.dark);
      p(x + 1, y + h, 2, 1, tc.dark); // swallow tail
      p(x, y, 4, 1, tc.dark);
    };
    let out;

    if (key === 'towncenter') {
      make(124, 108);
      // tower (behind the roof)
      plaster(26, 6, 10, 12);
      p(26, 6, 1, 12, BEAM); p(35, 6, 1, 12, BEAM); p(26, 6, 10, 1, BEAM);
      roof(26, 2, 10, 3, '#8a3a2c', '#a04434');
      // chimney
      stone(46, 8, 5, 12, '#787e88');
      p(45, 8, 7, 1, '#5a606a');
      // main roof
      roof(17, 13, 28, 12);
      // half-timbered hall
      plaster(7, 25, 48, 13);
      p(7, 25, 48, 1, BEAM); p(7, 37, 48, 1, BEAM);
      for (const bx of [7, 18, 30, 42, 54]) p(bx, 25, 1, 13, BEAM);
      for (let i = 0; i < 5; i++) { p(9 + i, 31 + i > 36 ? 36 : 31 + i, 1, 1, BEAM); p(13 - i, 31 + i > 36 ? 36 : 31 + i, 1, 1, BEAM); } // V brace
      // stone foundation
      stone(5, 38, 52, 9);
      p(4, 46, 54, 1, '#3a4048');
      // door + windows + wall banner
      door(27, 40, 8, 7);
      window2(11, 41); window2(48, 41);
      window2(33, 28); window2(21, 28);
      banner(44, 27, 7);
      out = { img: c, ax: 62, ay: 98, flagX: 60, flagY: 6, smokeX: 96, smokeY: 14 };
    }

    else if (key === 'barracks') {
      make(104, 84);
      // keep-like stone block with crenellations
      crenel(7, 12, 38);
      stone(7, 14, 38, 14, '#7a8088');
      // side tower
      crenel(40, 6, 9);
      stone(40, 8, 9, 20, '#828a94');
      p(43, 14, 2, 3, '#241a10'); // slit
      door(20, 21, 7, 7);
      window2(11, 17); window2(31, 17);
      // crossed swords plaque
      p(28, 15, 6, 5, '#5e3c1c');
      p(29, 16, 1, 3, '#d8d8e0'); p(32, 16, 1, 3, '#d8d8e0');
      p(29, 18, 4, 1, '#9aa3ad');
      stone(5, 28, 42, 6, '#6e747e');
      p(4, 33, 44, 1, '#3a4048');
      out = { img: c, ax: 52, ay: 70, flagX: 84, flagY: 14 };
    }

    else if (key === 'stable') {
      make(104, 80);
      // timber barn with hay
      roof(12, 6, 26, 9, '#8a6a34', '#a07e40');     // thatched roof
      plaster(8, 15, 36, 12);
      p(8, 15, 36, 1, BEAM); p(8, 26, 36, 1, BEAM);
      for (const bx of [8, 16, 25, 34, 43]) p(bx, 15, 1, 12, BEAM);
      // big barn door
      p(18, 18, 12, 9, '#4a3220');
      p(19, 19, 10, 8, '#3a2812');
      for (let i = 0; i < 5; i++) { p(19 + i * 2, 19 + i, 1, 1, '#5e3c1c'); p(28 - i * 2, 19 + i, 1, 1, '#5e3c1c'); }
      // hay pile
      p(36, 22, 8, 5, '#c8a23e');
      speckle(36, 22, 8, 5, ['#e8c84a', '#a8842e'], 10);
      // horseshoe sign
      p(12, 18, 4, 1, '#9aa3ad'); p(12, 19, 1, 2, '#9aa3ad'); p(15, 19, 1, 2, '#9aa3ad');
      stone(6, 27, 40, 5, '#6e747e');
      p(5, 31, 42, 1, '#3a4048');
      out = { img: c, ax: 52, ay: 66, flagX: 12, flagY: 12 };
    }

    else if (key === 'workshop') {
      make(104, 80);
      // dark timber workshop, slate roof
      roof(13, 7, 24, 8, '#4a505c', '#5c6470');
      p(8, 15, 36, 12, '#5a4632');
      for (let py = 17; py < 27; py += 3) p(8, py, 36, 1, '#4a3826'); // planks
      p(8, 15, 1, 12, '#3a2c1e'); p(43, 15, 1, 12, '#3a2c1e');
      door(22, 20, 8, 7);
      // big wooden wheel
      p(11, 18, 6, 6, '#8a5a2b');
      p(12, 19, 4, 4, '#241a10');
      p(13, 20, 2, 2, '#8a5a2b');
      // anvil + glow
      p(35, 23, 5, 2, '#3c424a'); p(36, 21, 3, 2, '#4a505a');
      p(33, 25, 2, 1, '#e8843a');
      stone(6, 27, 40, 5, '#6e747e');
      p(5, 31, 42, 1, '#3a4048');
      out = { img: c, ax: 52, ay: 66, flagX: 86, flagY: 16, smokeX: 24, smokeY: 12 };
    }

    else if (key === 'farm') {
      // flat tilled field, 2x2 diamond
      make(128, 64);
      ctx.save();
      diamondPath(ctx, 0, 0, 128, 64); ctx.clip();
      ctx.fillStyle = '#7a5c34'; ctx.fillRect(0, 0, 128, 64);
      for (let i = -6; i < 16; i++) { // furrows along the iso axis
        ctx.fillStyle = i % 2 ? '#8a6a3e' : '#6a4e2c';
        for (let s = 0; s < 40; s++) ctx.fillRect(s * 4 - 16 + i * 8 - s * 2, s * 2, 4, 2);
      }
      ctx.fillStyle = '#a8c84a';
      let s2 = 99; const rr = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 30; i++) ctx.fillRect(rr() * 124 | 0, rr() * 60 | 0, 2, 2);
      ctx.restore();
      diamondPath(ctx, 0, 0, 128, 64);
      ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 2; ctx.stroke();
      // fence posts on the back edges
      for (const [fx, fy] of [[64, 0], [96, 16], [32, 16], [16, 24], [112, 24]]) {
        ctx.fillStyle = '#5e3c1c'; ctx.fillRect(fx - 2, fy - 8, 4, 10);
        ctx.fillStyle = '#8a5a2b'; ctx.fillRect(fx - 2, fy - 8, 4, 2);
      }
      out = { img: c, ax: 64, ay: 32, flat: true };
    }

    else if (key === 'tower') {
      make(60, 96);
      // tapered stone watchtower
      crenel(8, 6, 14);
      stone(8, 8, 14, 12, '#828a94');
      // wooden hoarding ledge
      p(6, 20, 18, 2, '#6e4a2e');
      p(6, 22, 1, 2, '#4a3220'); p(23, 22, 1, 2, '#4a3220');
      stone(9, 22, 12, 16, '#7a8088');
      // arrow slits + window
      p(14, 11, 2, 4, '#241a10');
      p(14, 26, 2, 5, '#241a10');
      p(11, 30, 1, 2, '#241a10'); p(18, 30, 1, 2, '#241a10');
      door(13, 34, 5, 4);
      stone(7, 38, 16, 4, '#6e747e');
      p(6, 41, 18, 1, '#3a4048');
      out = { img: c, ax: 30, ay: 86, flagX: 26, flagY: 12 };
    }

    else if (key === 'market') {
      make(104, 76);
      // timber stall with team awning
      for (let i = 0; i < 7; i++) {
        const ry = 8 + i, rx = 10 - i, rw = 32 + 2 * i;
        ctx.fillStyle = i % 2 ? '#e8e4d8' : tc.main;
        ctx.fillRect(rx * PX, ry * PX, rw * PX, PX);
      }
      p(3, 15, 46, 1, tc.dark);
      // posts
      p(4, 16, 2, 12, '#5e3c1c'); p(46, 16, 2, 12, '#5e3c1c');
      // counter
      p(8, 21, 36, 5, '#8a6a3e');
      p(8, 21, 36, 1, '#a8845c');
      // goods: gold sacks, apples, cloth bolts
      p(11, 18, 4, 3, '#c8a23e'); p(12, 17, 2, 1, '#8a6a1e');
      p(18, 18, 4, 3, '#c23b2e'); p(19, 17, 2, 1, '#4e8a3c');
      p(25, 18, 4, 3, '#3a6fd8'); p(25, 18, 4, 1, '#7a9fe8');
      p(32, 18, 4, 3, '#e8e4d8');
      // barrel
      p(39, 19, 5, 7, '#8a5a2b');
      p(39, 21, 5, 1, '#5e3c1c'); p(39, 24, 5, 1, '#5e3c1c');
      // crate
      p(2, 22, 6, 6, '#a8845c');
      p(2, 22, 6, 1, '#c8a47c'); p(2, 24, 6, 1, '#8a6a3e'); p(4, 22, 1, 6, '#8a6a3e');
      p(1, 27, 48, 1, '#3a3024');
      out = { img: c, ax: 52, ay: 60, flagX: 8, flagY: 14 };
    }

    // crisp silhouette outline on standing buildings (farms stay flat)
    if (out && !out.flat) out.img = outline(out.img);
    cache[ck] = out;
    return out;
  }

  // ---------------- HUD icons ----------------
  function icon(kind) {
    const ck = 'i_' + kind;
    if (cache[ck]) return cache[ck];
    const c = mkCanvas(20, 20);
    const p = chunk(c.getContext('2d'));
    if (kind === 'food') {
      p(3, 4, 4, 4, '#c23b2e'); p(4, 3, 2, 1, '#c23b2e');
      p(4, 4, 1, 1, '#f0a08a'); p(5, 2, 1, 2, '#4e8a3c');
    } else if (kind === 'wood') {
      p(2, 5, 6, 3, '#8a5a2b'); p(2, 5, 6, 1, '#a8784a');
      p(7, 5, 1, 3, '#c89858'); p(3, 3, 2, 2, '#5e3c1c');
    } else if (kind === 'gold') {
      p(3, 4, 4, 4, '#e8c84a'); p(3, 4, 4, 1, '#f0da7a');
      p(3, 7, 4, 1, '#b08f1e'); p(4, 5, 1, 1, '#fff2b0');
    } else if (kind === 'pop') {
      p(4, 2, 2, 2, '#e8b88a'); p(3, 4, 4, 3, '#3a6fd8');
      p(7, 3, 2, 2, '#e8b88a'); p(6, 5, 3, 3, '#888');
    }
    cache[ck] = c;
    return c;
  }

  return { unit, flag, grassTile, waterTile, mountain, decal, crops, tree, stump, goldMine, berryBush, building, icon, diamondPath, PX };
})();
