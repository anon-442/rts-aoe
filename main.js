// ============================================================
// AGE OF PIXELS — boot, main menu, game loop
// ============================================================

(function () {
  let selectedCiv = 'english';
  let selectedDiff = 'normal';
  let tutorialOn = true;

  function buildMenu() {
    const civRow = document.getElementById('civ-row');
    for (const key in CIVS) {
      const civ = CIVS[key];
      const card = document.createElement('div');
      card.className = 'civcard' + (key === selectedCiv ? ' selected' : '');
      card.dataset.civ = key;

      const img = Sprites.unit(civ.icon, 0, false);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      card.appendChild(c);

      const h = document.createElement('h3');
      h.textContent = civ.name;
      card.appendChild(h);

      for (const perk of civ.perks) {
        const p = document.createElement('p');
        p.textContent = perk;
        card.appendChild(p);
      }
      card.addEventListener('click', () => {
        selectedCiv = key;
        document.querySelectorAll('.civcard').forEach(el =>
          el.classList.toggle('selected', el.dataset.civ === key));
      });
      civRow.appendChild(card);
    }

    const diffRow = document.getElementById('diff-row');
    for (const key in DIFFICULTIES) {
      const b = document.createElement('button');
      b.className = 'diffbtn' + (key === selectedDiff ? ' selected' : '');
      b.dataset.diff = key;
      b.textContent = DIFFICULTIES[key].name;
      b.addEventListener('click', () => {
        selectedDiff = key;
        document.querySelectorAll('.diffbtn').forEach(el =>
          el.classList.toggle('selected', el.dataset.diff === key));
      });
      diffRow.appendChild(b);
    }

    // tutorial toggle (defaults OFF once completed)
    tutorialOn = !Tutorial.wasCompleted();
    const tut = document.getElementById('tut-toggle');
    const renderTut = () => { tut.textContent = 'Tutorial: ' + (tutorialOn ? 'ON' : 'OFF'); tut.classList.toggle('selected', tutorialOn); };
    renderTut();
    tut.addEventListener('click', () => { tutorialOn = !tutorialOn; renderTut(); });

    document.getElementById('btn-play').addEventListener('click', startGame);
  }

  function startGame() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('endscreen').classList.add('hidden');

    Game.init(selectedCiv, selectedDiff);
    const botCiv = CIVS[Game.players[1].civ].name;
    UI.els.matchup.textContent = CIVS[selectedCiv].name + ' vs ' + botCiv + ' (Bot · ' +
      DIFFICULTIES[selectedDiff].name + ')';

    Input.selection.clear();
    const tc = Game.townCenter(0);
    Input.centerOn(tc.cx, tc.cy);
    UI.refreshPanel();
    Tutorial.start(tutorialOn);
    UI.toast('Destroy the enemy Town Hall to win!');
  }

  function resize() {
    const c = document.getElementById('game');
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (Game.started) {
      Game.update(dt);
      Input.update(dt);
      UI.update(dt);
      Tutorial.update(dt);
    }
    Renderer.draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('DOMContentLoaded', () => {
    resize();
    const canvas = document.getElementById('game');
    Renderer.init(canvas);
    Input.init(canvas);
    UI.init();
    Tutorial.init();
    buildMenu();
    requestAnimationFrame(frame);
  });
})();
