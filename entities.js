// ============================================================
// AGE OF PIXELS — units, buildings, projectiles, combat
// Positions are in tile units (floats); (0.5, 0.5) = center of tile 0,0.
// ============================================================

// ---------------- Unit ----------------
class Unit {
  constructor(owner, key, x, y) {
    const civ = Game.players[owner].civ;
    this.id = Game.nextId++;
    this.owner = owner;
    this.key = key;
    this.stat = unitStat(civ, key);
    this.x = x; this.y = y;
    this.hp = this.stat.hp;
    this.state = 'idle';
    this.path = null;
    this.goal = null;          // final move destination {x, y}
    this.target = null;        // entity being attacked / built / farmed
    this.resTarget = null;     // resource node being gathered
    this.carry = { type: null, amt: 0 };
    this.gatherT = 0;
    this.cd = 0;               // attack cooldown
    this.scanT = Math.random() * CFG.AGGRO_SCAN;
    this.repathT = 0;
    this.flip = false;
    this.animT = 0;
    this.lunge = 0;            // attack animation timer
    this.anchor = null;        // position to return to after auto-chase
    this.dead = false;
  }

  get radius() { return this.stat.radius; }
  get isMilitary() { return this.key !== 'villager'; }

  // ---- orders ----
  orderMove(x, y) {
    this.clearWork();
    this.state = 'move';
    this.setPath(x, y);
  }
  orderAttack(target) {
    if (this.key === 'ram' && !(target instanceof Building)) {
      this.orderMove(target.x, target.y); return;
    }
    this.clearWork();
    this.state = 'attack';
    this.target = target;
    this.repathT = 0;
  }
  orderGather(res) {
    if (!this.stat.isVillager) { this.orderMove(res.x + 0.5, res.y + 0.5); return; }
    this.clearWork();
    this.resTarget = res;
    this.gatherType = res.type; // remembered for retargeting when this node dies
    this.state = this.carry.amt >= CFG.CARRY_CAP && this.carry.type === resType(res) ? 'return' : 'gather';
    this.setPath(res.x + 0.5, res.y + 0.5);
  }
  orderBuild(b) {
    if (!this.stat.isVillager) { this.orderMove(b.cx, b.cy); return; }
    this.clearWork();
    this.state = 'build';
    this.target = b;
    this.setPath(b.cx, b.cy);
  }
  orderFarm(farm) {
    if (!this.stat.isVillager || !farm.done) { this.orderBuild(farm); return; }
    this.clearWork();
    if (farm.worker && farm.worker !== this) return;
    farm.worker = this;
    this.state = 'farm';
    this.target = farm;
    this.setPath(farm.cx, farm.cy);
  }
  clearWork() {
    if (this.target instanceof Building && this.target.worker === this) this.target.worker = null;
    this.target = null; this.resTarget = null; this.path = null; this.anchor = null;
  }

  setPath(x, y) {
    this.goal = { x, y };
    this.path = Path.find(this.x | 0, this.y | 0, x | 0, y | 0);
  }

  // ---- per-frame update ----
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    this.lunge = Math.max(0, this.lunge - dt);

