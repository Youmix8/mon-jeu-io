// Panneau HDV — production d'unités, upgrade niveau, recherche tech
// Le panneau s'affiche au clic gauche sur ton propre HDV (déclenché par MainScene).
// Se met à jour automatiquement à chaque gameState pour refléter gold/HP/techs en temps réel.

const HdvPanel = (() => {
  let isOpen = false;

  function open() {
    const el = document.getElementById('hdv-panel');
    if (!el) return;
    el.style.display = 'block';
    isOpen = true;
    refresh();
  }

  function close() {
    const el = document.getElementById('hdv-panel');
    if (!el) return;
    el.style.display = 'none';
    isOpen = false;
  }

  function toggle() { isOpen ? close() : open(); }
  function isVisible() { return isOpen; }

  function spawn(unitType) { Network.spawnUnit(unitType); }
  function upgrade()        { Network.upgradeHdv(); }
  function research(techId) { Network.researchTech(techId); }

  // Rafraîchit tous les compteurs et boutons (appelé à chaque gameState quand ouvert)
  function refresh() {
    if (!isOpen) return;
    const myId = Network.getMyId();
    if (!myId) return;
    const me = Network.getState().players && Network.getState().players[myId];
    if (!me) return;
    const cfg = Network.getConfig();

    // Empire
    document.getElementById('hdv-level').textContent  = me.hdvLevel || 1;
    document.getElementById('hdv-hp').textContent     = `${me.hp}/${me.maxHp}`;
    document.getElementById('hdv-gold').textContent   = me.gold;
    document.getElementById('hdv-techpts').textContent = me.techPoints || 0;

    // Gold rate = base 1 + bonus des techs Économie
    let rate = 1;
    for (const tid of (me.researchedTechs || [])) {
      const t = cfg.techTree && cfg.techTree[tid];
      if (t && t.effect && t.effect.goldBonus) rate += t.effect.goldBonus;
    }
    document.getElementById('hdv-rate').textContent = `+${rate}`;

    // Upgrade button
    const btn = document.getElementById('upgrade-btn');
    const lvlIdx = (me.hdvLevel || 1) - 1;
    const levels = cfg.hdvLevels || [];
    if (!levels.length || lvlIdx >= levels.length - 1) {
      btn.textContent = '✨ Niveau max';
      btn.disabled = true;
      btn.classList.add('disabled');
    } else {
      const cost = levels[lvlIdx].upgradeCost;
      btn.textContent = `⬆ Améliorer Lv ${me.hdvLevel + 1} (${cost} 💰)`;
      btn.disabled = me.gold < cost;
      btn.classList.toggle('disabled', me.gold < cost);
    }

    // Production grid
    const prod = document.getElementById('hdv-panel-production');
    if (cfg.unitTypes && prod) {
      prod.innerHTML = Object.values(cfg.unitTypes).map(u => {
        const unlocked = !u.requiresTech || (me.researchedTechs || []).includes(u.requiresTech);
        const affordable = me.gold >= u.cost;
        const cls = !unlocked ? 'unit-card locked'
                  : !affordable ? 'unit-card poor'
                  : 'unit-card';
        const onclick = unlocked ? `onclick="HdvPanel.spawn('${u.id}')"` : '';
        const lockNote = !unlocked ? `<div class="locked-note">🔒 ${techNameOf(u.requiresTech)}</div>` : '';
        return `<div class="${cls}" ${onclick}>
          <div class="unit-card-icon">${u.icon}</div>
          <div class="unit-card-name">${u.name}</div>
          <div class="unit-card-stats">❤️ ${u.hp} &nbsp; 🗡 ${u.damage} &nbsp; 🎯 ${u.range}</div>
          <div class="unit-card-cost">${u.cost} 💰</div>
          ${lockNote}
        </div>`;
      }).join('');
    }

    // Tech tree grid
    const tech = document.getElementById('hdv-panel-tech');
    if (cfg.techTree && tech) {
      const techList = Object.values(cfg.techTree).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
      tech.innerHTML = techList.map(t => {
        const researched = (me.researchedTechs || []).includes(t.id);
        const prereqsOk  = t.requires.every(r => (me.researchedTechs || []).includes(r));
        const canResearch = !researched && prereqsOk && (me.techPoints || 0) >= t.cost;
        const cls = researched ? 'tech-card researched'
                  : !prereqsOk ? 'tech-card locked'
                  : canResearch ? 'tech-card available'
                  : 'tech-card poor';
        const onclick = canResearch ? `onclick="HdvPanel.research('${t.id}')"` : '';
        const status = researched ? '✓ Recherchée'
                     : !prereqsOk ? `🔒 ${t.requires.map(r => techNameOf(r)).join(', ')}`
                     : canResearch ? `🔬 ${t.cost} pt`
                     : `🔬 ${t.cost} pt`;
        return `<div class="${cls}" ${onclick}>
          <div class="tech-card-icon">${t.icon}</div>
          <div class="tech-card-name">${t.name}</div>
          <div class="tech-card-desc">${t.desc}</div>
          <div class="tech-card-status">${status}</div>
        </div>`;
      }).join('');
    }
  }

  function techNameOf(id) {
    const cfg = Network.getConfig();
    const t = cfg.techTree && cfg.techTree[id];
    return t ? t.name : id;
  }

  // Fermer au Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) close();
  });

  return { open, close, toggle, refresh, isVisible, spawn, upgrade, research };
})();
