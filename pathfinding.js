// ============================================================
// AGE OF PIXELS — A* pathfinding on the tile grid
// 8 directions, no corner cutting through blocked tiles.
// Returns a list of tile-center waypoints, or null.
// ============================================================

const Path = (() => {
  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41],
  ];

  function find(sx, sy, tx, ty) {
    const N = GameMap.size;
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!GameMap.inBounds(tx, ty)) return null;

    // if target blocked, retarget to nearest free neighbour
    if (GameMap.isBlocked(tx, ty)) {
      const f = GameMap.findFreeTile(tx, ty, 4);
      if (!f) return null;
      tx = f.x; ty = f.y;
    }
    if (sx === tx && sy === ty) return [{ x: tx + 0.5, y: ty + 0.5 }];

    const open = new MinHeap();
    const gScore = new Float32Array(N * N).fill(Infinity);
    const cameFrom = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    const si = sy * N + sx, ti = ty * N + tx;
    gScore[si] = 0;
    open.push(si, heur(sx, sy, tx, ty));

    let iter = 0;
    while (open.size > 0 && iter++ < 6000) {
      const cur = open.pop();
      if (cur === ti) return rebuild(cameFrom, cur, N);
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % N, cy = (cur / N) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!GameMap.inBounds(nx, ny)) continue;
        const ni = ny * N + nx;
        if (GameMap.blocked[ni]) continue;
        // no cutting corners diagonally
        if (dx !== 0 && dy !== 0) {
          if (GameMap.isBlocked(cx + dx, cy) || GameMap.isBlocked(cx, cy + dy)) continue;
        }
        const g = gScore[cur] + cost;
        if (g < gScore[ni]) {
          gScore[ni] = g;
          cameFrom[ni] = cur;
          open.push(ni, g + heur(nx, ny, tx, ty));
        }
      }
    }
    return null; // unreachable
  }

  function heur(x, y, tx, ty) {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  }

  function rebuild(cameFrom, cur, N) {
    const out = [];
    while (cur >= 0) {
      out.push({ x: (cur % N) + 0.5, y: ((cur / N) | 0) + 0.5 });
      cur = cameFrom[cur];
    }
    out.reverse();
    out.shift(); // drop the start tile
    return out.length ? out : null;
  }

  // tiny binary min-heap keyed on f-score
  class MinHeap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      this.k.push(key); this.v.push(val);
      let i = this.k.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (this.v[par] <= this.v[i]) break;
        this.swap(i, par); i = par;
      }
    }
    pop() {
      const top = this.k[0], last = this.k.length - 1;
      this.swap(0, last); this.k.pop(); this.v.pop();
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.v[l] < this.v[m]) m = l;
        if (r < this.k.length && this.v[r] < this.v[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
      return top;
    }
    swap(a, b) {
      [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
      [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
    }
  }

  return { find };
})();
