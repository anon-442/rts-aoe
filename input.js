// ============================================================
// AGE OF PIXELS — mouse & keyboard input
// Left click / drag = select. Right click = contextual order.
// WASD / arrows / screen edges = pan camera. Esc = cancel. P = pause.
// ============================================================

const Input = {
  cam: { x: 0, y: 0 },
  mouse: { x: 0, y: 0, inside: false },
  selection: new Set(),
  drag: null,
  placeMode: null,   // {key, tx, ty, ok} while placing a building
  keys: {},
  midPan: null,

  init(canvas) {
    canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    window.addEventListener('mousemove', e => this.onMouseMove(e));
    window.addEventListener('mouseup', e => this.onMouseUp(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', e => this.onKeyDown(e));
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    document.addEventListener('mouseenter', () => { this.mouse.inside = true; });
  },

  centerOn(wx, wy) {
    const c = Renderer.canvas, Z = Renderer.zoom;
    this.cam.x = (wx - wy) * (CFG.TILE_W / 2) - c.width / Z / 2;
    this.cam.y = (wx + wy) * (CFG.TILE_H / 2) - c.height / Z / 2;
  },

  // mouse-wheel zoom, anchored on the cursor
  ZOOM_STEPS: [0.5, 0.65, 0.8, 1, 1.25, 1.6, 2],
  setZoom(newZ, anchorX, anchorY) {
    const oldZ = Renderer.zoom;
    if (newZ === oldZ) return;
    // keep the world point under the anchor fixed
    this.cam.x += anchorX / oldZ - anchorX / newZ;
    this.cam.y += anchorY / oldZ - anchorY / newZ;
    Renderer.zoom = newZ;
  },
  stepZoom(dir, anchorX, anchorY) {
    const steps = this.ZOOM_STEPS;
    let i = 0;
    for (let k = 1; k < steps.length; k++) {
      if (Math.abs(steps[k] - Renderer.zoom) < Math.abs(steps[i] - Renderer.zoom)) i = k;
    }
    const ni = Math.max(0, Math.min(steps.length - 1, i + dir));
    this.setZoom(steps[ni], anchorX, anchorY);
  },
  onWheel(e) {
    if (!Game.started) return;
    e.preventDefault();
    this.stepZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  },

  selectedOwnUnits() {
    return [...this.selection].filter(e => e instanceof Unit && e.owner === 0 && !e.dead);
  },
  selectedOwnBuilding() {
    const b = [...this.selection].find(e => e instanceof Building && e.owner === 0 && !e.dead);
    return b || null;
  },

  onMouseDown(e) {
    if (!Game.started || Game.over) return;
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;

    if (e.button === 1) { // middle: pan
      this.midPan = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      if (this.placeMode) {
        if (this.placeMode.ok) {
          const b = Game.placeBuilding(0, this.placeMode.key, this.placeMode.tx, this.placeMode.ty);
          if (b) {
            for (const v of this.selectedOwnUnits()) {
              if (v.stat.isVillager) v.orderBuild(b);
            }
            if (!e.shiftKey) this.placeMode = null;
          }
        } else {
          UI.toast("Can't build there");
        }
        return;
      }
      this.drag = { active: false, x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey };
    }

    if (e.button === 2 && this.placeMode) {
      this.placeMode = null; // right click cancels placement
    }
  },

  onMouseMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.mouse.inside = true;
    if (this.midPan) {
      this.cam.x -= (e.clientX - this.midPan.x) / Renderer.zoom;
      this.cam.y -= (e.clientY - this.midPan.y) / Renderer.zoom;
      this.midPan = { x: e.clientX, y: e.clientY };
    }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      if (Math.abs(this.drag.x1 - this.drag.x0) + Math.abs(this.drag.y1 - this.drag.y0) > 6) {
        this.drag.active = true;
      }
    }
  },

  onMouseUp(e) {
    if (e.button === 1) { this.midPan = null; return; }
    if (e.button === 2) { this.onRightClick(e); return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (!Game.started || Game.over) return;
    if (e.target !== Renderer.canvas) return; // released over the HUD

    if (!d.shift) this.selection.clear();

    if (d.active) {
      // box select own units (drag box is in screen px, world draws in zoomed px)
      const Z = Renderer.zoom;
      const x0 = Math.min(d.x0, d.x1) / Z, x1 = Math.max(d.x0, d.x1) / Z;
      const y0 = Math.min(d.y0, d.y1) / Z, y1 = Math.max(d.y0, d.y1) / Z;
      for (const u of Game.units) {
        if (u.owner !== 0 || u.dead) continue;
        const s = Renderer.worldToScreen(u.x, u.y);
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 - 16 && s.y <= y1 + 8) this.selection.add(u);
      }
      // if the box caught both military and villagers, prefer military
      const sel = [...this.selection];
      if (sel.some(u => u.isMilitary) && sel.some(u => !u.isMilitary)) {
        for (const u of sel) if (!u.isMilitary) this.selection.delete(u);
      }
    } else {
      // single click select: sprite-accurate pick (own or enemy, units or buildings)
      const picked = Renderer.pickEntity(e.clientX, e.clientY);
      if (picked && picked.kind !== 'resource') this.selection.add(picked.e);
    }
    UI.refreshPanel();
  },

  onRightClick(e) {
    if (!Game.started || Game.over || this.placeMode) return;
    if (e.target !== Renderer.canvas) return;
    const w = Renderer.screenToWorld(e.clientX, e.clientY);

    const units = this.selectedOwnUnits();
    if (units.length > 0) {
      dispatchCommand(units, w.x, w.y, Renderer.pickEntity(e.clientX, e.clientY));
      return;
    }
    // rally point for a selected production building
    const b = this.selectedOwnBuilding();
    if (b && b.def.trains) {
      if (b.key === 'towncenter') {
        b.rally = { x: w.x, y: w.y };
        UI.toast('Villager rally point set');
      } else {
        // one shared rally for ALL military production
        Game.players[0].rally = { x: w.x, y: w.y };
        UI.toast('Army rally point set (all military buildings)');
      }
    }
  },

  onKeyDown(e) {
    const k = e.key.toLowerCase();
    this.keys[k] = true;
    if (!Game.started) return;
    if (k === 'escape') {
      if (this.placeMode) this.placeMode = null;
      else { this.selection.clear(); UI.refreshPanel(); }
    }
    if (k === 'p' && !Game.over) {
      Game.paused = !Game.paused;
      UI.toast(Game.paused ? 'PAUSED — press P to resume' : 'Resumed');
    }
    if (k === 'h') { // jump to town hall
      const tc = Game.townCenter(0);
      if (tc) this.centerOn(tc.cx, tc.cy);
    }
    if (k === '+' || k === '=') {
      this.stepZoom(1, Renderer.canvas.width / 2, Renderer.canvas.height / 2);
    }
    if (k === '-') {
      this.stepZoom(-1, Renderer.canvas.width / 2, Renderer.canvas.height / 2);
    }
  },

  update(dt) {
    if (!Game.started) return;
    const speed = 650 * dt / Renderer.zoom; // constant perceived pan speed
    const c = Renderer.canvas;
    const m = this.mouse;
    const EDGE = 24;

    if (this.keys['arrowleft'] || this.keys['q'] || this.keys['a']) this.cam.x -= speed;
    if (this.keys['arrowright'] || this.keys['d']) this.cam.x += speed;
    if (this.keys['arrowup'] || this.keys['z'] || this.keys['w']) this.cam.y -= speed;
    if (this.keys['arrowdown'] || this.keys['s']) this.cam.y += speed;

    if (m.inside && !this.midPan) {
      if (m.x < EDGE) this.cam.x -= speed;
      if (m.x > c.width - EDGE) this.cam.x += speed;
      if (m.y < EDGE) this.cam.y -= speed;
      if (m.y > c.height - EDGE) this.cam.y += speed;
    }

    // clamp to the world (viewport size in world px depends on zoom)
    const N = GameMap.size;
    const half = N * CFG.TILE_W / 2;
    const worldH = N * CFG.TILE_H;
    const vw = c.width / Renderer.zoom, vh = c.height / Renderer.zoom;
    this.cam.x = Math.max(-half - vw / 2, Math.min(half - vw / 2, this.cam.x));
    this.cam.y = Math.max(-vh / 3, Math.min(worldH - vh / 2, this.cam.y));
  },

  startPlacement(key) {
    this.placeMode = { key, tx: 0, ty: 0, ok: false };
  },
};