    switch (this.state) {
      case 'idle': this.updateIdle(dt); break;
      case 'move': if (this.followPath(dt)) { this.state = 'idle'; } break;
      case 'attack': this.updateAttack(dt); break;
      case 'gather': this.updateGather(dt); break;
      case 'return': this.updateReturn(dt); break;
      case 'build': this.updateBuild(dt); break;
      case 'farm': this.updateFarm(dt); break;
    }
  }

  updateIdle(dt) {
    // military auto-acquires nearby enemies (rams & villagers don't)
    if (!this.isMilitary || this.key === 'ram') return;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = CFG.AGGRO_SCAN;
    const e = nearestEnemyUnit(this.owner, this.x, this.y, this.stat.sight);
    if (e) {
      if (!this.anchor) this.anchor = { x: this.x, y: this.y };
      this.state = 'attack';
      this.target = e;
    } else if (this.anchor) {
      const a = this.anchor; this.anchor = null;
      this.orderMove(a.x, a.y);
    }
  }

  updateAttack(dt) {
    const t = this.target;
    if (!t || t.dead) { this.target = null; this.state = 'idle'; return; }
    // auto-chase leash: drop targets that ran too far from our post
    if (this.anchor && dist(this.x, this.y, this.anchor.x, this.anchor.y) > this.stat.sight + 3) {
      const a = this.anchor; this.anchor = null;
      this.orderMove(a.x, a.y); return;
    }
    const d = distToEntity(this, t);
    if (d <= this.stat.range) {
      this.path = null;
      this.flip = entityX(t) < this.x;
      if (this.cd <= 0) {
        this.cd = this.stat.rate;
        this.lunge = 0.18;
        if (this.stat.projectile) {
          Game.projectiles.push(new Projectile(this, t));
        } else {
          dealDamage(this, t, false);
        }
      }
    } else {
      // chase: repath periodically toward the target
      this.repathT -= dt;
      if (!this.path || this.repathT <= 0) {
        this.repathT = 0.6;
        this.setPath(entityX(t), entityY(t));
      }
      this.followPath(dt);
    }
  }

  updateGather(dt) {
    let r = this.resTarget;
    if (!r || r.amount <= 0) {
      r = this.resTarget = GameMap.nearestResource(this.gatherType || 'tree', this.x, this.y, 9);
      if (!r) { this.state = this.carry.amt > 0 ? 'return' : 'idle'; return; }
      this.setPath(r.x + 0.5, r.y + 0.5);
    }
    const d = dist(this.x, this.y, r.x + 0.5, r.y + 0.5);
    if (d > 1.6) { // 1.6 covers diagonally-adjacent tiles (1.41)
      if (!this.path) {
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 1.0;
          this.setPath(r.x + 0.5, r.y + 0.5);
          if (!this.path) {
            // node is walled in (e.g. by forest): blacklist it and pick another
            this.gatherFails = (this.gatherFails || 0) + 1;
            if (this.gatherFails >= 2) {
              r.unreachableUntil = Game.time + 30;
              this.gatherFails = 0;
              this.resTarget = null;
            }
          } else this.gatherFails = 0;
        }
      }
      this.followPath(dt);
      return;
    }
    // harvest
    this.gatherFails = 0;
    this.path = null;
    this.flip = r.x + 0.5 < this.x;
    const mult = Game.players[this.owner].gatherMult;
    this.gatherT += dt * this.stat.gatherRate * mult;
    while (this.gatherT >= 1 && this.carry.amt < CFG.CARRY_CAP && r.amount > 0) {
      this.gatherT -= 1;
      this.carry.type = resType(r);
      this.carry.amt++;
      r.amount--;
      this.lunge = 0.15; // work swing
      const fxType = r.type === 'tree' ? 'chop' : r.type === 'gold' ? 'gold' : 'berry';
      Game.addFx(fxType, r.x + 0.5, r.y + 0.5, 0.5);
      if (r.amount <= 0) GameMap.removeResource(r);
    }
    if (this.carry.amt >= CFG.CARRY_CAP) {
      this.state = 'return';
      const dp = nearestDropoff(this.owner, this.x, this.y);
      if (dp) this.setPath(dp.cx, dp.cy); else this.state = 'idle';
    }
  }

  updateReturn(dt) {
    const dp = nearestDropoff(this.owner, this.x, this.y);
    if (!dp) { this.state = 'idle'; return; }
    if (distToEntity(this, dp) > 1.4) {
      if (!this.path) this.setPath(dp.cx, dp.cy);
      this.followPath(dt);
      return;
    }
    Game.players[this.owner].res[this.carry.type] += this.carry.amt;
    this.carry.amt = 0;
    if (this.resTarget && this.resTarget.amount > 0) {
      this.state = 'gather';
      this.setPath(this.resTarget.x + 0.5, this.resTarget.y + 0.5);
    } else {
      this.state = 'gather'; // will look for a nearby node of same type
    }
  }

  updateBuild(dt) {
    const b = this.target;
    if (!b || b.dead) { this.target = null; this.state = 'idle'; return; }
    if (b.done) {
      // finished: farms keep their builder as worker
      if (b.def.farmRate) { this.orderFarm(b); } else { this.target = null; this.state = 'idle'; }
      return;
    }
    if (distToEntity(this, b) > 1.3) {
      if (!this.path) {
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 1.0; this.setPath(b.cx, b.cy); }
      }
      this.followPath(dt);
      return;
    }
    this.path = null;
    b._builders++;
    this.lunge = 0.1; // hammering animation
    if (Math.random() < dt * 1.5) Game.addFx('build', b.cx, b.cy, 0.5);
  }

  updateFarm(dt) {
    const f = this.target;
    if (!f || f.dead || !f.done) { this.target = null; this.state = 'idle'; return; }
    if (f.worker !== this) { this.target = null; this.state = 'idle'; return; }
    if (dist(this.x, this.y, f.cx, f.cy) > 0.8) {
      if (!this.path) this.setPath(f.cx, f.cy);
      this.followPath(dt);
      return;
    }
    this.path = null;
    const mult = Game.players[this.owner].gatherMult;
    f.foodT += dt * f.def.farmRate * mult;
    while (f.foodT >= 1) { f.foodT -= 1; Game.players[this.owner].res.food += 1; }
  }

  // returns true when the path is finished
  followPath(dt) {
    if (!this.path || this.path.length === 0) {
      this.path = null;
      return true;
    }
    const wp = this.path[0];
    // waypoint got blocked by new construction: repath
    if (GameMap.isBlocked(wp.x | 0, wp.y | 0)) {
      if (this.goal) this.path = Path.find(this.x | 0, this.y | 0, this.goal.x | 0, this.goal.y | 0);
      if (!this.path) return true;
      return false;
    }
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.stat.speed * dt;
    this.animT += dt;
    if (Math.abs(dx) > 0.05) this.flip = dx < 0;
    if (d <= step) {
      this.x = wp.x; this.y = wp.y;
      this.path.shift();
      if (this.path.length === 0) { this.path = null; return true; }
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    return false;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      Game.addFx('death', this.x, this.y, 0.5);
      if (this.target instanceof Building && this.target.worker === this) this.target.worker = null;
    }
  }
}

