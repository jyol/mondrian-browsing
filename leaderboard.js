'use strict';

const SUPABASE_URL = 'https://slixswedyfgixlgwmlgi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YuQ-bI0v97xlZpAy7jnpdQ_9gMl53pt';
const LEADERBOARD_LIMIT = 30;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compareLeaderboardEntries(a, b) {
  const completedA = !!a.completed;
  const completedB = !!b.completed;

  if (completedA !== completedB) {
    return completedA ? -1 : 1;
  }

  if (completedA && completedB) {
    const totalA = a.total || 0;
    const totalB = b.total || 0;
    if (totalB !== totalA) {
      return totalB - totalA;
    }
  } else {
    const clickedA = a.clicked || 0;
    const clickedB = b.clicked || 0;
    if (clickedB !== clickedA) {
      return clickedB - clickedA;
    }
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function formatBlocks(entry) {
  const total = entry.total || 0;
  const clicked = entry.clicked == null ? (entry.score || 0) : entry.clicked;
  return String(clicked) + ' / ' + String(total);
}

async function fetchTopScores(limit) {
  const fetchLimit = Math.max(limit * 10, 100);
  const query =
    'select=player_name,clicked,total,page,completed,created_at' +
    '&order=created_at.desc' +
    '&limit=' + String(fetchLimit);

  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/scores?' + query;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    }
  });

  if (!response.ok) {
    throw new Error('排行榜加载失败');
  }

  const rows = await response.json();
  const list = Array.isArray(rows) ? rows.slice() : [];
  list.sort(compareLeaderboardEntries);
  return list.slice(0, limit);
}

function renderLeaderboard(listEl, list) {
  if (!list.length) {
    listEl.innerHTML = '<li class="leaderboard-empty">No scores yet — be the first!</li>';
    return;
  }

  listEl.innerHTML = list.map(function (entry, index) {
    const rank = index + 1;
    const player = escapeHtml(entry.player_name || 'Anonymous');
    const page = escapeHtml(entry.page || 'Unknown page');
    const blocks = escapeHtml(formatBlocks(entry));
    const done = entry.completed ? ' leaderboard-item-done' : '';

    return (
      '<li class="leaderboard-item' + done + '">' +
      '<span class="leaderboard-rank">#' + String(rank) + '</span>' +
      '<span class="leaderboard-blocks">' + blocks + '</span>' +
      '<span class="leaderboard-meta">' +
      '<span class="leaderboard-player">' + player + '</span>' +
      '<span class="leaderboard-page">' + page + '</span>' +
      '</span>' +
      '</li>'
    );
  }).join('');
}

function loadLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '<li class="leaderboard-empty">Loading…</li>';

  fetchTopScores(LEADERBOARD_LIMIT)
    .then(function (list) {
      renderLeaderboard(listEl, list);
    })
    .catch(function () {
      listEl.innerHTML = '<li class="leaderboard-empty">Leaderboard unavailable</li>';
    });
}

document.addEventListener('DOMContentLoaded', loadLeaderboard);
