// ============================================================
// AGE OF PIXELS — HUD: top bar, selection panel, minimap, toasts
// ============================================================

const UI = {
  els: {},
  minimapT: 0,
  panelT: 0,

  init() {
    const $ = id => document.getElementById(id);
    this.els = {
      hud: $('hud'), topbar: $('topbar'),
      food: $('res-food'), wood: $('res-wood'), gold: $('res-gold'),
      pop: $('res-pop'), time: $('gtime'), matchup: $('matchup'),
      selinfo: $('selinfo'), actions: $('actions'),
      minimap: $('minimap'), toasts: $('toasts'),
      end: $('endscreen'), endtitle: $('endtitle'), endmsg: $('endmsg'),
    };
    // resource icons
    for (const kind of ['food', 'wood', 'gold', 'pop']) {
      const slot = document.getElementById('icon-' + kind);
      const c = Sprites.icon(kind);
      c.className = 'resicon';
      slot.appendChild(c);
    }
    this.mm = this.els.minimap.getContext('2d');
    this.els.minimap.addEventListener('mousedown', e => this.minimapClick(e));
    document.getElementById('btn-again').addEventListener('click', () => {
      this.els.end.classList.add('hidden');
      document.getElementById('menu').classList.remove('hidden');
      this.els.hud.classList.add('hidden');
      Game.started = false;
    });
  },

  update(dt) {
    if (!Game.started) return;
    const r = Game.players[0].res;
    this.els.food.textContent = r.food | 0;
    this.els.wood.textContent = r.wood | 0;
    this.els.gold.textContent = r.gold | 0;
    this.els.pop.textContent = Game.popUsed(0) + '/' + CFG.POP_CAP;
    const t = Game.time | 0;
    this.els.time.textContent = ((t / 60) | 0) + ':' + String(t % 60).padStart(2, '0');

    this.minimapT -= dt;
    if (this.minimapT <= 0) { this.minimapT = 0.3; this.drawMinimap(); }

    // live-refresh the panel while something trains or builds
    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.4;
      const b = Input.selectedOwnBuilding();
      if (b && (b.queue.length > 0 || !b.done)) this.refreshPanel();
    }
  },

  // ---------------- selection panel ----------------
  refreshPanel() {
    const info = this.els.selinfo, act = this.els.actions;
    info.innerHTML = ''; act.innerHTML = '';
    const sel = [...Input.selection].filter(e => !e.dead);
    if (sel.length === 0) {
      info.innerHTML = '<div class="hint">Select units with left click / drag.<br>' +
        'Right click to move, gather, attack.<br>Mouse wheel = zoom.<br>' +
        'Keys: WASD/arrows pan, H = Town Hall, P = pause.</div>';
      return;
    }

    const units = sel.filter(e => e instanceof Unit);
    const bld = sel.find(e => e instanceof Building);

    if (units.length > 0) {
      // grouped portraits
      const groups = {};
      for (const u of units) (groups[u.key] = groups[u.key] || []).push(u);
      const row = document.createElement('div');
      row.className = 'portrait-row';
      for (const key in groups) {
        const g = groups[key];
        const cell = document.createElement('div');
        cell.className = 'portrait';
        const img = Sprites.unit(key, g[0].owner, false);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        cell.appendChild(c);
        const n = document.createElement('span');
        n.textContent = g.length > 1 ? g[0].stat.name + ' x' + g.length : g[0].stat.name;
        cell.appendChild(n);
        row.appendChild(cell);
      }
      info.appendChild(row);
      if (units.length === 1) {
        const u = units[0];
        const hp = document.createElement('div');
        hp.className = 'hint';
        hp.textContent = 'HP ' + Math.ceil(u.hp) + '/' + u.stat.hp +
          (u.owner !== 0 ? '  (enemy)' : '');
        info.appendChild(hp);
      }
      // villager build menu
      if (units.some(u => u.owner === 0 && u.stat.isVillager)) {
        for (const key of BUILD_MENU) {
          const cost = buildingCost(Game.players[0].civ, key);
          this.button(act, BUILDINGS[key].name, costText(cost), () => {
            if (!Game.canAfford(0, cost)) { this.toast('Not enough resources'); return; }
            Input.startPlacement(key);
          });
        }
      }
      return;
    }

    if (bld) {
      const title = document.createElement('div');
      title.className = 'bld-title';
      title.textContent = bld.def.name + (bld.owner !== 0 ? ' (enemy)' : '');
      info.appendChild(title);
      const hp = document.createElement('div');
      hp.className = 'hint';
      hp.textContent = bld.done
        ? 'HP ' + Math.ceil(bld.hp) + '/' + bld.maxHp
        : 'Under construction — ' + Math.round(100 * bld.progress / bld.def.buildTime) + '%';
      info.appendChild(hp);

      if (bld.owner !== 0) return;

      // training buttons
      if (bld.done && bld.def.trains) {
        for (const key of bld.def.trains) {
          const stat = unitStat(Game.players[0].civ, key);
          this.button(act, stat.name, costText(stat.cost) + ' | pop ' + stat.pop, () => {
            bld.trainUnit(key);
            this.refreshPanel();
          });
        }
        if (bld.queue.length > 0) {
          const stat = unitStat(Game.players[0].civ, bld.queue[0]);
          const q = document.createElement('div');
          q.className = 'hint';
          q.textContent = 'Queue (' + bld.queue.length + '): ' + stat.name + ' ' +
            Math.round(100 * bld.trainT / stat.trainTime) + '%';
          info.appendChild(q);
        }
        const rallyHint = document.createElement('div');
        rallyHint.className = 'hint dim';
        rallyHint.textContent = bld.key === 'towncenter'
          ? 'Right-click ground to set the villager rally point'
          : 'Right-click ground to set the army rally point (shared by all military buildings)';
        info.appendChild(rallyHint);
      }

      // market
      if (bld.done && bld.def.market) {
        const rates = marketRates(Game.players[0].civ);
        this.button(act, 'Sell 100 Wood', '+' + rates.sellGets + ' gold',
          () => Game.marketTrade(0, 'sell', 'wood'));
        this.button(act, 'Sell 100 Food', '+' + rates.sellGets + ' gold',
          () => Game.marketTrade(0, 'sell', 'food'));
        this.button(act, 'Buy 100 Wood', '-' + rates.buyCosts + ' gold',
          () => Game.marketTrade(0, 'buy', 'wood'));
        this.button(act, 'Buy 100 Food', '-' + rates.buyCosts + ' gold',
          () => Game.marketTrade(0, 'buy', 'food'));
      }

      // farm status
      if (bld.done && bld.def.farmRate) {
        const f = document.createElement('div');
        f.className = 'hint';
        f.textContent = bld.worker ? 'A villager is working this farm.'
          : 'Idle — right-click it with a villager.';
        info.appendChild(f);
      }
    }
  },

  button(parent, label, sub, onClick) {
    const b = document.createElement('button');
    b.className = 'actbtn';
    b.innerHTML = '<span>' + label + '</span><small>' + sub + '</small>';
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    parent.appendChild(b);
  },

  // ---------------- minimap ----------------
  drawMinimap() {
    const mm = this.mm, N = GameMap.size;
    const S = this.els.minimap.width / N;
    mm.fillStyle = '#06060c';
    mm.fillRect(0, 0, N * S, N * S);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fog = Game.fog[y * N + x];
        if (fog === 0) continue;
        if (GameMap.water[y * N + x]) mm.fillStyle = fog === 2 ? '#2a5a8c' : '#1c3a5c';
        else mm.fillStyle = fog === 2 ? '#3d6e30' : '#26421f';
        mm.fillRect(x * S, y * S, S, S);
      }
    }
    for (const mt of GameMap.mountains) {
      if (Game.fogAt(mt.x, mt.y) === 0) continue;
      mm.fillStyle = '#8a8f98';
      mm.fillRect(mt.x * S, mt.y * S, S, S);
    }
    for (const r of GameMap.resources) {
      if (Game.fogAt(r.x, r.y) === 0) continue;
      mm.fillStyle = r.type === 'tree' ? '#1c4a18' : r.type === 'gold' ? '#e8c84a' : '#c23b2e';
      mm.fillRect(r.x * S, r.y * S, S, S);
    }
    for (const b of Game.buildings) {
      if (b.owner !== 0 && !Renderer.buildingExplored(b)) continue;
      mm.fillStyle = TEAM_COLORS[b.owner].main;
      mm.fillRect(b.x * S - 1, b.y * S - 1, b.size * S + 2, b.size * S + 2);
    }
    for (const u of Game.units) {
      if (u.owner !== 0 && Game.fogAt(u.x, u.y) !== 2) continue;
      mm.fillStyle = TEAM_COLORS[u.owner].main;
      mm.fillRect(u.x * S - 1, u.y * S - 1, 2.5, 2.5);
    }
    // camera viewport (approximate: project screen corners to tiles)
    const c = Renderer.canvas;
    const tl = Renderer.screenToWorld(0, 0);
    const br = Renderer.screenToWorld(c.width, c.height);
    mm.strokeStyle = '#e8e4d8';
    mm.lineWidth = 1;
    mm.strokeRect(tl.x * S, tl.y * S, (br.x - tl.x) * S, (br.y - tl.y) * S);
  },

  minimapClick(e) {
    const rect = this.els.minimap.getBoundingClientRect();
    const N = GameMap.size;
    const x = (e.clientX - rect.left) / rect.width * N;
    const y = (e.clientY - rect.top) / rect.height * N;
    Input.centerOn(x, y);
  },

  // ---------------- toasts & end screen ----------------
  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.els.toasts.appendChild(t);
    setTimeout(() => t.classList.add('fade'), 1800);
    setTimeout(() => t.remove(), 2400);
  },

  showEnd(won) {
    this.els.endtitle.textContent = won ? 'VICTORY!' : 'DEFEAT';
    this.els.endtitle.className = won ? 'win' : 'lose';
    const t = Game.time | 0;
    this.els.endmsg.textContent = (won
      ? 'You razed the enemy Town Hall in '
      : 'Your Town Hall fell after ')
      + ((t / 60) | 0) + 'm ' + (t % 60) + 's.';
    this.els.end.classList.remove('hidden');
  },
};
