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
      startUnlocked: false, target: 'cell',
      desc: 'Kereszt alakú (5 mezős) területen eltávolítja a lerakott betűket.'
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

  // A Joker fills whichever slot is still open, regardless of what it needs.
  function canFeedLetter(state, id, letter) {
    if (!state.unlockedSpells.has(id)) return false;
    if (letter === LetterBag.JOKER_LETTER) return !isComplete(state, id);
    return remainingFor(state, id, letter) > 0;
  }

  // Which real letter a Joker fed into this spell would actually credit -
  // the first one (in the name's own letter order) still needing more.
  function firstNeededLetter(state, id) {
    const def = getDef(id);
    for (const letter of def.word) {
      if (remainingFor(state, id, letter) > 0) return letter;
    }
    return null;
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
    const creditLetter = letter === LetterBag.JOKER_LETTER ? firstNeededLetter(state, id) : letter;
    Inventory.consumeTokens([tokenId]);
    const fed = fedMap(state, id);
    state.spellFed[id] = { ...fed, [creditLetter]: (fed[creditLetter] || 0) + 1 };
    return { ok: true, letter: creditLetter, fedCount: fedCount(state, id), total: def.totalLetters, castable: isCastable(state, id) };
  }

  // Shared Blink movement logic, reused both by the main cast and by the
  // free bonus move a fully-spelled BLINK grants (see castBonusMove).
  // Ignores the monster's own current cell while scanning for neighbor
  // letters - it's vacating that spot as part of this very move, so it must
  // not count as a letter still sitting there (per feedback bug).
  function performBlinkMove(monsterId, r, c) {
    const m = Board.getMonster(monsterId);
    if (!m || !m.alive) return { ok: false, reason: 'invalid-target' };
    if (!Board.inBounds(r, c) || !Board.cellIsEmpty(r, c)) return { ok: false, reason: 'invalid-cell' };

    const origin = { r: m.r, c: m.c };
    const candidates = ['H', 'V'].map(dir => Board.wordCandidateAt(r, c, m.letter, dir, origin));
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

    return { ok: true, effect: { monster: m, to: [r, c], words, hit, killed, rewards, trapDamage } };
  }

  function cast(id, state, args) {
    const def = getDef(id);
    if (!def) return { ok: false, reason: 'unknown-spell' };
    if (!state.unlockedSpells.has(id)) return { ok: false, reason: 'locked' };
    if (state.spellUsedThisTurn[id]) return { ok: false, reason: 'already-used-this-turn' };
    if (!isCastable(state, id)) return { ok: false, reason: 'not-charged' };

    // Spelling out the whole word (not just the minCast threshold) makes the
    // spell noticeably stronger (per feedback) - captured here, before the
    // switch resets spellFed for the turn.
    const fullyFed = isComplete(state, id);

    let effect = {};
    switch (id) {
      case 'blink': {
        // Per feedback: the destination can sit right up against existing
        // letters (monsters or old tiles) - but then it MUST form a real
        // word, and every monster that word touches (including the one you
        // just moved) takes damage, same as a normal word play. A fully
        // isolated destination (no neighbors at all) just relocates the
        // monster for free. A fully-spelled BLINK grants a second, free
        // monster move right after this one (per feedback).
        const { monsterId, r, c } = args;
        const result = performBlinkMove(monsterId, r, c);
        if (!result.ok) return result;
        effect = { ...result.effect, bonusMoveAvailable: fullyFed };
        break;
      }
      case 'heal': {
        // A fully-spelled AID heals a bit more (per feedback).
        const amount = fullyFed ? 5 : 4;
        const before = state.hp;
        state.hp = Math.min(state.maxHp, state.hp + amount);
        effect = { healed: state.hp - before, amount };
        break;
      }
      case 'lettercall': {
        // A fully-spelled NEED queues two requested letters instead of one
        // (per feedback) - args.letters takes priority if given.
        const letters = Array.isArray(args.letters) ? args.letters : (args.letter ? [args.letter] : []);
        if (letters.length === 0 || !letters.every(l => /^[A-Z]$/.test(l))) {
          return { ok: false, reason: 'invalid-letter' };
        }
        for (const l of letters) LetterBag.requestLetter(l);
        effect = { letters };
        break;
      }
      case 'fire': {
        // Fire doesn't place a letter anywhere, so it can't trigger reward
        // fields - only direct placement does (per feedback). A
        // fully-spelled FIRE burns a 4x4 area instead of 3x3 (per feedback).
        const { r, c } = args;
        const rMax = fullyFed ? r + 2 : r + 1;
        const cMax = fullyFed ? c + 2 : c + 1;
        const hit = [];
        const killed = [];
        for (let rr = r - 1; rr <= rMax; rr++) {
          for (let cc = c - 1; cc <= cMax; cc++) {
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
        effect = { hit, killed, rewards: [], center: [r, c], full: fullyFed };
        break;
      }
      case 'ward': {
        // A fully-spelled WARD absorbs more (per feedback).
        const shield = fullyFed ? 7 : 4;
        state.wardShield = shield;
        effect = { shield };
        break;
      }
      case 'cleanse': {
        // Per feedback: a plus-shaped (5-cell) AOE normally; a fully-spelled
        // CLEAN clears a full 3x3 square instead (per feedback).
        const { r, c } = args;
        if (!Board.inBounds(r, c)) return { ok: false, reason: 'invalid-cell' };
        const area = fullyFed
          ? (() => {
              const cells = [];
              for (let rr = r - 1; rr <= r + 1; rr++) {
                for (let cc = c - 1; cc <= c + 1; cc++) cells.push([rr, cc]);
              }
              return cells;
            })()
          : [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
        const cleared = area.filter(([rr, cc]) => Board.inBounds(rr, cc) && Board.removeWordAt(rr, cc));
        effect = { cleared, center: [r, c] };
        break;
      }
    }

    state.spellFed[id] = {};
    state.spellUsedThisTurn[id] = true;
    return { ok: true, effect };
  }

  // The free second move a fully-spelled BLINK grants - no charge is spent,
  // the spell is already marked used for the turn by the main cast.
  function castBonusMove(id, args) {
    if (id !== 'blink') return { ok: false, reason: 'unsupported' };
    const { monsterId, r, c } = args;
    return performBlinkMove(monsterId, r, c);
  }

  function resetTurnUsage(state) {
    for (const def of DEFS) state.spellUsedThisTurn[def.id] = false;
  }

  return {
    DEFS, getDef, fedCount, remainingFor, neededLetters, isComplete, isCastable,
    canFeedLetter, slotStates, feedLetter, cast, castBonusMove, resetTurnUsage
  };
})();
