// Board module: 7x7 grid state (GDD section 11) with real Scrabble-style
// placement - monsters ARE letters already sitting on the board, and the
// player's new words must read through them (reusing their letter for free)
// to damage them. New words may start anywhere empty; only touching a
// monster's cell deals damage to it. A monster's letter stays on the board
// as an inert tile forever once it dies (the dungeon remembers it).
const Board = (() => {
  const SIZE = 7;
  let grid = [];
  let monsters = new Map(); // id -> monster instance (also stored with r,c)
  let roomNumber = 0;

  // Difficulty curve across the 5 rooms + boss room.
  const ROOM_PLANS = {
    1: { count: 6, elites: 0, traps: 2, rewards: 2 },
    2: { count: 7, elites: 0, traps: 2, rewards: 2 },
    3: { count: 7, elites: 1, traps: 3, rewards: 2 },
    4: { count: 8, elites: 1, traps: 3, rewards: 3 },
    5: { count: 8, elites: 2, traps: 3, rewards: 3 },
    6: { count: 2, elites: 0, traps: 3, rewards: 2, boss: true }
  };

  function emptyCell() {
    return { trap: false, trapSpent: false, reward: null, placed: null, monsterId: null };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function neighbors(r, c) {
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => inBounds(rr, cc));
  }

  function cellIsEmpty(r, c) {
    const cell = grid[r][c];
    const livingMonster = cell.monsterId && monsters.get(cell.monsterId) && monsters.get(cell.monsterId).alive;
    return !livingMonster && !cell.placed;
  }

  function allCells() {
    const out = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) out.push([r, c]);
    return out;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // All 8 surrounding cells (orthogonal + diagonal) - spawn spacing must hold
  // on every side, not just up/down/left/right.
  function neighbors8(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        if (inBounds(rr, cc)) out.push([rr, cc]);
      }
    }
    return out;
  }

  function hasAdjacentMonster(r, c) {
    return neighbors8(r, c).some(([nr, nc]) => grid[nr][nc].monsterId);
  }

  // Picks (and removes) a cell from freeCells that isn't next to another
  // monster yet (including diagonally), so spawns always keep a full ring of
  // empty space around them - falls back to any free cell if the board is
  // too packed to manage it.
  function popSpacedMonsterCell(freeCells) {
    for (let i = 0; i < freeCells.length; i++) {
      const [r, c] = freeCells[i];
      if (!hasAdjacentMonster(r, c)) {
        freeCells.splice(i, 1);
        return [r, c];
      }
    }
    return freeCells.pop();
  }

  function generateRoom(num) {
    roomNumber = num;
    monsters = new Map();
    grid = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) row.push(emptyCell());
      grid.push(row);
    }

    const plan = ROOM_PLANS[num] || ROOM_PLANS[5];
    const freeCells = shuffle(allCells());

    const placedMonsters = [];

    if (plan.boss) {
      const boss = Monsters.createBoss();
      const [br, bc] = popSpacedMonsterCell(freeCells);
      boss.r = br; boss.c = bc;
      grid[br][bc].monsterId = boss.id;
      monsters.set(boss.id, boss);
      placedMonsters.push(boss);
      for (let i = 0; i < plan.count - 1; i++) {
        const m = Monsters.createMonsterByTier('swarm');
        const [r, c] = popSpacedMonsterCell(freeCells);
        m.r = r; m.c = c;
        grid[r][c].monsterId = m.id;
        monsters.set(m.id, m);
        placedMonsters.push(m);
      }
    } else {
      for (let i = 0; i < plan.elites; i++) {
        const m = Monsters.createMonsterByTier('elite');
        const [r, c] = popSpacedMonsterCell(freeCells);
        m.r = r; m.c = c;
        grid[r][c].monsterId = m.id;
        monsters.set(m.id, m);
        placedMonsters.push(m);
      }
      const remaining = plan.count - plan.elites;
      for (let i = 0; i < remaining; i++) {
        const roll = Math.random();
        const tier = roll < 0.45 ? 'swarm' : (roll < 0.75 ? 'brute' : 'tough');
        const m = Monsters.createMonsterByTier(tier);
        const [r, c] = popSpacedMonsterCell(freeCells);
        m.r = r; m.c = c;
        grid[r][c].monsterId = m.id;
        monsters.set(m.id, m);
        placedMonsters.push(m);
      }
    }

    let trapsToPlace = plan.traps;
    for (const [r, c] of freeCells) {
      if (trapsToPlace <= 0) break;
      if (cellIsEmpty(r, c)) {
        grid[r][c].trap = true;
        trapsToPlace--;
      }
    }

    let rewardsToPlace = plan.rewards;
    const monsterShuffled = shuffle(placedMonsters.slice());
    for (const m of monsterShuffled) {
      if (rewardsToPlace <= 0) break;
      const opts = neighbors(m.r, m.c).filter(([r, c]) => cellIsEmpty(r, c) && !grid[r][c].trap && !grid[r][c].reward);
      if (opts.length === 0) continue;
      const [r, c] = opts[Math.floor(Math.random() * opts.length)];
      grid[r][c].reward = { kind: Math.random() < 0.6 ? 'gold' : 'heal', linkedMonsterId: m.id, consumed: false };
      rewardsToPlace--;
    }

    return getState();
  }

  function getCell(r, c) {
    return grid[r][c];
  }

  // The letter currently occupying a cell (living monster, dead-monster
  // corpse tile, or a previously placed word tile) - null if empty.
  function getCellLetter(r, c) {
    const cell = grid[r][c];
    if (cell.monsterId) {
      const m = monsters.get(cell.monsterId);
      if (m && m.alive) return m.letter;
    }
    if (cell.placed) return cell.placed.letter;
    return null;
  }

  function getLivingMonsterAt(r, c) {
    const cell = grid[r][c];
    if (!cell.monsterId) return null;
    const m = monsters.get(cell.monsterId);
    return m && m.alive ? m : null;
  }

  function getMonsters() {
    return Array.from(monsters.values());
  }

  function getLivingMonsters() {
    return getMonsters().filter(m => m.alive);
  }

  function getMonster(id) {
    return monsters.get(id);
  }

  function roomCleared() {
    return getLivingMonsters().length === 0;
  }

  // --- Line geometry (for interactive word building) ---

  function computeLineCells(r, c, dir, length) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      const rr = dir === 'V' ? r + i : r;
      const cc = dir === 'H' ? c + i : c;
      if (!inBounds(rr, cc)) return null;
      cells.push([rr, cc]);
    }
    return cells;
  }

  // How far a line can extend from (r,c) in dir before running off the board.
  function maxLineLength(r, c, dir) {
    return dir === 'H' ? SIZE - c : SIZE - r;
  }

  // What word (if any) `letter` would form at (r,c) along `dir`, treating
  // (r,c) as already holding it and reading outward through whatever's
  // already on the board on both sides (monsters, corpses, old tiles).
  // Used by Blink: a monster you move in next to existing letters must form
  // a real word, unless the spot is fully isolated. Doesn't mutate the board.
  function wordCandidateAt(r, c, letter, dir) {
    let lo = dir === 'H' ? c : r;
    let hi = lo;
    const letterAt = (pos) => {
      const rr = dir === 'H' ? r : pos;
      const cc = dir === 'H' ? pos : c;
      if (rr === r && cc === c) return letter;
      return getCellLetter(rr, cc);
    };
    while (lo - 1 >= 0 && letterAt(lo - 1) != null) lo--;
    while (hi + 1 <= SIZE - 1 && letterAt(hi + 1) != null) hi++;
    const cells = [];
    for (let pos = lo; pos <= hi; pos++) {
      const rr = dir === 'H' ? r : pos;
      const cc = dir === 'H' ? pos : c;
      cells.push({ r: rr, c: cc, letter: letterAt(pos) });
    }
    return { cells, word: cells.map(x => x.letter).join('') };
  }

  // --- Committing a resolved word ---

  // Traps fire the instant a new letter physically lands on them, regardless
  // of whether the word goes on to succeed - so this runs before we know
  // whether the tiles will stick.
  function triggerTrapsFor(cells) {
    const hits = [];
    for (const [r, c] of cells) {
      if (grid[r][c].trap && !grid[r][c].trapSpent) {
        grid[r][c].trapSpent = true;
        hits.push([r, c]);
      }
    }
    return hits;
  }

  // Makes newly-placed letters permanent (only called once we know the word
  // killed at least one monster, per the "stays only if it killed" rule).
  // newLetters: [{r, c, letter}]
  function writeLetters(newLetters) {
    for (const { r, c, letter } of newLetters) {
      grid[r][c].placed = { letter };
    }
  }

  function removeWordAt(r, c) {
    const cell = grid[r][c];
    if (!cell.placed) return false;
    cell.placed = null;
    return true;
  }

  function resetTrapTurnFlags() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) grid[r][c].trapSpent = false;
  }

  function moveMonster(id, r, c) {
    const m = monsters.get(id);
    if (!m) return false;
    if (!inBounds(r, c) || !cellIsEmpty(r, c)) return false;
    grid[m.r][m.c].monsterId = null;
    m.r = r; m.c = c;
    grid[r][c].monsterId = id;
    return true;
  }

  // Monster dies: its letter becomes a permanent inert tile on its cell.
  function killMonster(id) {
    const m = monsters.get(id);
    if (!m) return null;
    m.alive = false;
    grid[m.r][m.c].monsterId = null;
    grid[m.r][m.c].placed = { letter: m.letter };
    let reward = null;
    const cellsToCheck = neighbors(m.r, m.c);
    cellsToCheck.push([m.r, m.c]);
    for (const [r, c] of cellsToCheck) {
      const cell = grid[r][c];
      if (cell.reward && cell.reward.linkedMonsterId === id && !cell.reward.consumed) {
        cell.reward.consumed = true;
        reward = cell.reward;
      }
    }
    return reward;
  }

  function getState() {
    return { size: SIZE, grid, roomNumber };
  }

  return {
    SIZE, generateRoom, getCell, getCellLetter, getLivingMonsterAt, getMonsters,
    getLivingMonsters, getMonster, roomCleared, computeLineCells, maxLineLength, wordCandidateAt,
    triggerTrapsFor, writeLetters, removeWordAt, resetTrapTurnFlags, moveMonster, killMonster,
    cellIsEmpty, getState, inBounds
  };
})();
