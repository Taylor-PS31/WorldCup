import { useState, useEffect, useCallback } from 'react';
import './App.css';

// ─── Data ─────────────────────────────────────────────────────────────────────

const GROUPS = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Türkiye'],
  E: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

const GROUP_KEYS = Object.keys(GROUPS);

const groupMatches = (teams) => [
  [teams[0], teams[1]], [teams[2], teams[3]],
  [teams[0], teams[2]], [teams[1], teams[3]],
  [teams[0], teams[3]], [teams[1], teams[2]],
];

const KO_ROUNDS = [
  { key: 'r32', label: 'Round of 32',    matchCount: 16 },
  { key: 'r16', label: 'Round of 16',    matchCount: 8  },
  { key: 'qf',  label: 'Quarter-finals', matchCount: 4  },
  { key: 'sf',  label: 'Semi-finals',    matchCount: 2  },
];

// football-data.org competition ID for World Cup 2026
const FDORG_COMP = 2000;

// ─── Tournament schedule (all times stored as UTC, converted from BST = UTC+1) ──
// Each stage has: start (first match kicks off → predictions lock)
//                 end   (last match ends → next stage predictions unlock / free-edit window opens)
const SCHEDULE = {
  groups: {
    start: new Date('2026-06-11T19:00:00Z'), // 20:00 BST 11 Jun
    end:   new Date('2026-06-28T05:00:00Z'), // 06:00 BST 28 Jun
  },
  r32: {
    start: new Date('2026-06-28T19:00:00Z'), // 20:00 BST 28 Jun
    end:   new Date('2026-07-04T04:30:00Z'), // 05:30 BST 4 Jul
  },
  r16: {
    start: new Date('2026-07-04T17:00:00Z'), // 18:00 BST 4 Jul
    end:   new Date('2026-07-06T23:00:00Z'), // 00:00 BST 7 Jul
  },
  qf: {
    start: new Date('2026-07-09T20:00:00Z'), // 21:00 BST 9 Jul
    end:   new Date('2026-07-12T04:00:00Z'), // 05:00 BST 12 Jul
  },
  sf: {
    start: new Date('2026-07-14T19:00:00Z'), // 20:00 BST 14 Jul
    end:   new Date('2026-07-15T22:00:00Z'), // 23:00 BST 15 Jul
  },
  thirdPlace: {
    start: new Date('2026-07-18T21:00:00Z'), // 22:00 BST 18 Jul
    end:   new Date('2026-07-19T00:00:00Z'), // 01:00 BST 19 Jul
  },
  final: {
    start: new Date('2026-07-19T19:00:00Z'), // 20:00 BST 19 Jul
    end:   new Date('2026-07-19T22:00:00Z'), // 23:00 BST 19 Jul
  },
};

// Stage order for progression
const STAGE_ORDER = ['groups', 'r32', 'r16', 'qf', 'sf', 'final'];

// Derive current tournament phase from wall clock
// Returns:
//   { phase: 'pre' }                        — before tournament starts
//   { phase: 'running', stage }             — a stage is actively in progress (locked)
//   { phase: 'window', nextStage }          — between stages, free-edit window open
//   { phase: 'complete' }                   — tournament over
function getTournamentPhase(now = new Date()) {
  // Before tournament
  if (now < SCHEDULE.groups.start) return { phase: 'pre' };

  // Check each stage in order
  for (const stage of STAGE_ORDER) {
    const s = SCHEDULE[stage] || SCHEDULE['thirdPlace'];
    if (!SCHEDULE[stage]) continue;
    const { start, end } = SCHEDULE[stage];
    if (now >= start && now < end) return { phase: 'running', stage };
    // Window between this stage ending and the next stage starting
    const nextIdx = STAGE_ORDER.indexOf(stage) + 1;
    if (nextIdx < STAGE_ORDER.length) {
      const nextStage = STAGE_ORDER[nextIdx];
      const nextStart = SCHEDULE[nextStage]?.start;
      if (nextStart && now >= end && now < nextStart) {
        return { phase: 'window', completedStage: stage, nextStage };
      }
    }
  }

  // Also handle the 3rd place match window
  if (now >= SCHEDULE.sf.end && now < SCHEDULE.thirdPlace.start) {
    return { phase: 'window', completedStage: 'sf', nextStage: 'final' };
  }
  if (now >= SCHEDULE.thirdPlace.start && now < SCHEDULE.final.start) {
    return { phase: 'running', stage: 'thirdPlace' };
  }

  if (now >= SCHEDULE.final.end) return { phase: 'complete' };

  return { phase: 'pre' };
}

// Which stages are locked for predictions right now?
// Returns a Set of stage keys that cannot be edited
function getLockedStages(now = new Date()) {
  const tp = getTournamentPhase(now);
  const locked = new Set();

  if (tp.phase === 'pre') return locked; // nothing locked yet

  if (tp.phase === 'complete') {
    STAGE_ORDER.forEach(s => locked.add(s));
    return locked;
  }

  // Everything up to and including the currently running/completed stage is locked
  const cutoffStage = tp.phase === 'running' ? tp.stage
    : tp.phase === 'window' ? tp.completedStage
    : null;

  if (!cutoffStage) return locked;

  const cutoffIdx = STAGE_ORDER.indexOf(cutoffStage);
  STAGE_ORDER.forEach((s, i) => { if (i <= cutoffIdx) locked.add(s); });

  return locked;
}

// Hook that re-evaluates phase every 30 seconds
function useTournamentPhase() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return {
    phase: getTournamentPhase(now),
    lockedStages: getLockedStages(now),
    now,
  };
}

// ─── State helpers ─────────────────────────────────────────────────────────────

// Official R32 bracket slot labels — exactly as per the FIFA 2026 bracket image
// Each match is a pair: [home slot label, away slot label]
// These show as placeholders until the user builds the bracket from group stage results
const R32_SLOTS = [
  // Match 1 (June 29 – Foxborough)
  'Winner Group E',       '3rd Group A/B/C/D/F',
  // Match 2 (June 30 – East Rutherford)
  'Winner Group I',       '3rd Group C/D/F/G/H',
  // Match 3 (June 28 – Inglewood)
  'Runner-up Group A',    'Runner-up Group B',
  // Match 4 (June 29 – Guadalupe)
  'Winner Group F',       'Runner-up Group C',
  // Match 5 (July 2 – Toronto)
  'Runner-up Group K',    'Runner-up Group L',
  // Match 6 (July 2 – Inglewood)
  'Winner Group H',       'Runner-up Group J',
  // Match 7 (July 1 – Santa Clara)
  'Winner Group D',       '3rd Group B/E/F/I/J',
  // Match 8 (July 1 – Seattle)
  'Winner Group G',       '3rd Group A/E/H/I/J',
  // Match 9 (June 29 – Houston)
  'Winner Group C',       'Runner-up Group F',
  // Match 10 (June 30 – Arlington)
  'Runner-up Group E',    'Runner-up Group I',
  // Match 11 (June 30 – Mexico City)
  'Winner Group A',       '3rd Group C/E/F/H/I',
  // Match 12 (July 1 – Atlanta)
  'Winner Group L',       '3rd Group E/H/I/J/K',
  // Match 13 (July 3 – Miami Gardens)
  'Winner Group J',       'Runner-up Group H',
  // Match 14 (July 3 – Arlington)
  'Runner-up Group D',    'Runner-up Group G',
  // Match 15 (July 2 – Vancouver)
  'Winner Group B',       '3rd Group E/F/G/I/J',
  // Match 16 (July 3 – Kansas City)
  'Winner Group K',       '3rd Group D/E/I/J/L',
];

const emptyKO = () => ({
  r32: [...R32_SLOTS],   // pre-filled with official slot labels
  r16: Array(16).fill('TBD'),
  qf:  Array(8).fill('TBD'),
  sf:  Array(4).fill('TBD'),
  final: ['TBD', 'TBD'],
  third: ['TBD', 'TBD'],
  winner: 'TBD',
  thirdPlace: 'TBD',
  koScores: {},
});

const emptyData = () => ({ qualifiers: {}, matchResults: {}, knockout: emptyKO() });

// penaltyPoints: points deducted for post-window KO changes (fill from actual)
const emptyLockState = () => ({
  userLocked: false,       // has the user manually locked their predictions?
  penaltyPoints: 0,        // cumulative penalty for fill-from-actual changes
  windowAcknowledged: {},  // { r32: true } — user has acknowledged the fill prompt for each stage
});

