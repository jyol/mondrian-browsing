'use strict';

function supabaseHeaders(extra) {
  return Object.assign(
    {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: 'Bearer ' + SUPABASE_CONFIG.anonKey,
      'Content-Type': 'application/json'
    },
    extra || {}
  );
}

function supabaseRestUrl(path, query) {
  const base = SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/' + path;
  return query ? base + '?' + query : base;
}

async function supabaseRequest(path, options) {
  const response = await fetch(supabaseRestUrl(path, options.query), {
    method: options.method || 'GET',
    headers: supabaseHeaders(options.headers),
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = null;

  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const message =
      (data && (data.message || data.error || data.hint)) ||
      response.statusText ||
      'Supabase request failed';
    throw new Error(message);
  }

  return data;
}

async function insertScore(entry) {
  const rows = await supabaseRequest('scores', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation'
    },
    body: {
      player_name: entry.player_name,
      clicked: entry.clicked,
      total: entry.total,
      completed: entry.completed,
      page: entry.page,
      url: entry.url
    }
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function fetchTopScores(limit) {
  const fetchLimit = Math.max(limit * 10, 100);
  const query =
    'select=player_name,clicked,total,page,completed,created_at' +
    '&order=created_at.desc' +
    '&limit=' + String(fetchLimit);

  const rows = await supabaseRequest('scores', { query: query });
  const list = Array.isArray(rows) ? rows.slice() : [];

  list.sort(compareLeaderboardEntries);

  return list.slice(0, limit);
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

async function fetchScoreRank(completed, clicked, total, createdAt) {
  const rank = await supabaseRequest('rpc/get_score_rank', {
    method: 'POST',
    body: {
      p_completed: completed,
      p_clicked: clicked,
      p_total: total,
      p_created_at: createdAt
    }
  });

  return typeof rank === 'number' ? rank : Number(rank);
}

async function saveScoreToSupabase(entry) {
  const inserted = await insertScore(entry);
  const rank = await fetchScoreRank(
    inserted.completed,
    inserted.clicked,
    inserted.total,
    inserted.created_at
  );

  return {
    entry: inserted,
    rank: rank
  };
}

async function loadScoresFromSupabase(limit) {
  return fetchTopScores(limit);
}

function getStoredPlayerName() {
  return new Promise((resolve) => {
    chrome.storage.local.get(PLAYER_NAME_STORAGE_KEY, (result) => {
      const name = result[PLAYER_NAME_STORAGE_KEY];
      resolve(typeof name === 'string' && name.trim() ? name.trim() : '');
    });
  });
}

function setStoredPlayerName(name) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PLAYER_NAME_STORAGE_KEY]: name }, resolve);
  });
}
