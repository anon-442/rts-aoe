// ============================================================
// AGE OF PIXELS — central game state & simulation loop
// ============================================================

const Game = {
  players: [],      // [human, bot]
  units: [],
  buildings: [],
  projectiles: [],
  impacts: [],      // catapult impact flashes {x, y, t}
  fx: [],           // short-lived visual effects {type, x, y, t, dur, seed}
  stumps: [],
  nextId: 1,
  time: 0,
  fog: null,        // Uint8 per tile, human player: 0 hidden, 1 explored, 2 visible
  fogT: 0,
  started: false,
  over: false,
  winner: -1,
  paused: false,

  init(playerCiv, difficulty) {
    const diff = DIFFICULTIES[difficulty];
    const civKeys = Object.keys(CIVS);
    const botCiv = civKeys[(Math.random() * civKeys.length) | 0];

    this.players = [
      { civ: playerCiv, res: Object.assign({}, CFG.START_RES), gatherMult: 1, isBot: false, rally: null },
      { civ: botCiv, res: Object.assign({}, CFG.START_RES), gatherMult: diff.gatherMult, isBot: true, rally: null },
    ];
    this.players[1].res.food += diff.bonusRes;
    this.players[1].res.wood += diff.bonusRes;
    this.players[1].res.gold += diff.bonusRes / 2 | 0;

    this.units = []; this.buildings = []; this.projectiles = [];
    this.impacts = []; this.stumps = []; this.fx = [];
    this.nextId = 1; this.time = 0; this.over = false; this.winner = -1;
    this.paused = false;

    // regenerate until the two bases can reach each other (lakes/mountains
    // could theoretically seal a path on an unlucky roll)
    let tries = 0;
    do {
      GameMap.generate();
      tries++;
    } while (tries < 8 && !Path.find(
      GameMap.startPositions[0].x, GameMap.startPositions[0].y,
      GameMap.startPositions[1].x, GameMap.startPositions[1].y));
    this.fog = new Uint8Array(GameMap.size * GameMap.size);

    // town halls + starting villagers
    for (let p = 0; p < 2; p++) {
      const sp = GameMap.startPositions[p];
      const tc = new Building(p, 'towncenter', sp.x, sp.y, true);
      this.buildings.push(tc);
      for (let i = 0; i < CFG.START_VILLAGERS; i++) {
        const spot = GameMap.findFreeTile(sp.x + 2, sp.y + 2, 5);
        this.addUnit(p, 'villager', spot.x + 0.5, spot.y + 0.5);
      }
    }

    AI.init(diff);
    this.computeFog();
    this.started = true;
  },

  townCenter(owner) {
    return this.buildings.find(b => b.owner === owner && b.key === 'towncenter' && !b.dead);
  },

  addUnit(owner, key, x, y) {
    const u = new Unit(owner, key, x, y);
    this.units.push(u);
    return u;
  },

  // Place a construction site (pays the cost). Returns the building or null.
  placeBuilding(owner, key, x, y) {
    const def = BUILDINGS[key];
    const cost = buildingCost(this.players[owner].civ, key);
    if (!GameMap.canPlaceBuilding(x, y, def.size)) {
      if (owner === 0) UI.toast("Can't build there");
      return null;
    }
    if (!this.canAfford(owner, cost)) {
      if (owner === 0) UI.toast('Not enough resources');
      return null;
    }
    this.pay(owner, cost);
    const b = new Building(owner, key, x, y, false);
    this.buildings.push(b);
    return b;
  },

  canAfford(owner, cost) {
    const r = this.players[owner].res;
    for (const k in cost) if ((r[k] || 0) < cost[k]) return false;
    return true;
  },
  pay(owner, cost) {
    const r = this.players[owner].res;
    for (const k in cost) r[k] -= cost[k];
  },

  popUsed(owner) {
    let n = 0;
    for (const u of this.units) {
      if (u.owner === owner && !u.dead) n += u.stat.pop;
    }
    for (const b of this.buildings) {
      if (b.owner !== owner || b.dead) continue;
      for (const k of b.queue) n += unitStat(this.players[owner].civ, k).pop;
    }
    return n;
  },

  addFx(type, x, y, dur) {
    if (this.fx.length >= 150) return;
    this.fx.push({ type, x, y, dur, t: dur, seed: Math.random() * 6.28 });
  },

  marketTrade(owner, action, resKey) {
    const rates = marketRates(this.players[owner].civ);
    const r = this.players[owner].res;
    if (action === 'sell') {
      if (r[resKey] < rates.lot) { if (owner === 0) UI.toast('Not enough ' + resKey); return; }
      r[resKey] -= rates.lot;
      r.gold += rates.sellGets;
    } else {
      if (r.gold < rates.buyCosts) { if (owner === 0) UI.toast('Not enough gold'); return; }
      r.gold -= rates.buyCosts;
      r[resKey] += rates.lot;
    }
  },

  update(dt) {
    if (!this.started || this.over || this.paused) return;
    this.time += dt;

    for (const u of this.units) u.update(dt);
    for (const b of this.buildings) b.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const im of this.impacts) im.t -= dt;
    for (const f of this.fx) f.t -= dt;

    resolveUnitCollisions();
    AI.update(dt);

    // sweep the dead
    for (const u of this.units) {
      if (u.dead) Input.selection.delete(u);
    }
    this.units = this.units.filter(u => !u.dead);
    this.buildings = this.buildings.filter(b => {
      if (b.dead) Input.selection.delete(b);
      return !b.dead;
    });
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.impacts = this.impacts.filter(im => im.t > 0);
    this.fx = this.fx.filter(f => f.t > 0);

    // fog of war (human player only — the bot peeks, like old-school AI)
    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = CFG.FOG_REFRESH; this.computeFog(); }

    // victory: destroy the enemy Town Hall
    if (!this.townCenter(1)) { this.over = true; this.winner = 0; UI.showEnd(true); }
    else if (!this.townCenter(0)) { this.over = true; this.winner = 1; UI.showEnd(false); }
  },

  computeFog() {
    const N = GameMap.size, fog = this.fog;
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    const reveal = (cx, cy, r) => {
      const r2 = r * r;
      const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(N - 1, (cx + r) | 0);
      const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(N - 1, (cy + r) | 0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) fog[y * N + x] = 2;
        }
      }
    };
    for (const u of this.units) {
      if (u.owner === 0 && !u.dead) reveal(u.x, u.y, u.stat.sight);
    }
    for (const b of this.buildings) {
      if (b.owner === 0 && !b.dead) reveal(b.cx, b.cy, b.def.sight || 5);
    }
  },

  fogAt(x, y) {
    if (!GameMap.inBounds(x | 0, y | 0)) return 0;
    return this.fog[(y | 0) * GameMap.size + (x | 0)];
  },
};
