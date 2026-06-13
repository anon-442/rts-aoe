// ============================================================
// AGE OF PIXELS — isometric renderer
// Painter's algorithm: terrain first, then everything that
// stands on it sorted by depth (x + y).
// ============================================================

const Renderer = {
  canvas: null,
  ctx: null,
  zoom: 1,          // camera zoom (0.5 .. 2, mouse wheel)
  clock: 0,         // visual animation clock (keeps running while paused)
  _lastNow: 0,
  puffs: [],        // chimney smoke particles
  smokeTimers: {},

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._lastNow = performance.now() / 1000;
  },

  worldToScreen(wx, wy) {
    return {
      x: (wx - wy) * (CFG.TILE_W / 2) - Input.cam.x,
      y: (wx + wy) * (CFG.TILE_H / 2) - Input.cam.y,
    };
  },
  screenToWorld(sx, sy) {
    const a = (sx / this.zoom + Input.cam.x) / (CFG.TILE_W / 2);
    const b = (sy / this.zoom + Input.cam.y) / (CFG.TILE_H / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  },

  draw() {
    const now = performance.now() / 1000;
    const dtR = Math.min(0.05, now - this._lastNow);
    this._lastNow = now;
    this.clock += dtR;

    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, W, H);
    if (!Game.started) return;

    // world pass, scaled by the camera zoom
    const Z = this.zoom;
    ctx.setTransform(Z, 0, 0, Z, 0, 0);
    this.drawTerrain(W / Z, H / Z);
    this.drawEntities(W / Z, H / Z);
    this.drawFx();
    this.drawSmoke(dtR);
    this.drawProjectiles();
    this.drawPlacementGhost();

    // screen-space pass
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawDragBox();
    this.drawVignette(W, H);
  },

  drawTerrain(W, H) {
    const ctx = this.ctx, N = GameMap.size;
    const tw = CFG.TILE_W, th = CFG.TILE_H;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fog = Game.fog[y * N + x];
        if (fog === 0) continue; // unexplored = void
        const s = this.worldToScreen(x, y); // top corner of the diamond
        if (s.x < -tw || s.x > W || s.y < -th * 2 - 30 || s.y > H + th + 30) continue;
        if (GameMap.water[y * N + x]) {
          // animated shimmer: cycle frames, offset per tile
          const wf = (((this.clock * 1.6) | 0) + x * 3 + y * 5) % 3;
          ctx.drawImage(Sprites.waterTile(wf), s.x - tw / 2, s.y);
        } else {
          ctx.drawImage(Sprites.grassTile(GameMap.terrainVariant[y * N + x]), s.x - tw / 2, s.y);
        }
        // earth cliffs on the map's south edges: the world becomes a floating slab
        if (y === N - 1) {
          ctx.fillStyle = '#4c3522';
          ctx.beginPath();
          ctx.moveTo(s.x - tw / 2, s.y + th / 2);
          ctx.lineTo(s.x, s.y + th);
          ctx.lineTo(s.x, s.y + th + 24);
          ctx.lineTo(s.x - tw / 2, s.y + th / 2 + 24);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#3a281a';
          ctx.fillRect(s.x - tw / 2, s.y + th / 2 + 14, 2, 8);
          ctx.fillRect(s.x - tw / 4, s.y + th * 0.75 + 10, 2, 10);
        }
        if (x === N - 1) {
          ctx.fillStyle = '#5c422c';
          ctx.beginPath();
          ctx.moveTo(s.x, s.y + th);
          ctx.lineTo(s.x + tw / 2, s.y + th / 2);
          ctx.lineTo(s.x + tw / 2, s.y + th / 2 + 24);
          ctx.lineTo(s.x, s.y + th + 24);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#46311f';
          ctx.fillRect(s.x + tw / 4, s.y + th * 0.75 + 10, 2, 10);
        }
        // ground decoration (skip tiles occupied by resources/buildings)
        const dec = GameMap.decor[y * N + x];
        if (dec && !GameMap.blocked[y * N + x]) {
          ctx.drawImage(Sprites.decal(dec), s.x - 12, s.y + 8);
        }
        if (fog === 1) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = '#06060c';
          Sprites.diamondPath(ctx, s.x - tw / 2, s.y, tw, th);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    // farms are flat: draw them with the ground
    for (const b of Game.buildings) {
      if (b.key !== 'farm') continue;
      if (!this.buildingExplored(b)) continue;
      const spr = Sprites.building('farm', b.owner);
      const s = this.worldToScreen(b.x, b.y);
      ctx.globalAlpha = b.done ? 1 : 0.55;
      ctx.drawImage(spr.img, s.x - spr.ax, s.y);
      // crops at 4 growth stages over the 24s cycle
      if (b.done) {
        const stage = Math.min(3, (b.growT / 6) | 0);
        if (stage > 0) ctx.drawImage(Sprites.crops(stage), s.x - spr.ax, s.y);
      }
      ctx.globalAlpha = 1;
      if (Input.selection.has(b)) this.drawFootprint(b, '#7af07a');
      if (!b.done || b.hp < b.maxHp || Input.selection.has(b)) this.drawBuildingBar(b, s.x, s.y + 6);
    }
    // tree stumps
    for (const st of Game.stumps) {
      if (Game.fogAt(st.x, st.y) === 0) continue;
      const s = this.worldToScreen(st.x + 0.5, st.y + 0.5);
      ctx.drawImage(Sprites.stump(), s.x - 10, s.y - 8);
    }
  },

  buildingExplored(b) {
    for (let dy = 0; dy < b.size; dy++) {
      for (let dx = 0; dx < b.size; dx++) {
        if (Game.fogAt(b.x + dx, b.y + dy) >= 1) return true;
      }
    }
    return false;
  },

  drawEntities(W, H) {
    const ctx = this.ctx;
    const items = [];

    for (const r of GameMap.resources) {
      if (Game.fogAt(r.x, r.y) === 0) continue;
      items.push({ depth: r.x + r.y + 1, kind: 'res', e: r });
    }
    for (const mt of GameMap.mountains) {
      if (Game.fogAt(mt.x, mt.y) === 0) continue;
      items.push({ depth: mt.x + mt.y + 1, kind: 'mtn', e: mt });
    }
    for (const b of Game.buildings) {
      if (b.key === 'farm') continue;
      if (b.owner !== 0 && !this.buildingExplored(b)) continue;
      items.push({ depth: b.x + b.y + 2 * b.size - 1, kind: 'bld', e: b });
    }
    for (const u of Game.units) {
      if (u.owner !== 0 && Game.fogAt(u.x, u.y) !== 2) continue;
      items.push({ depth: u.x + u.y, kind: 'unit', e: u });
    }
    items.sort((a, b) => a.depth - b.depth);

    for (const it of items) {
      if (it.kind === 'res') this.drawResource(it.e);
      else if (it.kind === 'bld') this.drawBuilding(it.e);
      else if (it.kind === 'mtn') this.drawMountain(it.e);
      else this.drawUnit(it.e);
    }

    // catapult impact flashes
    for (const im of Game.impacts) {
      const s = this.worldToScreen(im.x, im.y);
      const r = (0.35 - im.t) / 0.35;
      ctx.strokeStyle = 'rgba(255,180,60,' + (1 - r) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 8 + r * 30, 4 + r * 15, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  drawResource(r) {
    const ctx = this.ctx;
    const s = this.worldToScreen(r.x + 0.5, r.y + 0.5);
    if (r.type === 'tree') {
      // canopy sways in the wind: top slice shifts, trunk stays put
      const img = Sprites.tree(r.id % 2);
      const sway = Math.round(Math.sin(this.clock * 1.3 + r.x * 0.9 + r.y * 1.7) * 1.6);
      const topH = 30;
      this.shadow(s.x + 2, s.y + 2, 16, 6);
      ctx.drawImage(img, 0, 0, img.width, topH, s.x - 22 + sway, s.y - 52, img.width, topH);
      ctx.drawImage(img, 0, topH, img.width, img.height - topH, s.x - 22, s.y - 52 + topH, img.width, img.height - topH);
    } else if (r.type === 'gold') {
      this.shadow(s.x, s.y + 2, 22, 8, 0.22);
      ctx.drawImage(Sprites.goldMine(), s.x - 26, s.y - 24);
      // occasional glint
      if ((this.clock * 2 + r.id) % 7 < 0.35) {
        ctx.fillStyle = '#fff2b0';
        ctx.fillRect(s.x - 6 + (r.id % 9), s.y - 14, 2, 2);
      }
    } else {
      this.shadow(s.x, s.y + 1, 15, 5, 0.22);
      ctx.drawImage(Sprites.berryBush(), s.x - 20, s.y - 22);
    }
  },

  drawMountain(mt) {
    const s = this.worldToScreen(mt.x + 0.5, mt.y + 0.5);
    this.shadow(s.x + 2, s.y + 2, 20, 8, 0.3);
    this.ctx.drawImage(Sprites.mountain((mt.x + mt.y) % 2), s.x - 28, s.y - 54);
  },

  drawBuilding(b) {
    const ctx = this.ctx;
    const spr = Sprites.building(b.key, b.owner);
    // anchor: ground-center of footprint
    const s = this.worldToScreen(b.cx, b.cy);
    const imgX = s.x - spr.ax, imgY = s.y - spr.ay;
    if (Input.selection.has(b)) this.drawFootprint(b, '#7af07a');
    // ground shadow spanning the footprint
    this.shadow(s.x + 4, s.y - b.size * 6, b.size * 34, b.size * 13, 0.25);
    ctx.globalAlpha = b.done ? 1 : 0.55;
    ctx.drawImage(spr.img, imgX, imgY);
    ctx.globalAlpha = 1;

    if (b.done) {
      // waving team flag
      if (spr.flagX !== undefined) {
        const fimg = Sprites.flag(b.owner, ((this.clock * 2.5) | 0) % 2);
        ctx.drawImage(fimg, imgX + spr.flagX, imgY + spr.flagY - fimg.height);
      }
      // chimney smoke spawner
      if (spr.smokeX !== undefined) {
        const last = this.smokeTimers[b.id] || 0;
        if (this.clock - last > 0.8 + (b.id % 3) * 0.3) {
          this.smokeTimers[b.id] = this.clock;
          if (this.puffs.length < 80) {
            this.puffs.push({ bx: b.cx, by: b.cy, ox: spr.smokeX - spr.ax, oy: spr.smokeY - spr.ay, age: 0 });
          }
        }
      }
    }
    if (!b.done) {
      // construction progress
      this.drawBar(s.x, s.y + 8, 48, b.progress / b.def.buildTime, '#e8c84a');
    } else if (b.hp < b.maxHp || Input.selection.has(b)) {
      this.drawBuildingBar(b, s.x, s.y + 8);
    }
    // rally flag: Town Hall has its own (villagers), troops share one
    if (Input.selection.has(b) && b.owner === 0 && b.def.trains) {
      const rally = b.key === 'towncenter' ? b.rally : Game.players[0].rally;
      if (rally) {
        const rs = this.worldToScreen(rally.x, rally.y);
        ctx.fillStyle = '#3a3a4a'; ctx.fillRect(rs.x, rs.y - 14, 2, 14);
        ctx.fillStyle = TEAM_COLORS[0].main; ctx.fillRect(rs.x + 2, rs.y - 14, 8, 5);
        ctx.fillStyle = TEAM_COLORS[0].dark; ctx.fillRect(rs.x + 2, rs.y - 10, 6, 1);
      }
    }
  },

  drawBuildingBar(b, sx, sy) {
    this.drawBar(sx, sy, 48, b.hp / b.maxHp, this.hpColor(b.hp / b.maxHp));
  },

  drawUnit(u) {
    const ctx = this.ctx;
    const s = this.worldToScreen(u.x, u.y);
    // walk cycle: alternate leg frames while a path is active
    const frame = u.path ? ((u.animT * 7) | 0) % 2 : 0;
    const img = Sprites.unit(u.key, u.owner, u.flip, frame);

    this.shadow(s.x, s.y + 2, img.width * 0.34, img.width * 0.14, 0.3);

    // selection ellipse under the feet
    if (Input.selection.has(u)) {
      ctx.strokeStyle = '#7af07a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 2, img.width * 0.45, img.width * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    let oy = 0, ox = 0;
    if (u.path) oy = Math.sin(u.animT * 12) * 1.5;                    // walking bob
    else oy = Math.round(Math.sin(this.clock * 1.8 + u.id * 1.3));    // idle breathing
    if (u.lunge > 0) ox = (u.flip ? -1 : 1) * 4;                      // attack lunge

    ctx.drawImage(img, Math.round(s.x - img.width / 2 + ox), Math.round(s.y - img.height + 4 + oy));

    // carried resources indicator
    if (u.carry.amt > 0) {
      ctx.fillStyle = u.carry.type === 'gold' ? '#e8c84a' : u.carry.type === 'wood' ? '#8a5a2b' : '#c23b2e';
      ctx.fillRect(s.x - 2, s.y - img.height, 5, 5);
    }
    // health bar when hurt or selected
    if (u.hp < u.stat.hp || Input.selection.has(u)) {
      this.drawBar(s.x, s.y - img.height - 2, 26, u.hp / u.stat.hp, this.hpColor(u.hp / u.stat.hp));
    }
  },

  // What did the player actually click? Tests full sprite rectangles in
  // screen space (so clicking a tree's foliage or a tower's top works),
  // front-most drawn entity wins.
  pickEntity(mx, my) {
    const Z = this.zoom;
    const vx = mx / Z, vy = my / Z;
    const hits = [];
    const test = (rx, ry, rw, rh) => vx >= rx && vx <= rx + rw && vy >= ry && vy <= ry + rh;

    for (const u of Game.units) {
      if (u.dead) continue;
      if (u.owner !== 0 && Game.fogAt(u.x, u.y) !== 2) continue;
      const s = this.worldToScreen(u.x, u.y);
      const img = Sprites.unit(u.key, u.owner, false, 0);
      if (test(s.x - img.width / 2, s.y - img.height + 4, img.width, img.height + 4)) {
        hits.push({ kind: 'unit', e: u, depth: u.x + u.y + 100 }); // units beat scenery
      }
    }
    for (const b of Game.buildings) {
      if (b.dead) continue;
      if (b.owner !== 0 && !this.buildingExplored(b)) continue;
      const spr = Sprites.building(b.key, b.owner);
      let rx, ry;
      if (spr.flat) {
        const s = this.worldToScreen(b.x, b.y);
        rx = s.x - spr.ax; ry = s.y;
      } else {
        const s = this.worldToScreen(b.cx, b.cy);
        rx = s.x - spr.ax; ry = s.y - spr.ay;
      }
      if (test(rx, ry, spr.img.width, spr.img.height)) {
        hits.push({ kind: 'building', e: b, depth: b.x + b.y + 2 * b.size - 1 });
      }
    }
    for (const r of GameMap.resources) {
      if (Game.fogAt(r.x, r.y) === 0) continue;
      const s = this.worldToScreen(r.x + 0.5, r.y + 0.5);
      const ok = r.type === 'tree' ? test(s.x - 22, s.y - 52, 44, 56)
        : r.type === 'gold' ? test(s.x - 26, s.y - 24, 52, 34)
        : test(s.x - 20, s.y - 22, 40, 28);
      if (ok) hits.push({ kind: 'resource', e: r, depth: r.x + r.y + 1 });
    }
    if (hits.length === 0) return null;
    hits.sort((a, b) => b.depth - a.depth);
    return hits[0];
  },

  hpColor(f) { return f > 0.6 ? '#5ad05a' : f > 0.3 ? '#e8c84a' : '#d8483a'; },

  // soft ground shadow, offset to the south-east (sun from the north-west)
  shadow(sx, sy, rx, ry, alpha) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha || 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx + 3, sy + 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  drawBar(cx, y, w, frac, color) {
    const ctx = this.ctx;
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = '#1b1b29';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, y, w * frac, 3);
  },

  drawFootprint(b, color) {
    const ctx = this.ctx;
    const tw = CFG.TILE_W, th = CFG.TILE_H;
    const s = this.worldToScreen(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + b.size * tw / 2, s.y + b.size * th / 2);
    ctx.lineTo(s.x, s.y + b.size * th);
    ctx.lineTo(s.x - b.size * tw / 2, s.y + b.size * th / 2);
    ctx.closePath();
    ctx.stroke();
  },

  // Short-lived gameplay effects spawned by the simulation (Game.fx)
  drawFx() {
    const ctx = this.ctx;
    for (const f of Game.fx) {
      if (Game.fogAt(f.x, f.y) !== 2) continue;
      const s = this.worldToScreen(f.x, f.y);
      const q = 1 - f.t / f.dur; // 0 -> 1 over the effect's life
      ctx.globalAlpha = 1 - q;
      if (f.type === 'hit') {
        ctx.fillStyle = q < 0.4 ? '#fff2b0' : '#e8843a';
        const r = 3 + q * 7;
        ctx.fillRect(s.x - r, s.y - 12, 2, 2); ctx.fillRect(s.x + r - 2, s.y - 12, 2, 2);
        ctx.fillRect(s.x - 1, s.y - 12 - r, 2, 2); ctx.fillRect(s.x - 1, s.y - 12 + r * 0.5, 2, 2);
      } else if (f.type === 'chop' || f.type === 'build') {
        ctx.fillStyle = f.type === 'chop' ? '#c89858' : '#cabd9a';
        for (let i = 0; i < 3; i++) {
          const a = f.seed + i * 2.1;
          const dx = Math.cos(a) * q * 12, dy = -8 - q * 8 + q * q * 16 + Math.sin(a) * 3;
          ctx.fillRect(s.x + dx, s.y + dy, 2, 2);
        }
      } else if (f.type === 'gold' || f.type === 'berry') {
        ctx.fillStyle = f.type === 'gold' ? '#f0da7a' : '#e0524a';
        for (let i = 0; i < 2; i++) {
          const a = f.seed + i * 2.6;
          ctx.fillRect(s.x + Math.cos(a) * 8, s.y - 6 - q * 10 - i * 4, 2, 2);
        }
      } else if (f.type === 'death') {
        ctx.fillStyle = '#9a96a8';
        const r = 4 + q * 12;
        for (let i = 0; i < 5; i++) {
          const a = f.seed + i * 1.26;
          ctx.fillRect(s.x + Math.cos(a) * r - 1, s.y - 6 + Math.sin(a) * r * 0.5 - 1, 3, 3);
        }
      }
      ctx.globalAlpha = 1;
    }
  },

  // Chimney smoke puffs (purely visual, world-anchored)
  drawSmoke(dtR) {
    const ctx = this.ctx;
    for (const pf of this.puffs) pf.age += dtR;
    this.puffs = this.puffs.filter(pf => pf.age < 2.2);
    for (const pf of this.puffs) {
      if (Game.fogAt(pf.bx, pf.by) < 1) continue;
      const s = this.worldToScreen(pf.bx, pf.by);
      const q = pf.age / 2.2;
      const size = 3 + q * 6;
      ctx.globalAlpha = 0.45 * (1 - q);
      ctx.fillStyle = '#b8b2a8';
      ctx.fillRect(
        s.x + pf.ox + Math.sin(pf.age * 2.2) * 3 - size / 2,
        s.y + pf.oy - pf.age * 16 - size / 2,
        size, size
      );
      ctx.globalAlpha = 1;
    }
  },

  drawProjectiles() {
    const ctx = this.ctx;
    for (const p of Game.projectiles) {
      if (Game.fogAt(p.x, p.y) !== 2 && Game.fogAt(p.tx || p.x, p.ty || p.y) !== 2) continue;
      const s = this.worldToScreen(p.x, p.y);
      if (p.type === 'arrow') {
        const t = p.target;
        const ts = t ? this.worldToScreen(entityX(t), entityY(t)) : s;
        const ang = Math.atan2(ts.y - s.y, ts.x - s.x);
        ctx.save();
        ctx.translate(s.x, s.y - 10);
        ctx.rotate(ang);
        ctx.fillStyle = '#d8d4c8';
        ctx.fillRect(-5, -1, 10, 2);
        ctx.restore();
      } else {
        // stone with an arcing height
        const total = dist(p.startX, p.startY, p.tx, p.ty) || 1;
        const remaining = dist(p.x, p.y, p.tx, p.ty);
        const prog = 1 - remaining / total;
        const lift = Math.sin(prog * Math.PI) * 38;
        ctx.fillStyle = '#54493e';
        ctx.beginPath();
        ctx.arc(s.x, s.y - 8 - lift, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  drawPlacementGhost() {
    const pm = Input.placeMode;
    if (!pm) return;
    const ctx = this.ctx;
    const def = BUILDINGS[pm.key];
    const w = this.screenToWorld(Input.mouse.x, Input.mouse.y);
    const tx = Math.floor(w.x - def.size / 2 + 0.5), ty = Math.floor(w.y - def.size / 2 + 0.5);
    pm.tx = tx; pm.ty = ty;
    let ok = GameMap.canPlaceBuilding(tx, ty, def.size);
    // must be on explored ground
    if (ok) {
      for (let dy = 0; dy < def.size && ok; dy++) {
        for (let dx = 0; dx < def.size && ok; dx++) {
          if (Game.fogAt(tx + dx, ty + dy) === 0) ok = false;
        }
      }
    }
    pm.ok = ok;
    const spr = Sprites.building(pm.key, 0);
    const sC = this.worldToScreen(tx + def.size / 2, ty + def.size / 2);
    const sT = this.worldToScreen(tx, ty);

    // footprint diamond
    const tw = CFG.TILE_W, th = CFG.TILE_H;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = ok ? '#5ad05a' : '#d8483a';
    ctx.beginPath();
    ctx.moveTo(sT.x, sT.y);
    ctx.lineTo(sT.x + def.size * tw / 2, sT.y + def.size * th / 2);
    ctx.lineTo(sT.x, sT.y + def.size * th);
    ctx.lineTo(sT.x - def.size * tw / 2, sT.y + def.size * th / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.7;
    if (spr.flat) ctx.drawImage(spr.img, sT.x - spr.ax, sT.y);
    else ctx.drawImage(spr.img, sC.x - spr.ax, sC.y - spr.ay);
    ctx.globalAlpha = 1;
  },

  drawDragBox() {
    const d = Input.drag;
    if (!d || !d.active) return;
    const ctx = this.ctx;
    ctx.strokeStyle = '#7af07a';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1),
      Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
  },

  // subtle dark corners pull the eye to the center of the action
  drawVignette(W, H) {
    if (!this._vig || this._vigW !== W || this._vigH !== H) {
      this._vigW = W; this._vigH = H;
      this._vig = document.createElement('canvas');
      this._vig.width = W; this._vig.height = H;
      const vctx = this._vig.getContext('2d');
      const g = vctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,12,0)');
      g.addColorStop(1, 'rgba(0,0,12,0.34)');
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, W, H);
    }
    this.ctx.drawImage(this._vig, 0, 0);
  },
};
