// Run manager: player HP/gold/XP/level, spell unlocks, room progression.
// A run = 5 normal/elite rooms + 1 boss room (GDD section 12 + chosen scope).
const Run = (() => {
  const TOTAL_ROOMS = 6; // rooms 1-5 normal/elite, room 6 = boss
  const BASE_MAX_HP = 20;

  let state = null;

  function xpThreshold(level) {
    // GDD table: L1=0, L2=8, L3=20, L4=36, L5=56 -> deltas 8,12,16,20 (arithmetic +4).
    // Generalized: delta(n -> n+1) = 4n + 4.
    let total = 0;
    for (let n = 1; n < level; n++) total += 4 * n + 4;
    return total;
  }

  // Deals the player back up to their current inventory capacity (GDD-feedback
  // rework: rack is refilled in full between turns rather than 1 letter/turn).
  function refillRack() {
    while (Inventory.hasSpace()) {
      Inventory.addLetter(LetterBag.draw());
    }
  }

  function createNewRun() {
    state = {
      hp: BASE_MAX_HP,
      maxHp: BASE_MAX_HP,
      gold: 0,
      xp: 0,
      level: 1,
      unlockedSpells: new Set(Spells.DEFS.filter(d => d.startUnlocked).map(d => d.id)),
      spellFed: {},
      spellUsedThisTurn: {},
      goldBonusPerKill: 0,
      wardShield: 0,
      roomNumber: 1,
      roomsCleared: 0
    };
    Inventory.reset();
    refillRack();
    Board.generateRoom(1);
    return state;
  }

  function getState() {
    return state;
  }

  function addGold(n) {
    state.gold += n;
  }

  // Returns array of pending level-up events (player must choose a perk for each).
  function addXp(amount) {
    state.xp += amount;
    const levelUps = [];
    while (state.xp >= xpThreshold(state.level + 1)) {
      state.level++;
      levelUps.push(state.level);
    }
    return levelUps;
  }

  // bonusXp: a straight XP award independent of any kill (per feedback -
  // longer words are worth more XP, and a word doesn't need to kill anything
  // to be worth playing).
  function applyKillRewards(rewardList, monsterList, bonusXp = 0) {
    let goldGained = 0;
    let healGained = 0;
    let xpGained = bonusXp;
    for (const m of monsterList) {
      xpGained += m.xp;
      goldGained += m.gold + state.goldBonusPerKill;
    }
    for (const r of rewardList) {
      if (r.kind === 'gold') goldGained += 5; // GDD: aranymező = 5 gold
      if (r.kind === 'heal') healGained += 3; // GDD: gyógyítómező = 3 HP
    }
    state.gold += goldGained;
    state.hp = Math.min(state.maxHp, state.hp + healGained);
    const levelUps = xpGained > 0 ? addXp(xpGained) : [];
    return { goldGained, healGained, xpGained, bonusXp, levelUps };
  }

  function buyCapacityUpgrade() {
    const cost = Inventory.nextUpgradeCost();
    if (cost === null || state.gold < cost) return false;
    state.gold -= cost;
    Inventory.upgradeCapacity();
    return true;
  }

  function isBossRoom() {
    return state.roomNumber === TOTAL_ROOMS;
  }

  function isFinalRoom() {
    return state.roomNumber >= TOTAL_ROOMS;
  }

  function advanceRoom() {
    state.roomsCleared++;
    if (state.roomNumber >= TOTAL_ROOMS) return false; // run complete / victory
    state.roomNumber++;
    Board.generateRoom(state.roomNumber);
    // Per feedback: a new room starts with a completely fresh rack rather
    // than carrying over whatever letters were left from the last one.
    Inventory.discard(Inventory.getTokens().map(t => t.id));
    refillRack();
    return true;
  }

  // --- Level-up perk pool ---
  const LOCKED_SPELL_ORDER = ['lettercall', 'fire', 'ward', 'cleanse'];

  function nextLockedSpell() {
    return LOCKED_SPELL_ORDER.find(id => !state.unlockedSpells.has(id)) || null;
  }

  function buildPerkOptions() {
    const options = [];
    const lockedSpell = nextLockedSpell();
    if (lockedSpell) {
      const def = Spells.getDef(lockedSpell);
      options.push({
        id: 'unlock-spell', label: `Új varázslat: ${def.name}`, spellId: lockedSpell,
        apply: () => state.unlockedSpells.add(lockedSpell)
      });
    }
    options.push({
      id: 'max-hp', label: 'Maximális életerő +5',
      apply: () => { state.maxHp += 5; state.hp += 5; }
    });
    options.push({
      id: 'gold-bonus', label: 'Aranyszerzési bónusz: +1 arany minden legyőzött ellenfélért',
      apply: () => { state.goldBonusPerKill += 1; }
    });
    options.push({
      id: 'instant-gold', label: 'Azonnali aranyjutalom: +15 arany',
      apply: () => { state.gold += 15; }
    });
    options.push({
      id: 'luck', label: 'Betűhúzás finomhangolása: a következő 5 húzás hasznosabb betűket ad',
      apply: () => { LetterBag.addLuckCharges(5); }
    });
    // Return 3 random distinct options (always include spell unlock if available, it's the headline reward)
    const rest = options.filter(o => o.id !== 'unlock-spell');
    shuffleArr(rest);
    const picked = lockedSpell ? [options[0], ...rest.slice(0, 2)] : rest.slice(0, 3);
    return picked;
  }

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // TEMPORARY (debug Back/Forward): full state in/out for snapshotting.
  function exportState() {
    return state;
  }

  function importState(data) {
    state = data;
  }

  return {
    TOTAL_ROOMS, createNewRun, getState, addGold, addXp, applyKillRewards,
    isBossRoom, isFinalRoom, advanceRoom, xpThreshold, buildPerkOptions,
    buyCapacityUpgrade, refillRack, exportState, importState
  };
})();
