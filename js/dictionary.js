// Dictionary module: wraps the big word list into a fast Set-based lookup.
const Dictionary = (() => {
  let wordSet = null;

  function init() {
    if (wordSet) return;
    wordSet = new Set(DUNGEONARY_WORD_LIST);
  }

  function isValidWord(word) {
    if (!wordSet) init();
    if (!word || word.length < 2) return false;
    return wordSet.has(word.toUpperCase());
  }

  return { init, isValidWord };
})();
