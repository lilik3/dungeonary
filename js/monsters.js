// Monster roster: one creature type per letter of the alphabet.
// GDD section 8 fixes Goblin=G, Orc=O, Spider=S with explicit stats.
// The worked example in the GDD (the "ORC" combat example) additionally names
// R = Patkany (Rat) and C = Rakpok (Crab Spider) as flavor, which we reuse here.
// All remaining letters are filled in by tier (GDD explicitly defers this to
// "a separate content table" - this is that table), using letter rarity as a
// rough proxy for danger: common letters -> weak "swarm" tier, mid-frequency
// letters -> "brute"/"tough" tiers, rare letters -> "elite" tier.
//
// Per feedback: HP is kept small and fixed per tier (no randomness, nothing
// above 3) - Orc specifically stays at 1 HP as called out.
const Monsters = (() => {
  const TIER_STATS = {
    swarm: { hp: 1, dmg: 1, xp: 1, gold: 2 },
    brute: { hp: 1, dmg: 2, xp: 2, gold: 2 },
    tough: { hp: 2, dmg: 2, xp: 3, gold: 3 },
    elite: { hp: 3, dmg: 3, xp: 4, gold: 8 }
  };
  const BOSS_HP = 3;

  const ROSTER = {
    // swarm tier (common letters, weak) - 1 HP
    E: { name: 'Lebegő Szem', emoji: '👁️', tier: 'swarm' },
    A: { name: 'Akolitus', emoji: '🙏', tier: 'swarm' },
    I: { name: 'Imp', emoji: '😈', tier: 'swarm' },
    N: { name: 'Naga', emoji: '🐍', tier: 'swarm' },
    R: { name: 'Patkány', emoji: '🐀', tier: 'swarm' },
    T: { name: 'Troll Kölyök', emoji: '🧌', tier: 'swarm' },
    L: { name: 'Gyíkember', emoji: '🦎', tier: 'swarm' },
    U: { name: 'Csatornatolvaj', emoji: '🧟', tier: 'swarm' },
    D: { name: 'Dretch', emoji: '👿', tier: 'swarm' },
    G: { name: 'Goblin', emoji: '👺', tier: 'swarm' },
    // brute tier (the GDD's own named basics) - 1 HP, Orc explicitly 1 HP
    O: { name: 'Ork', emoji: '👹', tier: 'brute' },
    S: { name: 'Pók', emoji: '🕷️', tier: 'brute' },
    C: { name: 'Rákpók', emoji: '🦀', tier: 'brute' },
    // tough tier - 2 HP
    M: { name: 'Mimic', emoji: '📦', tier: 'tough' },
    P: { name: 'Fantom', emoji: '👻', tier: 'tough' },
    F: { name: 'Spóragomba', emoji: '🍄', tier: 'tough' },
    H: { name: 'Hárpia', emoji: '🦅', tier: 'tough' },
    V: { name: 'Vámpír', emoji: '🧛', tier: 'tough' },
    W: { name: 'Kísértet', emoji: '💀', tier: 'tough' },
    Y: { name: 'Jeti', emoji: '🧊', tier: 'tough' },
    B: { name: 'Denevér', emoji: '🦇', tier: 'tough' },
    // elite tier (rare letters, dangerous) - 3 HP, the cap
    K: { name: 'Kobold Vezér', emoji: '👑', tier: 'elite' },
    J: { name: 'Jabberwock', emoji: '🐉', tier: 'elite' },
    X: { name: 'Xorn', emoji: '🪨', tier: 'elite' },
    Q: { name: 'Quasit', emoji: '🦂', tier: 'elite' },
    Z: { name: 'Zombi Úr', emoji: '🧟‍♂️', tier: 'elite' }
  };

  const BOSS_POOL = [
    { letter: 'K', name: 'Kobold Felügyelő', emoji: '👑' },
    { letter: 'J', name: 'Öreg Jabberwock', emoji: '🐉' },
    { letter: 'X', name: 'Xorn Anya', emoji: '🪨' },
    { letter: 'Q', name: 'Quasit Zsarnok', emoji: '🦂' },
    { letter: 'Z', name: 'Zombi Király', emoji: '🧟‍♂️' }
  ];

  let nextMonsterId = 1;

  function lettersByTier(tier) {
    return Object.keys(ROSTER).filter(l => ROSTER[l].tier === tier);
  }

  function randomLetterOfTier(tier) {
    const pool = lettersByTier(tier);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function createMonster(letter) {
    const def = ROSTER[letter];
    const stats = TIER_STATS[def.tier];
    return {
      id: nextMonsterId++,
      letter,
      name: def.name,
      emoji: def.emoji,
      tier: def.tier,
      hp: stats.hp,
      maxHp: stats.hp,
      dmg: stats.dmg,
      xp: stats.xp,
      gold: stats.gold,
      isBoss: false,
      r: -1, c: -1,
      alive: true
    };
  }

  function createMonsterByTier(tier) {
    return createMonster(randomLetterOfTier(tier));
  }

  function createBoss() {
    const def = BOSS_POOL[Math.floor(Math.random() * BOSS_POOL.length)];
    return {
      id: nextMonsterId++,
      letter: def.letter,
      name: def.name,
      emoji: def.emoji,
      tier: 'boss',
      hp: BOSS_HP,
      maxHp: BOSS_HP,
      dmg: 3 + Math.floor(Math.random() * 2), // 3-4 per GDD
      xp: 10,
      gold: 20,
      isBoss: true,
      r: -1, c: -1,
      alive: true
    };
  }

  return { ROSTER, createMonster, createMonsterByTier, createBoss, lettersByTier };
})();