// ─── Persistence ──────────────────────────────────────────────────────────────

// Bump this number whenever the shape of saved data changes in a breaking way.
// The migrate() function below must handle upgrading from all previous versions.
const SAVE_VERSION = 2;
const STORAGE_KEY = 'wc2026_save';

// Deep-merge defaults into a loaded object so new fields added in updates
// are always present, even if the saved data predates them.
function applyDefaults(loaded, defaults) {
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) return loaded ?? defaults;
  const result = { ...defaults };
  if (typeof loaded === 'object' && loaded !== null && !Array.isArray(loaded)) {
    Object.keys(loaded).forEach(k => {
      if (k in defaults) result[k] = applyDefaults(loaded[k], defaults[k]);
      else result[k] = loaded[k];
    });
  }
  return result;
}

function migrate(saved) {
  let data = saved;
  // v0 → v1: koScores added to knockout
  if ((data.version || 0) < 1) {
    const fixKO = (ko) => ({ ...emptyKO(), ...ko, koScores: ko.koScores || {} });
    data = {
      ...data,
      prediction: { ...data.prediction, knockout: fixKO(data.prediction?.knockout || {}) },
      actual:     { ...data.actual,     knockout: fixKO(data.actual?.knockout     || {}) },
      version: 1,
    };
  }
  // v1 → v2: r32 now pre-filled with official slot labels instead of 'TBD'
  // Only replace slots that are still 'TBD' — leave any real team names untouched
  if ((data.version || 0) < 2) {
    const upgradeR32 = (ko) => {
      const r32 = [...(ko.r32 || emptyKO().r32)];
      R32_SLOTS.forEach((label, i) => {
        if (r32[i] === 'TBD') r32[i] = label;
      });
      return { ...ko, r32 };
    };
    data = {
      ...data,
      prediction: { ...data.prediction, knockout: upgradeR32(data.prediction?.knockout || {}) },
      actual:     { ...data.actual,     knockout: upgradeR32(data.actual?.knockout     || {}) },
      version: 2,
    };
  }
  return data;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    let saved = JSON.parse(raw);
    // Run migrations if needed
    if (saved.version < SAVE_VERSION) saved = migrate(saved);
    // Apply defaults so any fields added since save are present
    const defaultSave = {
      prediction:     emptyData(),
      actual:         emptyData(),
      lockState:      emptyLockState(),
      predGroupMode:  'simple',
      actGroupMode:   'simple',
      predScoreMode:  false,
      actScoreMode:   false,
    };
    return applyDefaults(saved, defaultSave);
  } catch (e) {
    console.warn('Failed to load saved data:', e);
    return null;
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: SAVE_VERSION }));
  } catch (e) {
    console.warn('Failed to save data:', e);
  }
}

// ─── Standings calculation ─────────────────────────────────────────────────────

