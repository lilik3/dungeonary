// Weighted letter bag: infinite weighted-random draw (no depletion), per GDD section 6.
// Correction/pity system intentionally OFF for this MVP (GDD explicitly recommends starting without it).
const LetterBag = (() => {
  // Internal marker for the Joker tile (per feedback): a wildcard letter,
  // as rare as the rarest real letters, that can stand in for any letter.
  const JOKER_LETTER = '*';

  // Actual English-text letter frequency (per feedback - the old Scrabble
  // tile counts made Z/X/Q/J far too common relative to how rare they really
  // are in English; this is the standard corpus-frequency table, scaled
  // x10 and rounded). The Joker sits at the same rarity as the rarest real
  // letters (Q/Z).
  const WEIGHTS = {
    E: 127, T: 91, A: 82, O: 75, I: 70, N: 67, S: 63, H: 61, R: 60,
    D: 43, L: 40, C: 28, U: 28, M: 24, W: 24, F: 22, G: 20, Y: 20,
    P: 19, B: 15, V: 10, K: 8, J: 2, X: 2, Q: 1, Z: 1, [JOKER_LETTER]: 1
  };

  const LETTERS = Object.keys(WEIGHTS);
  const TOTAL_WEIGHT = LETTERS.reduce((sum, l) => sum + WEIGHTS[l], 0);

  // "Luck charges" from a level-up perk: temporarily bias toward common/vowel letters.
  let luckCharges = 0;
  const LUCKY_LETTERS = ['E', 'A', 'I', 'O', 'N', 'R', 'T', 'S'];

  function addLuckCharges(n) {
    luckCharges += n;
  }

  function weightedRandomLetter() {
    if (luckCharges > 0) {
      luckCharges--;
      return LUCKY_LETTERS[Math.floor(Math.random() * LUCKY_LETTERS.length)];
    }
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const letter of LETTERS) {
      roll -= WEIGHTS[letter];
      if (roll <= 0) return letter;
    }
    return LETTERS[LETTERS.length - 1];
  }

  // requestedLetters: a queue set by the Letter Call spell (NEED); each
  // queued letter is consumed, in order, by the next draws. A full NEED cast
  // queues two letters instead of one (per feedback).
  let requestedLetters = [];

  function requestLetter(letter) {
    requestedLetters.push(letter.toUpperCase());
  }

  function hasRequest() {
    return requestedLetters.length > 0;
  }

  function clearRequest() {
    requestedLetters = [];
  }

  // Draws exactly one letter. Does not check inventory space - caller's job.
  function draw() {
    if (requestedLetters.length > 0) return requestedLetters.shift();
    return weightedRandomLetter();
  }

  // TEMPORARY (debug Back/Forward): full state in/out for snapshotting.
  function exportState() {
    return { luckCharges, requestedLetters: requestedLetters.slice() };
  }

  function importState(data) {
    luckCharges = data.luckCharges;
    requestedLetters = (data.requestedLetters || []).slice();
  }

  return {
    draw, requestLetter, hasRequest, clearRequest, addLuckCharges, WEIGHTS,
    exportState, importState, JOKER_LETTER
  };
})();
