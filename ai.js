// ============================================================
// AGE OF PIXELS — bot opponent (player index 1)
// A simple but honest state machine: grow economy, expand
// production, then attack in escalating waves. It ignores fog
// (classic RTS bot peeking) but plays by every other rule.
// ============================================================

const AI = {
  diff: null,
  tickT: 0,
  wave: 0,
  waveSize: 8,
  attacking: false,
  barracksAlt: 0,

  init(diff) {
    this.diff = diff;
    this.tickT = 0;
    this.wave = 0;
    this.waveSize = diff.waveSize;
    this.attacking = false;
    this.barracksAlt = 0;
  },

  update(dt) {
    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT = 0.5;

    const me = 1;
    const tc = Game.townCenter(me);
    if (!tc) return;

    this.runEconomy(me, tc);
    this.runConstruction(me, tc);
    this.runMilitary(me, tc);
  },

  // ---------- economy ----------
  runEconomy(me, tc) {
    const vills = Game.units.filter(u => u.owner === me && u.key === 'villager');

    // keep making villagers
    if (vills.length + tc.queue.length < this.diff.villagerTarget &&
        tc.queue.length === 0 && Game.canAfford(me, UNITS.villager.cost)) {
      tc.trainUnit('villager');
    }

    // task idle villagers toward the resource we're shortest on
    const counts = { food: 0, wood: 0, gold: 0 };
    const idle = [];
    for (const v of vills) {
      if (v.state === 'idle') { idle.push(v); continue; }
      if (v.state === 'farm') counts.food++;
      else if (v.resTarget) counts[resType(v.resTarget)]++;
      else if (v.carry.amt > 0 && v.carry.type) counts[v.carry.type]++;
    }
    const want = { food: 0.42, wood: 0.38, gold: 0.20 };
    for (const v of idle) {
      const total = counts.food + counts.wood + counts.gold + 1;
      let bestRes = 'food', bestGap = -Infinity;
      for (const r of ['food', 'wood', 'gold']) {
        const gap = want[r] - counts[r] / total;
        if (gap > bestGap) { bestGap = gap; bestRes = r; }
      }
      if (this.assignGather(v, bestRes, tc)) counts[bestRes]++;
      else if (this.assignGather(v, 'wood', tc)) counts.wood++;
    }
  },

  assignGather(v, resKey, tc) {
    if (resKey === 'food') {
      const berry = GameMap.nearestResource('berry', tc.cx, tc.cy, 14);
      if (berry) { v.orderGather(berry); return true; }
      // berries gone: work or build a farm
      const freeFarm = Game.buildings.find(b =>
        b.owner === 1 && b.key === 'farm' && b.done && !b.worker && !b.dead);
      if (freeFarm) { v.orderFarm(freeFarm); return true; }
      const site = Game.buildings.find(b => b.owner === 1 && b.key === 'farm' && !b.done);
      if (site) { v.orderBuild(site); return true; }
      const farms = Game.buildings.filter(b => b.owner === 1 && b.key === 'farm').length;
      if (farms < 8 && Game.canAfford(1, buildingCost(Game.players[1].civ, 'farm'))) {
        const spot = this.findSpot(tc, BUILDINGS.farm.size);
        if (spot) {
          const b = Game.placeBuilding(1, 'farm', spot.x, spot.y);
          if (b) { v.orderBuild(b); return true; }
        }
      }
      return false;
    }
    const type = resKey === 'wood' ? 'tree' : 'gold';
    const node = GameMap.nearestResource(type, tc.cx, tc.cy, 22);
    if (node) { v.orderGather(node); return true; }
    return false;
  },

  // ---------- construction ----------
  runConstruction(me, tc) {
    const has = key => Game.buildings.some(b => b.owner === me && b.key === key && !b.dead);
    const civ = Game.players[me].civ;
    const res = Game.players[me].res;

    const tryBuild = (key, reserve) => {
      const cost = buildingCost(civ, key);
      const total = (cost.wood || 0) + reserve;
      if ((res.wood || 0) < total || !Game.canAfford(me, cost)) return;
      const spot = this.findSpot(tc, BUILDINGS[key].size);
      if (!spot) return;
      const b = Game.placeBuilding(me, key, spot.x, spot.y);
      if (b) this.sendBuilder(b);
    };

    if (!has('barracks')) tryBuild('barracks', 60);
    else if (!has('stable') && Game.time > 150) tryBuild('stable', 80);
    else if (!has('tower') && Game.time > 240) tryBuild('tower', 80);
    else if (!has('workshop') && Game.time > 300) tryBuild('workshop', 100);
    else if (!has('market') && res.wood > 350) tryBuild('market', 100);

    // proactive farms: don't wait for the berries to run dry
    const farms = Game.buildings.filter(b => b.owner === me && b.key === 'farm' && !b.dead).length;
    if (Game.time > 180 && farms < 4 && res.wood > 180) tryBuild('farm', 0);

    // unfinished sites with no one working? send help
    for (const b of Game.buildings) {
      if (b.owner !== me || b.done || b.dead) continue;
      const busy = Game.units.some(u => u.owner === me && u.state === 'build' && u.target === b);
      if (!busy) this.sendBuilder(b);
    }

    // market play: dump excess wood for gold
    if (has('market') && res.wood > 500 && res.gold < 120) {
      Game.marketTrade(me, 'sell', 'wood');
    }
  },

  sendBuilder(b) {
    let best = null, bestD = Infinity;
    for (const u of Game.units) {
      if (u.owner !== 1 || u.key !== 'villager' || u.dead) continue;
      if (u.state === 'build') continue;
      const d = dist(u.x, u.y, b.cx, b.cy);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (best) best.orderBuild(b);
  },

  // spiral search for a buildable spot near the town hall (offset toward map center)
  findSpot(tc, size) {
    const cx = (tc.x + 1), cy = (tc.y + 1);
    for (let r = 3; r <= 10; r++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        if (GameMap.canPlaceBuilding(x, y, size)) return { x, y };
      }
    }
    return null;
  },

  // ---------- military ----------
  runMilitary(me, tc) {
    const res = Game.players[me].res;
    const army = Game.units.filter(u => u.owner === me && u.isMilitary);

    // keep production rolling (keep a small food buffer for villagers)
    for (const b of Game.buildings) {
      if (b.owner !== me || !b.done || b.dead || !b.def.trains || b.key === 'towncenter') continue;
      if (b.queue.length > 0) continue;
      let pick = null;
      if (b.key === 'barracks') {
        pick = this.barracksAlt++ % 2 === 0 ? 'infantry' : 'archer';
      } else if (b.key === 'stable') {
        pick = 'knight';
      } else if (b.key === 'workshop') {
        pick = this.wave >= 2 ? (this.wave % 2 === 0 ? 'catapult' : 'ram') : 'ram';
      }
      if (!pick) continue;
      const cost = unitStat(Game.players[me].civ, pick).cost;
      // early on, keep a food buffer for villagers; once the eco is up, spend freely
      const villCount = Game.units.filter(u => u.owner === me && u.key === 'villager').length;
      const reserve = villCount < this.diff.villagerTarget ? 60 : 0;
      if ((cost.food || 0) > 0 && res.food < (cost.food || 0) + reserve) continue;
      if (Game.canAfford(me, cost)) b.trainUnit(pick);
    }

    // defense first: enemies near our town hall
    const intruder = nearestEnemyUnit(me, tc.cx, tc.cy, 11);
    if (intruder) {
      for (const u of army) {
        if (u.state === 'idle' || (u.target && dist(u.x, u.y, tc.cx, tc.cy) > 14)) {
          u.orderAttack(intruder);
          u.anchor = null;
        }
      }
      return;
    }

    // attack waves at the player's town hall
    const enemyTC = Game.townCenter(0);
    if (!enemyTC) return;
    if (!this.attacking && army.length >= this.waveSize) {
      this.attacking = true;
      this.wave++;
      this.waveSize += 2;
      for (const u of army) u.orderAttack(enemyTC);
    } else if (this.attacking) {
      if (army.length < 3) { this.attacking = false; return; }
      // reinforce: idle soldiers join the push
      for (const u of army) {
        if (u.state === 'idle') u.orderAttack(enemyTC);
      }
    }
  },
};
