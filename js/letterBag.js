// Weighted letter bag: infinite weighted-random draw (no depletion), per GDD section 6.
// Correction/pity system intentionally OFF for this MVP (GDD explicitly recommends starting without it).
const LetterBag = (() => {
  // Standard Scrabble-like English letter frequency weights.
  const WEIGHTS = {
    E: 12, A: 9, I: 9, O: 8, N: 6, R: 6, T: 6, L: 4, S: 4, U: 4, D: 4,
    G: 3, B: 2, C: 2, M: 2, P: 2, F: 2, H: 2, V: 2, W: 2, Y: 2,
    K: 1, J: 1, X: 1, Q: 1, Z: 1
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

  // requestedLetter: set by the Letter Call spell; consumed by the next draw.
  let requestedLetter = null;

  function requestLetter(letter) {
    requestedLetter = letter.toUpperCase();
  }

  function hasRequest() {
    return !!requestedLetter;
  }

  function clearRequest() {
    requestedLetter = null;
  }

  // Draws exactly one letter. Does not check inventory space - caller's job.
  function draw() {
    if (requestedLetter) {
      const l = requestedLetter;
      requestedLetter = null;
      return l;
    }
    return weightedRandomLetter();
  }

  return { draw, requestLetter, hasRequest, clearRequest, addLuckCharges, WEIGHTS };
})();
