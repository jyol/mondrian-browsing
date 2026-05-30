'use strict';

/**
 * Mondrian Browsing — click sprint game engine
 * Overlays Mondrian blocks on leaf DOM elements (innermost boxes only) without
 * shifting page layout.
 */

(function MondrianBrowsing() {
  const INTERACTIVE_SELECTOR =
    'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
  const NON_RENDERED_TAGS = new Set([
    'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'TITLE'
  ]);
  const MIN_CELL_PX = 8;
  const MAX_VIEWPORT_COVERAGE = 0.72;
  const START_TIME = 60;
  const WARNING_TIME_THRESHOLD = 20;
  const HUD_POSITION_KEY = 'sweeperHudPosition';
  const LEADERBOARD_LIMIT = 10;

  const UNPAINTED_CANVAS = '#FFFFFF';
  const UNPAINTED_HOVER = '#F0F0F0';

  const ART_PALETTES = [
    {
      id: 'mondrian',
      name: 'Mondrian',
      border: '#16161D',
      paintBands: [
        { colors: ['#E31B23', '#B81D18'], copies: 12 },
        { colors: ['#1951A0', '#0F448A'], copies: 12 },
        { colors: ['#FAD201', '#F0C22B'], copies: 12 },
        { colors: ['#16161D', '#708CA2', '#D3C2A3'], copies: 7 }
      ]
    },
    {
      id: 'starry-night',
      name: 'The Starry Night',
      border: '#0A1528',
      paintBands: [
        { colors: ['#0F2042', '#1F3A60', '#5B84B1'], copies: 14 },
        { colors: ['#FCE762'], copies: 11 }
      ]
    },
    {
      id: 'water-lilies',
      name: 'Water Lilies',
      border: '#607D8B',
      paintBands: [
        { colors: ['#607D8B', '#708090'], copies: 12 },
        { colors: ['#B0C4DE'], copies: 10 },
        { colors: ['#D8BFD8', '#FFB6C1'], copies: 14 }
      ]
    },
    {
      id: 'great-wave',
      name: 'The Great Wave',
      border: '#0A1D37',
      paintBands: [
        { colors: ['#0A1D37', '#28527A'], copies: 14 },
        { colors: ['#8D8DAA'], copies: 8 },
        { colors: ['#F19066'], copies: 10 }
      ]
    },
    {
      id: 'hatsune-miku',
      name: 'Hatsune Miku',
      border: '#1A1C23',
      paintBands: [
        { colors: ['#39C5BB'], copies: 14 },
        { colors: ['#FF1493', '#FF69B4'], copies: 11 },
        { colors: ['#7F8C8D'], copies: 8 },
        { colors: ['#1A1C23'], copies: 4 }
      ]
    }
  ];

  let activePalette = ART_PALETTES[0];
  let paintColorPool = null;

  const STATUS = {
    playing: 'PAINT THE PAGE!',
    hurry: 'HURRY UP!',
    win: 'PAINTING COMPLETE!',
    lost: 'TIME\'S UP!'
  };

  let gameActive = false;
  let gameOver = false;
  /** @type {{ target: Element, overlay: HTMLElement }[]} */
  let cells = [];
  let timeLeft = START_TIME;
  let clickedCount = 0;
  let timerId = null;
  let finalScore = null;

  let overlayCanvas = null;
  let positionSyncScheduled = false;

  let hudEl = null;
  let timeValueEl = null;
  let scoreValueEl = null;
  let statusEl = null;
  let leaderboardListEl = null;
  let resultOverlayEl = null;
  let startPopupEl = null;
  let startPopupTimeoutId = null;
  let hudDragHandle = null;

  const START_POPUP_TEXT = 'Start painting!';
  const START_POPUP_DURATION_MS = 2000;

  let hudDrag = {
    active: false,
    startX: 0,
    startY: 0,
    origLeft: 0,
    origTop: 0
  };

  const RESULT_WIN_TITLE = 'Mondrian completed.';
  const RESULT_LOSE_TITLE =
    'A painting too ambitious to complete...';

  const MONDRIAN_COLORS = {
    white: '#F4F4F0',
    black: '#16161D',
    red: '#E31B23',
    blue: '#1951A0',
    yellow: '#FAD201'
  };

  const WATERMARK_FONT = '11px "Comic Sans MS", "Comic Sans", cursive';

  let gameFinishedAt = null;
  let paintWatermarkEl = null;

  const savedNativeHandlers = new WeakMap();

  const boundHandlers = {
    cellPointerDown: onCellPointerDown,
    blockNavigation: blockNavigation,
    blockLinkActivation: blockLinkActivation,
    blockKeyboardNav: blockKeyboardNav,
    syncOverlayPositions: scheduleOverlaySync
  };

  function suppressPageEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  /* ------------------------------------------------------------------ */
  /* Toggle entry point                                                  */
  /* ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'SWEEPER_TOGGLE') {
      if (gameActive) {
        stopGame();
      } else {
        startGame();
      }
      sendResponse({ active: gameActive });
    }
    return true;
  });

  /* ------------------------------------------------------------------ */
  /* Game lifecycle                                                      */
  /* ------------------------------------------------------------------ */

  function startGame() {
    if (gameActive) {
      return;
    }

    const targets = collectLeafBlocks();

    if (targets.length === 0) {
      return;
    }

    gameActive = true;
    gameOver = false;
    finalScore = null;
    timeLeft = START_TIME;
    clickedCount = 0;

    document.documentElement.setAttribute('data-sweeper-active', 'true');
    document.documentElement.removeAttribute('data-sweeper-gameover');
    document.documentElement.removeAttribute('data-sweeper-win');

    applyActivePalette(pickRandomPalette());
    cells = buildOverlayLayer(targets);
    neutralizeNativeCellHandlers(cells);
    createHud();
    attachGlobalBlockers();
    attachPositionSync();
    scheduleOverlaySync();
    updateHud();
    loadLeaderboardIntoHud();
    showStartPopup(() => {
      attachCellListeners(cells);
      startTimer();
    });
  }

  function stopGame() {
    if (!gameActive) {
      return;
    }

    gameActive = false;
    gameOver = false;
    finalScore = null;
    stopTimer();

    detachCellListeners(cells);
    detachPositionSync();
    detachGlobalBlockers();
    removeHud();
    removeStartPopup();
    removeResultOverlay();
    removePaintWatermark();
    restoreNativeCellHandlers(cells);
    cleanupCells(cells);

    cells = [];
    clickedCount = 0;
    timeLeft = START_TIME;
    gameFinishedAt = null;

    document.documentElement.removeAttribute('data-sweeper-active');
    document.documentElement.removeAttribute('data-sweeper-gameover');
    document.documentElement.removeAttribute('data-sweeper-win');
    clearActivePalette();
  }

  function endGame(reason) {
    if (gameOver) {
      return;
    }

    gameOver = true;
    gameFinishedAt = new Date();
    stopTimer();
    document.documentElement.setAttribute('data-sweeper-gameover', 'true');

    if (reason === 'win') {
      finalScore = clickedCount;
      document.documentElement.setAttribute('data-sweeper-win', 'true');
      setStatus('win', String(clickedCount) + ' / ' + String(cells.length));
    } else {
      finalScore = clickedCount;
      document.documentElement.removeAttribute('data-sweeper-win');
      setStatus('lost');
    }

    updateHud();
    saveRunToLeaderboard((rank) => {
      showResultOverlay(reason, rank);
      showPaintWatermark();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Board setup                                                         */
  /* ------------------------------------------------------------------ */

  function isGameUiElement(el) {
    return (
      el.id === 'sweeper-hud' ||
      el.id === 'sweeper-result' ||
      el.id === 'sweeper-start' ||
      el.id === 'sweeper-canvas' ||
      !!el.closest('#sweeper-hud') ||
      !!el.closest('#sweeper-result') ||
      !!el.closest('#sweeper-start') ||
      !!el.closest('#sweeper-canvas')
    );
  }

  function isVisibleCell(el) {
    if (el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    if (Number(style.opacity) === 0) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_CELL_PX || rect.height < MIN_CELL_PX) {
      return false;
    }

    return true;
  }

  function getElementArea(el) {
    const rect = el.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function isOversizedBlock(el) {
    if (el === document.documentElement || el === document.body) {
      return true;
    }

    const rect = el.getBoundingClientRect();
    const viewportArea = window.innerWidth * window.innerHeight;

    if (viewportArea <= 0) {
      return false;
    }

    return rect.width * rect.height > viewportArea * MAX_VIEWPORT_COVERAGE;
  }

  /**
   * Leaf blocks only — the innermost visible elements, with no child blocks
   * nested inside. Skips giant page wrappers so one block cannot cover all.
   */
  function collectLeafBlocks() {
    const candidates = Array.from(document.querySelectorAll('*')).filter((el) => {
      if (NON_RENDERED_TAGS.has(el.tagName)) {
        return false;
      }

      if (isGameUiElement(el)) {
        return false;
      }

      if (isOversizedBlock(el)) {
        return false;
      }

      return isVisibleCell(el);
    });

    const leaves = candidates.filter((el) => {
      return !candidates.some((other) => other !== el && el.contains(other));
    });

    return leaves.sort((a, b) => getElementArea(a) - getElementArea(b));
  }

  /* ------------------------------------------------------------------ */
  /* Art palettes                                                        */
  /* ------------------------------------------------------------------ */

  function pickRandomPalette() {
    return ART_PALETTES[Math.floor(Math.random() * ART_PALETTES.length)];
  }

  function parseHexColor(hex) {
    const normalized = hex.replace('#', '');

    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  function isWhiteLikePaintColor(hex) {
    const { r, g, b } = parseHexColor(hex);
    const minChannel = Math.min(r, g, b);
    const maxChannel = Math.max(r, g, b);

    return minChannel >= 232 && (maxChannel - minChannel) <= 24;
  }

  function applyActivePalette(palette) {
    activePalette = palette;
    paintColorPool = null;

    const root = document.documentElement;
    root.style.setProperty('--game-canvas', UNPAINTED_CANVAS);
    root.style.setProperty('--game-canvas-hover', UNPAINTED_HOVER);
    root.style.setProperty('--game-border', palette.border);
    root.setAttribute('data-sweeper-palette', palette.id);
  }

  function clearActivePalette() {
    activePalette = ART_PALETTES[0];
    paintColorPool = null;

    const root = document.documentElement;
    root.style.removeProperty('--game-canvas');
    root.style.removeProperty('--game-canvas-hover');
    root.style.removeProperty('--game-border');
    root.removeAttribute('data-sweeper-palette');
  }

  function getPaintColorPool() {
    if (paintColorPool) {
      return paintColorPool;
    }

    paintColorPool = [];

    activePalette.paintBands.forEach((band) => {
      band.colors.forEach((color) => {
        if (isWhiteLikePaintColor(color)) {
          return;
        }

        for (let i = 0; i < band.copies; i += 1) {
          paintColorPool.push(color);
        }
      });
    });

    if (paintColorPool.length === 0) {
      paintColorPool.push(activePalette.border);
    }

    return paintColorPool;
  }

  function pickPaintColor(index, target) {
    const pool = getPaintColorPool();
    const rect = target.getBoundingClientRect();
    const seed =
      Math.imul(index + 1, 2654435761) ^
      Math.imul(Math.round(rect.left * 13 + rect.top * 17 + rect.width), 2246822519);

    return pool[(seed >>> 0) % pool.length];
  }

  function applyPaintColor(overlay, color) {
    overlay.style.setProperty('background-color', color, 'important');
  }

  function buildOverlayLayer(targetList) {
    removeOverlayCanvas();

    overlayCanvas = document.createElement('div');
    overlayCanvas.id = 'sweeper-canvas';
    document.documentElement.appendChild(overlayCanvas);

    const fragment = document.createDocumentFragment();
    const entries = [];
    const layerCount = targetList.length;

    targetList.forEach((target, index) => {
      target.dataset.sweeperTarget = 'true';

      const overlay = document.createElement('div');
      overlay.className = 'sweeper-overlay';
      overlay.dataset.sweeperCell = 'true';
      overlay.dataset.clicked = 'false';
      overlay.dataset.paintColor = pickPaintColor(index, target);
      /* Smaller blocks sit above larger ones when boxes overlap */
      overlay.style.zIndex = String(layerCount - index);

      syncOverlayPosition(target, overlay);
      fragment.appendChild(overlay);

      entries.push({ target: target, overlay: overlay });
    });

    overlayCanvas.appendChild(fragment);

    return entries;
  }

  function syncOverlayPosition(target, overlay) {
    const rect = target.getBoundingClientRect();

    if (rect.width < MIN_CELL_PX || rect.height < MIN_CELL_PX) {
      overlay.style.visibility = 'hidden';
      overlay.style.pointerEvents = 'none';
      return;
    }

    overlay.style.visibility = 'visible';
    overlay.style.pointerEvents = 'auto';
    overlay.style.width = Math.round(rect.width) + 'px';
    overlay.style.height = Math.round(rect.height) + 'px';
    overlay.style.transform =
      'translate(' + Math.round(rect.left) + 'px, ' + Math.round(rect.top) + 'px)';
  }

  function scheduleOverlaySync() {
    if (positionSyncScheduled || !gameActive) {
      return;
    }

    positionSyncScheduled = true;

    requestAnimationFrame(() => {
      positionSyncScheduled = false;

      if (!gameActive) {
        return;
      }

      cells.forEach((entry) => {
        syncOverlayPosition(entry.target, entry.overlay);
      });
    });
  }

  function attachPositionSync() {
    window.addEventListener('scroll', boundHandlers.syncOverlayPositions, true);
    window.addEventListener('resize', boundHandlers.syncOverlayPositions, false);
  }

  function detachPositionSync() {
    window.removeEventListener('scroll', boundHandlers.syncOverlayPositions, true);
    window.removeEventListener('resize', boundHandlers.syncOverlayPositions, false);
  }

  function removeOverlayCanvas() {
    if (overlayCanvas && overlayCanvas.parentNode) {
      overlayCanvas.parentNode.removeChild(overlayCanvas);
    }
    overlayCanvas = null;
  }

  function neutralizeNativeCellHandlers(cellEntries) {
    cellEntries.forEach((entry) => {
      const cell = entry.target;
      const saved = {};

      if (cell.onclick) {
        saved.onclick = cell.onclick;
        cell.onclick = null;
      }

      if (cell.hasAttribute('onclick')) {
        saved.onclickAttr = cell.getAttribute('onclick');
        cell.removeAttribute('onclick');
      }

      if (cell.hasAttribute('href')) {
        saved.href = cell.getAttribute('href');
        cell.removeAttribute('href');
      }

      savedNativeHandlers.set(cell, saved);
    });
  }

  function restoreNativeCellHandlers(cellEntries) {
    cellEntries.forEach((entry) => {
      const cell = entry.target;
      const saved = savedNativeHandlers.get(cell);
      if (!saved) {
        return;
      }

      if ('onclick' in saved) {
        cell.onclick = saved.onclick;
      }

      if ('onclickAttr' in saved) {
        cell.setAttribute('onclick', saved.onclickAttr);
      }

      if ('href' in saved) {
        cell.setAttribute('href', saved.href);
      }

      savedNativeHandlers.delete(cell);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Click logic                                                         */
  /* ------------------------------------------------------------------ */

  function clickCell(overlay) {
    if (overlay.dataset.clicked === 'true') {
      return;
    }

    const paintColor = overlay.dataset.paintColor || getPaintColorPool()[0];

    overlay.dataset.clicked = 'true';
    overlay.classList.add('sweeper-painted');
    applyPaintColor(overlay, paintColor);

    clickedCount += 1;
    updateHud();

    if (clickedCount === cells.length) {
      endGame('win');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Input handlers                                                      */
  /* ------------------------------------------------------------------ */

  function onCellPointerDown(event) {
    if (!gameActive || gameOver || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    clickCell(event.currentTarget);
  }

  function blockLinkActivation(event) {
    if (!gameActive) {
      return;
    }

    const link = event.target.closest('a[href]');
    if (link) {
      suppressPageEvent(event);
    }
  }

  function blockNavigation(event) {
    if (!gameActive) {
      return;
    }

    const target = event.target;

    if (target.closest('#sweeper-hud') || target.closest('#sweeper-result') ||
        target.closest('#sweeper-start')) {
      return;
    }

    if (target.closest('.sweeper-overlay[data-sweeper-cell="true"]')) {
      return;
    }

    if (target.closest(INTERACTIVE_SELECTOR)) {
      suppressPageEvent(event);
      return;
    }

    suppressPageEvent(event);
  }

  function blockKeyboardNav(event) {
    if (!gameActive) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target;
      const interactive = target.closest(INTERACTIVE_SELECTOR);

      if (interactive && !interactive.classList.contains('sweeper-overlay')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Timer                                                               */
  /* ------------------------------------------------------------------ */

  function startTimer() {
    stopTimer();

    timerId = window.setInterval(() => {
      if (!gameActive || gameOver) {
        stopTimer();
        return;
      }

      timeLeft -= 1;
      updateHud();
      scheduleOverlaySync();

      if (timeLeft <= 0) {
        endGame('timeout');
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Leaderboard                                                         */
  /* ------------------------------------------------------------------ */

  function getPageLabel() {
    const title = document.title.trim();
    if (title) {
      return title.length > 48 ? title.slice(0, 45) + '...' : title;
    }
    return window.location.hostname || 'Unknown page';
  }

  function sendBackgroundMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message || 'Extension message failed'
          });
          return;
        }

        resolve(response || { ok: false, error: 'No response from extension' });
      });
    });
  }

  async function ensurePlayerName() {
    const existing = await sendBackgroundMessage({ type: 'PLAYER_NAME_GET' });

    if (existing.ok && existing.name) {
      return existing.name;
    }

    const entered = window.prompt('Enter your name for the global leaderboard:');

    if (!entered || !entered.trim()) {
      return 'Anonymous';
    }

    const name = entered.trim().slice(0, 32);
    await sendBackgroundMessage({ type: 'PLAYER_NAME_SET', name: name });
    return name;
  }

  function saveRunToLeaderboard(onSaved) {
    ensurePlayerName().then((playerName) => {
      const entry = {
        player_name: playerName,
        clicked: clickedCount,
        total: cells.length,
        completed: clickedCount === cells.length && cells.length > 0,
        page: getPageLabel(),
        url: window.location.href
      };

      sendBackgroundMessage({ type: 'LEADERBOARD_SAVE', entry: entry }).then((response) => {
        loadLeaderboardIntoHud();

        if (typeof onSaved === 'function') {
          onSaved(response.ok ? response.rank : 0);
        }
      });
    });
  }

  function loadLeaderboardIntoHud() {
    if (!leaderboardListEl) {
      return;
    }

    leaderboardListEl.innerHTML =
      '<li class="sweeper-leaderboard-empty">Loading scores…</li>';

    sendBackgroundMessage({ type: 'LEADERBOARD_LOAD' }).then((response) => {
      if (!leaderboardListEl) {
        return;
      }

      if (!response.ok) {
        const message = response.configured === false
          ? 'Set up Supabase in supabase-config.js'
          : (response.error || 'Leaderboard unavailable');
        leaderboardListEl.innerHTML =
          '<li class="sweeper-leaderboard-empty">' + escapeHtml(message) + '</li>';
        return;
      }

      const list = Array.isArray(response.list) ? response.list : [];

      if (list.length === 0) {
        leaderboardListEl.innerHTML =
          '<li class="sweeper-leaderboard-empty">No scores yet — be the first!</li>';
        return;
      }

      leaderboardListEl.innerHTML = list
        .map((entry, index) => {
          const rank = index + 1;
          const player = escapeHtml(entry.player_name || 'Anonymous');
          const page = escapeHtml(entry.page || 'Unknown page');
          const blocksLabel = formatLeaderboardBlocks(entry);

          return (
            '<li class="sweeper-leaderboard-item">' +
            '<span class="sweeper-leaderboard-rank">#' + String(rank) + '</span>' +
            '<span class="sweeper-leaderboard-blocks">' + blocksLabel + '</span>' +
            '<span class="sweeper-leaderboard-meta">' +
            '<span class="sweeper-leaderboard-player">' + player + '</span>' +
            '<span class="sweeper-leaderboard-page">' + page + '</span>' +
            '</span>' +
            '</li>'
          );
        })
        .join('');
    });
  }

  function formatLeaderboardBlocks(entry) {
    const total = entry.total || 0;
    let clicked = entry.clicked;

    if (clicked == null) {
      clicked = entry.score || 0;
    }

    return escapeHtml(String(clicked) + ' / ' + String(total));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */

  function createHud() {
    removeHud();

    hudEl = document.createElement('div');
    hudEl.id = 'sweeper-hud';
    hudEl.innerHTML =
      '<div class="sweeper-hud-drag-handle" id="sweeper-hud-drag-handle">' +
      '<span class="sweeper-hud-drag-grip" aria-hidden="true">✥</span>' +
      '<span class="sweeper-hud-title-text">Mondrian Browsing</span>' +
      '</div>' +
      '<div class="sweeper-hud-stats">' +
      '<div class="sweeper-hud-stat">' +
      '<span class="sweeper-hud-label">Time</span>' +
      '<span class="sweeper-hud-value" id="sweeper-hud-time">' + String(START_TIME) + 's</span>' +
      '</div>' +
      '<div class="sweeper-hud-stat">' +
      '<span class="sweeper-hud-label">Painted</span>' +
      '<span class="sweeper-hud-value" id="sweeper-hud-score">0 / 0</span>' +
      '</div>' +
      '</div>' +
      '<div class="sweeper-hud-status sweeper-status-playing" id="sweeper-hud-status">' +
      STATUS.playing +
      '</div>' +
      '<div class="sweeper-hud-leaderboard-heading">Global scores</div>' +
      '<div class="sweeper-hud-leaderboard" id="sweeper-hud-leaderboard-panel">' +
      '<ol class="sweeper-leaderboard-list" id="sweeper-leaderboard-list"></ol>' +
      '</div>';

    document.documentElement.appendChild(hudEl);

    timeValueEl = hudEl.querySelector('#sweeper-hud-time');
    scoreValueEl = hudEl.querySelector('#sweeper-hud-score');
    statusEl = hudEl.querySelector('#sweeper-hud-status');
    leaderboardListEl = hudEl.querySelector('#sweeper-leaderboard-list');
    hudDragHandle = hudEl.querySelector('#sweeper-hud-drag-handle');

    setupHudInteractions();
    applySavedHudPosition();
  }

  function setupHudInteractions() {
    if (hudDragHandle) {
      hudDragHandle.addEventListener('pointerdown', onHudDragStart, true);
    }
  }

  function teardownHudInteractions() {
    document.removeEventListener('pointermove', onHudDragMove, true);
    document.removeEventListener('pointerup', onHudDragEnd, true);
    document.removeEventListener('pointercancel', onHudDragEnd, true);

    if (hudDragHandle) {
      hudDragHandle.removeEventListener('pointerdown', onHudDragStart, true);
    }

    hudDragHandle = null;
    hudDrag.active = false;
  }

  function onHudDragStart(event) {
    if (!hudEl || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = hudEl.getBoundingClientRect();

    hudDrag.active = true;
    hudDrag.startX = event.clientX;
    hudDrag.startY = event.clientY;
    hudDrag.origLeft = rect.left;
    hudDrag.origTop = rect.top;

    hudEl.style.right = 'auto';
    hudEl.style.bottom = 'auto';
    hudEl.style.left = Math.round(rect.left) + 'px';
    hudEl.style.top = Math.round(rect.top) + 'px';
    hudEl.classList.add('sweeper-hud-dragging');

    if (hudDragHandle && hudDragHandle.setPointerCapture) {
      hudDragHandle.setPointerCapture(event.pointerId);
    }

    document.addEventListener('pointermove', onHudDragMove, true);
    document.addEventListener('pointerup', onHudDragEnd, true);
    document.addEventListener('pointercancel', onHudDragEnd, true);
  }

  function onHudDragMove(event) {
    if (!hudDrag.active || !hudEl) {
      return;
    }

    event.preventDefault();

    const rect = hudEl.getBoundingClientRect();
    const margin = 8;
    let left = hudDrag.origLeft + (event.clientX - hudDrag.startX);
    let top = hudDrag.origTop + (event.clientY - hudDrag.startY);

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    hudEl.style.left = Math.round(left) + 'px';
    hudEl.style.top = Math.round(top) + 'px';
  }

  function onHudDragEnd(event) {
    if (!hudDrag.active) {
      return;
    }

    hudDrag.active = false;

    if (hudEl) {
      hudEl.classList.remove('sweeper-hud-dragging');
    }

    if (hudDragHandle && hudDragHandle.releasePointerCapture) {
      try {
        hudDragHandle.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* pointer may already be released */
      }
    }

    document.removeEventListener('pointermove', onHudDragMove, true);
    document.removeEventListener('pointerup', onHudDragEnd, true);
    document.removeEventListener('pointercancel', onHudDragEnd, true);
    saveHudPosition();
  }

  function saveHudPosition() {
    if (!hudEl) {
      return;
    }

    const rect = hudEl.getBoundingClientRect();
    chrome.storage.local.set({
      [HUD_POSITION_KEY]: {
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      }
    });
  }

  function applySavedHudPosition() {
    if (!hudEl) {
      return;
    }

    chrome.storage.local.get(HUD_POSITION_KEY, (result) => {
      const pos = result[HUD_POSITION_KEY];

      if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') {
        return;
      }

      hudEl.style.right = 'auto';
      hudEl.style.bottom = 'auto';
      hudEl.style.left = pos.left + 'px';
      hudEl.style.top = pos.top + 'px';
    });
  }

  function removeHud() {
    teardownHudInteractions();

    if (hudEl && hudEl.parentNode) {
      hudEl.parentNode.removeChild(hudEl);
    }

    hudEl = null;
    timeValueEl = null;
    scoreValueEl = null;
    statusEl = null;
    leaderboardListEl = null;
  }

  function getLiveScoreDisplay() {
    return String(clickedCount) + ' / ' + String(cells.length);
  }

  function updateHud() {
    if (!timeValueEl || !scoreValueEl) {
      return;
    }

    timeValueEl.textContent = String(timeLeft) + 's';
    scoreValueEl.textContent = getLiveScoreDisplay();

    if (!gameOver) {
      refreshPlayingStatus();
    }
  }

  function refreshPlayingStatus() {
    if (timeLeft <= WARNING_TIME_THRESHOLD) {
      setStatus('hurry');
    } else {
      setStatus('playing');
    }
  }

  function setStatus(kind, customText) {
    if (!statusEl) {
      return;
    }

    if (kind === 'win' && customText) {
      statusEl.textContent = STATUS.win + ' ' + customText;
    } else {
      statusEl.textContent = STATUS[kind] || customText || kind;
    }

    statusEl.className = 'sweeper-hud-status sweeper-status-' + kind;
  }

  /* ------------------------------------------------------------------ */
  /* Painting export                                                     */
  /* ------------------------------------------------------------------ */

  function formatPaintTimestamp(date) {
    return date.toLocaleString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function formatFilenameTimestamp(date) {
    const pad = (value) => String(value).padStart(2, '0');

    return (
      date.getFullYear() +
      '-' + pad(date.getMonth() + 1) +
      '-' + pad(date.getDate()) +
      '-' + pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  function getWatermarkText(date) {
    const stamp = formatPaintTimestamp(date || gameFinishedAt || new Date());
    const score = String(clickedCount) + '/' + String(cells.length);
    const domain = (window.location.hostname || 'unknown').toUpperCase();

    return (
      'MONDRIAN BROWSING ' + stamp +
      ' • OPUS ' + score +
      ' • ' + domain
    ).toUpperCase();
  }

  function getOverlayFillColor(overlay) {
    if (overlay.classList.contains('sweeper-painted') && overlay.dataset.paintColor) {
      return overlay.dataset.paintColor;
    }

    return UNPAINTED_CANVAS;
  }

  function drawOverlayBlock(ctx, rect, fillColor) {
    const x = rect.left;
    const y = rect.top;
    const width = rect.width;
    const height = rect.height;

    if (width < 1 || height < 1) {
      return;
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = activePalette.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, Math.max(0, width - 3), Math.max(0, height - 3));
  }

  function drawCanvasWatermark(ctx, width, height, date) {
    const text = getWatermarkText(date);
    const marginX = 16;
    const marginY = 14;

    ctx.save();
    ctx.font = WATERMARK_FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.fillText(text, width - marginX, height - marginY);
    ctx.restore();
  }

  function renderCompositionCanvas() {
    cells.forEach((entry) => {
      syncOverlayPosition(entry.target, entry.overlay);
    });

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = UNPAINTED_CANVAS;
    ctx.fillRect(0, 0, width, height);

    const sortedCells = cells.slice().sort((a, b) => {
      return Number(a.overlay.style.zIndex) - Number(b.overlay.style.zIndex);
    });

    sortedCells.forEach((entry) => {
      const overlay = entry.overlay;

      if (overlay.style.visibility === 'hidden') {
        return;
      }

      drawOverlayBlock(ctx, overlay.getBoundingClientRect(), getOverlayFillColor(overlay));
    });

    drawCanvasWatermark(ctx, width, height, gameFinishedAt || new Date());

    return canvas;
  }

  function preloadWatermarkFont() {
    if (document.fonts && document.fonts.load) {
      return document.fonts.load(WATERMARK_FONT);
    }

    return Promise.resolve();
  }

  function downloadCompositionImage() {
    preloadWatermarkFont().then(() => {
      const canvas = renderCompositionCanvas();
      const stamp = gameFinishedAt || new Date();
      const filename = 'mondrian-painting-' + formatFilenameTimestamp(stamp) + '.png';

      canvas.toBlob((blob) => {
        if (!blob) {
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
  }

  function showPaintWatermark() {
    removePaintWatermark();

    if (!gameFinishedAt) {
      return;
    }

    preloadWatermarkFont().then(() => {
      if (!gameFinishedAt) {
        return;
      }

      paintWatermarkEl = document.createElement('div');
      paintWatermarkEl.id = 'sweeper-paint-watermark';
      paintWatermarkEl.textContent = getWatermarkText(gameFinishedAt);
      document.documentElement.appendChild(paintWatermarkEl);
    });
  }

  function removePaintWatermark() {
    if (paintWatermarkEl && paintWatermarkEl.parentNode) {
      paintWatermarkEl.parentNode.removeChild(paintWatermarkEl);
    }

    paintWatermarkEl = null;
  }

  /* ------------------------------------------------------------------ */
  /* Start popup                                                       */
  /* ------------------------------------------------------------------ */

  function showStartPopup(onDismiss) {
    removeStartPopup();

    startPopupEl = document.createElement('div');
    startPopupEl.id = 'sweeper-start';
    startPopupEl.innerHTML =
      '<div class="sweeper-start-card">' +
      '<div class="sweeper-start-title">' + escapeHtml(START_POPUP_TEXT) + '</div>' +
      '</div>';

    document.documentElement.appendChild(startPopupEl);

    let dismissed = false;

    const dismiss = () => {
      if (dismissed) {
        return;
      }

      dismissed = true;
      removeStartPopup();

      if (typeof onDismiss === 'function') {
        onDismiss();
      }
    };

    startPopupEl.addEventListener('click', dismiss);

    requestAnimationFrame(() => {
      if (startPopupEl) {
        startPopupEl.classList.add('sweeper-start-visible');
      }
    });

    startPopupTimeoutId = window.setTimeout(dismiss, START_POPUP_DURATION_MS);
  }

  function removeStartPopup() {
    if (startPopupTimeoutId !== null) {
      window.clearTimeout(startPopupTimeoutId);
      startPopupTimeoutId = null;
    }

    if (startPopupEl && startPopupEl.parentNode) {
      startPopupEl.parentNode.removeChild(startPopupEl);
    }

    startPopupEl = null;
  }

  /* ------------------------------------------------------------------ */
  /* Result overlay (win / lose)                                         */
  /* ------------------------------------------------------------------ */

  function formatResultRank(rank) {
    if (rank > 0) {
      return 'Your rank: #' + String(rank);
    }

    return 'Your rank: unranked';
  }

  function showResultOverlay(reason, rank) {
    removeResultOverlay();

    const isWin = reason === 'win';
    const title = isWin ? RESULT_WIN_TITLE : RESULT_LOSE_TITLE;
    let subtitle = '';

    if (isWin) {
      subtitle = String(cells.length) + ' blocks painted';
    } else {
      subtitle =
        'You painted ' + String(clickedCount) + ' of ' + String(cells.length) + ' blocks';
    }

    resultOverlayEl = document.createElement('div');
    resultOverlayEl.id = 'sweeper-result';
    resultOverlayEl.className = isWin
      ? 'sweeper-result sweeper-result-win'
      : 'sweeper-result sweeper-result-lose';
    resultOverlayEl.innerHTML =
      '<div class="sweeper-result-card">' +
      '<div class="sweeper-result-title">' + escapeHtml(title) + '</div>' +
      '<div class="sweeper-result-subtitle">' + escapeHtml(subtitle) + '</div>' +
      '<div class="sweeper-result-rank">' + escapeHtml(formatResultRank(rank)) + '</div>' +
      '<button type="button" class="sweeper-result-download" id="sweeper-result-download">' +
      'Share your painting' +
      '</button>' +
      '</div>';

    document.documentElement.appendChild(resultOverlayEl);

    const downloadBtn = resultOverlayEl.querySelector('#sweeper-result-download');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        downloadCompositionImage();
      });
    }

    requestAnimationFrame(() => {
      if (resultOverlayEl) {
        resultOverlayEl.classList.add('sweeper-result-visible');
      }
    });
  }

  function removeResultOverlay() {
    if (resultOverlayEl && resultOverlayEl.parentNode) {
      resultOverlayEl.parentNode.removeChild(resultOverlayEl);
    }
    resultOverlayEl = null;
  }

  /* ------------------------------------------------------------------ */
  /* Event listener wiring                                               */
  /* ------------------------------------------------------------------ */

  function attachCellListeners(cellEntries) {
    cellEntries.forEach((entry) => {
      entry.overlay.addEventListener('pointerdown', boundHandlers.cellPointerDown, true);
    });
  }

  function detachCellListeners(cellEntries) {
    cellEntries.forEach((entry) => {
      entry.overlay.removeEventListener('pointerdown', boundHandlers.cellPointerDown, true);
    });
  }

  function attachGlobalBlockers() {
    document.addEventListener('pointerdown', boundHandlers.blockLinkActivation, true);
    document.addEventListener('click', boundHandlers.blockLinkActivation, true);
    document.addEventListener('pointerdown', boundHandlers.blockNavigation, true);
    document.addEventListener('mousedown', boundHandlers.blockNavigation, true);
    document.addEventListener('click', boundHandlers.blockNavigation, true);
    document.addEventListener('auxclick', boundHandlers.blockNavigation, true);
    document.addEventListener('keydown', boundHandlers.blockKeyboardNav, true);
  }

  function detachGlobalBlockers() {
    document.removeEventListener('pointerdown', boundHandlers.blockLinkActivation, true);
    document.removeEventListener('click', boundHandlers.blockLinkActivation, true);
    document.removeEventListener('pointerdown', boundHandlers.blockNavigation, true);
    document.removeEventListener('mousedown', boundHandlers.blockNavigation, true);
    document.removeEventListener('click', boundHandlers.blockNavigation, true);
    document.removeEventListener('auxclick', boundHandlers.blockNavigation, true);
    document.removeEventListener('keydown', boundHandlers.blockKeyboardNav, true);
  }

  /* ------------------------------------------------------------------ */
  /* Cleanup                                                             */
  /* ------------------------------------------------------------------ */

  function cleanupCells(cellEntries) {
    cellEntries.forEach((entry) => {
      delete entry.target.dataset.sweeperTarget;

      entry.overlay.classList.remove('sweeper-painted');
      entry.overlay.style.removeProperty('background-color');
      delete entry.overlay.dataset.paintColor;

      if (entry.overlay.parentNode) {
        entry.overlay.parentNode.removeChild(entry.overlay);
      }
    });

    removeOverlayCanvas();
  }
})();
