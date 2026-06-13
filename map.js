// ============================================================
// AGE OF PIXELS — map generation & tile queries
// Point-symmetric map: every resource near player 0's corner is
// mirrored for player 1, so both sides start fair.
// ============================================================

const GameMap = {
  size: CFG.MAP_SIZE,
  terrainVariant: null, // Uint8 per tile: grass variant 0..7
  blocked: null,        // Uint8 per tile: 1 = not walkable
  water: null,          // Uint8 per tile: 1 = lake/stream
  mountains: [],        // impassable peaks {x, y}
  resources: [],        // {id, type:'tree'|'gold'|'berry', x, y, amount}
  resGrid: null,        // tile index -> resource (or undefined)
  startPositions: [{ x: 7, y: 7 }, { x: 39, y: 39 }],

  idx(x, y) { return y * this.size + x; },
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; },
  isBlocked(x, y) { return !this.inBounds(x, y) || this.blocked[this.idx(x, y)] === 1; },
  resourceAt(x, y) { return this.resGrid[this.idx(x, y)]; },

  generate() {
    const N = this.size;
    this.terrainVariant = new Uint8Array(N * N);
    this.decor = new Uint8Array(N * N);   // 0 none, 1 flowers, 2 grass tuft, 3 pebbles
    this.blocked = new Uint8Array(N * N);
    this.water = new Uint8Array(N * N);
    this.mountains = [];
    this.resources = [];
    this.resGrid = new Array(N * N);
    let nextId = 1;

    // pseudo-noise shading: large light/dark grass patches instead of uniform green
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const n = Math.sin(x * 0.31 + 1.7) + Math.cos(y * 0.27 + 0.5) +
                  Math.sin((x + y) * 0.13) + Math.sin(x * 0.71 + y * 0.53) * 0.5;
        let shade = Math.round((n + 3) / 6 * 3 + (Math.random() - 0.5) * 0.7);
        shade = Math.max(0, Math.min(3, shade));
        this.terrainVariant[this.idx(x, y)] = shade * 2 + ((Math.random() * 2) | 0); // 0..7
        const r = Math.random();
        this.decor[this.idx(x, y)] = r < 0.045 ? 1 : r < 0.10 ? 2 : r < 0.13 ? 3 : 0;
      }
    }

    const mirror = (x, y) => ({ x: N - 1 - x, y: N - 1 - y });

    const place = (type, x, y, amount) => {
      if (!this.inBounds(x, y) || this.isBlocked(x, y)) return;
      // keep clear of both start areas
      for (const sp of this.startPositions) {
        if (Math.abs(x - sp.x) <= 3 && Math.abs(y - sp.y) <= 3) return;
      }
      const r = { id: nextId++, type, x, y, amount };
      this.resources.push(r);
      this.resGrid[this.idx(x, y)] = r;
      this.blocked[this.idx(x, y)] = 1;
    };

    // mirrored placement helper
    const placeSym = (type, x, y, amount) => {
      place(type, x, y, amount);
      const m = mirror(x, y);
      place(type, m.x, m.y, amount);
    };

    // --- vital resources FIRST so forests can never wall them in ---
    // berries (food)
    for (const [bx, by] of [[12, 5], [12, 6], [13, 5], [13, 6], [5, 12], [6, 12]]) {
      placeSym('berry', bx, by, 120);
    }
    // gold cluster
    for (const [gx, gy] of [[15, 11], [16, 11], [15, 12], [16, 12]]) {
      placeSym('gold', gx, gy, 500);
    }
    // contested center gold (the strategic prize)
    const c = (N / 2) | 0;
    for (const [gx, gy] of [[c - 1, c - 1], [c, c - 1], [c - 1, c], [c, c]]) {
      place('gold', gx, gy, 700);
    }
    // side prizes in the west/east corners (worth the trip out there)
    for (const [gx, gy] of [[3, 41], [4, 41], [3, 42]]) placeSym('gold', gx, gy, 500);
    for (const [bx, by] of [[13, 43], [14, 43]]) placeSym('berry', bx, by, 120);

    // keep a breathing ring around berries & gold free of trees
    const protectedTiles = new Set();
    for (const r of this.resources) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (this.resGrid[this.idx(r.x, r.y)] === r && (dx || dy)) {
            protectedTiles.add(this.idx(r.x + dx, r.y + dy));
          }
        }
      }
    }
    const placeTree = (x, y) => {
      if (!this.inBounds(x, y) || protectedTiles.has(this.idx(x, y))) return;
      place('tree', x, y, 50);
    };
    const placeTreeSym = (x, y) => {
      placeTree(x, y);
      const m = mirror(x, y);
      placeTree(m.x, m.y);
    };

    // --- lakes & streams (impassable water), mirrored for fairness ---
    const nearAnyStart = (x, y, d) =>
      this.startPositions.some(sp => Math.abs(x - sp.x) <= d && Math.abs(y - sp.y) <= d);
    const stampWater = (x, y) => {
      for (const pt of [{ x, y }, mirror(x, y)]) {
        if (!this.inBounds(pt.x, pt.y)) continue;
        const id = this.idx(pt.x, pt.y);
        if (this.blocked[id] || protectedTiles.has(id) || nearAnyStart(pt.x, pt.y, 6)) continue;
        this.water[id] = 1;
        this.blocked[id] = 1;
      }
    };
    // lake body in the west corner (mirrored to the east corner)
    for (let i = 0; i < 6; i++) {
      const lx = 6 + ((Math.random() * 5) | 0), ly = 37 + ((Math.random() * 5) | 0);
      const r = 1.4 + Math.random() * 1.4;
      for (let y = Math.floor(ly - r); y <= Math.ceil(ly + r); y++) {
        for (let x = Math.floor(lx - r); x <= Math.ceil(lx + r); x++) {
          if ((x - lx) * (x - lx) + (y - ly) * (y - ly) <= r * r) stampWater(x, y);
        }
      }
    }
    // stream snaking from the lake toward the center, with a ford (dry crossing)
    let rx = 11, ry = 35;
    for (let i = 0; i < 11; i++) {
      if (i === 5 || i === 6) { rx += 1; ry -= 1; continue; } // the ford
      stampWater(rx, ry);
      stampWater(rx, ry + 1);
      rx += 1;
      if (Math.random() < 0.5) ry -= 1;
    }

    // --- mountain ranges (impassable, mirrored) ---
    const stampMountain = (x, y) => {
      for (const pt of [{ x, y }, mirror(x, y)]) {
        if (!this.inBounds(pt.x, pt.y)) continue;
        const id = this.idx(pt.x, pt.y);
        if (this.blocked[id] || protectedTiles.has(id) || nearAnyStart(pt.x, pt.y, 5)) continue;
        this.blocked[id] = 1;
        this.mountains.push({ x: pt.x, y: pt.y });
      }
    };
    for (const [mcx, mcy, count] of [[19, 30, 6], [34, 27, 5], [4, 33, 3]]) {
      let mx = mcx, my = mcy;
      for (let i = 0; i < count; i++) {
        stampMountain(mx, my);
        mx += ((Math.random() * 3) | 0) - 1;
        my += (Math.random() * 2) | 0;
      }
    }

    // --- forests: a few blobs per half, mirrored ---
    const blob = (cx, cy, count) => {
      for (let i = 0; i < count; i++) {
        const x = cx + ((Math.random() * 7) | 0) - 3;
        const y = cy + ((Math.random() * 7) | 0) - 3;
        placeTreeSym(x, y);
      }
    };
    blob(14, 4, 14);
    blob(4, 16, 14);
    blob(20, 12, 10);
    blob(10, 28, 12);
    blob(30, 6, 12);
    blob(8, 44, 9);   // fills the west corner (mirrored east)
    blob(17, 40, 7);

    // a personal mini-forest right next to base
    for (const [tx, ty] of [[3, 3], [4, 2], [2, 4], [3, 2], [2, 3], [4, 3], [2, 2]]) {
      placeTreeSym(tx, ty);
    }

    // --- scattered lone trees, mirrored ---
    for (let i = 0; i < 26; i++) {
      const x = (Math.random() * N) | 0, y = (Math.random() * (N / 2)) | 0;
      placeTreeSym(x, y);
    }
  },

  // Called when a resource is exhausted
  removeResource(r) {
    const i = this.resources.indexOf(r);
    if (i >= 0) this.resources.splice(i, 1);
    this.resGrid[this.idx(r.x, r.y)] = undefined;
    this.blocked[this.idx(r.x, r.y)] = 0;
    if (r.type === 'tree') {
      // timber! dust puff + stump where the tree stood
      Game.addFx('build', r.x + 0.5, r.y + 0.5, 0.6);
      Game.addFx('chop', r.x + 0.5, r.y + 0.5, 0.5);
      Game.stumps.push({ x: r.x, y: r.y });
      if (Game.stumps.length > 60) Game.stumps.shift();
    }
  },

  // Find the nearest resource of a type around (x, y), within maxDist
  nearestResource(type, x, y, maxDist = 10) {
    let best = null, bestD = maxDist * maxDist;
    for (const r of this.resources) {
      if (r.type !== type) continue;
      if (r.unreachableUntil && r.unreachableUntil > Game.time) continue;
      const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  },

  setBlockedRect(x, y, size, val) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (this.inBounds(x + dx, y + dy)) this.blocked[this.idx(x + dx, y + dy)] = val;
      }
    }
  },

  // Is a size x size building footprint placeable at (x, y)?
  canPlaceBuilding(x, y, size) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (this.isBlocked(x + dx, y + dy)) return false;
        // don't allow building on top of units
        for (const u of Game.units) {
          if ((u.x | 0) === x + dx && (u.y | 0) === y + dy) return false;
        }
      }
    }
    // farms are walkable, so check building footprints explicitly
    for (const b of Game.buildings) {
      if (b.dead) continue;
      if (x < b.x + b.size && x + size > b.x && y < b.y + b.size && y + size > b.y) return false;
    }
    return true;
  },

  // Spiral-search the nearest free tile around (x, y)
  findFreeTile(x, y, maxR = 8) {
    if (!this.isBlocked(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isBlocked(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  },
};
