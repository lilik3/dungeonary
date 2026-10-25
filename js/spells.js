// Spell system (GDD section 7 + v0.4 Cleanse addendum + v0.5 Fire AOE image).
// Per feedback: each spell is "spelled out" with its own name's letters, as
// a row of drag-and-drop slots - AID needs exactly an A, an I and a D in
// its slots; a letter that appears twice in the name (e.g. NEED's two E's)
// needs two of that letter dropped in, and a slot rejects any letter the
// spell doesn't need (or needs no more of) there. The spell becomes castable
// once at least `minCast` of its slots are filled - not necessarily all of
// them. Casting consumes whatever's filled and can happen at most once per
// turn (resets at End Turn); unused progress carries over between turns.
const Spells = (() => {
  function requiredMultiset(word) {
    const m = {};
    for (const ch of word) m[ch] = (m[ch] || 0) + 1;
    return m;
  }

  const RAW_DEFS = [
    {
      id: 'blink', word: 'BLINK', emoji: '🌀', minCast: 3,
      startUnlocked: true, target: 'monster-then-cell',
      desc: 'Egy ellenfelet áthelyez egy üres mezőre. Nem okoz sebzést.'
    },
    {
      id: 'heal', word: 'AID', emoji: '➕', minCast: 1,
      startUnlocked: true, target: 'none',
      desc: 'Visszaad 4 életerőt, legfeljebb a maximumig.'
    },
    {
      id: 'lettercall', word: 'NEED', emoji: '🔤', minCast: 2,
      startUnlocked: false, target: 'letter',
      desc: 'A legközelebbi körvégi feltöltéskor a kért betűt is megkapod.'
    },
    {
      id: 'fire', word: 'FIRE', emoji: '🔥', minCast: 2,
      startUnlocked: false, target: 'cell',
      desc: '3x3-as területen minden élő ellenfél 1 sebzést kap.'
    },
    {
      id: 'ward', word: 'WARD', emoji: '🛡️', minCast: 2,
      startUnlocked: false, target: 'none',
      desc: 'A következő ellenségtámadási fázisban legfeljebb 4 sebzést elnyel.'
    },
    {
      id: 'cleanse', word: 'CLEAN', emoji: '🧹', minCast: 3,
      startUnlocked: false, target: 'placedWord',
      desc: 'Eltávolít egy lerakott betűt a tábláról (szabaddá teszi a mezőt).'
    }
  ];

  const DEFS = RAW_DEFS.map(d => ({
    ...d,
    name: `${d.word} – ${{ blink: 'Villanás', heal: 'Gyógyítás', lettercall: 'Betűidézés', fire: 'Tűzrobbanás', ward: 'Védőpajzs', cleanse: 'Tisztítás' }[d.id]}`,
    required: requiredMultiset(d.word),
    totalLetters: d.word.length
  }));

  function getDef(id) {
    return DEFS.find(d => d.id === id);
  }

  function fedMap(state, id) {
    return state.spellFed[id] || {};
  }

  function fedCount(state, id) {
    const fed = fedMap(state, id);
    return Object.values(fed).reduce((a, b) => a + b, 0);
  }

  // How many more of `letter` this spell still needs (0 if none/not required).
  function remainingFor(state, id, letter) {
    const def = getDef(id);
    const need = def.required[letter] || 0;
    const have = fedMap(state, id)[letter] || 0;
    return Math.max(0, need - have);
  }

  // Letters still needed, each repeated as many times as still required -
  // e.g. for NEED with one E fed: ['N', 'E', 'D'].
  function neededLetters(state, id) {
    const def = getDef(id);
    const out = [];
    for (const letter of Object.keys(def.required)) {
      const left = remainingFor(state, id, letter);
      for (let i = 0; i < left; i++) out.push(letter);
    }
    return out;
  }

  // Full completion (every letter of the name filled) - used to cap feeding.
  function isComplete(state, id) {
    return neededLetters(state, id).length === 0;
  }

  // Castable once at least minCast letters are filled - doesn't require the
  // whole name to be spelled out.
  function isCastable(state, id) {
    return fedCount(state, id) >= getDef(id).minCast;
  }

  function canFeedLetter(state, id, letter) {
    return state.unlockedSpells.has(id) && remainingFor(state, id, letter) > 0;
  }

  // The visual slots for this spell's name, in order, each marked filled or
  // not (same-letter slots are interchangeable, so the leftmost unfilled one
  // of a given letter is always the one shown as filled next).
  function slotStates(state, id) {
    const def = getDef(id);
    const fed = fedMap(state, id);
    const seen = {};
    return def.word.split('').map(letter => {
      seen[letter] = (seen[letter] || 0) + 1;
      return { letter, filled: seen[letter] <= (fed[letter] || 0) };
    });
  }

  function feedLetter(id, state, tokenId) {
    const def = getDef(id);
    if (!def) return { ok: false, reason: 'unknown-spell' };
    if (!state.unlockedSpells.has(id)) return { ok: false, reason: 'locked' };
    const tokens = Inventory.tokensForIds([tokenId]);
    if (tokens.length !== 1) return { ok: false, reason: 'invalid-token' };
    const letter = tokens[0].letter;
    if (!canFeedLetter(state, id, letter)) return { ok: false, reason: 'wrong-letter', letter };
    Inventory.consumeTokens([tokenId]);
    const fed = fedMap(state, id);
    state.spellFed[id] = { ...fed, [letter]: (fed[letter] || 0) + 1 };
    return { ok: true, letter, fedCount: fedCount(state, id), total: def.totalLetters, castable: isCastable(state, id) };
  }

  function cast(id, state, args) {
    const def = getDef(id);
    if (!def) return { ok: false, reason: 'unknown-spell' };
    if (!state.unlockedSpells.has(id)) return { ok: false, reason: 'locked' };
    if (state.spellUsedThisTurn[id]) return { ok: false, reason: 'already-used-this-turn' };
    if (!isCastable(state, id)) return { ok: false, reason: 'not-charged' };

    let effect = {};
    switch (id) {
      case 'blink': {
        // Per feedback: the destination can sit right up against existing
        // letters (monsters or old tiles) - but then it MUST form a real
        // word, and every monster that word touches (including the one you
        // just moved) takes damage, same as a normal word play. A fully
        // isolated destination (no neighbors at all) just relocates the
        // monster for free. Either way, landing on a trap hurts the moved
        // monster too (shoving an enemy into a hazard), independent of
        // whether a word formed.
        const { monsterId, r, c } = args;
        const m = Board.getMonster(monsterId);
        if (!m || !m.alive) return { ok: false, reason: 'invalid-target' };
        if (!Board.inBounds(r, c) || !Board.cellIsEmpty(r, c)) return { ok: false, reason: 'invalid-cell' };

        const candidates = ['H', 'V'].map(dir => Board.wordCandidateAt(r, c, m.letter, dir));
        const extended = candidates.filter(cand => cand.cells.length >= 2);
        const isolated = extended.length === 0;
        let words;
        if (!isolated) {
          const validWords = extended.filter(cand => Dictionary.isValidWord(cand.word));
          if (validWords.length === 0) {
            return { ok: false, reason: 'invalid-word', words: extended.map(cand => cand.word) };
          }
          words = validWords.map(cand => cand.word);
        }

        Board.moveMonster(monsterId, r, c);

        let hit = [], killed = [];
        if (!isolated) {
          const extendedValid = extended.filter(cand => Dictionary.isValidWord(cand.word));
          const touchedCells = extendedValid.flatMap(cand => cand.cells);
          ({ hit, killed } = Combat.resolveMonstersInCells(touchedCells));
        }

        // Landing directly on a trap or reward field triggers it, same as a
        // player-placed letter would.
        const trapDamage = Board.triggerTrapsFor([[r, c]]).length * 2;
        const rewards = Board.triggerRewardsFor([[r, c]]);
        if (trapDamage > 0 && m.alive) {
          m.hp -= trapDamage;
          if (!hit.includes(m)) hit.push(m);
          if (m.hp <= 0) {
            Board.killMonster(m.id);
            killed.push(m);
          }
        }

        effect = { monster: m, to: [r, c], words, hit, killed, rewards, trapDamage };
        break;
      }
      case 'heal': {
        const before = state.hp;
        state.hp = Math.min(state.maxHp, state.hp + 4);
        effect = { healed: state.hp - before };
        break;
      }
      case 'lettercall': {
        const { letter } = args;
        if (!letter || !/^[A-Z]$/.test(letter)) return { ok: false, reason: 'invalid-letter' };
        LetterBag.requestLetter(letter);
        effect = { letter };
        break;
      }
      case 'fire': {
        // Fire doesn't place a letter anywhere, so it can't trigger reward
        // fields - only direct placement does (per feedback).
        const { r, c } = args;
        const hit = [];
        const killed = [];
        for (let rr = r - 1; rr <= r + 1; rr++) {
          for (let cc = c - 1; cc <= c + 1; cc++) {
            if (!Board.inBounds(rr, cc)) continue;
            const m = Board.getLivingMonsterAt(rr, cc);
            if (m) {
              m.hp -= 1;
              hit.push(m);
              if (m.hp <= 0) {
                Board.killMonster(m.id);
                killed.push(m);
              }
            }
          }
        }
        effect = { hit, killed, rewards: [], center: [r, c] };
        break;
      }
      case 'ward': {
        state.wardShield = 4;
        effect = { shield: 4 };
        break;
      }
      case 'cleanse': {
        const { r, c } = args;
        if (!Board.removeWordAt(r, c)) return { ok: false, reason: 'invalid-target' };
        effect = { cleared: [r, c] };
        break;
      }
    }

    state.spellFed[id] = {};
    state.spellUsedThisTurn[id] = true;
    return { ok: true, effect };
  }

  function resetTurnUsage(state) {
    for (const def of DEFS) state.spellUsedThisTurn[def.id] = false;
  }

  return {
    DEFS, getDef, fedCount, remainingFor, neededLetters, isComplete, isCastable,
    canFeedLetter, slotStates, feedLetter, cast, resetTurnUsage
  };
})();
