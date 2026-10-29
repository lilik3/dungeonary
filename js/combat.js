// Combat resolver: Scrabble-style spatial combat. A placed word is a line of
// cells; some already had a letter (a living monster or an inert corpse/word
// tile), the rest are freshly filled from the player's rack. Any LIVING
// monster whose cell lies on that line takes 1 damage - no letter-identity
// matching needed, since the monster's own letter is necessarily part of the
// word by construction. Per feedback, new tiles now always stay on the board
// once a valid word is played, whether or not it killed anything.
const Combat = (() => {
  // Deals 1 damage to every distinct living monster whose cell appears in
  // `cells` ([{r,c}, ...]), handling kills. Rewards are separate now (per
  // feedback) - they trigger on direct letter placement, not on kills.
  function resolveMonstersInCells(cells) {
    const seen = new Set();
    const hit = [];
    const killed = [];
    for (const { r, c } of cells) {
      const m = Board.getLivingMonsterAt(r, c);
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        m.hp -= 1;
        hit.push(m);
        if (m.hp <= 0) {
          Board.killMonster(m.id);
          killed.push(m);
        }
      }
    }
    return { hit, killed };
  }

  // newCells: [{r, c, letter, tokenId, isJoker?}] - every letter the player
  // is placing this turn, not necessarily all on one line (per feedback: a
  // single play can branch into an intersecting word too, Scrabble-style -
  // every resulting word, main line or cross branch, is validated and played
  // together as one atomic move).
  function resolveWordSubmission(newCells) {
    if (!newCells || newCells.length === 0) {
      return { ok: false, reason: 'no-new-letters' };
    }

    const tokenIds = newCells.map(p => p.tokenId);
    const tokens = Inventory.tokensForIds(tokenIds);
    if (tokens.length !== tokenIds.length) {
      return { ok: false, reason: 'invalid-tokens' };
    }
    // every new cell's letter must match the rack token it claims to use -
    // unless that token is a Joker, which stands in for whatever was chosen.
    const tokenById = new Map(tokens.map(t => [t.id, t]));
    for (const p of newCells) {
      const tok = tokenById.get(p.tokenId);
      if (!tok) return { ok: false, reason: 'token-mismatch' };
      if (tok.letter !== p.letter && tok.letter !== LetterBag.JOKER_LETTER) {
        return { ok: false, reason: 'token-mismatch' };
      }
    }

    // Every word (2+ letters, any direction) that touches at least one of
    // the new letters - the line(s) being played, plus any cross word a new
    // letter happens to complete. All of them must be real words.
    const words = Board.allWordsForNewLetters(newCells.map(p => ({ r: p.r, c: p.c, letter: p.letter })));
    if (words.length === 0) {
      return { ok: false, reason: 'too-short' };
    }
    for (const w of words) {
      if (!Dictionary.isValidWord(w.word)) {
        return { ok: false, reason: 'invalid-word', word: w.word };
      }
    }

    // Traps and reward fields fire immediately when a new letter lands on
    // them, regardless of the combat outcome below.
    const newCellCoords = newCells.map(p => [p.r, p.c]);
    const trapHits = Board.triggerTrapsFor(newCellCoords);
    const trapDamage = trapHits.length * 2;
    const rewards = Board.triggerRewardsFor(newCellCoords);

    // Letter-match-by-position damage: every living monster any formed word
    // passes through (deduped - a cell shared by two words only counts once).
    const cellSeen = new Set();
    const allCells = [];
    for (const w of words) {
      for (const cell of w.cells) {
        const key = `${cell.r},${cell.c}`;
        if (cellSeen.has(key)) continue;
        cellSeen.add(key);
        allCells.push(cell);
      }
    }
    const { hit, killed } = resolveMonstersInCells(allCells);

    Board.writeLetters(newCells.map(p => ({ r: p.r, c: p.c, letter: p.letter, isJoker: p.isJoker })));

    Inventory.consumeTokens(tokenIds);

    const wordList = words.map(w => w.word);
    return {
      ok: true, words: wordList, word: wordList.join(' + '), hit, killed, rewards, trapDamage, trapCells: trapHits,
      tilesKept: true, newLetterCount: newCells.length
    };
  }

  // Enemy attack phase: every living monster hits the player. A Ward shield
  // (if active) absorbs damage first.
  function resolveEnemyAttack(wardAbsorb) {
    const living = Board.getLivingMonsters();
    let totalDamage = living.reduce((sum, m) => sum + m.dmg, 0);
    let absorbed = 0;
    if (wardAbsorb > 0 && totalDamage > 0) {
      absorbed = Math.min(wardAbsorb, totalDamage);
      totalDamage -= absorbed;
    }
    return { attackers: living.length, rawDamage: living.reduce((s, m) => s + m.dmg, 0), absorbed, finalDamage: totalDamage };
  }

  return { resolveMonstersInCells, resolveWordSubmission, resolveEnemyAttack };
})();
