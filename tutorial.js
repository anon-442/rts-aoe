// ============================================================
// AGE OF PIXELS — interactive tutorial
// Steps auto-complete when the player performs the action;
// info-only steps show a NEXT button instead.
// ============================================================

const Tutorial = {
  steps: [
    {
      text: 'Welcome, lord! <b>Left-click</b> one of your Villagers to select it. (Drag a box to select several.)',
      check: () => [...Input.selection].some(e =>
        e instanceof Unit && e.owner === 0 && e.key === 'villager'),
    },
    {
      text: 'With a villager selected, <b>right-click</b> the berry bushes or a tree — it starts gathering food or wood.',
      check: () => Game.units.some(u => u.owner === 0 && u.key === 'villager' &&
        (u.state === 'gather' || u.state === 'return')),
    },
    {
      text: 'Select your <b>Town Hall</b> and train a new Villager. More villagers = faster economy.',
      check: () => {
        const tc = Game.townCenter(0);
        return (tc && tc.queue.length > 0) ||
          Game.units.filter(u => u.owner === 0 && u.key === 'villager').length > CFG.START_VILLAGERS;
      },
    },
    {
      text: 'Berries run out — <b>Farms</b> never do. Select a villager, press the <b>Farm</b> button and place it near your Town Hall. The builder will work it automatically.',
      check: () => Game.buildings.some(b => b.owner === 0 && b.key === 'farm'),
    },
    {
      text: 'Time for an army! Build a <b>Barracks</b> (150 wood), then train Men-at-Arms or Archers.',
      check: () => Game.units.some(u => u.owner === 0 && u.isMilitary),
    },
    {
      text: 'Know your counters: <b>Archers</b> beat infantry · <b>Infantry</b> beat knights · <b>Knights</b> beat archers & siege · <b>Rams</b> shrug off arrows and crush buildings. The <b>Market</b> trades resources for gold.',
    },
    {
      text: '<b>Victory</b>: destroy the enemy Town Hall before they destroy yours. Scout with the minimap, defend with towers. Good luck, lord!',
      last: true,
    },
  ],

  idx: 0,
  active: false,
  flashT: 0,
  els: null,

  init() {
    this.els = {
      panel: document.getElementById('tutorial'),
      step: document.getElementById('tut-step'),
      text: document.getElementById('tut-text'),
      next: document.getElementById('tut-next'),
      skip: document.getElementById('tut-skip'),
    };
    this.els.skip.addEventListener('click', () => this.finish());
    this.els.next.addEventListener('click', () => this.advance());
  },

  start(enabled) {
    this.idx = 0;
    this.flashT = 0;
    this.active = !!enabled;
    this.els.panel.classList.toggle('hidden', !this.active);
    if (this.active) this.render();
  },

  render() {
    const st = this.steps[this.idx];
    this.els.step.textContent = 'TUTORIAL ' + (this.idx + 1) + '/' + this.steps.length;
    this.els.text.innerHTML = st.text;
    this.els.panel.classList.remove('tut-done');
    // auto steps hide the NEXT button; info steps show it
    this.els.next.classList.toggle('hidden', !!st.check);
    this.els.next.textContent = st.last ? 'TO BATTLE!' : 'NEXT';
  },

  update(dt) {
    if (!this.active || Game.over) return;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.advance();
      return;
    }
    const st = this.steps[this.idx];
    if (st.check && st.check()) {
      // brief green "done" flash before moving on
      this.flashT = 0.9;
      this.els.panel.classList.add('tut-done');
      this.els.text.innerHTML = '&#10004; Well done!';
    }
  },

  advance() {
    if (this.idx >= this.steps.length - 1) { this.finish(); return; }
    this.idx++;
    this.render();
  },

  finish() {
    this.active = false;
    this.els.panel.classList.add('hidden');
    try { localStorage.setItem('aop_tutorial', 'done'); } catch (e) {}
  },

  wasCompleted() {
    try { return localStorage.getItem('aop_tutorial') === 'done'; } catch (e) { return false; }
  },
};