function calcStandings(groupKey, matchResultsForGroup) {
  const teams = GROUPS[groupKey];
  const matches = groupMatches(teams);
  const stats = {};
  teams.forEach((t) => { stats[t] = { w: 0, d: 0, l: 0, gf: 0, ga: 0 }; });

  matches.forEach((match, i) => {
    const res = (matchResultsForGroup || {})[i];
    if (!res) return;
    const [home, away] = match;
    const hg = parseInt(res.homeGoals), ag = parseInt(res.awayGoals);
    const hasScores = !isNaN(hg) && !isNaN(ag);
    if (hasScores) {
      stats[home].gf += hg; stats[home].ga += ag;
      stats[away].gf += ag; stats[away].ga += hg;
      if (hg > ag)      { stats[home].w++; stats[away].l++; }
      else if (hg < ag) { stats[away].w++; stats[home].l++; }
      else              { stats[home].d++; stats[away].d++; }
    } else if (res.result) {
      if (res.result === 'home')      { stats[home].w++; stats[away].l++; }
      else if (res.result === 'away') { stats[away].w++; stats[home].l++; }
      else if (res.result === 'draw') { stats[home].d++; stats[away].d++; }
    }
  });

  return teams
    .map((t) => ({ name: t, ...stats[t], pts: stats[t].w * 3 + stats[t].d }))
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

// ─── Comparison / scoring logic ───────────────────────────────────────────────

function ord(n) {
  return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

function getOutcome(res) {
  if (!res) return { outcome: '', hg: null, ag: null };
  const hg = parseInt(res.homeGoals), ag = parseInt(res.awayGoals);
  if (!isNaN(hg) && !isNaN(ag)) {
    return { outcome: hg > ag ? 'home' : hg < ag ? 'away' : 'draw', hg, ag };
  }
  return { outcome: res.result || '', hg: null, ag: null };
}

function buildComparison(prediction, actual, advancedMatchMode, penaltyPoints) {
  const items = [];
  let totalEarned = 0, totalPossible = 0;

  const add = (item) => { items.push(item); totalEarned += item.earned; totalPossible += item.possible; };

  GROUP_KEYS.forEach((gk) => {
    const predIsSimple   = !!(prediction.qualifiers[gk]?.length > 0);
    const actualIsSimple = !!(actual.qualifiers[gk]?.length > 0);
    const predOrder   = predIsSimple   ? prediction.qualifiers[gk]   : calcStandings(gk, prediction.matchResults[gk]).map(t => t.name);
    const actualOrder = actualIsSimple ? actual.qualifiers[gk]       : calcStandings(gk, actual.matchResults[gk]).map(t => t.name);

    GROUPS[gk].forEach((team) => {
      const pp = predOrder.indexOf(team), ap = actualOrder.indexOf(team);
      if (pp < 0 || ap < 0) return;
      const correct = pp === ap;
      add({ category: 'Group Position', group: gk, description: `${team} — predicted ${pp+1}${ord(pp+1)}, actual ${ap+1}${ord(ap+1)}`, correct, earned: correct ? 1 : 0, possible: 1 });
    });

    if (!predIsSimple && !actualIsSimple) {
      groupMatches(GROUPS[gk]).forEach(([home, away], i) => {
        const p = getOutcome((prediction.matchResults[gk] || {})[i]);
        const a = getOutcome((actual.matchResults[gk]     || {})[i]);
        if (!p.outcome || !a.outcome) return;
        const exact = p.outcome === a.outcome && p.hg === a.hg && p.ag === a.ag && p.hg !== null;
        const match = p.outcome === a.outcome;
        const lbl   = { home: `${home} win`, away: `${away} win`, draw: 'Draw' };
        const sstr  = (r) => r.hg !== null ? `${r.hg}–${r.ag}` : r.outcome;

        if (advancedMatchMode === 'score') {
          // Always award 1pt for correct outcome; additionally +3pts for exact score
          // Total: 1pt (outcome) + 3pts (score) = 4pts for exact; 1pt for correct outcome only; 0 for wrong
          const earned   = match ? (exact ? 4 : 1) : 0;
          const possible = 4;
          add({
            category: 'Match Score', group: gk,
            description: `${home} vs ${away} — predicted ${sstr(p)}, actual ${sstr(a)}`,
            correct: match, exactMatch: exact, earned, possible,
          });
        } else {
          // W/D/L only: 1pt for correct outcome
          add({
            category: 'Match Result', group: gk,
            description: `${home} vs ${away} — predicted ${lbl[p.outcome]||p.outcome}, actual ${lbl[a.outcome]||a.outcome}`,
            correct: match, exactMatch: exact, earned: match ? 1 : 0, possible: 1,
          });
        }
      });
    }
  });

  KO_ROUNDS.forEach(({ key, label, matchCount }) => {
    for (let i = 0; i < matchCount; i++) {
      const pw = prediction.knockout[key][i], aw = actual.knockout[key][i];
      if (pw === 'TBD' || aw === 'TBD') continue;
      const correct = pw === aw;

      // Score bonus (only if both sides have scores entered for this match)
      const scoreKey = `${key}-${i}`; // one score per advancing slot
      const ps = (prediction.knockout.koScores || {})[scoreKey];
      const as = (actual.knockout.koScores     || {})[scoreKey];
      const ph = parseInt(ps?.h), pa2 = parseInt(ps?.a);
      const ah = parseInt(as?.h), aa  = parseInt(as?.a);
      const hasScores = !isNaN(ph) && !isNaN(pa2) && !isNaN(ah) && !isNaN(aa);
      const exactScore = hasScores && ph === ah && pa2 === aa;

      if (advancedMatchMode === 'score' && hasScores) {
        add({
          category: `${label} Score`, group: null,
          description: `Match ${i+1} — predicted ${ph}–${pa2}, actual ${ah}–${aa}`,
          correct: exactScore, exactMatch: exactScore,
          earned: exactScore ? 3 : 0, possible: 3,
        });
      }

      // Always add the advancement item (1pt)
      add({
        category: label, group: null,
        description: `Predicted ${pw} to advance — actual: ${aw}`,
        correct, earned: correct ? 1 : 0, possible: 1,
      });
    }
  });

  if (prediction.knockout.winner !== 'TBD' && actual.knockout.winner !== 'TBD') {
    const correct = prediction.knockout.winner === actual.knockout.winner;
    add({ category: 'Champion', group: null, description: `Predicted ${prediction.knockout.winner}, actual ${actual.knockout.winner}`, correct, earned: correct ? 1 : 0, possible: 1 });
  }
  if (prediction.knockout.thirdPlace !== 'TBD' && actual.knockout.thirdPlace !== 'TBD') {
    const correct = prediction.knockout.thirdPlace === actual.knockout.thirdPlace;
    add({ category: '3rd Place', group: null, description: `Predicted ${prediction.knockout.thirdPlace}, actual ${actual.knockout.thirdPlace}`, correct, earned: correct ? 1 : 0, possible: 1 });
  }

  // Deduct penalty points for post-lock changes
  const penalty = penaltyPoints || 0;
  return { items, totalEarned: Math.max(0, totalEarned - penalty), totalPossible, penaltyDeducted: penalty };
}

// ─── Live data fetch (football-data.org) ──────────────────────────────────────

async function fetchActualResults(apiKey) {
  // Returns { groups: {A: [{home, away, homeGoals, awayGoals, status}]}, error }
  try {
    const resp = await fetch(
      `https://api.football-data.org/v4/competitions/${FDORG_COMP}/matches`,
      { headers: { 'X-Auth-Token': apiKey } }
    );
    if (!resp.ok) {
      if (resp.status === 401) return { error: 'Invalid API key. Check your football-data.org key.' };
      if (resp.status === 404) return { error: 'World Cup 2026 data not yet available on football-data.org.' };
      return { error: `API error ${resp.status}` };
    }
    const data = await resp.json();
    const matches = data.matches || [];
    const groups = {};
    matches.forEach((m) => {
      const stage = m.stage || '';
      const group = m.group || '';
      const gLetter = group.replace('GROUP_', '');
      if (!GROUP_KEYS.includes(gLetter)) return;
      if (!groups[gLetter]) groups[gLetter] = [];
      groups[gLetter].push({
        home: m.homeTeam?.name || '',
        away: m.awayTeam?.name || '',
        homeGoals: m.score?.fullTime?.home ?? '',
        awayGoals: m.score?.fullTime?.away ?? '',
        status: m.status || '',
      });
    });
    return { groups };
  } catch (e) {
    return { error: 'Network error — check your internet connection.' };
  }
}

// ─── Scoring Guide ────────────────────────────────────────────────────────────

function ScoringGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="scoring-guide">
      <button className="scoring-guide-toggle" onClick={() => setOpen(v => !v)}>
        {open ? '▲' : '▼'} How scoring works
      </button>
      {open && (
        <div className="scoring-guide-body">
          <div className="sg-section">
            <div className="sg-heading">🏟️ Group Stage — always (Simple &amp; Advanced)</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts">1pt</span><span>Correct position for each team in the group table (1st, 2nd, 3rd or 4th)</span></div>
            </div>
          </div>
          <div className="sg-section">
            <div className="sg-heading">🏟️ Group Stage — Advanced mode only (on top of above)</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts">+1pt</span><span>Correct match outcome (W / D / L) per game</span></div>
            </div>
          </div>
          <div className="sg-section">
            <div className="sg-heading">🏟️ Group Stage — Advanced + Scores (on top of above)</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts sg-bonus">+3pts</span><span>Correct exact score — stacks with the +1pt outcome point (4pts total for a perfect score prediction)</span></div>
            </div>
          </div>
          <div className="sg-section">
            <div className="sg-heading">⚽ Knockout Stage — always</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts">1pt</span><span>Correct team advancing in each knockout match (R32, R16, QF, SF, Final, 3rd place)</span></div>
            </div>
          </div>
          <div className="sg-section">
            <div className="sg-heading">⚽ Knockout Stage — Scores mode (on top of above)</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts sg-bonus">+3pts</span><span>Correct exact score — stacks with the 1pt advancement point (4pts total for a perfect prediction)</span></div>
              <div className="sg-note">Switch to <strong>Scores</strong> mode using the toggle next to the section tabs. This applies to both group and knockout stages simultaneously.</div>
            </div>
          </div>
          <div className="sg-section">
            <div className="sg-heading">🔒 Lock &amp; penalty system</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts sg-zero">−1pt</span><span>Each slot changed when you use <em>Fill from actual results</em> during a free-edit window</span></div>
              <div className="sg-note">You can lock and unlock freely before the tournament and in between each round. Once the first match of each round kicks off, everything locks automatically until the end of the current round.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────

const ALL_CATEGORIES = ['Group Position', 'Match Result', 'Match Score', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Champion', '3rd Place'];

function ComparisonPanel({ prediction, actual, predGroupMode, actGroupMode, penaltyPoints }) {
  const [displayMode, setDisplayMode]       = useState('correct');
  const [matchMode, setMatchMode]           = useState('wdl');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterResult, setFilterResult]     = useState('All');
  const [filterGroup, setFilterGroup]       = useState('All');

  const bothAdvanced = predGroupMode === 'advanced' && actGroupMode === 'advanced';
  const { items, totalEarned, totalPossible, penaltyDeducted } = buildComparison(prediction, actual, matchMode, penaltyPoints);

  const filtered = items.filter((item) => {
    if (filterCategory !== 'All' && item.category !== filterCategory) return false;
    if (filterResult === 'Correct'   && !item.correct) return false;
    if (filterResult === 'Incorrect' &&  item.correct) return false;
    if (filterGroup !== 'All' && String(item.group) !== String(filterGroup)) return false;
    return true;
  });

  const correctCount = filtered.filter(i => i.correct).length;
  const incorrectCount = filtered.filter(i => !i.correct).length;
  const filteredEarned = filtered.reduce((s, i) => s + i.earned, 0);

  return (
    <div className="comparison-panel">
      <div className="cmp-header">
        <div>
          <div className="cmp-title">📊 Prediction Analysis</div>
          <div className="cmp-sub">
            1pt per correct group position · 1pt per correct KO advance
            {bothAdvanced && <> · {matchMode === 'wdl' ? '+1pt W/D/L' : '+3pts exact score'}</>}
            {penaltyDeducted > 0 && <span className="penalty-note"> · −{penaltyDeducted}pts late-change penalty</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {bothAdvanced && (
            <div className="score-mode-toggle">
              <button className={`toggle-btn ${matchMode === 'wdl'   ? 'active' : ''}`} onClick={() => setMatchMode('wdl')}>+1 W/D/L</button>
              <button className={`toggle-btn ${matchMode === 'score' ? 'active' : ''}`} onClick={() => setMatchMode('score')}>+3 Exact</button>
            </div>
          )}
          <div className="score-mode-toggle">
            <button className={`toggle-btn ${displayMode === 'correct' ? 'active' : ''}`} onClick={() => setDisplayMode('correct')}>✓/✗</button>
            <button className={`toggle-btn ${displayMode === 'points' ? 'active' : ''}`} onClick={() => setDisplayMode('points')}>Points</button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="cmp-empty">Fill in both your predictions and actual results to see the comparison here.</div>
      ) : (
        <>
          <div className="cmp-stats">
            <div className="cmp-stat"><div className="cmp-stat-val correct-col">{items.filter(i=>i.correct).length}</div><div className="cmp-stat-label">Correct</div></div>
            <div className="cmp-stat"><div className="cmp-stat-val incorrect-col">{items.filter(i=>!i.correct).length}</div><div className="cmp-stat-label">Incorrect</div></div>
            <div className="cmp-stat"><div className="cmp-stat-val">{items.length > 0 ? Math.round(items.filter(i=>i.correct).length/items.length*100) : 0}%</div><div className="cmp-stat-label">Accuracy</div></div>
            <div className="cmp-stat">
              <div className="cmp-stat-val points-col">{totalEarned} <span style={{fontSize:13,fontWeight:400,color:'#888'}}>/ {totalPossible}</span></div>
              <div className="cmp-stat-label">Points{penaltyDeducted > 0 && <span className="penalty-note"> (−{penaltyDeducted} penalty)</span>}</div>
            </div>
          </div>

          <div className="cmp-filters">
            <div className="filter-group">
              <span className="filter-label">Category</span>
              <select className="filter-select" value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}>
                <option value="All">All</option>
                {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Result</span>
              <select className="filter-select" value={filterResult} onChange={e=>setFilterResult(e.target.value)}>
                <option value="All">All</option>
                <option value="Correct">Correct only</option>
                <option value="Incorrect">Incorrect only</option>
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Group</span>
              <select className="filter-select" value={filterGroup} onChange={e=>setFilterGroup(e.target.value)}>
                <option value="All">All</option>
                {GROUP_KEYS.map(g => <option key={g} value={g}>Group {g}</option>)}
                <option value="null">Knockout only</option>
              </select>
            </div>
            <div className="filter-summary">
              {filtered.length} items · <span className="correct-col">{correctCount}✓</span> · <span className="incorrect-col">{incorrectCount}✗</span>
              {displayMode === 'points' && <> · <span className="points-col">{filteredEarned}pts</span></>}
            </div>
          </div>

          <div className="cmp-list">
            {filtered.length === 0
              ? <div className="cmp-empty">No items match your filters.</div>
              : filtered.map((item, i) => (
                <div key={i} className={`cmp-item ${item.correct ? 'cmp-correct' : 'cmp-incorrect'} ${item.exactMatch ? 'cmp-exact' : ''}`}>
                  <div className="cmp-item-left">
                    <span className={`cmp-tick ${item.correct ? 'tick-correct' : 'tick-wrong'}`}>{item.correct ? '✓' : '✗'}</span>
                    <div>
                      <div className="cmp-item-cat">
                        {item.category}
                        {item.group && <span className="cmp-item-group">Group {item.group}</span>}
                        {item.exactMatch && <span className="cmp-exact-badge">Exact score!</span>}
                      </div>
                      <div className="cmp-item-desc">{item.description}</div>
                    </div>
                  </div>
                  {displayMode === 'points' && (
                    <div className={`cmp-item-pts ${item.earned > 0 ? 'pts-earned' : 'pts-zero'}`}>+{item.earned}</div>
                  )}
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tournament Status Banner ─────────────────────────────────────────────────

const STAGE_LABELS = {
  groups: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final', thirdPlace: '3rd Place',
};

function fmt(date) {
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function TournamentStatusBanner({ tournPhase, lockedStages, lockState, onUserLock, onFillFromActual, penaltyPoints }) {
  const [confirmLock, setConfirmLock] = useState(false);
  const [showFillConfirm, setShowFillConfirm] = useState(false);
  const { phase } = tournPhase;

  // ── Pre-tournament ──
  if (phase === 'pre') {
    const { userLocked } = lockState;
    return (
      <div className={`lock-banner ${userLocked ? 'locked' : 'unlocked'}`}>
        <div className="lock-info">
          <span className="lock-icon">{userLocked ? '🔒' : '🔓'}</span>
          <div>
            <div className="lock-title">
              {userLocked ? 'Predictions locked' : 'Tournament not started yet'}
              {penaltyPoints > 0 && <span className="penalty-badge">−{penaltyPoints}pts penalty</span>}
            </div>
            <div className="lock-sub">
              {userLocked
                ? `You've locked your predictions. You can unlock and re-lock freely until the tournament starts (${fmt(SCHEDULE.groups.start)}).`
                : `Freely edit your predictions until the first match kicks off (${fmt(SCHEDULE.groups.start)}). Lock them when you're happy.`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!userLocked ? (
            !confirmLock
              ? <button className="lock-btn" onClick={() => setConfirmLock(true)}>🔒 Lock my predictions</button>
              : <div className="lock-confirm">
                  <span>Sure? You can still unlock before the tournament starts.</span>
                  <button className="lock-btn danger" onClick={() => { onUserLock(true); setConfirmLock(false); }}>Yes, lock</button>
                  <button className="lock-btn cancel" onClick={() => setConfirmLock(false)}>Cancel</button>
                </div>
          ) : (
            <button className="lock-btn unlock-btn" onClick={() => onUserLock(false)}>🔓 Unlock to make changes</button>
          )}
        </div>
      </div>
    );
  }

  // ── Stage running ──
  if (phase === 'running') {
    const { stage } = tournPhase;
    return (
      <div className="lock-banner locked">
        <div className="lock-info">
          <span className="lock-icon">🔒</span>
          <div>
            <div className="lock-title">
              {STAGE_LABELS[stage] || stage} in progress — predictions locked
              {penaltyPoints > 0 && <span className="penalty-badge">−{penaltyPoints}pts penalty</span>}
            </div>
            <div className="lock-sub">
              Predictions for this stage and all previous stages are permanently locked. Editing resumes after this stage ends.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Free-edit window between stages ──
  if (phase === 'window') {
    const { completedStage, nextStage } = tournPhase;
    const nextStart = SCHEDULE[nextStage]?.start;
    return (
      <div className="lock-banner window">
        <div className="lock-info">
          <span className="lock-icon">✏️</span>
          <div>
            <div className="lock-title">
              Free-edit window open — {STAGE_LABELS[completedStage]} complete
              {penaltyPoints > 0 && <span className="penalty-badge">−{penaltyPoints}pts penalty</span>}
            </div>
            <div className="lock-sub">
              Edit your {STAGE_LABELS[nextStage] || nextStage} predictions freely until {nextStart ? fmt(nextStart) : 'the next stage starts'}.
              Predictions lock automatically when the first match kicks off.
            </div>
          </div>
        </div>
        {!showFillConfirm ? (
          <button className="lock-btn fill-btn" onClick={() => setShowFillConfirm(true)}>
            📥 Fill from actual results (−1pt per change)
          </button>
        ) : (
          <div className="lock-confirm">
            <span>Each slot that differs from your original prediction costs 1 point. Continue?</span>
            <button className="lock-btn danger" onClick={() => { onFillFromActual(nextStage); setShowFillConfirm(false); }}>Yes, fill it</button>
            <button className="lock-btn cancel" onClick={() => setShowFillConfirm(false)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  // ── Complete ──
  if (phase === 'complete') {
    return (
      <div className="lock-banner locked">
        <div className="lock-info">
          <span className="lock-icon">🏆</span>
          <div>
            <div className="lock-title">
              Tournament complete — all predictions locked
              {penaltyPoints > 0 && <span className="penalty-badge">−{penaltyPoints}pts penalty</span>}
            </div>
            <div className="lock-sub">The World Cup 2026 is over. Check the analysis tab to see how you did!</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Live fetch panel ─────────────────────────────────────────────────────────

function LiveFetchPanel({ onApplyResults }) {
  const [apiKey, setApiKey]     = useState('');
  const [status, setStatus]     = useState('idle'); // 'idle'|'fetching'|'done'|'error'
  const [message, setMessage]   = useState('');
  const [autoMode, setAutoMode] = useState(false);

  const doFetch = useCallback(async () => {
    if (!apiKey.trim()) { setMessage('Enter your API key first.'); setStatus('error'); return; }
    setStatus('fetching'); setMessage('Fetching from football-data.org…');
    const result = await fetchActualResults(apiKey.trim());
    if (result.error) { setStatus('error'); setMessage(result.error); return; }
    onApplyResults(result.groups);
    setStatus('done'); setMessage(`Fetched successfully.`);
  }, [apiKey, onApplyResults]);

  return (
    <div className="live-panel">
      <div className="live-header">
        <span className="live-icon">📡</span>
        <div>
          <div className="live-title">Live Results — football-data.org</div>
          <div className="live-sub">
            Get a free API key at <a href="https://www.football-data.org/client/register" target="_blank" rel="noreferrer">football-data.org</a>, then paste it below to fetch real match results.
          </div>
        </div>
        <div className="score-mode-toggle" style={{ marginLeft: 'auto' }}>
          <button className={`toggle-btn ${!autoMode ? 'active' : ''}`} onClick={() => setAutoMode(false)}>Manual</button>
          <button className={`toggle-btn ${autoMode  ? 'active' : ''}`} onClick={() => setAutoMode(true)}>Auto</button>
        </div>
      </div>
      <div className="live-controls">
        <input
          type="text" className="api-key-input" placeholder="Paste your API key here…"
          value={apiKey} onChange={e => setApiKey(e.target.value)}
        />
        <button className="live-fetch-btn" onClick={doFetch} disabled={status === 'fetching'}>
          {status === 'fetching' ? 'Fetching…' : '⬇ Fetch results now'}
        </button>
      </div>
      {message && <div className={`live-msg ${status}`}>{message}</div>}
      {autoMode && apiKey && (
        <AutoFetcher apiKey={apiKey} onFetch={doFetch} />
      )}
    </div>
  );
}

function AutoFetcher({ apiKey, onFetch }) {
  const [interval, setIntervalMins] = useState(5);
  useEffect(() => {
    const id = setInterval(onFetch, interval * 60 * 1000);
    return () => clearInterval(id);
  }, [onFetch, interval]);
  return (
    <div className="auto-fetch-row">
      <span className="live-sub">Auto-refreshing every</span>
      <select className="filter-select" value={interval} onChange={e => setIntervalMins(Number(e.target.value))}>
        <option value={1}>1 minute</option>
        <option value={5}>5 minutes</option>
        <option value={15}>15 minutes</option>
        <option value={30}>30 minutes</option>
      </select>
      <span className="live-sub">· running</span>
    </div>
  );
}

// ─── Shared match slot ────────────────────────────────────────────────────────

// A slot label is a placeholder like "Winner Group A" — not a real team yet
const isSlotLabel = (team) =>
  !team ||
  team === 'TBD' ||
  team.startsWith('Winner Group') ||
  team.startsWith('Runner-up Group') ||
  team.startsWith('3rd Group');

function MatchSlot({ teamA, teamB, label, onSelectWinner, locked, scoreMode, score, onScoreChange }) {
  return (
    <div className="match-slot">
      {label && <div className="match-label">{label}</div>}
      {[teamA, teamB].map((team, i) => {
        const isLabel = isSlotLabel(team);
        const clickable = !isLabel && onSelectWinner && !locked;
        return (
          <div key={i}
            className={`match-team ${clickable ? 'clickable' : ''} ${locked ? 'locked-slot' : ''}`}
            style={{ borderTop: i === 1 ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}
            onClick={() => clickable && onSelectWinner(team)}
          >
            {isLabel
              ? <span className="team-slot-label">{team || 'TBD'}</span>
              : <span className="team-name">{team}</span>}
          </div>
        );
      })}
      {scoreMode && onScoreChange && !isSlotLabel(teamA) && !isSlotLabel(teamB) && (
        <div className="ko-score-row">
          <input type="number" min="0" max="99" className="score-input" disabled={locked}
            value={score?.h ?? ''} placeholder="0"
            onChange={e => !locked && onScoreChange({ ...(score||{}), h: e.target.value })} />
          <span className="score-sep">–</span>
          <input type="number" min="0" max="99" className="score-input" disabled={locked}
            value={score?.a ?? ''} placeholder="0"
            onChange={e => !locked && onScoreChange({ ...(score||{}), a: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ─── Group Stage — Simple Mode ────────────────────────────────────────────────

function SimpleGroupCard({ groupKey, qualifiers, onToggle, locked }) {
  const teams = GROUPS[groupKey];
  const q = qualifiers[groupKey] || [];
  const sorted = [...teams].sort((a, b) => {
    const pa = q.indexOf(a), pb = q.indexOf(b);
    if (pa >= 0 && pb >= 0) return pa - pb;
    if (pa >= 0) return -1; if (pb >= 0) return 1;
    return a.localeCompare(b);
  });
  return (
    <div className={`group-card ${locked ? 'card-locked' : ''}`}>
      <div className="group-header">
        <span>Group {groupKey}</span>
        <span className="group-hint">{locked ? '🔒 locked' : 'click to rank'}</span>
      </div>
      <table className="group-table">
        <thead><tr><th></th><th style={{textAlign:'left'}}>Team</th><th>Pos</th></tr></thead>
        <tbody>
          {sorted.map((team) => {
            const pos = q.indexOf(team);
            return (
              <tr key={team} className={`group-row pos-${pos}`} onClick={() => !locked && onToggle(groupKey, team)}>
                <td className="badge-cell">
                  {pos === 0 && <span className="badge b1">1st</span>}
                  {pos === 1 && <span className="badge b2">2nd</span>}
                  {pos === 2 && <span className="badge b3">3rd★</span>}
                </td>
                <td className="team-cell"><span className="team-name">{team}</span></td>
                <td className="pts">{pos >= 0 ? pos + 1 : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Group Stage — Advanced Mode ──────────────────────────────────────────────

function AdvancedGroupCard({ groupKey, matchResults, onUpdateMatch, scoreMode, locked }) {
  const teams = GROUPS[groupKey];
  const matches = groupMatches(teams);
  const mrs = matchResults[groupKey] || {};
  const standings = calcStandings(groupKey, mrs);
  return (
    <div className={`group-card adv-card ${locked ? 'card-locked' : ''}`}>
      <div className="group-header">
        <span>Group {groupKey}</span>
        <span className="group-hint">{locked ? '🔒 locked' : scoreMode ? 'enter scores' : 'pick results'}</span>
      </div>
      <table className="group-table">
        <thead><tr><th></th><th style={{textAlign:'left'}}>Team</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th></tr></thead>
        <tbody>
          {standings.map((team, i) => (
            <tr key={team.name} className={`group-row pos-${i < 2 ? i : i === 2 ? 2 : -1}`}>
              <td className="badge-cell">
                {i === 0 && <span className="badge b1">1st</span>}
                {i === 1 && <span className="badge b2">2nd</span>}
                {i === 2 && <span className="badge b3">3rd</span>}
                {i === 3 && <span className="badge b4">4th</span>}
              </td>
              <td className="team-cell"><span className="team-name">{team.name}</span></td>
              <td>{team.w}</td><td>{team.d}</td><td>{team.l}</td>
              <td>{team.gf}</td><td>{team.ga}</td>
              <td className="pts">{team.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="match-list">
        <div className="match-list-header">Matches</div>
        {matches.map(([home, away], i) => {
          const res = mrs[i] || {};
          return (
            <div key={i} className="match-row">
              <span className="match-team-name home">{home}</span>
              {scoreMode ? (
                <div className="score-inputs">
                  <input type="number" min="0" max="99" className="score-input" disabled={locked} value={res.homeGoals??''} onChange={e=>!locked&&onUpdateMatch(groupKey,i,{...res,homeGoals:e.target.value})} placeholder="0"/>
                  <span className="score-sep">–</span>
                  <input type="number" min="0" max="99" className="score-input" disabled={locked} value={res.awayGoals??''} onChange={e=>!locked&&onUpdateMatch(groupKey,i,{...res,awayGoals:e.target.value})} placeholder="0"/>
                </div>
              ) : (
                <div className="wdl-btns">
                  {['home','draw','away'].map(r=>(
                    <button key={r} disabled={locked} className={`wdl-btn ${res.result===r?'active-'+r:''}`}
                      onClick={()=>!locked&&onUpdateMatch(groupKey,i,{...res,result:res.result===r?'':r})}>
                      {r==='home'?'W':r==='draw'?'D':'L'}
                    </button>
                  ))}
                </div>
              )}
              <span className="match-team-name away">{away}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Group Stage wrapper ───────────────────────────────────────────────────────

function GroupStage({ data, onSetQualifiers, onUpdateMatch, onBuildKnockout, groupMode, scoreMode, locked }) {
  const q = data.qualifiers;
  const getAdvQ = () => {
    const d = {};
    GROUP_KEYS.forEach(gk => { d[gk] = calcStandings(gk, data.matchResults[gk]).map(t=>t.name); });
    return d;
  };
  const allTop2Done = groupMode === 'advanced'
    ? GROUP_KEYS.every(g => calcStandings(g, data.matchResults[g]).some(t => t.pts > 0))
    : GROUP_KEYS.every(g => (q[g]||[]).length >= 2);
  const best3Count = groupMode === 'advanced' ? 8 : Object.values(q).filter(v=>v&&v[2]).length;
  const canBuild = !locked && (groupMode === 'advanced' ? true : (allTop2Done && best3Count >= 8));

  const handleToggle = (gk, team) => {
    const cur = [...(q[gk]||[])];
    const idx = cur.indexOf(team);
    let next;
    if (idx >= 0) next = cur.filter(t=>t!==team);
    else if (cur.length < 3) next = [...cur, team];
    else next = [cur[1],cur[2],team];
    onSetQualifiers(gk, next);
  };

  const handleBuild = () => {
    const qSource = groupMode === 'advanced' ? getAdvQ() : q;

    // Get ranked teams per group
    const winner   = (g) => (qSource[g]||[])[0] || R32_SLOTS[0]; // fallback to label if not set
    const runnerUp = (g) => (qSource[g]||[])[1] || R32_SLOTS[1];

    // Get best 8 third-place teams, sorted by pts then GD
    let thirds = [];
    if (groupMode === 'advanced') {
      const tl = [];
      GROUP_KEYS.forEach(g => { const s=calcStandings(g,data.matchResults[g]); if(s[2]) tl.push({...s[2],group:g}); });
      tl.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga));
      thirds = tl.slice(0,8).map(t=>t.name);
    } else {
      GROUP_KEYS.forEach(g => { if((q[g]||[])[2]) thirds.push(q[g][2]); });
    }
    while (thirds.length < 8) thirds.push('TBD');

    // Map slot labels to actual teams
    // Third-place slots are assigned in order of the bracket (top to bottom)
    // The slot labels tell us which pool they come from but the actual
    // assignment is positional — best 3rd goes to first 3rd slot, etc.
    const thirdSlotOrder = [0,1,2,3,4,5,6,7]; // indices into thirds[]
    let thirdIdx = 0;
    const getTeam = (label) => {
      if (label.startsWith('Winner Group '))   return winner(label.slice(-1));
      if (label.startsWith('Runner-up Group ')) return runnerUp(label.slice(-1));
      if (label.startsWith('3rd Group '))       return thirds[thirdIdx++] || 'TBD';
      return label; // already a team name
    };

    const r32 = R32_SLOTS.map(label => getTeam(label));
    onBuildKnockout(r32);
  };

  return (
    <div>
      {groupMode === 'simple' ? (
        <div className="info-bar">Click once for <strong>1st</strong>, twice for <strong>2nd</strong>, three times for <strong>best 3rd ⭐</strong>, again to deselect.</div>
      ) : (
        <div className="info-bar">Enter match results — standings update automatically. Use the <strong>Scores</strong> toggle above to predict exact scores.</div>
      )}
      <div className="group-grid">
        {GROUP_KEYS.map(gk =>
          groupMode === 'simple'
            ? <SimpleGroupCard key={gk} groupKey={gk} qualifiers={q} onToggle={handleToggle} locked={locked}/>
            : <AdvancedGroupCard key={gk} groupKey={gk} matchResults={data.matchResults} onUpdateMatch={onUpdateMatch} scoreMode={scoreMode} locked={locked}/>
        )}
      </div>
      {!locked && groupMode === 'simple' && !allTop2Done && <p className="build-hint">Select top 2 from every group to unlock the knockout stage.</p>}
      {!locked && groupMode === 'simple' && allTop2Done && best3Count < 8 && <p className="build-hint">{best3Count}/8 best 3rd-place teams. Pick {8-best3Count} more.</p>}
      {!locked && <button className={`build-btn ${canBuild?'active':'disabled'}`} onClick={()=>canBuild&&handleBuild()}>Build knockout bracket →</button>}
    </div>
  );
}

// ─── Knockout Stage ────────────────────────────────────────────────────────────

function KnockoutStage({ knockout, onUpdate, lockedRounds, onPenalty, scoreMode, isPenaltyActive }) {
  const ko = knockout;

  const updateScore = (roundKey, matchIdx, val) => {
    const scoreKey = `${roundKey}-${matchIdx}`;
    const newScores = { ...(ko.koScores || {}), [scoreKey]: val };
    onUpdate({ ...ko, koScores: newScores });
  };

  // advanceTeam: matchIdx is the MATCH number (0-15 for R32), not the slot index
  // The winner slot for match i is ko[roundKey][i] — the winner advances, stored as one team per match
  const advanceTeam = (roundKey, matchIdx, team) => {
    const isLocked = lockedRounds && lockedRounds.has(roundKey);
    if (isLocked) return;
    const prev = ko[roundKey][matchIdx];
    if (isPenaltyActive && prev !== 'TBD' && prev !== team && onPenalty) onPenalty();
    const arr = [...ko[roundKey]];
    arr[matchIdx] = team;
    onUpdate({ ...ko, [roundKey]: arr });
  };

  const advSF = (mi, team) => {
    if (lockedRounds?.has('sf')) return;
    const prev = ko.sf[mi];
    if (isPenaltyActive && prev !== 'TBD' && prev !== team && onPenalty) onPenalty();
    const sf = [...ko.sf]; sf[mi] = team;
    const other = mi % 2 === 0 ? mi + 1 : mi - 1;
    const loser = [ko.sf[mi], ko.sf[other]].find(x => x !== team && x !== 'TBD') || 'TBD';
    const slot = mi < 2 ? 0 : 1;
    const final = [...ko.final]; final[slot] = team;
    const third = [...ko.third]; third[slot] = loser;
    onUpdate({ ...ko, sf, final, third });
  };

  const advFinal = (team) => {
    if (lockedRounds?.has('final')) return;
    const prev = ko.winner;
    if (isPenaltyActive && prev !== 'TBD' && prev !== team && onPenalty) onPenalty();
    onUpdate({ ...ko, winner: team });
  };

  const advThird = (team) => {
    const prev = ko.thirdPlace;
    if (isPenaltyActive && prev !== 'TBD' && prev !== team && onPenalty) onPenalty();
    onUpdate({ ...ko, thirdPlace: team });
  };

  const isRoundLocked = (key) => lockedRounds?.has(key) || false;
  const getScore = (roundKey, matchIdx) => (ko.koScores || {})[`${roundKey}-${matchIdx}`];

  const matchH = scoreMode ? 100 : 80;
  const gap0 = 6;
  const gap1 = (matchH+gap0)*2-matchH, gap2 = (matchH+gap1)*2-matchH, gap3 = (matchH+gap2)*2-matchH;
  const mt1 = (matchH+gap0)/2, mt2 = mt1+(matchH+gap1)/2, mt3 = mt2+(matchH+gap2)/2, mt4 = mt3+(matchH+gap3)/2;

  const renderCol = (label, matches, marginTop) => (
    <div className="ko-col">
      <div className="ko-col-label">{label}</div>
      <div className="ko-col-matches" style={{marginTop}}>
        {matches.map((m,i) => <div key={i}>{i>0&&<div style={{height:m.gap}}/>}{m.node}</div>)}
      </div>
    </div>
  );

  // mi = match index; teamA = ko[round][mi*2], teamB = ko[round][mi*2+1]
  // winner stored at ko[round][mi] — but wait, the r16 advancers array has 16 slots for 16 matches
  // Each match i: teamA = r32[i*2], teamB = r32[i*2+1], winner stored at r16[i]
  const mkR32 = (s) => Array.from({length:8},(_,i) => {
    const mi=s*8+i; const lk=isRoundLocked('r32');
    return { node:<MatchSlot teamA={ko.r32[mi*2]} teamB={ko.r32[mi*2+1]} label={`R32 ${mi+1}`}
      onSelectWinner={t=>advanceTeam('r16',mi,t)} locked={lk}
      scoreMode={scoreMode} score={getScore('r32',mi)} onScoreChange={v=>updateScore('r32',mi,v)}/>, gap:gap0 };
  });
  const mkR16 = (s) => Array.from({length:4},(_,i) => {
    const mi=s*4+i; const lk=isRoundLocked('r16');
    return { node:<MatchSlot teamA={ko.r16[mi*2]} teamB={ko.r16[mi*2+1]} label={`R16 ${mi+1}`}
      onSelectWinner={t=>advanceTeam('qf',mi,t)} locked={lk}
      scoreMode={scoreMode} score={getScore('r16',mi)} onScoreChange={v=>updateScore('r16',mi,v)}/>, gap:gap1 };
  });
  const mkQF = (s) => Array.from({length:2},(_,i) => {
    const mi=s*2+i; const lk=isRoundLocked('qf');
    return { node:<MatchSlot teamA={ko.qf[mi*2]} teamB={ko.qf[mi*2+1]} label={`QF ${mi+1}`}
      onSelectWinner={t=>advanceTeam('sf',mi,t)} locked={lk}
      scoreMode={scoreMode} score={getScore('qf',mi)} onScoreChange={v=>updateScore('qf',mi,v)}/>, gap:gap2 };
  });
  const mkSF = (s) => [{
    node:<MatchSlot teamA={ko.sf[s*2]} teamB={ko.sf[s*2+1]} label={`SF ${s+1}`}
      onSelectWinner={t=>advSF(s*2,t)} locked={isRoundLocked('sf')}
      scoreMode={scoreMode} score={getScore('sf',s)} onScoreChange={v=>updateScore('sf',s,v)}/>, gap:0 }];

  // Build all matches for a given round as a flat list — unused but kept for future use

  const ROUND_DEFS = [
    { key: 'r32',   label: 'R32',   fullLabel: 'Round of 32',    left: mkR32(0), right: mkR32(1) },
    { key: 'r16',   label: 'R16',   fullLabel: 'Round of 16',    left: mkR16(0), right: mkR16(1) },
    { key: 'qf',    label: 'QF',    fullLabel: 'Quarter-finals', left: mkQF(0),  right: mkQF(1)  },
    { key: 'sf',    label: 'SF',    fullLabel: 'Semi-finals',    left: mkSF(0),  right: mkSF(1)  },
    { key: 'final', label: 'Final', fullLabel: 'Final & 3rd',    left: [],       right: []        },
  ];

  const [mobileRound, setMobileRound] = useState('r32');
  const mobileRoundDef = ROUND_DEFS.find(r => r.key === mobileRound);
  const mobileMatches = mobileRoundDef?.key === 'final' ? [] : [...(mobileRoundDef?.left||[]), ...(mobileRoundDef?.right||[])];

  return (
    <div>
      <p className="ko-hint">Click a team to advance them. SF losers auto-fill the 3rd place playoff.{lockedRounds?.size > 0 && ' 🔒 Locked rounds shown in grey.'}</p>

      {/* Desktop: full side-by-side bracket */}
      <div className="ko-desktop">
        <div className="ko-scroll">
          <div className="ko-bracket">
            {renderCol('Round of 32', mkR32(0), 0)}
            {renderCol('Round of 16', mkR16(0), mt1)}
            {renderCol('Quarter-finals', mkQF(0), mt2)}
            {renderCol('Semi-finals', mkSF(0), mt3)}
            <div className="ko-col ko-centre">
              <div style={{height:mt4}}/>
              <div className="ko-col-label">Final</div>
              <MatchSlot teamA={ko.final[0]} teamB={ko.final[1]} label="🏆 Final" onSelectWinner={advFinal} locked={isRoundLocked('final')}
                scoreMode={scoreMode} score={getScore('final',0)} onScoreChange={v=>updateScore('final',0,v)}/>
              <div className="champion-box">
                <div className="champ-trophy">🏆</div>
                <div className="champ-label">CHAMPION</div>
                <div className="champ-team">{ko.winner==='TBD'?<em>TBD</em>:ko.winner}</div>
              </div>
              <div style={{height:20}}/>
              <div className="ko-col-label third-label">3rd Place</div>
              <MatchSlot teamA={ko.third[0]} teamB={ko.third[1]} label="🥉 3rd place" onSelectWinner={advThird}
                scoreMode={scoreMode} score={getScore('third',0)} onScoreChange={v=>updateScore('third',0,v)}/>
              {ko.thirdPlace !== 'TBD' && (
                <div className="third-box">
                  <div className="champ-trophy">🥉</div>
                  <div className="champ-label">3RD PLACE</div>
                  <div className="champ-team">{ko.thirdPlace}</div>
                </div>
              )}
            </div>
            {renderCol('Semi-finals', mkSF(1), mt3)}
            {renderCol('Quarter-finals', mkQF(1), mt2)}
            {renderCol('Round of 16', mkR16(1), mt1)}
            {renderCol('Round of 32', mkR32(1), 0)}
          </div>
        </div>
      </div>

      {/* Mobile: round-by-round view */}
      <div className="ko-mobile">
        <div className="mobile-round-nav">
          {ROUND_DEFS.map(r => (
            <button key={r.key}
              className={`mobile-round-btn ${mobileRound === r.key ? 'active' : ''} ${isRoundLocked(r.key) ? 'locked' : ''}`}
              onClick={() => setMobileRound(r.key)}>
              {r.label}{isRoundLocked(r.key) ? ' 🔒' : ''}
            </button>
          ))}
        </div>
        <div className="mobile-round-title">{mobileRoundDef?.fullLabel}</div>
        {mobileRound === 'final' ? (
          <div className="mobile-final-grid">
            <div>
              <div className="ko-col-label" style={{textAlign:'left',marginBottom:8}}>🏆 Final</div>
              <MatchSlot teamA={ko.final[0]} teamB={ko.final[1]} label="🏆 Final" onSelectWinner={advFinal} locked={isRoundLocked('final')}
                scoreMode={scoreMode} score={getScore('final',0)} onScoreChange={v=>updateScore('final',0,v)}/>
              {ko.winner !== 'TBD' && (
                <div className="champion-box" style={{marginTop:10}}>
                  <div className="champ-trophy">🏆</div>
                  <div className="champ-label">CHAMPION</div>
                  <div className="champ-team">{ko.winner}</div>
                </div>
              )}
            </div>
            <div>
              <div className="ko-col-label third-label" style={{textAlign:'left',marginBottom:8}}>🥉 3rd Place</div>
              <MatchSlot teamA={ko.third[0]} teamB={ko.third[1]} label="🥉 3rd place" onSelectWinner={advThird}
                scoreMode={scoreMode} score={getScore('third',0)} onScoreChange={v=>updateScore('third',0,v)}/>
              {ko.thirdPlace !== 'TBD' && (
                <div className="third-box" style={{marginTop:10}}>
                  <div className="champ-trophy">🥉</div>
                  <div className="champ-label">3RD PLACE</div>
                  <div className="champ-team">{ko.thirdPlace}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mobile-matches-grid">
            {mobileMatches.map((m, i) => <div key={i}>{m.node}</div>)}
          </div>
        )}
      </div>

      {(ko.winner !== 'TBD' || ko.thirdPlace !== 'TBD') && (
        <div className="result-banner">
          {ko.winner !== 'TBD' && <div className="result-item"><span>🏆</span><div><div className="result-label">CHAMPION</div><div className="result-team">{ko.winner}</div></div></div>}
          {ko.thirdPlace !== 'TBD' && <div className="result-item"><span>🥉</span><div><div className="result-label">3RD PLACE</div><div className="result-team">{ko.thirdPlace}</div></div></div>}
        </div>
      )}
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Load saved state from localStorage on first render ──
  const saved = loadFromStorage();

  const [activeTab, setActiveTab]           = useState('prediction');
  const [section, setSection]               = useState('groups');
  const [showComparison, setShowComparison] = useState(false);
  const [showLiveFetch, setShowLiveFetch]   = useState(false);

  const [prediction, setPrediction]         = useState(saved?.prediction     || emptyData());
  const [actual, setActual]                 = useState(saved?.actual          || emptyData());
  const [predGroupMode, setPredGroupMode]   = useState(saved?.predGroupMode  || 'simple');
  const [actGroupMode,  setActGroupMode]    = useState(saved?.actGroupMode   || 'simple');
  const [predScoreMode, setPredScoreMode]   = useState(saved?.predScoreMode  || false);
  const [actScoreMode,  setActScoreMode]    = useState(saved?.actScoreMode   || false);
  const [lockState, setLockState]           = useState(saved?.lockState      || emptyLockState());

  // ── Save to localStorage whenever any persistent state changes ──
  useEffect(() => {
    saveToStorage({ prediction, actual, lockState, predGroupMode, actGroupMode, predScoreMode, actScoreMode });
  }, [prediction, actual, lockState, predGroupMode, actGroupMode, predScoreMode, actScoreMode]);

  // Live tournament phase from schedule — re-evaluates every 30 seconds
  const { phase: currentPhase, lockedStages, now: phaseNow } = useTournamentPhase();

  const data      = activeTab === 'prediction' ? prediction      : actual;
  const setData   = activeTab === 'prediction' ? setPrediction   : setActual;
  const groupMode = activeTab === 'prediction' ? predGroupMode   : actGroupMode;
  const setGMode  = activeTab === 'prediction' ? setPredGroupMode : setActGroupMode;
  const scoreMode = activeTab === 'prediction' ? predScoreMode   : actScoreMode;
  const setSMode  = activeTab === 'prediction' ? setPredScoreMode : setActScoreMode;

  // Is a given stage editable right now on the prediction tab?
  const isStageEditable = (stage) => {
    if (activeTab !== 'prediction') return true;
    const tp = getTournamentPhase(phaseNow); // use hook's tracked time, not raw Date()
    if (tp.phase === 'pre') return !lockState.userLocked;
    if (tp.phase === 'running') return false;
    if (tp.phase === 'window') return stage === tp.nextStage;
    if (tp.phase === 'complete') return false;
    return false;
  };

  const groupEditable    = isStageEditable('groups');
  const koEditableStages = new Set(STAGE_ORDER.filter(s => isStageEditable(s)));
  // Invert: locked rounds = rounds that are NOT editable
  const koLockedRounds = new Set(STAGE_ORDER.filter(s => !koEditableStages.has(s)));

  const setQualifiers = (gk, teams) => setData(prev => ({ ...prev, qualifiers: { ...prev.qualifiers, [gk]: teams } }));
  const updateMatch   = (gk, idx, res) => setData(prev => ({ ...prev, matchResults: { ...prev.matchResults, [gk]: { ...(prev.matchResults[gk] || {}), [idx]: res } } }));
  const buildKnockout = (r32) => { setData(prev => ({ ...prev, knockout: { ...emptyKO(), r32 } })); setSection('knockout'); };
  const updateKnockout = (ko) => setData(prev => ({ ...prev, knockout: ko }));

  // Penalty: called when user changes a KO pick (only during free-edit window, fill-from-actual)
  const handlePenalty = () => setLockState(prev => ({ ...prev, penaltyPoints: prev.penaltyPoints + 1 }));

  // User manually locks/unlocks (pre-tournament only)
  const handleUserLock = (locked) => setLockState(prev => ({ ...prev, userLocked: locked }));

  // Fill prediction KO bracket from actual results for the given stage — 1pt per change
  const handleFillFromActual = (stage) => {
    if (!stage || !actual.knockout[stage]) return;
    const actualSlots = actual.knockout[stage];
    const predSlots   = prediction.knockout[stage] || [];
    let penalties = 0;
    const newSlots = actualSlots.map((team, i) => {
      if (team !== 'TBD' && predSlots[i] !== team) { penalties++; return team; }
      return predSlots[i] || 'TBD';
    });
    setPrediction(prev => ({ ...prev, knockout: { ...prev.knockout, [stage]: newSlots } }));
    if (penalties > 0) setLockState(prev => ({ ...prev, penaltyPoints: prev.penaltyPoints + penalties }));
  };

  // Apply fetched live results to actual tab
  const handleApplyLiveResults = useCallback((groups) => {
    setActual(prev => {
      const newMR = { ...prev.matchResults };
      Object.entries(groups).forEach(([gk, matches]) => {
        if (!GROUPS[gk]) return;
        const existing = { ...(newMR[gk] || {}) };
        const gMatches = groupMatches(GROUPS[gk]);
        matches.forEach((m) => {
          const idx = gMatches.findIndex(([h, a]) =>
            h.toLowerCase().includes((m.home||'').toLowerCase().split(' ')[0]) ||
            a.toLowerCase().includes((m.away||'').toLowerCase().split(' ')[0])
          );
          if (idx >= 0 && m.homeGoals !== '' && m.awayGoals !== '') {
            existing[idx] = { homeGoals: String(m.homeGoals), awayGoals: String(m.awayGoals) };
          }
        });
        newMR[gk] = existing;
      });
      return { ...prev, matchResults: newMR };
    });
  }, []);

  return (
    <div className="app">
      <div className="hero">
        <span className="hero-icon">⚽</span>
        <div style={{flex:1}}>
          <div className="hero-title">FIFA World Cup 2026</div>
          <div className="hero-sub">48 teams · 12 groups · R32 → R16 → QF → SF → Final + 3rd place</div>
        </div>
        <button className="clear-data-btn" title="Clear all saved data and start fresh"
          onClick={() => {
            if (window.confirm('Clear all your predictions and results? This cannot be undone.')) {
              localStorage.removeItem(STORAGE_KEY);
              setPrediction(emptyData()); setActual(emptyData());
              setLockState(emptyLockState());
              setPredGroupMode('simple'); setActGroupMode('simple');
              setPredScoreMode(false); setActScoreMode(false);
            }
          }}>
          🗑 Reset
        </button>
      </div>

      {/* Tab row */}
      <div className="tab-row">
        {[{ id: 'prediction', label: '🔮 My Prediction', color: '#1a3c5e' }, { id: 'actual', label: '📺 Actual Results', color: '#6b1a1a' }].map(t => (
          <button key={t.id} className="tab-btn"
            style={{ background: activeTab === t.id ? t.color : '#fff', color: activeTab === t.id ? '#fff' : '#666' }}
            onClick={() => { setActiveTab(t.id); setShowComparison(false); setShowLiveFetch(false); }}>
            {t.label}
          </button>
        ))}
        {activeTab === 'actual' && (
          <>
            <button className="tab-btn live-toggle-btn"
              style={{ background: showLiveFetch ? '#1a5c1a' : '#fff', color: showLiveFetch ? '#fff' : '#1a5c1a', borderColor: '#1a5c1a' }}
              onClick={() => { setShowLiveFetch(v => !v); setShowComparison(false); }}>
              {showLiveFetch ? '▲ Hide live fetch' : '📡 Live fetch'}
            </button>
            <button className="tab-btn compare-btn"
              style={{ marginLeft: 'auto', background: showComparison ? '#2d6a2d' : '#fff', color: showComparison ? '#fff' : '#2d6a2d', borderColor: '#2d6a2d' }}
              onClick={() => { setShowComparison(v => !v); setShowLiveFetch(false); }}>
              {showComparison ? '▲ Hide analysis' : '📊 Compare predictions'}
            </button>
          </>
        )}
      </div>

      {/* Tournament status banner — prediction tab only */}
      {activeTab === 'prediction' && (
        <TournamentStatusBanner
          tournPhase={currentPhase}
          lockedStages={lockedStages}
          lockState={lockState}
          onUserLock={handleUserLock}
          onFillFromActual={handleFillFromActual}
          penaltyPoints={lockState.penaltyPoints}
        />
      )}

      {/* Live fetch panel */}
      {activeTab === 'actual' && showLiveFetch && <LiveFetchPanel onApplyResults={handleApplyLiveResults} />}

      {/* Comparison panel */}
      {activeTab === 'actual' && showComparison && (
        <ComparisonPanel
          prediction={prediction} actual={actual}
          predGroupMode={predGroupMode} actGroupMode={actGroupMode}
          penaltyPoints={lockState.penaltyPoints}
        />
      )}

      {/* Scoring guide — prediction tab only */}
      {activeTab === 'prediction' && !showComparison && !showLiveFetch && <ScoringGuide />}

      {/* Main content */}
      {!showComparison && !showLiveFetch && (
        <>
          <div className="section-nav-row">
            <div className="section-nav">
              {[{ id: 'groups', label: 'Group Stage' }, { id: 'knockout', label: 'Knockout Stage' }].map(s => (
                <button key={s.id} className={`section-btn ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>{s.label}</button>
              ))}
            </div>
            {/* Global mode toggles — Simple/Advanced applies to groups, Scores applies to both */}
            <div style={{ display: 'flex', gap: 6 }}>
              {section === 'groups' && (
                <div className="mode-toggle">
                  <button className={`toggle-btn ${groupMode === 'simple' ? 'active' : ''}`} onClick={() => setGMode('simple')}>Simple</button>
                  <button className={`toggle-btn ${groupMode === 'advanced' ? 'active' : ''}`} onClick={() => setGMode('advanced')}>Advanced</button>
                </div>
              )}
              {(section === 'knockout' || groupMode === 'advanced') && (
                <div className="mode-toggle">
                  <button className={`toggle-btn ${!scoreMode ? 'active' : ''}`} onClick={() => setSMode(false)}>W / D / L</button>
                  <button className={`toggle-btn ${scoreMode ? 'active' : ''}`} onClick={() => setSMode(true)}>Scores</button>
                </div>
              )}
            </div>
          </div>
          <div className="content">
            {section === 'groups' && (
              <GroupStage data={data} onSetQualifiers={setQualifiers} onUpdateMatch={updateMatch}
                onBuildKnockout={buildKnockout} groupMode={groupMode} scoreMode={scoreMode}
                locked={activeTab === 'prediction' && !groupEditable} />
            )}
            {section === 'knockout' && (
              <KnockoutStage knockout={data.knockout} onUpdate={updateKnockout}
                lockedRounds={activeTab === 'prediction' ? koLockedRounds : new Set()}
                onPenalty={activeTab === 'prediction' ? handlePenalty : null}
                isPenaltyActive={activeTab === 'prediction' && currentPhase.phase === 'window'}
                scoreMode={scoreMode} />
            )}
          </div>
        </>
      )}
    </div>
  );
}