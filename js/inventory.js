// Inventory manager: letter tokens, capacity, discard/trash, word consumption.
const Inventory = (() => {
  const BASE_CAPACITY = 7;
  const MAX_CAPACITY = 11;
  const UPGRADE_COSTS = { 8: 20, 9: 35, 10: 55, 11: 80 };

  let capacity = BASE_CAPACITY;
  // Each token: { id, letter }
  let tokens = [];
  let nextId = 1;

  function reset() {
    capacity = BASE_CAPACITY;
    tokens = [];
    nextId = 1;
  }

  function hasSpace() {
    return tokens.length < capacity;
  }

  function freeSlots() {
    return capacity - tokens.length;
  }

  function addLetter(letter) {
    if (!hasSpace()) return null;
    const token = { id: nextId++, letter: letter.toUpperCase() };
    tokens.push(token);
    return token;
  }

  function discard(tokenIds) {
    const idSet = new Set(tokenIds);
    tokens = tokens.filter(t => !idSet.has(t.id));
  }

  function getTokens() {
    return tokens.slice();
  }

  // Validates that every tokenId exists in inventory and corresponds to the given letters (order-sensitive by id list).
  function tokensForIds(tokenIds) {
    const map = new Map(tokens.map(t => [t.id, t]));
    return tokenIds.map(id => map.get(id)).filter(Boolean);
  }

  function consumeTokens(tokenIds) {
    const idSet = new Set(tokenIds);
    tokens = tokens.filter(t => !idSet.has(t.id));
  }

  function canUpgrade() {
    return capacity < MAX_CAPACITY;
  }

  function nextUpgradeCost() {
    if (!canUpgrade()) return null;
    return UPGRADE_COSTS[capacity + 1];
  }

  function upgradeCapacity() {
    if (!canUpgrade()) return false;
    capacity += 1;
    return true;
  }

  function getCapacity() {
    return capacity;
  }

  return {
    reset, hasSpace, freeSlots, addLetter, discard, getTokens,
    tokensForIds, consumeTokens, canUpgrade, nextUpgradeCost,
    upgradeCapacity, getCapacity, MAX_CAPACITY
  };
})();