// ---------------- Building ----------------
class Building {
  constructor(owner, key, x, y, prebuilt) {
    const civ = Game.players[owner].civ;
    this.id = Game.nextId++;
    this.owner = owner;
    this.key = key;
    this.def = BUILDINGS[key];
    this.x = x; this.y = y;
    this.size = this.def.size;
    this.maxHp = this.def.hp;
    this.done = !!prebuilt || this.def.buildTime === 0;
    this.progress = this.done ? this.def.buildTime : 0;
    this.hp = this.done ? this.maxHp : Math.max(1, this.maxHp * 0.1);
    this.queue = [];        // unit keys being trained
    this.trainT = 0;
    this.rally = null;
    this.cd = 0;
    this.scanT = 0;
    this.worker = null;     // farm worker
    this.foodT = 0;
    this.growT = 0;         // crop growth cycle (visual)
    this._builders = 0;
    this.dead = false;
    // farms are flat fields: units walk on them to work
    if (key !== 'farm') GameMap.setBlockedRect(x, y, this.size, 1);
  }

  get cx() { return this.x + this.size / 2; }
  get cy() { return this.y + this.size / 2; }

  update(dt) {
    // construction
    if (!this.done) {
      if (this._builders > 0) {
        const speed = Math.min(this._builders, CFG.MAX_BUILDERS);
        this.progress += dt * speed;
        this.hp = Math.min(this.maxHp,
          this.maxHp * (0.1 + 0.9 * this.progress / this.def.buildTime));
        if (this.progress >= this.def.buildTime) {
          this.done = true;
          this.hp = this.maxHp;
          if (this.owner === 0) UI.toast(this.def.name + ' completed');
        }
      }
      this._builders = 0;
      return;
    }
    this._builders = 0;

    // crops grow while a villager actually works the farm
    if (this.def.farmRate && this.worker && !this.worker.dead && this.worker.state === 'farm') {
      this.growT += dt;
      if (this.growT >= 24) { // harvest — the cycle starts over
        this.growT = 0;
        Game.addFx('gold', this.cx, this.cy, 0.6);
      }
    }

    // training queue
    if (this.queue.length > 0) {
      const key = this.queue[0];
      const stat = unitStat(Game.players[this.owner].civ, key);
      this.trainT += dt;
      if (this.trainT >= stat.trainTime) {
        if (Game.popUsed(this.owner) + stat.pop <= CFG.POP_CAP) {
          this.trainT = 0;
          this.queue.shift();
          const spot = GameMap.findFreeTile(this.x + this.size, this.y + this.size, 6);
          if (spot) {
            const u = Game.addUnit(this.owner, key, spot.x + 0.5, spot.y + 0.5);
            // villagers follow the Town Hall's own rally; all troops share
            // one army rally point per player
            const rally = this.key === 'towncenter' ? this.rally : Game.players[this.owner].rally;
            if (rally) dispatchCommand([u], rally.x, rally.y);
          }
        }
        // if pop-capped, wait (trainT stays at max)
        this.trainT = Math.min(this.trainT, stat.trainTime);
      }
    }

    // tower / town hall arrows
    if (this.def.attack) {
      this.cd = Math.max(0, this.cd - dt);
      this.scanT -= dt;
      if (this.scanT <= 0) {
        this.scanT = 0.4;
        this._tgt = nearestEnemyUnit(this.owner, this.cx, this.cy, this.def.attack.range);
      }
      const t = this._tgt;
      if (t && !t.dead && this.cd <= 0 &&
          dist(this.cx, this.cy, t.x, t.y) <= this.def.attack.range) {
        this.cd = this.def.attack.rate;
        Game.projectiles.push(new Projectile(this, t));
      }
    }
  }

