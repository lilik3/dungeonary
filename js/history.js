// TEMPORARY debug tool (per feedback): simple Back/Forward buttons for
// testing - steps the entire game state backward/forward through snapshots
// taken right before every state-mutating action. Not part of the actual
// game; safe to delete later along with the two buttons that drive it.
const History = (() => {
  let undoStack = [];
  let redoStack = [];
  const MAX_STACK = 200;

  function snapshot() {
    return {
      run: Run.exportState(),
      inventory: Inventory.exportState(),
      board: Board.exportState(),
      turn: TurnManager.exportState(),
      letterBag: LetterBag.exportState()
    };
  }

  function restore(snap) {
    const cloned = structuredClone(snap);
    Run.importState(cloned.run);
    Inventory.importState(cloned.inventory);
    Board.importState(cloned.board);
    TurnManager.importState(cloned.turn);
    LetterBag.importState(cloned.letterBag);
  }

  // Called by TurnManager right before it mutates anything.
  function capture() {
    undoStack.push(structuredClone(snapshot()));
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack = [];
  }

  function canGoBack() { return undoStack.length > 0; }
  function canGoForward() { return redoStack.length > 0; }

  function back() {
    if (undoStack.length === 0) return false;
    const current = structuredClone(snapshot());
    const prev = undoStack.pop();
    redoStack.push(current);
    restore(prev);
    return true;
  }

  function forward() {
    if (redoStack.length === 0) return false;
    const current = structuredClone(snapshot());
    const next = redoStack.pop();
    undoStack.push(current);
    restore(next);
    return true;
  }

  return { capture, back, forward, canGoBack, canGoForward };
})();
