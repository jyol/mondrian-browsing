'use strict';

importScripts('supabase-config.js', 'supabase-client.js');

/**
 * Mondrian Browsing — background service worker
 * Toggles the game on/off in the active tab and handles Supabase leaderboard API calls.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === 'PLAYER_NAME_GET') {
    getStoredPlayerName()
      .then((name) => sendResponse({ ok: true, name: name }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  if (message.type === 'PLAYER_NAME_SET') {
    const name = String(message.name || '').trim().slice(0, 32);

    if (!name) {
      sendResponse({ ok: false, error: 'Name is required' });
      return false;
    }

    setStoredPlayerName(name)
      .then(() => sendResponse({ ok: true, name: name }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  if (message.type === 'LEADERBOARD_LOAD') {
    handleLeaderboardLoad(sendResponse);
    return true;
  }

  if (message.type === 'LEADERBOARD_SAVE') {
    handleLeaderboardSave(message.entry, sendResponse);
    return true;
  }

  return false;
});

async function handleLeaderboardLoad(sendResponse) {
  if (!isSupabaseConfigured()) {
    sendResponse({
      ok: false,
      configured: false,
      error: 'Supabase is not configured. See SUPABASE_SETUP.md'
    });
    return;
  }

  try {
    const list = await loadScoresFromSupabase(LEADERBOARD_LIMIT);
    sendResponse({ ok: true, configured: true, list: list });
  } catch (err) {
    sendResponse({
      ok: false,
      configured: true,
      error: String(err.message || err)
    });
  }
}

async function handleLeaderboardSave(entry, sendResponse) {
  if (!isSupabaseConfigured()) {
    sendResponse({
      ok: false,
      configured: false,
      error: 'Supabase is not configured. See SUPABASE_SETUP.md'
    });
    return;
  }

  try {
    const result = await saveScoreToSupabase(entry);
    sendResponse({
      ok: true,
      configured: true,
      rank: result.rank,
      entry: result.entry
    });
  } catch (err) {
    sendResponse({
      ok: false,
      configured: true,
      error: String(err.message || err)
    });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  const message = { type: 'SWEEPER_TOGGLE' };

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (injectErr) {
      console.error('[Mondrian Browsing] Failed to inject content script:', injectErr);
    }
  }
});