  trainUnit(key) {
    const p = Game.players[this.owner];
    const stat = unitStat(p.civ, key);
    if (this.queue.length >= 8) return false;
    if (Game.popUsed(this.owner) + stat.pop > CFG.POP_CAP) {
      if (this.owner === 0) UI.toast('Population cap reached');
      return false;
    }
    if (!Game.canAfford(this.owner, stat.cost)) {
      if (this.owner === 0) UI.toast('Not enough resources');
      return false;
    }
    Game.pay(this.owner, stat.cost);
    this.queue.push(key);
    return true;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      if (this.key !== 'farm') GameMap.setBlockedRect(this.x, this.y, this.size, 0);
      if (this.worker) { this.worker.target = null; this.worker.state = 'idle'; }
      // collapse cloud
      Game.addFx('death', this.cx, this.cy, 0.7);
      Game.addFx('death', this.x + 0.4, this.y + 0.4, 0.7);
      Game.addFx('build', this.cx, this.cy, 0.6);
    }
  }
}

// ---------------- Projectile ----------------
class Projectile {
  constructor(src, target) {
    this.owner = src.owner;
    this.x = entityX(src); this.y = entityY(src);
    const srcStat = src.stat || src.def.attack;
    this.dmg = src.stat ? src.stat.atk : src.def.attack.dmg;
    this.srcKey = src.key;
    this.isPierce = true; // arrows & stones both count as pierce for ram resist
    if (src.stat && src.stat.projectile === 'stone') {
      this.type = 'stone';
      this.aoe = src.stat.aoe;
      this.tx = entityX(target); this.ty = entityY(target); // fixed ground target
      this.speed = 5;
    } else {
      this.type = 'arrow';
      this.target = target;
      this.speed = 12;
    }
    this.t = 0;
    this.startX = this.x; this.startY = this.y;
    this.dead = false;
  }

  update(dt) {
    this.t += dt;
    if (this.type === 'arrow') {
      const t = this.target;
      if (!t || t.dead) { this.dead = true; return; }
      const tx = entityX(t), ty = entityY(t);
      const d = dist(this.x, this.y, tx, ty);
      const step = this.speed * dt;
      if (d <= step + 0.2) {
        this.dead = true;
        dealDamage(this, t, true);
      } else {
        this.x += ((tx - this.x) / d) * step;
        this.y += ((ty - this.y) / d) * step;
      }
    } else {
      const d = dist(this.x, this.y, this.tx, this.ty);
      const step = this.speed * dt;
      if (d <= step) {
        this.dead = true;
        // area damage to all enemies around the impact
        for (const u of Game.units) {
          if (u.owner === this.owner || u.dead) continue;
          if (dist(u.x, u.y, this.tx, this.ty) <= this.aoe) dealDamage(this, u, true);
        }
        for (const b of Game.buildings) {
          if (b.owner === this.owner || b.dead) continue;
          if (dist(b.cx, b.cy, this.tx, this.ty) <= this.aoe + b.size * 0.5) dealDamage(this, b, true);
        }
        Game.impacts.push({ x: this.tx, y: this.ty, t: 0.35 });
      } else {
        this.x += ((this.tx - this.x) / d) * step;
        this.y += ((this.ty - this.y) / d) * step;
      }
    }
  }
}

// ---------------- combat helpers ----------------
function dealDamage(src, target, isProjectile) {
  let dmg = src.dmg !== undefined ? src.dmg : src.stat.atk;
  const srcKey = src.srcKey || src.key;
  if (target instanceof Building) {
    dmg *= VS_BUILDING[srcKey] !== undefined ? VS_BUILDING[srcKey] : 0.5;
  } else {
    if (srcKey && BONUS[srcKey] && BONUS[srcKey][target.key]) dmg *= BONUS[srcKey][target.key];
    if (isProjectile && target.stat && target.stat.pierceResist) dmg *= (1 - target.stat.pierceResist);
    // rams can't hit units at all
    if (srcKey === 'ram' && !(target instanceof Building)) return;
  }
  Game.addFx('hit', entityX(target), entityY(target), 0.3);
  target.takeDamage(Math.max(0.5, dmg));
  // fight back: idle defenders engage their attacker
  if (target instanceof Unit && target.state === 'idle' && target.isMilitary &&
      target.key !== 'ram' && src instanceof Unit) {
    target.anchor = { x: target.x, y: target.y };
    target.state = 'attack';
    target.target = src;
  }
}

