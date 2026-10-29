// Weighted letter bag: infinite weighted-random draw (no depletion), per GDD section 6.
// Correction/pity system intentionally OFF for this MVP (GDD explicitly recommends starting without it).
const LetterBag = (() => {
  // Internal marker for the Joker tile (per feedback): a wildcard letter,
  // as rare as the rarest real letters, that can stand in for any letter.
  const JOKER_LETTER = '*';

  // Square-root-dampened English-text letter frequency (per feedback - raw
  // corpus frequency (the previous table) made the rarest letters feel
  // completely absent: K sat at ~0.8% and the Joker at ~0.1%, so most runs
  // never drew one at all. Raw Scrabble tile counts (the table before that)
  // went too far the other way and made Z/X/Q/J feel oppressively common.
  // Taking the square root of each letter's real frequency keeps the same
  // relative ORDER (E is still clearly the most common, Z/Q still the
  // rarest) but compresses the RANGE between them - the common/rare ratio
  // ends up close to Scrabble's own bag (~12:1) while the shape in between
  // still tracks true English usage. The Joker sits a notch above K: rare
  // enough to feel special, common enough to actually show up.
  const WEIGHTS = {
    E: 36, T: 30, A: 29, O: 27, I: 26, N: 26, S: 25, H: 25, R: 24,
    D: 21, L: 20, C: 17, U: 17, M: 16, W: 15, F: 15, G: 14, Y: 14,
    P: 14, B: 12, V: 10, K: 9, J: 4, X: 4, Q: 3, Z: 3, [JOKER_LETTER]: 6
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
