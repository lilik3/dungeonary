// New skill-tree spell system (replaces the parked original letter-feed-only
// system - see spells.js). Every node is described along two independent
// axes, exactly as discussed with the player:
//   - UNLOCK: how you permanently gain the node (skill points, an optional
//     one-time "achievement" gate, and/or a gold-only path at the Trader).
//     Ownership lives in MetaProgress and persists across runs forever.
//   - ACTIVATION: how you actually use it during a given run - the old
//     letter-feed/minCast mechanic for the four reskinned original spells,
//     or a brand new trigger (word length, HP threshold, stepping on a
//     trap, or piling up dead letters on the board).
const SkillTree = (() => {
  const NODE_DEFS = [
    { id: 'core', branch: null, name: 'Mag', emoji: '🔮', requires: [], cost: null, gate: null, goldCost: null,
      activation: 'passive', passiveEffect: null,
      desc: 'A fa középpontja. Mindig a tiéd, nincs önálló hatása.' },

    // --- Mozgás ág ---
    { id: 'blink', branch: 'mozgas', name: 'Villanás', emoji: '🌀', requires: ['core'], cost: 1, gate: null, goldCost: null,
      activation: 'feed', spellId: 'blink',
      desc: 'Betű-feltöltős (BLINK betűi): egy ellenfelet áthelyez egy üres mezőre.' },
    { id: 'move-minor', branch: 'mozgas', name: 'Fürge léptek', emoji: '👟', requires: ['blink'], cost: 1,
      gate: { type: 'xpLevel', level: 3 }, goldCost: null,
      activation: 'passive', passiveEffect: { rackCapacity: 1 },
      desc: 'Örökre +1 betűtároló hely. Feltétel: érj el valaha 3. szintet.' },
    { id: 'second-wind', branch: 'mozgas', name: 'Második esély', emoji: '💨', requires: ['move-minor'], cost: 2,
      gate: { type: 'lowHp' }, goldCost: null,
      activation: 'hpThreshold', hpThreshold: 0.25, healAmount: 6,
      desc: 'Ha az életerőd 25% alá esik, egyszer castolható: azonnali +6 HP. Feltétel: élj túl valaha egy 25% alatti HP-s pillanatot.' },

    // --- Tűz ág ---
    { id: 'fire', branch: 'tuz', name: 'Tűzrobbanás', emoji: '🔥', requires: ['core'], cost: 1, gate: null, goldCost: null,
      activation: 'feed', spellId: 'fire',
      desc: 'Betű-feltöltős (FIRE betűi): 3x3-as területen sebez minden élő ellenfelet.' },
    { id: 'fire-minor', branch: 'tuz', name: 'Parázs', emoji: '✨', requires: ['fire'], cost: 1, gate: null, goldCost: null,
      activation: 'passive', passiveEffect: { goldPerKill: 1 },
      desc: 'Örökre +1 arany minden legyőzött ellenfélért.' },
    { id: 'flame-surge', branch: 'tuz', name: 'Lánghullám', emoji: '🌊', requires: ['fire-minor'], cost: 2, gate: null, goldCost: null,
      activation: 'wordLength', wordLength: 5,
      desc: 'Ha lerakol egy 5+ betűs szót, egyszer castolható: 1 sebzés minden élő ellenfélnek a pályán.' },

    // --- Védelem ág ---
    { id: 'heal', branch: 'vedelem', name: 'Gyógyítás', emoji: '➕', requires: ['core'], cost: 1, gate: null, goldCost: null,
      activation: 'feed', spellId: 'heal',
      desc: 'Betű-feltöltős (AID betűi): visszaad életerőt.' },
    { id: 'ward', branch: 'vedelem', name: 'Védőpajzs', emoji: '🛡️', requires: ['heal'], cost: 1, gate: null, goldCost: null,
      activation: 'feed', spellId: 'ward',
      desc: 'Betű-feltöltős (WARD betűi): elnyeli a következő ellenségtámadás egy részét.' },
    { id: 'defense-minor', branch: 'vedelem', name: 'Páncélzat', emoji: '🪖', requires: ['ward'], cost: 1, gate: null, goldCost: null,
      activation: 'passive', passiveEffect: { maxHp: 3 },
      desc: 'Örökre +3 maximális életerő.' },
    { id: 'trap-sense', branch: 'vedelem', name: 'Csapdaérzék', emoji: '🪤', requires: ['defense-minor'], cost: 2,
      gate: { type: 'trapStepped' }, goldCost: null,
      activation: 'trapTrigger', bonusGold: 5,
      desc: 'Minden csapdalépésnél +5 arany kárpótlás, automatikusan. Feltétel: lépj valaha csapdába.' },

    // --- Betű ág ---
    { id: 'need', branch: 'betu', name: 'Betűidézés', emoji: '🔤', requires: ['core'], cost: 1, gate: null, goldCost: null,
      activation: 'feed', spellId: 'lettercall',
      desc: 'Betű-feltöltős (NEED betűi): a következő feltöltéskor a kért betűt is megkapod.' },
    { id: 'clean', branch: 'betu', name: 'Tisztítás', emoji: '🧹', requires: ['need'], cost: 1, gate: null, goldCost: null,
      activation: 'feed', spellId: 'cleanse',
      desc: 'Betű-feltöltős (CLEAN betűi): eltávolítja a lerakott betűket egy területen.' },
    { id: 'letter-minor', branch: 'betu', name: 'Betűtudás', emoji: '📖', requires: ['clean'], cost: 1, gate: null, goldCost: null,
      activation: 'passive', passiveEffect: { luckPerRoom: 1 },
      desc: 'Minden új szobában +1 szerencse-töltet a betűhúzáshoz.' },
    { id: 'junk-transmute', branch: 'betu', name: 'Hulladék-átalakítás', emoji: '♻️', requires: ['letter-minor'], cost: 2,
      gate: { type: 'junkLetters' }, goldCost: null,
      activation: 'junkTrigger', junkCount: 5,
      desc: 'Ha 5 egyforma betű gyűlik össze a pályán, automatikusan eltünteti és arannyá alakítja őket. Feltétel: gyűljön össze valaha 5 egyforma betű a pályán.' },

    // --- Szabadon álló, csak arannyal megvehető node ---
    { id: 'greed', branch: null, name: 'Mohóság', emoji: '💰', requires: ['core'], cost: null, gate: null, goldCost: 40,
      activation: 'passive', passiveEffect: { goldPerKill: 1 },
      desc: 'Örökre +1 arany minden legyőzött ellenfélért. Csak arannyal vehető meg a kereskedőnél.' }
  ];

  function getDef(id) {
    return NODE_DEFS.find(d => d.id === id);
  }

  function getAllDefs() {
    return NODE_DEFS.slice();
  }

  function isOwned(id) {
    return MetaProgress.isOwned(id);
  }

  function requirementsMet(def) {
    return def.requires.every(id => isOwned(id));
  }

  function gateMet(def) {
    if (!def.gate) return true;
    const lt = MetaProgress.getLifetime();
    if (def.gate.type === 'trapStepped') return lt.trapStepped;
    if (def.gate.type === 'junkLetters') return lt.junkLetters;
    if (def.gate.type === 'lowHp') return lt.lowHp;
    if (def.gate.type === 'xpLevel') return lt.maxLevelReached >= def.gate.level;
    return true;
  }

  function canUnlockWithPoints(id) {
    const def = getDef(id);
    if (!def || isOwned(id) || def.cost == null) return false;
    return requirementsMet(def) && gateMet(def) && MetaProgress.getSkillPoints() >= def.cost;
  }

  function canUnlockWithGold(state, id) {
    const def = getDef(id);
    if (!def || isOwned(id) || def.goldCost == null) return false;
    return requirementsMet(def) && gateMet(def) && state.gold >= def.goldCost;
  }

  // The standing (non-recurring) part of a passive node's effect - safe to
  // call once per run for every owned node (applyAllOwnedPassives) since
  // each run's state starts fresh.
  function applyStandingPassive(state, def) {
    const eff = def.passiveEffect;
    if (!eff) return;
    if (eff.maxHp) { state.maxHp += eff.maxHp; state.hp += eff.maxHp; }
    if (eff.rackCapacity) { for (let i = 0; i < eff.rackCapacity; i++) Inventory.upgradeCapacity(); }
    if (eff.goldPerKill) { state.goldBonusPerKill = (state.goldBonusPerKill || 0) + eff.goldPerKill; }
  }

  // Applied once, right when a node is newly unlocked (mid-run reward) - the
  // standing effect plus an immediate one-off nudge for recurring effects
  // (e.g. an instant luck charge instead of making the player wait for the
  // next room).
  function applyPassiveEffect(state, def) {
    applyStandingPassive(state, def);
    if (def.passiveEffect && def.passiveEffect.luckPerRoom) LetterBag.addLuckCharges(def.passiveEffect.luckPerRoom);
  }

  // Re-applies every currently-owned node's standing passive effect - run
  // creation needs this since state.maxHp/goldBonusPerKill/Inventory
  // capacity all reset fresh each run, but node ownership persists forever.
  function applyAllOwnedPassives(state) {
    for (const def of NODE_DEFS) {
      if (isOwned(def.id)) applyStandingPassive(state, def);
    }
  }

  // Every owned 'feed' node unlocks its underlying original-system spell id
  // in state.unlockedSpells, so Spells.feedLetter/cast/isCastable (unchanged
  // since the old system was parked) keep working exactly as before.
  function syncFeedAccess(state) {
    for (const def of NODE_DEFS) {
      if (def.activation === 'feed' && isOwned(def.id)) state.unlockedSpells.add(def.spellId);
    }
  }

  function unlockWithPoints(state, id) {
    if (!canUnlockWithPoints(id)) return { ok: false, reason: 'cannot-unlock' };
    const def = getDef(id);
    MetaProgress.unlockNode(id, def.cost);
    applyPassiveEffect(state, def);
    syncFeedAccess(state);
    onHpChanged(state); // in case this node is already standing-armed (e.g. already low HP)
    return { ok: true };
  }

  function unlockWithGold(state, id) {
    if (!canUnlockWithGold(state, id)) return { ok: false, reason: 'cannot-unlock' };
    const def = getDef(id);
    state.gold -= def.goldCost;
    MetaProgress.unlockNode(id, 0);
    applyPassiveEffect(state, def);
    syncFeedAccess(state);
    onHpChanged(state);
    return { ok: true };
  }

  // Called once at run creation (room 1) - resets per-run node state and
  // grants feed access + first room-start passive bonuses.
  function syncRunState(state) {
    state.nodeArmed = {};
    state.nodeUsedThisTurn = {};
    syncFeedAccess(state);
    applyAllOwnedPassives(state);
    applyRoomStartBonuses(state);
  }

  function resetTurnUsage(state) {
    state.nodeUsedThisTurn = {};
  }

  // Called at the start of every room (including room 1).
  function applyRoomStartBonuses(state) {
    for (const def of NODE_DEFS) {
      if (isOwned(def.id) && def.passiveEffect && def.passiveEffect.luckPerRoom) {
        LetterBag.addLuckCharges(def.passiveEffect.luckPerRoom);
      }
    }
  }

  function isCastable(state, id) {
    const def = getDef(id);
    if (!def || !isOwned(id)) return false;
    if (def.activation === 'feed') return Spells.isCastable(state, def.spellId) && !state.spellUsedThisTurn[def.spellId];
    if (def.activation === 'hpThreshold' || def.activation === 'wordLength') {
      return !!state.nodeArmed[id] && !state.nodeUsedThisTurn[id];
    }
    return false;
  }

  // Manual cast for hpThreshold/wordLength nodes (feed nodes go through
  // Spells.cast directly, same as before). trapTrigger/junkTrigger nodes
  // have no manual cast - they fire on their own via the on* hooks below.
  function cast(id, state, args) {
    const def = getDef(id);
    if (!def || !isOwned(id)) return { ok: false, reason: 'locked' };

    if (def.activation === 'hpThreshold') {
      if (!isCastable(state, id)) return { ok: false, reason: 'not-castable' };
      const healed = Math.min(def.healAmount, state.maxHp - state.hp);
      state.hp += healed;
      state.nodeUsedThisTurn[id] = true;
      onHpChanged(state);
      return { ok: true, effect: { healed } };
    }

    if (def.activation === 'wordLength') {
      if (!isCastable(state, id)) return { ok: false, reason: 'not-castable' };
      const living = Board.getLivingMonsters();
      const { hit, killed } = Combat.resolveMonstersInCells(living.map(m => ({ r: m.r, c: m.c })));
      state.nodeUsedThisTurn[id] = true;
      state.nodeArmed[id] = false;
      return { ok: true, effect: { hit, killed, rewards: [] } };
    }

    return { ok: false, reason: 'not-manually-castable' };
  }

  // --- Trigger hooks (called by TurnManager after the relevant action) ---

  function onHpChanged(state) {
    if (state.hp > 0 && state.hp / state.maxHp <= 0.25) MetaProgress.recordLowHp();
    for (const def of NODE_DEFS) {
      if (def.activation !== 'hpThreshold' || !isOwned(def.id)) continue;
      if (state.hp / state.maxHp <= def.hpThreshold) state.nodeArmed[def.id] = true;
      else state.nodeArmed[def.id] = false;
    }
  }

  function onWordsPlaced(state, words) {
    const maxLen = words.reduce((m, w) => Math.max(m, w.length), 0);
    for (const def of NODE_DEFS) {
      if (def.activation !== 'wordLength' || !isOwned(def.id)) continue;
      if (maxLen >= def.wordLength) state.nodeArmed[def.id] = true;
    }
  }

  // Returns log-line strings for any auto-applied effect, for the UI to show.
  function onTrapHit(state) {
    MetaProgress.recordTrapStepped();
    const events = [];
    for (const def of NODE_DEFS) {
      if (def.activation !== 'trapTrigger' || !isOwned(def.id)) continue;
      if (state.nodeUsedThisTurn[def.id]) continue;
      state.gold += def.bonusGold;
      state.nodeUsedThisTurn[def.id] = true;
      events.push(`${def.emoji} ${def.name}: +${def.bonusGold} arany kárpótlás.`);
    }
    return events;
  }

  function countBoardLetters() {
    const { size } = Board.getState();
    const counts = {};
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = Board.getCell(r, c);
        if (cell.placed && !cell.monsterId) counts[cell.placed.letter] = (counts[cell.placed.letter] || 0) + 1;
      }
    }
    return counts;
  }

  function onBoardChanged(state) {
    const counts = countBoardLetters();
    const maxCount = Object.values(counts).reduce((m, n) => Math.max(m, n), 0);
    if (maxCount >= 5) MetaProgress.recordJunkLetters();

    const events = [];
    for (const def of NODE_DEFS) {
      if (def.activation !== 'junkTrigger' || !isOwned(def.id)) continue;
      if (state.nodeUsedThisTurn[def.id]) continue;
      const letter = Object.keys(counts).find(l => counts[l] >= def.junkCount);
      if (!letter) continue;
      const { size } = Board.getState();
      let cleared = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = Board.getCell(r, c);
          if (cell.placed && !cell.monsterId && cell.placed.letter === letter) {
            Board.removeWordAt(r, c);
            cleared++;
          }
        }
      }
      state.gold += cleared * 2;
      state.nodeUsedThisTurn[def.id] = true;
      events.push(`${def.emoji} ${def.name}: ${cleared}x "${letter}" eltüntetve, +${cleared * 2} arany.`);
    }
    return events;
  }

  return {
    getDef, getAllDefs, isOwned, requirementsMet, gateMet,
    canUnlockWithPoints, canUnlockWithGold, unlockWithPoints, unlockWithGold,
    syncRunState, resetTurnUsage, applyRoomStartBonuses,
    isCastable, cast, onHpChanged, onWordsPlaced, onTrapHit, onBoardChanged
  };
})();
