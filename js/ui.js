// UI module: all DOM rendering and event wiring. Talks to the game logic
// exclusively through TurnManager / Run / Board / Inventory / Spells / Dictionary.
//
// Word building is real drag-and-drop (per feedback): press and hold a rack
// tile, drag it onto an empty board cell, release to drop it there. Dropped
// letters show up on the board immediately. The resulting word is read off
// the board (your drops plus any letters already there - monsters or old
// tiles - that your drops touch or bridge), exactly like placing tiles in
// Scrabble. Monster letters are rendered large and bold so they're always
// legible at a glance, with the monster's emoji as a small corner badge.
const UI = (() => {
  let pendingDrops = []; // [{r, c, letter, tokenId}] - not yet committed to the board
  let dragData = null; // { tokenId, letter } while a drag is in progress
  let spellTargetState = null; // { spellId, stage, monsterId }
  let pendingLevelUps = 0;
  let currentPerkOptions = [];

  const $ = sel => document.querySelector(sel);

  function log(msg, cls) {
    const el = document.createElement('p');
    if (cls) el.className = cls;
    el.textContent = msg;
    const logEl = $('#log');
    logEl.appendChild(el);
    while (logEl.children.length > 60) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    $('#log').innerHTML = '';
  }

  // ---------- WORD CANDIDATE COMPUTATION ----------

  function reservedTokenIds() {
    return new Set(pendingDrops.map(p => p.tokenId));
  }

  function pendingDropAt(r, c) {
    return pendingDrops.find(p => p.r === r && p.c === c) || null;
  }

  // 'H' / 'V' once 2+ drops fix the line, 'ambiguous' for a single drop
  // (direction not yet determined), 'invalid' if drops aren't colinear
  // (shouldn't happen - drops are rejected before this can occur).
  function axisOf(drops) {
    if (drops.length === 0) return null;
    if (drops.length === 1) return 'ambiguous';
    if (drops.every(p => p.r === drops[0].r)) return 'H';
    if (drops.every(p => p.c === drops[0].c)) return 'V';
    return 'invalid';
  }

  // Builds the maximal word through `drops` along `dir`: fills any gap
  // within the drops' own span using existing board letters (returns null if
  // a gap has neither a drop nor an existing letter - word isn't ready yet),
  // then extends outward through existing letters on both ends.
  function buildCandidate(dir, drops) {
    const fixed = dir === 'H' ? drops[0].r : drops[0].c;
    const positions = drops.map(p => (dir === 'H' ? p.c : p.r));
    let lo = Math.min(...positions);
    let hi = Math.max(...positions);

    const letterAt = (pos) => {
      const r = dir === 'H' ? fixed : pos;
      const c = dir === 'H' ? pos : fixed;
      const drop = drops.find(p => p.r === r && p.c === c);
      if (drop) return { letter: drop.letter, tokenId: drop.tokenId, r, c };
      const existing = Board.getCellLetter(r, c);
      if (existing != null) return { letter: existing, tokenId: null, r, c };
      return null;
    };

    for (let pos = lo; pos <= hi; pos++) {
      if (!letterAt(pos)) return null; // gap - still mid-build
    }
    while (lo - 1 >= 0 && letterAt(lo - 1)) lo--;
    const maxPos = Board.SIZE - 1;
    while (hi + 1 <= maxPos && letterAt(hi + 1)) hi++;

    const cells = [];
    for (let pos = lo; pos <= hi; pos++) cells.push(letterAt(pos));
    return { cells, word: cells.map(c => c.letter).join('') };
  }

  // All straight-line word candidates the current drops could resolve to.
  function getCandidates() {
    if (pendingDrops.length === 0) return [];
    const axis = axisOf(pendingDrops);
    if (axis === 'invalid') return [];
    if (axis === 'ambiguous') {
      const out = [];
      const h = buildCandidate('H', pendingDrops);
      if (h && h.cells.length >= 2) out.push({ ...h, dir: 'H' });
      const v = buildCandidate('V', pendingDrops);
      if (v && v.cells.length >= 2) out.push({ ...v, dir: 'V' });
      return out;
    }
    const built = buildCandidate(axis, pendingDrops);
    if (!built || built.cells.length < 2) return [];
    return [{ ...built, dir: axis }];
  }

  function getConfirmableCandidates() {
    return getCandidates().filter(c => Dictionary.isValidWord(c.word));
  }

  function wouldAcceptDrop(r, c) {
    if (Board.getCellLetter(r, c) != null) return false;
    if (pendingDropAt(r, c)) return false;
    if (pendingDrops.length > 0) {
      const axis = axisOf(pendingDrops);
      const first = pendingDrops[0];
      if (axis === 'H') return r === first.r;
      if (axis === 'V') return c === first.c;
      if (axis === 'ambiguous') return r === first.r || c === first.c;
    }
    return true;
  }

  // ---------- RENDER ----------

  function renderAll() {
    renderHud();
    renderBoard();
    renderRack();
    renderSpellPanel();
    renderActionButtons();
    renderPlacementControls();
    renderLetterPicker(null);
  }

  function renderHud() {
    const s = Run.getState();
    if (!s) return;
    $('#hp-fill').style.width = `${Math.max(0, (s.hp / s.maxHp) * 100)}%`;
    $('#hp-text').textContent = `${s.hp} / ${s.maxHp}`;

    const curThresh = Run.xpThreshold(s.level);
    const nextThresh = Run.xpThreshold(s.level + 1);
    const span = nextThresh - curThresh;
    const progress = span > 0 ? (s.xp - curThresh) / span : 1;
    $('#xp-fill').style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
    $('#xp-text').textContent = `${s.xp - curThresh} / ${span}`;
    $('#level-text').textContent = s.level;

    $('#gold-text').textContent = s.gold;
    $('#room-text').textContent = Run.isBossRoom() ? 'Főellenfél' : s.roomNumber;
    $('#room-total').textContent = Run.TOTAL_ROOMS;
  }

  function renderBoard() {
    const boardEl = $('#board');
    boardEl.innerHTML = '';
    const { size } = Board.getState();
    const phase = TurnManager.getPhase();

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = Board.getCell(r, c);
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.r = r;
        div.dataset.c = c;

        const pending = pendingDropAt(r, c);
        const m = Board.getLivingMonsterAt(r, c);

        if (pending) {
          div.classList.add('pending-tile', 'selectable');
          div.textContent = pending.letter;
          div.title = 'Kattints a visszavonáshoz';
        } else if (m) {
          div.classList.add('has-monster');
          div.title = `${m.name} (${m.letter}) — HP ${m.hp}/${m.maxHp}, sebzés ${m.dmg}`;
          if (m.tier === 'elite') div.classList.add('monster-elite');
          if (m.isBoss) div.classList.add('monster-boss');
          const letterEl = document.createElement('span');
          letterEl.className = 'cell-letter';
          letterEl.textContent = m.letter;
          div.appendChild(letterEl);
          const emojiEl = document.createElement('span');
          emojiEl.className = 'cell-emoji';
          emojiEl.textContent = m.emoji;
          div.appendChild(emojiEl);
          const hpWrap = document.createElement('div');
          hpWrap.className = 'hp-mini';
          const hpFill = document.createElement('div');
          hpFill.className = 'hp-mini-fill';
          hpFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
          hpWrap.appendChild(hpFill);
          div.appendChild(hpWrap);
        } else if (cell.placed) {
          div.classList.add('placed-tile');
          div.textContent = cell.placed.letter;
        } else {
          if (cell.trap && !cell.trapSpent) div.classList.add('trap');
          if (cell.reward && !cell.reward.consumed) {
            div.classList.add(cell.reward.kind === 'gold' ? 'reward-gold' : 'reward-heal');
          }
        }

        if (spellTargetState && phase === 'playing') {
          div.classList.add('selectable');
        }

        div.addEventListener('click', () => handleCellClick(r, c));
        boardEl.appendChild(div);
      }
    }
  }

  function renderRack() {
    const rackEl = $('#rack');
    rackEl.innerHTML = '';
    const tokens = Inventory.getTokens();
    const reserved = reservedTokenIds();
    for (const t of tokens) {
      const div = document.createElement('div');
      div.className = 'tile';
      div.textContent = t.letter;
      if (reserved.has(t.id)) div.classList.add('reserved');
      div.addEventListener('mousedown', (e) => handleTileMouseDown(e, t.id, t.letter));
      rackEl.appendChild(div);
    }
  }

  // Each spell is its own row: its name spelled out as drag-and-drop slots
  // (per feedback), a "Min: N" threshold, and a Cast button. Drop a matching
  // rack letter onto an empty slot to fill it; a slot refuses any letter it
  // doesn't need (or needs no more of).
  function renderSpellPanel() {
    const panel = $('#spell-panel');
    panel.innerHTML = '';
    const s = Run.getState();
    if (!s) return;
    const phase = TurnManager.getPhase();

    for (const def of Spells.DEFS) {
      const row = document.createElement('div');
      row.className = 'spell-row';
      const unlocked = s.unlockedSpells.has(def.id);

      const emoji = document.createElement('span');
      emoji.className = 'spell-row-emoji';
      emoji.textContent = def.emoji;
      row.appendChild(emoji);

      if (!unlocked) {
        row.classList.add('locked');
        const text = document.createElement('span');
        text.className = 'spell-row-locked-text';
        text.textContent = `${def.word} — szintlépéskor oldható fel`;
        row.appendChild(text);
        panel.appendChild(row);
        continue;
      }

      const used = s.spellUsedThisTurn[def.id];
      const castable = Spells.isCastable(s, def.id);
      if (castable && !used) row.classList.add('castable');
      if (used) row.classList.add('used-this-turn');
      if (spellTargetState && spellTargetState.spellId === def.id) row.classList.add('active-target');
      row.title = def.desc;

      const slotsWrap = document.createElement('div');
      slotsWrap.className = 'spell-row-slots';
      Spells.slotStates(s, def.id).forEach((slot, idx) => {
        const slotEl = document.createElement('div');
        slotEl.className = 'spell-slot' + (slot.filled ? ' filled' : '');
        slotEl.textContent = slot.letter;
        slotEl.dataset.spellId = def.id;
        slotEl.dataset.slotIndex = idx;
        slotsWrap.appendChild(slotEl);
      });
      row.appendChild(slotsWrap);

      const minLabel = document.createElement('span');
      minLabel.className = 'spell-row-min';
      minLabel.textContent = `Min: ${def.minCast}`;
      row.appendChild(minLabel);

      const castBtn = document.createElement('button');
      castBtn.className = 'btn btn-cast';
      castBtn.textContent = 'Cast';
      castBtn.disabled = phase !== 'playing' || !castable || used;
      castBtn.addEventListener('click', () => handleCastClick(def.id));
      row.appendChild(castBtn);

      panel.appendChild(row);
    }
  }

  function renderActionButtons() {
    const phase = TurnManager.getPhase();
    const s = Run.getState();
    $('#btn-end-turn').disabled = phase !== 'playing' || pendingDrops.length > 0 || !!spellTargetState;
    $('#btn-trash').classList.toggle('hidden', phase !== 'playing');
    $('#btn-trash').disabled = Inventory.getTokens().length === 0 || (s && s.hp <= 2);
  }

  function renderPlacementControls() {
    const panel = $('#placement-controls');
    if (pendingDrops.length === 0) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const hint = $('#placement-hint');
    const confirmable = getConfirmableCandidates();
    const allCandidates = getCandidates();

    if (confirmable.length > 0) {
      hint.textContent = 'Érvényes szó! Erősítsd meg, húzz még betűt, vagy vonj vissza egyet a táblán rákattintva.';
    } else if (allCandidates.length > 0) {
      hint.textContent = `"${allCandidates[0].word}" nem szerepel a szótárban - húzz még betűt, vagy vond vissza.`;
    } else {
      hint.textContent = 'Még nincs kész szó - húzz melléjük egy betűt, vagy egy szörny mellé/fölé, hogy összekösd velük.';
    }

    const container = $('#confirm-options');
    container.innerHTML = '';
    confirmable.forEach(cand => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = confirmable.length > 1
        ? `Megerősítés (${cand.dir === 'H' ? 'vízszintes' : 'függőleges'}): ${cand.word}`
        : `Megerősítés: ${cand.word}`;
      btn.addEventListener('click', () => confirmWord(cand));
      container.appendChild(btn);
    });
  }

  function renderLetterPicker(forSpellId) {
    const panel = $('#letter-picker');
    if (!forSpellId) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = '';
    const hint = document.createElement('div');
    hint.style.width = '100%';
    hint.style.fontSize = '12px';
    hint.style.color = 'var(--text-dim)';
    hint.textContent = 'Válaszd ki a kért betűt:';
    panel.appendChild(hint);
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const btn = document.createElement('button');
      btn.className = 'letter-pick-btn';
      btn.textContent = letter;
      btn.addEventListener('click', () => {
        const res = TurnManager.castSpell(forSpellId, { letter });
        handleSpellResult(res);
      });
      panel.appendChild(btn);
    }
  }

  // ---------- DRAG AND DROP ----------

  function showGhost(x, y, letter) {
    const ghost = $('#drag-ghost');
    ghost.textContent = letter;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    ghost.classList.remove('hidden');
  }

  function moveGhost(x, y) {
    const ghost = $('#drag-ghost');
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  }

  function hideGhost() {
    $('#drag-ghost').classList.add('hidden');
  }

  // Finds whichever drop target (a board cell or a spell slot) sits under
  // the given viewport point.
  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cellEl = el.closest('.cell');
    if (cellEl) return { type: 'cell', el: cellEl, r: +cellEl.dataset.r, c: +cellEl.dataset.c };
    const slotEl = el.closest('.spell-slot');
    if (slotEl) {
      return {
        type: 'slot', el: slotEl, spellId: slotEl.dataset.spellId,
        letter: slotEl.textContent, filled: slotEl.classList.contains('filled')
      };
    }
    return null;
  }

  function clearDropHighlights() {
    document.querySelectorAll('.cell.drop-target, .cell.drop-invalid').forEach(el => {
      el.classList.remove('drop-target', 'drop-invalid');
    });
    document.querySelectorAll('.spell-slot.slot-drop-target, .spell-slot.slot-drop-invalid').forEach(el => {
      el.classList.remove('slot-drop-target', 'slot-drop-invalid');
    });
  }

  function handleTileMouseDown(e, tokenId, letter) {
    if (e.button !== 0) return;
    const phase = TurnManager.getPhase();
    if (phase !== 'playing' || spellTargetState) return;
    if (reservedTokenIds().has(tokenId)) return;
    e.preventDefault();

    dragData = { tokenId, letter };
    showGhost(e.clientX, e.clientY, letter);

    const onMove = (ev) => {
      moveGhost(ev.clientX, ev.clientY);
      clearDropHighlights();
      const target = dropTargetAt(ev.clientX, ev.clientY);
      if (!target) return;
      if (target.type === 'cell') {
        target.el.classList.add(wouldAcceptDrop(target.r, target.c) ? 'drop-target' : 'drop-invalid');
      } else if (target.type === 'slot') {
        const ok = !target.filled && target.letter === letter;
        target.el.classList.add(ok ? 'slot-drop-target' : 'slot-drop-invalid');
      }
    };
    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      hideGhost();
      clearDropHighlights();
      const target = dropTargetAt(ev.clientX, ev.clientY);
      if (target && target.type === 'cell') {
        tryDrop(target.r, target.c);
      } else if (target && target.type === 'slot') {
        trySpellSlotDrop(target.spellId);
      }
      dragData = null;
      renderAll();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function tryDrop(r, c) {
    if (!dragData) return;
    if (!wouldAcceptDrop(r, c)) {
      log('Ide nem helyezhető el betű.', 'danger');
      return;
    }
    pendingDrops.push({ r, c, letter: dragData.letter, tokenId: dragData.tokenId });
  }

  function trySpellSlotDrop(spellId) {
    if (!dragData) return;
    const res = TurnManager.feedSpellLetter(spellId, dragData.tokenId);
    if (!res.ok) {
      if (res.reason === 'wrong-letter') {
        log(`A(z) ${Spells.getDef(spellId).word} varázslatba nem kell (több) "${res.letter}" betű.`, 'danger');
      } else {
        log(`Nem sikerült feltölteni: ${res.reason}`, 'danger');
      }
      return;
    }
    if (res.castable) {
      log(`${Spells.getDef(spellId).name} castolható! Nyomd meg a Cast gombot.`, 'good');
    }
  }

  // ---------- EVENT HANDLERS ----------

  function handleCellClick(r, c) {
    const phase = TurnManager.getPhase();
    if (phase !== 'playing') return;

    if (spellTargetState) {
      handleSpellTargetClick(r, c);
      return;
    }

    const pending = pendingDropAt(r, c);
    if (pending) {
      pendingDrops = pendingDrops.filter(p => p !== pending);
      renderAll();
    }
  }

  function confirmWord(candidate) {
    const res = TurnManager.submitWord(candidate.cells);
    if (!res.ok) {
      log(`Nem sikerült lerakni: ${res.reason}`, 'danger');
      return;
    }
    describeWordResult(res);
    pendingDrops = [];
    processTurnOutcome(res.turnOutcome);
  }

  function handleSpellTargetClick(r, c) {
    const def = Spells.getDef(spellTargetState.spellId);
    if (def.target === 'monster-then-cell') {
      if (spellTargetState.stage === 'monster') {
        const m = Board.getLivingMonsterAt(r, c);
        if (!m) { log('Válassz egy élő ellenfelet.', 'danger'); return; }
        spellTargetState.monsterId = m.id;
        spellTargetState.stage = 'cell';
        log('Most válassz egy üres mezőt, ahova a Blink áthelyezi.');
        renderBoard();
        return;
      }
      if (!Board.cellIsEmpty(r, c)) { log('Üres mezőt válassz.', 'danger'); return; }
      const res = TurnManager.castSpell('blink', { monsterId: spellTargetState.monsterId, r, c });
      handleSpellResult(res);
      return;
    }
    if (def.target === 'cell') {
      const res = TurnManager.castSpell(def.id, { r, c });
      handleSpellResult(res);
      return;
    }
    if (def.target === 'placedWord') {
      if (Board.getCellLetter(r, c) == null || Board.getLivingMonsterAt(r, c)) {
        log('Válassz egy lerakott betűt tartalmazó mezőt (élő szörny nem lehet).', 'danger');
        return;
      }
      const res = TurnManager.castSpell(def.id, { r, c });
      handleSpellResult(res);
      return;
    }
  }

  function handleCastClick(id) {
    const phase = TurnManager.getPhase();
    if (phase !== 'playing') return;
    const s = Run.getState();
    if (!s.unlockedSpells.has(id)) return;
    if (s.spellUsedThisTurn[id]) { log('Ezt a varázslatot már használtad ebben a körben.', 'danger'); return; }
    if (!Spells.isCastable(s, id)) { log('Még nincs elég betű a varázslatban.', 'danger'); return; }

    pendingDrops = [];
    const def = Spells.getDef(id);
    switch (def.target) {
      case 'none': {
        const res = TurnManager.castSpell(id, {});
        handleSpellResult(res);
        break;
      }
      case 'letter':
        spellTargetState = null;
        renderLetterPicker(id);
        break;
      case 'cell':
      case 'placedWord':
        spellTargetState = { spellId: id, stage: 'cell' };
        log(def.target === 'placedWord' ? 'Válassz egy lerakott betűt a tábláról.' : 'Válassz egy mezőt a tábláról.');
        renderAll();
        break;
      case 'monster-then-cell':
        spellTargetState = { spellId: id, stage: 'monster' };
        log('Válassz egy ellenfelet, akit áthelyezel.');
        renderAll();
        break;
    }
  }

  function handleSpellResult(res) {
    if (!res.ok) {
      if (res.reason === 'invalid-word') {
        log(`Blink: "${res.words.join('", "')}" nem érvényes szó, nem teheted oda. Válassz másik mezőt.`, 'danger');
      } else {
        log(`Nem sikerült a varázslat (${res.reason}).`, 'danger');
      }
      spellTargetState = null;
      renderAll();
      return;
    }
    describeSpellEffect(res);
    spellTargetState = null;
    renderLetterPicker(null);
    processTurnOutcome(res.turnOutcome);
  }

  function describeSpellEffect(res) {
    const e = res.effect;
    if (e.healed !== undefined) log(`Gyógyítás: +${e.healed} HP.`, 'good');
    if (e.shield !== undefined) log(`Ward aktiválva: a következő ellenségtámadásból ${e.shield} sebzést elnyel.`, 'good');
    if (e.letter) log(`Betűidézés: a legközelebbi feltöltéskor ${e.letter} betűt kapsz.`, 'good');
    if (e.to && e.words) {
      log(`Blink: az ellenfél áthelyezve, és "${e.words.join('", "')}" szót alkotott!`, 'good');
      for (const m of e.hit) {
        const died = !m.alive;
        log(`${m.emoji} ${m.name} (${m.letter}) ${died ? 'elpusztult!' : 'megsebződött.'}`, died ? 'good' : null);
      }
    } else if (e.to) {
      log('Blink: az ellenfél áthelyezve egy új mezőre.', 'good');
    }
    if (e.cleared) log('Cleanse: a kijelölt betű eltávolítva a tábláról.', 'good');
    if (e.hit && !e.to) {
      log(`Fire: ${e.hit.length} ellenfél megsebződött a 3x3-as területen.`, 'good');
      for (const m of e.killed) log(`${m.name} (${m.letter}) elpusztult! +${m.xp} XP`, 'good');
    }
  }

  // ---------- ACTION BUTTON WIRING ----------

  function wireButtons() {
    $('#btn-start').addEventListener('click', () => startNewRun());
    $('#btn-restart').addEventListener('click', () => startNewRun());
    $('#btn-victory-restart').addEventListener('click', () => startNewRun());

    $('#chk-god-mode').addEventListener('change', (e) => {
      TurnManager.setGodMode(e.target.checked);
      log(e.target.checked ? 'TESZT: Végtelen HP bekapcsolva.' : 'TESZT: Végtelen HP kikapcsolva.', 'important');
      renderAll();
    });

    $('#btn-trash').addEventListener('click', () => {
      const res = TurnManager.trashAll();
      if (!res.ok) {
        if (res.reason !== 'empty') log(`Nem sikerült: ${res.reason}`, 'danger');
        return;
      }
      log(`Trash: eldobtad mind a(z) ${res.discarded} betűdet, -${res.cost} HP.`, 'danger');
      if (res.gameOver) {
        showGameOver();
        return;
      }
      renderAll();
    });

    $('#btn-cancel-placement').addEventListener('click', () => {
      pendingDrops = [];
      renderAll();
    });

    $('#btn-end-turn').addEventListener('click', () => {
      const res = TurnManager.endTurn();
      if (!res.ok) return;
      const a = res.enemyAttack;
      if (a.attackers > 0) {
        log(`Ellenségtámadás: ${a.attackers} ellenfél, ${a.finalDamage} sebzés` + (a.absorbed > 0 ? ` (${a.absorbed} elnyelve)` : '') + '.', 'danger');
      } else {
        log('Nincs élő ellenfél, nincs ellenségtámadás.');
      }
      if (res.gameOver) {
        showGameOver();
        return;
      }
      log('Új kör — a kezed feltöltődött.');
      renderAll();
    });

    $('#btn-buy-capacity').addEventListener('click', () => {
      const ok = Run.buyCapacityUpgrade();
      if (ok) log('Inventory kapacitás növelve!', 'good');
      else log('Nincs elég arany, vagy már elérted a maximumot.', 'danger');
      renderTrader();
    });

    $('#btn-continue').addEventListener('click', () => {
      const more = TurnManager.continueFromTrader();
      hideModal('#screen-trader');
      clearLog();
      if (more) {
        log(Run.isBossRoom() ? 'A főellenfél szobájába léptél!' : `${Run.getState().roomNumber}. szoba.`, 'important');
      }
      renderAll();
    });
  }

  function describeWordResult(res) {
    log(`Kiraktad: "${res.word}" (${res.newLetterCount} új betűvel)`, 'important');
    for (const m of res.hit) {
      const died = !m.alive;
      log(`${m.emoji} ${m.name} (${m.letter}) ${died ? 'elpusztult!' : `sebződött (${m.hp}/${m.maxHp} HP maradt)`}`, died ? 'good' : null);
    }
    const applied = res.turnOutcome && res.turnOutcome.rewardsApplied;
    if (applied && (applied.xpGained > 0 || applied.goldGained > 0)) {
      const bonusNote = applied.bonusXp > 0 ? ` (ebből +${applied.bonusXp} XP a szó hosszáért)` : '';
      log(`+${applied.xpGained} XP, +${applied.goldGained} arany.${bonusNote}`, 'good');
    }
    if (res.rewards.length > 0) {
      for (const r of res.rewards) {
        log(r.kind === 'gold' ? 'Aranymező aktiválva: +5 arany!' : 'Gyógyítómező aktiválva: +3 HP!', 'good');
      }
    }
    if (res.trapDamage > 0) {
      log(`Csapdába léptél! -${res.trapDamage} HP.`, 'danger');
    }
    log('Az új betűid a táblán maradnak.');
  }

  function processTurnOutcome(outcome) {
    if (!outcome) { renderAll(); return; }
    if (outcome.gameOver) {
      showGameOver();
      return;
    }
    if (outcome.levelUps && outcome.levelUps.length > 0) {
      pendingLevelUps = outcome.levelUps.length;
      showNextLevelUp();
      return;
    }
    if (outcome.cleared) {
      if (outcome.victory) showVictory();
      else showTrader();
      return;
    }
    renderAll();
  }

  // ---------- LEVEL UP / TRADER / GAME OVER / VICTORY ----------

  function showNextLevelUp() {
    if (pendingLevelUps <= 0) {
      afterLevelUpsResolved();
      return;
    }
    currentPerkOptions = Run.buildPerkOptions();
    const container = $('#levelup-options');
    container.innerHTML = '';
    currentPerkOptions.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        TurnManager.confirmLevelUp(idx, currentPerkOptions);
        pendingLevelUps--;
        showNextLevelUp();
      });
      container.appendChild(btn);
    });
    showModal('#screen-levelup');
  }

  function afterLevelUpsResolved() {
    hideModal('#screen-levelup');
    if (Board.roomCleared()) {
      if (Run.isBossRoom()) showVictory();
      else showTrader();
    } else {
      renderAll();
    }
  }

  function showTrader() {
    renderTrader();
    showModal('#screen-trader');
  }

  function renderTrader() {
    const s = Run.getState();
    $('#trader-gold').textContent = s.gold;
    $('#trader-capacity').textContent = Inventory.getCapacity();
    const cost = Inventory.nextUpgradeCost();
    const btn = $('#btn-buy-capacity');
    if (cost === null) {
      btn.textContent = 'Maximális kapacitás elérve';
      btn.disabled = true;
    } else {
      btn.textContent = `Kapacitás +1 (${cost} arany)`;
      btn.disabled = s.gold < cost;
    }
  }

  function showGameOver() {
    const s = Run.getState();
    $('#gameover-stats').textContent = `Elért szint: ${s.level} · Megtisztított szobák: ${s.roomsCleared} · Arany: ${s.gold}`;
    showModal('#screen-gameover');
  }

  function showVictory() {
    const s = Run.getState();
    $('#victory-stats').textContent = `Legyőzted a főellenfelet! Szint: ${s.level} · Arany: ${s.gold}`;
    showModal('#screen-victory');
  }

  function showModal(sel) { $(sel).classList.remove('hidden'); }
  function hideModal(sel) { $(sel).classList.add('hidden'); }

  function startNewRun() {
    hideModal('#screen-gameover');
    hideModal('#screen-victory');
    hideModal('#screen-trader');
    hideModal('#screen-levelup');
    $('#screen-start').classList.add('hidden');
    $('#screen-game').classList.remove('hidden');
    pendingDrops = [];
    dragData = null;
    spellTargetState = null;
    clearLog();
    TurnManager.startRun();
    log('Új futam indult! Jó szerencsét a kazamatában.', 'important');
    renderAll();
  }

  function init() {
    Dictionary.init();
    wireButtons();
  }

  return { init, renderAll, log };
})();
