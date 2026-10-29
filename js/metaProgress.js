// Persistent meta-progression: skill points, owned skill-tree nodes, and the
// lifetime stats that gate certain nodes (stepped in a trap, dropped low on
// HP, etc.) - all of this survives between runs, unlike Run's own state.
// Backed by localStorage; falls back to an in-memory default if storage is
// unavailable (private browsing, blocked storage) so the game never throws.
const MetaProgress = (() => {
  const STORAGE_KEY = 'dungeonary_meta_v1';

  function defaultData() {
    return {
      skillPoints: 0,
      // Core is the free hub; Blink and Heal start owned too (same as the
      // original system's startUnlocked spells) so a brand new player isn't
      // staring at an empty ability panel before their first level-up.
      ownedNodes: ['core', 'blink', 'heal'],
      lifetime: {
        trapStepped: false,
        junkLetters: false,
        lowHp: false,
        maxLevelReached: 1
      }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      const def = defaultData();
      return {
        skillPoints: typeof parsed.skillPoints === 'number' ? parsed.skillPoints : def.skillPoints,
        ownedNodes: Array.isArray(parsed.ownedNodes) ? parsed.ownedNodes : def.ownedNodes,
        lifetime: { ...def.lifetime, ...(parsed.lifetime || {}) }
      };
    } catch (e) {
      return defaultData();
    }
  }

  let data = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // storage unavailable - progress just won't persist across reloads
    }
  }

  function getSkillPoints() {
    return data.skillPoints;
  }

  function addSkillPoints(n) {
    data.skillPoints += n;
    save();
  }

  function isOwned(nodeId) {
    return data.ownedNodes.includes(nodeId);
  }

  function getOwnedNodes() {
    return data.ownedNodes.slice();
  }

  // Spends skill points (if cost > 0) and/or marks a node owned. Caller
  // (SkillTree) is responsible for checking affordability/prereqs first.
  function unlockNode(nodeId, pointCost) {
    if (isOwned(nodeId)) return;
    if (pointCost > 0) data.skillPoints -= pointCost;
    data.ownedNodes.push(nodeId);
    save();
  }

  function getLifetime() {
    return data.lifetime;
  }

  // Each record* function is a one-way flag/high-water-mark flip - once
  // true, stays true forever (these gate node unlocks, not act as counters).
  function recordTrapStepped() {
    if (data.lifetime.trapStepped) return;
    data.lifetime.trapStepped = true;
    save();
  }

  function recordJunkLetters() {
    if (data.lifetime.junkLetters) return;
    data.lifetime.junkLetters = true;
    save();
  }

  function recordLowHp() {
    if (data.lifetime.lowHp) return;
    data.lifetime.lowHp = true;
    save();
  }

  function recordLevelReached(level) {
    if (level <= data.lifetime.maxLevelReached) return;
    data.lifetime.maxLevelReached = level;
    save();
  }

  // TEMPORARY (test menu): wipes all persistent meta-progress.
  function resetAll() {
    data = defaultData();
    save();
  }

  return {
    getSkillPoints, addSkillPoints, isOwned, getOwnedNodes, unlockNode, getLifetime,
    recordTrapStepped, recordJunkLetters, recordLowHp, recordLevelReached, resetAll
  };
})();
