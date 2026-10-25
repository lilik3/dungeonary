// Turn manager: a turn is now free-form (GDD-feedback rework) - the player
// may place as many words as their rack allows and feed/cast spells in any
// order, then explicitly ends the turn. Only then do surviving monsters
// attack and the rack refill back to capacity. Room-clear and death are
// still checked immediately after every individual action, since neither
// waits for the player to declare the turn over.
const TurnManager = (() => {
  let phase = 'playing'; // playing -> (room-clear | game-over), or stays playing after End Turn
  const TRASH_HP_COST = 2;
  let godMode = false; // TEMPORARY test toggle: ignores all player HP loss

  function getPhase() {
    return phase;
  }

  function isGodMode() {
    return godMode;
  }

  function setGodMode(on) {
    godMode = !!on;
    if (godMode) {
      const state = Run.getState();
      if (state) state.hp = state.maxHp;
    }
  }

  // TEMPORARY (debug Back/Forward): full state in/out for snapshotting.
  function exportState() {
    return { phase, godMode };
  }

  function importState(data) {
    phase = data.phase;
    godMode = data.godMode;
  }

  function startRun() {
    if (Run.getState()) History.capture();
    Run.createNewRun();
    phase = 'playing';
  }

  // Trash is now an all-or-nothing mulligan (per feedback): it costs HP and
  // dumps the entire rack at once, rather than letting the player cherry-pick
  // which tokens to discard for free.
  function trashAll() {
    if (phase !== 'playing') return { ok: false, reason: 'wrong-phase' };
    const tokens = Inventory.getTokens();
    if (tokens.length === 0) return { ok: false, reason: 'empty' };
    History.capture();
    const state = Run.getState();
    if (!godMode) state.hp = Math.max(0, state.hp - TRASH_HP_COST);
    Inventory.discard(tokens.map(t => t.id));
    if (state.hp <= 0) {
      phase = 'game-over';
      return { ok: true, cost: TRASH_HP_COST, discarded: tokens.length, gameOver: true };
    }
    return { ok: true, cost: TRASH_HP_COST, discarded: tokens.length, gameOver: false };
  }

  function checkImmediateOutcome(rewardInfo, trapDamageAlreadyApplied) {
    const outcome = { cleared: false, levelUps: [], gameOver: false, victory: false };

    if (rewardInfo) {
      const applied = Run.applyKillRewards(rewardInfo.rewards, rewardInfo.killed, rewardInfo.bonusXp || 0);
      outcome.rewardsApplied = applied;
      outcome.levelUps = applied.levelUps;
    }

    const state = Run.getState();
    if (state.hp <= 0) {
      state.hp = 0;
      phase = 'game-over';
      outcome.gameOver = true;
      return outcome;
    }

    if (Board.roomCleared()) {
      phase = 'room-clear';
      outcome.cleared = true;
      outcome.victory = Run.isBossRoom();
    }
    return outcome;
  }

  // Every valid word earns straight XP for its length alone (per feedback -
  // a longer word is worth more, and you don't need to land on a monster at
  // all to make a word worth playing) - on top of whatever kill XP it earns.
  function wordLengthXp(word) {
    return Math.max(0, word.length - 1);
  }

  // placementCells: [{r, c, letter, tokenId}] - see Combat.resolveWordSubmission.
  function submitWord(placementCells) {
    if (phase !== 'playing') return { ok: false, reason: 'wrong-phase' };
    History.capture();
    const res = Combat.resolveWordSubmission(placementCells);
    if (!res.ok) return res;

    const state = Run.getState();
    if (res.trapDamage > 0 && !godMode) {
      state.hp = Math.max(0, state.hp - res.trapDamage);
    }

    const bonusXp = wordLengthXp(res.word);
    const turnOutcome = checkImmediateOutcome({ rewards: res.rewards, killed: res.killed, bonusXp });
    return { ...res, turnOutcome };
  }

  function feedSpellLetter(spellId, tokenId) {
    if (phase !== 'playing') return { ok: false, reason: 'wrong-phase' };
    History.capture();
    return Spells.feedLetter(spellId, Run.getState(), tokenId);
  }

  function castSpell(spellId, args) {
    if (phase !== 'playing') return { ok: false, reason: 'wrong-phase' };
    History.capture();
    const state = Run.getState();
    const res = Spells.cast(spellId, state, args || {});
    if (!res.ok) return res;

    let rewardInfo = null;
    if (Array.isArray(res.effect.killed)) {
      rewardInfo = { rewards: res.effect.rewards, killed: res.effect.killed };
    }
    const turnOutcome = checkImmediateOutcome(rewardInfo);
    return { ...res, turnOutcome };
  }

  // Explicit end of turn: surviving monsters attack, then the rack refills.
  function endTurn() {
    if (phase !== 'playing') return { ok: false, reason: 'wrong-phase' };
    History.capture();
    const state = Run.getState();
    const atk = Combat.resolveEnemyAttack(state.wardShield);
    state.wardShield = 0;
    if (!godMode) state.hp -= atk.finalDamage;

    if (state.hp <= 0) {
      state.hp = 0;
      phase = 'game-over';
      return { ok: true, enemyAttack: atk, gameOver: true };
    }

    Spells.resetTurnUsage(state);
    Board.resetTrapTurnFlags();
    Run.refillRack();
    return { ok: true, enemyAttack: atk, gameOver: false };
  }

  function confirmLevelUp(choiceIndex, options) {
    const choice = options[choiceIndex];
    if (!choice) return false;
    History.capture();
    choice.apply();
    return true;
  }

  function continueFromTrader() {
    History.capture();
    const more = Run.advanceRoom();
    phase = 'playing';
    return more;
  }

  return {
    getPhase, startRun, trashAll, submitWord, feedSpellLetter, castSpell,
    endTurn, confirmLevelUp, continueFromTrader, isGodMode, setGodMode,
    exportState, importState
  };
})();