function entityX(e) { return e instanceof Building ? e.cx : e.x; }
function entityY(e) { return e instanceof Building ? e.cy : e.y; }
function resType(r) { return r.type === 'tree' ? 'wood' : r.type === 'gold' ? 'gold' : 'food'; }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

// distance from a unit to an entity (buildings use their footprint edge)
function distToEntity(u, e) {
  if (e instanceof Building) {
    const nx = Math.max(e.x, Math.min(u.x, e.x + e.size));
    const ny = Math.max(e.y, Math.min(u.y, e.y + e.size));
    return dist(u.x, u.y, nx, ny);
  }
  return dist(u.x, u.y, e.x, e.y) - e.radius;
}

function nearestEnemyUnit(owner, x, y, range) {
  let best = null, bestD = range;
  for (const u of Game.units) {
    if (u.owner === owner || u.dead) continue;
    const d = dist(x, y, u.x, u.y);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function nearestDropoff(owner, x, y) {
  let best = null, bestD = Infinity;
  for (const b of Game.buildings) {
    if (b.owner !== owner || !b.done || !b.def.dropoff || b.dead) continue;
    const d = dist(x, y, b.cx, b.cy);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// What entity sits at a world point? (for clicks & smart commands)
function entityAt(wx, wy, ownerFilter) {
  for (const u of Game.units) {
    if (u.dead) continue;
    if (ownerFilter !== undefined && u.owner !== ownerFilter) continue;
    if (dist(wx, wy, u.x, u.y) < u.radius + 0.35) return u;
  }
  const tx = wx | 0, ty = wy | 0;
  for (const b of Game.buildings) {
    if (b.dead) continue;
    if (ownerFilter !== undefined && b.owner !== ownerFilter) continue;
    if (tx >= b.x && tx < b.x + b.size && ty >= b.y && ty < b.y + b.size) return b;
  }
  return null;
}

// Right-click style contextual command for a group of units.
// `picked` (optional) is a sprite-accurate hit from Renderer.pickEntity —
// it wins over tile-based resolution so clicking foliage/rooftops works.
function dispatchCommand(units, wx, wy, picked) {
  if (units.length === 0) return;
  const owner = units[0].owner;
  let enemy = entityAt(wx, wy, 1 - owner);
  let own = enemy ? null : entityAt(wx, wy, owner);
  let res = enemy || own ? null : GameMap.resourceAt(wx | 0, wy | 0);
  if (picked) {
    if (picked.kind === 'resource') { res = picked.e; enemy = null; own = null; }
    else if (picked.e.owner === owner) {
      if (picked.kind === 'building') { own = picked.e; enemy = null; res = null; }
    } else { enemy = picked.e; own = null; res = null; }
  }

  let i = 0;
  for (const u of units) {
    if (enemy) { u.orderAttack(enemy); continue; }
    if (own instanceof Building) {
      if (!own.done) { u.orderBuild(own); continue; }
      if (own.def.farmRate && !own.worker && u.stat.isVillager) { u.orderFarm(own); continue; }
      if (own.def.dropoff && u.carry.amt > 0) { u.state = 'return'; u.setPath(own.cx, own.cy); continue; }
    }
    if (res) { u.orderGather(res); continue; }
    // plain move with a small formation spread
    const ring = Math.floor(Math.sqrt(i));
    const ang = i * 2.4;
    u.orderMove(wx + Math.cos(ang) * ring * 0.7, wy + Math.sin(ang) * ring * 0.7);
    i++;
  }
}

// Soft collision: push overlapping units apart
function resolveUnitCollisions() {
  const units = Game.units;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const minD = a.radius + b.radius;
      let d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      if (d2 === 0) { // perfectly stacked: nudge apart in a random direction
        const a2 = Math.random() * Math.PI * 2;
        dx = Math.cos(a2) * 0.01; dy = Math.sin(a2) * 0.01;
        d2 = 0.0001;
      }
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const px = (dx / d) * push, py = (dy / d) * push;
      tryShift(a, -px, -py);
      tryShift(b, px, py);
    }
  }
}
function tryShift(u, dx, dy) {
  const nx = u.x + dx, ny = u.y + dy;
  if (!GameMap.isBlocked(nx | 0, u.y | 0)) u.x = Math.max(0.2, Math.min(GameMap.size - 0.2, nx));
  if (!GameMap.isBlocked(u.x | 0, ny | 0)) u.y = Math.max(0.2, Math.min(GameMap.size - 0.2, ny));
}
