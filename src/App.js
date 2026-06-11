import { useState, useEffect, useCallback } from 'react';
import './App.css';
import THIRD_PLACE_MAP from './thirdPlaceMap';

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

// ─── Stage locking by schedule ─────────────────────────────────────────────────

// isPredictionStageLocked and isActualStageLocked use STAGE_ORDER

function isPredictionStageLocked(stage, now) {
  if (now < SCHEDULE.groups.start) return false;

  const stageIdx = STAGE_ORDER.indexOf(stage);
  if (stageIdx < 0) return true;

  const s = SCHEDULE[stage];
  if (!s) return true;

  if (now >= s.start) return true;

  if (stageIdx === 0) return false;

  const prevKey = STAGE_ORDER[stageIdx - 1];
  const prev = SCHEDULE[prevKey];
  if (!prev) return true;

  if (now >= prev.end && now < s.start) return false;

  return true;
}

function isActualStageLocked(stage, now, confirmedStages) {
  // Before tournament: all actual results locked
  if (now < SCHEDULE.groups.start) return true;

  const s = SCHEDULE[stage];
  if (!s) return true;

  // Before stage starts: locked
  if (now < s.start) return true;

  // After confirmed: locked permanently
  if (confirmedStages?.has(stage)) return true;

  // During or after stage window: editable
  return false;
}

// Bump this number whenever the shape of saved data changes in a breaking way.
// The migrate() function below must handle upgrading from all previous versions.
const SAVE_VERSION = 3;
const STORAGE_KEY = 'wc2026_save';

// Deep-merge defaults into a loaded object so new fields added in updates
// are always present, even if the saved data predates them.
function applyDefaults(loaded, defaults) {
  // Primitive or array — return loaded value as-is if it exists (including 0, false, '')
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
    return (loaded !== null && loaded !== undefined) ? loaded : defaults;
  }
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
  // v2 → v3: 3rd-place bracket assignment logic changed to use official FIFA 495 table.
  // Reset the entire knockout bracket back to default slot labels so users rebuild cleanly.
  // We always reset here since the old assignment was incorrect — any KO picks based on
  // wrong 3rd-place placements would be meaningless anyway.
  if ((data.version || 0) < 3) {
    const freshKO = () => ({ ...emptyKO() }); // r32 pre-filled with R32_SLOTS labels
    data = {
      ...data,
      prediction: { ...data.prediction, knockout: freshKO() },
      actual:     { ...data.actual,     knockout: freshKO() },
      version: 3,
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
      predGroupMode:  'advanced',
      actGroupMode:   'advanced',
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
    // Use Number() instead of parseInt() so '0' and 0 both parse correctly
    // Also check the raw value isn't an empty string before parsing
    const hgRaw = res.homeGoals, agRaw = res.awayGoals;
    // Only count if BOTH scores are explicitly set (not empty string, null or undefined)
    const hgValid = hgRaw !== '' && hgRaw !== null && hgRaw !== undefined;
    const agValid = agRaw !== '' && agRaw !== null && agRaw !== undefined;
    const hg = hgValid ? Number(hgRaw) : NaN;
    const ag = agValid ? Number(agRaw) : NaN;
    const hasScores = hgValid && agValid && !isNaN(hg) && !isNaN(ag);
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
  const hgRaw = res.homeGoals, agRaw = res.awayGoals;
  const hg = (hgRaw !== '' && hgRaw !== null && hgRaw !== undefined) ? Number(hgRaw) : NaN;
  const ag = (agRaw !== '' && agRaw !== null && agRaw !== undefined) ? Number(agRaw) : NaN;
  if (!isNaN(hg) && !isNaN(ag)) {
    return { outcome: hg > ag ? 'home' : hg < ag ? 'away' : 'draw', hg, ag };
  }
  return { outcome: res.result || '', hg: null, ag: null };
}

function buildComparison(prediction, actual, advancedMatchMode, penaltyPoints, lockedPredictions) {
  const items = [];
  let totalEarned = 0, totalPossible = 0;

  const add = (item) => { items.push(item); totalEarned += item.earned; totalPossible += item.possible; };

  GROUP_KEYS.forEach((gk) => {
    const predIsSimple   = !!(prediction.qualifiers[gk]?.length > 0);
    const actualIsSimple = !!(actual.qualifiers[gk]?.length > 0);
    const predOrder   = predIsSimple   ? prediction.qualifiers[gk]   : calcStandings(gk, prediction.matchResults[gk]).map(t => t.name);
    const actualOrder = actualIsSimple ? actual.qualifiers[gk]       : calcStandings(gk, actual.matchResults[gk]).map(t => t.name);

    // Count complete matches in this group
    const completeMatchCount = Object.values(actual.matchResults[gk] || {}).filter(r => {
      if (!r) return false;
      const hg = r.homeGoals, ag = r.awayGoals;
      const bothScores = hg !== '' && hg !== null && hg !== undefined &&
                         ag !== '' && ag !== null && ag !== undefined &&
                         !isNaN(Number(hg)) && !isNaN(Number(ag));
      return bothScores || !!r.result;
    }).length;

    // Group positions only compared when actual side has ALL 6 matches complete (advanced)
    // or at least 2 qualifiers selected (simple)
    const actualGroupComplete = actualIsSimple
      ? (actual.qualifiers[gk]?.length >= 3) // 3 clicked = 4th is implicit
      : completeMatchCount >= 6;

    if (!actualGroupComplete) {
      // Still process match results below even if group not complete
    } else {
      // Compare group positions for all 4 teams
      GROUPS[gk].forEach((team) => {
        const pp = predOrder.indexOf(team);
        const ap = actualOrder.indexOf(team);
        // If team not ranked in simple mode, treat as last place
        const predPos = pp >= 0 ? pp : GROUPS[gk].length - 1;
        const actPos  = ap >= 0 ? ap : GROUPS[gk].length - 1;
        const correct = predPos === actPos;
        add({ category: 'Group Position', group: gk, description: `${team} — predicted ${predPos+1}${ord(predPos+1)}, actual ${actPos+1}${ord(actPos+1)}`, correct, earned: correct ? 1 : 0, possible: 1 });
      });
    }

    if (!predIsSimple && !actualIsSimple) {
      groupMatches(GROUPS[gk]).forEach(([home, away], i) => {
        const p = getOutcome((prediction.matchResults[gk] || {})[i]);
        const a = getOutcome((actual.matchResults[gk]     || {})[i]);
        // Only score if both sides have a complete result
        if (!p.outcome || !a.outcome) return;
        // For scores mode, require both sides to have numeric scores entered
        if (advancedMatchMode === 'score') {
          if (p.hg === null || a.hg === null) return;
        }
        const exact = p.outcome === a.outcome && p.hg === a.hg && p.ag === a.ag && p.hg !== null;
        const match = p.outcome === a.outcome;
        const lbl   = { home: `${home} win`, away: `${away} win`, draw: 'Draw' };
        const sstr  = (r) => r.hg !== null ? `${r.hg}–${r.ag}` : r.outcome;

        if (advancedMatchMode === 'score') {
          const earned   = match ? (exact ? 4 : 1) : 0;
          const possible = 4;
          add({
            category: 'Match Result', group: gk,
            description: `${home} vs ${away} — predicted ${sstr(p)}, actual ${sstr(a)}`,
            correct: match, exactMatch: exact, earned, possible,
          });
        } else {
          add({
            category: 'Match Result', group: gk,
            description: `${home} vs ${away} — predicted ${lbl[p.outcome]||p.outcome}, actual ${lbl[a.outcome]||a.outcome}`,
            correct: match, exactMatch: exact, earned: match ? 1 : 0, possible: 1,
          });
        }
      });
    }
  });

  // KO round winner mapping: winners of each round are stored in the NEXT round's array
  const WINNER_ARRAY = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final' };

  KO_ROUNDS.forEach(({ key, label, matchCount }) => {
    const winnerKey = WINNER_ARRAY[key];
    if (!winnerKey) return;

    // Use locked prediction snapshot if available, otherwise current prediction
    const lockedSnap = lockedPredictions?.get(key);
    const predWinners = lockedSnap || prediction.knockout[winnerKey] || [];

    for (let i = 0; i < matchCount; i++) {
      const pw = predWinners[i];
      const aw = (actual.knockout[winnerKey] || [])[i];

      // Skip if either side is TBD or still a slot label (not a real team yet)
      if (!pw || !aw || isSlotLabel(pw) || isSlotLabel(aw)) continue;
      const correct = pw === aw;

      // Score bonus — use prediction scores; fall back to actual scores if pred not entered
      const scoreKey = `${key}-${i}`;
      const ps = (prediction.knockout.koScores || {})[scoreKey] || (actual.knockout.koScores || {})[scoreKey];
      const as = (actual.knockout.koScores || {})[scoreKey];
      const phRaw = ps?.h, paRaw = ps?.a, ahRaw = as?.h, aaRaw = as?.a;
      const phV = (phRaw !== '' && phRaw !== null && phRaw !== undefined) ? Number(phRaw) : NaN;
      const paV = (paRaw !== '' && paRaw !== null && paRaw !== undefined) ? Number(paRaw) : NaN;
      const ahV = (ahRaw !== '' && ahRaw !== null && ahRaw !== undefined) ? Number(ahRaw) : NaN;
      const aaV = (aaRaw !== '' && aaRaw !== null && aaRaw !== undefined) ? Number(aaRaw) : NaN;
      // Only award score bonus if prediction had its OWN score (not just copying actual)
      const predHadOwnScore = !!((prediction.knockout.koScores || {})[scoreKey]);
      const hasScores = predHadOwnScore && !isNaN(phV) && !isNaN(paV) && !isNaN(ahV) && !isNaN(aaV);
      const exactScore = hasScores && phV === ahV && paV === aaV;

      if (advancedMatchMode === 'score' && hasScores) {
        add({
          category: label, group: null,
          description: `Predicted ${pw} (${phV}–${paV}) — actual: ${aw} (${ahV}–${aaV})`,
          correct, exactMatch: exactScore,
          earned: correct ? (exactScore ? 4 : 1) : 0, possible: 4,
        });
      } else {
        add({
          category: label, group: null,
          description: `Predicted ${pw} to advance — actual: ${aw}`,
          correct, earned: correct ? 1 : 0, possible: 1,
        });
      }
    }
  });

  // Final and 3rd place — use locked 'sf' snapshot for winner/thirdPlace if available
  const lockedSFSnap = lockedPredictions?.get('sf');
  const predWinner = lockedSFSnap?.[0] !== undefined
    ? (lockedPredictions?.get('final')?.[0] || prediction.knockout.winner)
    : prediction.knockout.winner;
  const predThird = prediction.knockout.thirdPlace;

  if (predWinner !== 'TBD' && actual.knockout.winner !== 'TBD' &&
      !isSlotLabel(predWinner) && !isSlotLabel(actual.knockout.winner)) {
    const correct = predWinner === actual.knockout.winner;
    // Check for final score bonus
    const fps = (prediction.knockout.koScores || {})['final-0'];
    const fas = (actual.knockout.koScores     || {})['final-0'];
    const fph = fps?.h !== '' && fps?.h != null ? Number(fps.h) : NaN;
    const fpa = fps?.a !== '' && fps?.a != null ? Number(fps.a) : NaN;
    const fah = fas?.h !== '' && fas?.h != null ? Number(fas.h) : NaN;
    const faa = fas?.a !== '' && fas?.a != null ? Number(fas.a) : NaN;
    const fHasScores = !isNaN(fph) && !isNaN(fpa) && !isNaN(fah) && !isNaN(faa);
    const fExact = fHasScores && fph === fah && fpa === faa;
    if (advancedMatchMode === 'score' && fHasScores) {
      add({ category: 'Champion', group: null, description: `Predicted ${predWinner} (${fph}–${fpa}), actual ${actual.knockout.winner} (${fah}–${faa})`, correct, exactMatch: fExact, earned: correct ? (fExact ? 4 : 1) : 0, possible: 4 });
    } else {
      add({ category: 'Champion', group: null, description: `Predicted ${predWinner}, actual ${actual.knockout.winner}`, correct, earned: correct ? 1 : 0, possible: 1 });
    }
  }
  if (predThird !== 'TBD' && actual.knockout.thirdPlace !== 'TBD' &&
      !isSlotLabel(predThird) && !isSlotLabel(actual.knockout.thirdPlace)) {
    const correct = predThird === actual.knockout.thirdPlace;
    add({ category: '3rd Place', group: null, description: `Predicted ${predThird}, actual ${actual.knockout.thirdPlace}`, correct, earned: correct ? 1 : 0, possible: 1 });
  }

  // Deduct penalty points for post-lock changes
  const penalty = penaltyPoints || 0;
  return { items, totalEarned: totalEarned - penalty, totalPossible, penaltyDeducted: penalty };
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
            <div className="sg-heading">🏟️ Group Stage</div>
            <div className="sg-rows">
              <div className="sg-row"><span className="sg-pts">1pt</span><span>Correct position for each team in the group table (1st, 2nd, 3rd or 4th)</span></div>
              <div className="sg-row"><span className="sg-pts">+1pt</span><span>Correct match outcome (W / D / L) per game — W/D/L and Scores modes</span></div>
              <div className="sg-row"><span className="sg-pts sg-bonus">+3pts</span><span>Correct exact score — stacks with the +1pt outcome point (4pts total for a perfect score) — Scores mode only</span></div>
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

const ALL_CATEGORIES = ['Group Position', 'Match Result', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Champion', 'Runner-up', '3rd Place'];

function ComparisonPanel({ prediction, actual, predGroupMode, actGroupMode, penaltyPoints, scoreMode, lockedPredictions }) {
  const [displayMode, setDisplayMode]       = useState('points');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterResult, setFilterResult]     = useState('All');
  const [filterGroup, setFilterGroup]       = useState('All');

  const matchMode = scoreMode ? 'score' : 'wdl';
  const { items, totalEarned: rawEarned, totalPossible } = buildComparison(prediction, actual, matchMode, 0, lockedPredictions);
  const penaltyDeducted = penaltyPoints || 0;
  const totalEarned = rawEarned - penaltyDeducted;
  const presentCategories = ALL_CATEGORIES.filter(c => items.some(i => i.category === c));

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
            {predGroupMode === 'advanced' && actGroupMode === 'advanced' && <> · {matchMode === 'wdl' ? '+1pt W/D/L' : '+3pts exact score'}</>}
            {penaltyDeducted > 0 && <span className="penalty-note"> · −{penaltyDeducted}pts late-change penalty</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
                {presentCategories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
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
  team === undefined ||
  team === null ||
  team === '' ||
  team === 'TBD' ||
  (typeof team === 'string' && (
    team.startsWith('Winner Group') ||
    team.startsWith('Runner-up Group') ||
    team.startsWith('3rd Group')
  ));

function MatchSlot({ teamA, teamB, label, onSelectWinner, locked, scoreMode, score, onScoreChange }) {
  // Use local state for score inputs to prevent re-render losing focus mid-type
  const [localH, setLocalH] = useState(score?.h ?? '');
  const [localA, setLocalA] = useState(score?.a ?? '');

  // Sync local state when score prop changes from outside (e.g. auto-fill)
  useEffect(() => { setLocalH(score?.h ?? ''); }, [score?.h]);
  useEffect(() => { setLocalA(score?.a ?? ''); }, [score?.a]);

  const commitScore = (h, a) => {
    if (!onScoreChange) return;
    const newScore = { ...(score||{}), h, a };
    onScoreChange(newScore);
    // Auto-advance winner once both scores committed and unambiguous
    if (onSelectWinner && !locked) {
      const hNum = Number(h), aNum = Number(a);
      const hOk = h !== '' && !isNaN(hNum);
      const aOk = a !== '' && !isNaN(aNum);
      if (hOk && aOk && hNum !== aNum) {
        const winner = hNum > aNum ? teamA : teamB;
        if (winner && !isSlotLabel(winner)) onSelectWinner(winner);
      }
    }
  };

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
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            className="score-input" disabled={locked}
            value={localH} placeholder="0"
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
              setLocalH(v);
              // Commit immediately if away score already filled
              if (localA !== '' && v !== '') commitScore(v, localA);
            }}
            onBlur={() => commitScore(localH, localA)}
            onKeyDown={e => e.key === 'Enter' && commitScore(localH, localA)}
          />
          <span className="score-sep">–</span>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            className="score-input" disabled={locked}
            value={localA} placeholder="0"
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
              setLocalA(v);
              // Commit immediately if home score already filled
              if (localH !== '' && v !== '') commitScore(localH, v);
            }}
            onBlur={() => commitScore(localH, localA)}
            onKeyDown={e => e.key === 'Enter' && commitScore(localH, localA)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Group Stage — Simple Mode ────────────────────────────────────────────────

function SimpleGroupCard({ groupKey, qualifiers, onToggle, locked }) {
  const teams = GROUPS[groupKey];
  const q = qualifiers[groupKey] || [];

  const allThirds = GROUP_KEYS.map(gk => qualifiers[gk]?.[2]).filter(Boolean);
  const thisThird = q[2];
  const thirdRank = thisThird ? allThirds.indexOf(thisThird) : -1;
  const thirdQualifies = thirdRank >= 0 && thirdRank < 8;
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
                  {pos === 2 && (thirdQualifies
                    ? <span className="badge b3">3rd★</span>
                    : <span className="badge b3-plain">3</span>)}
                  {pos === 3 && <span className="badge b4-plain">4</span>}
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
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    className="score-input" disabled={locked}
                    value={res.homeGoals ?? ''}
                    onChange={e => {
                      if (locked) return;
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                      onUpdateMatch(groupKey, i, { ...res, homeGoals: v });
                    }}
                    placeholder="0"
                  />
                  <span className="score-sep">–</span>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    className="score-input" disabled={locked}
                    value={res.awayGoals ?? ''}
                    onChange={e => {
                      if (locked) return;
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                      onUpdateMatch(groupKey, i, { ...res, awayGoals: v });
                    }}
                    placeholder="0"
                  />
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

function GroupStage({ data, onSetQualifiers, onUpdateMatch, onBuildKnockout, groupMode, scoreMode, locked, groupStageConfirmed }) {
  const q = data.qualifiers;
  const getAdvQ = () => {
    const d = {};
    GROUP_KEYS.forEach(gk => { d[gk] = calcStandings(gk, data.matchResults[gk]).map(t=>t.name); });
    return d;
  };
  const allTop2Done = GROUP_KEYS.every(g => calcStandings(g, data.matchResults[g]).some(t => t.pts > 0));
  const canBuild = !locked && allTop2Done;

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
    const winner   = (g) => (qSource[g]||[])[0] || `Winner Group ${g}`;
    const runnerUp = (g) => (qSource[g]||[])[1] || `Runner-up Group ${g}`;

    // ── Get all 12 third-place teams with stats ──
    let allThirds = [];
    if (groupMode === 'advanced') {
      GROUP_KEYS.forEach(g => {
        const s = calcStandings(g, data.matchResults[g]);
        if (s[2]) allThirds.push({ name: s[2].name, group: g, pts: s[2].pts, gf: s[2].gf, ga: s[2].ga });
      });
    } else {
      GROUP_KEYS.forEach(g => {
        if ((q[g]||[])[2]) allThirds.push({ name: q[g][2], group: g, pts: 0, gf: 0, ga: 0 });
      });
    }

    // ── Sort by FIFA tiebreaker: Points → GD → Goals scored ──
    allThirds.sort((a, b) =>
      b.pts - a.pts ||
      (b.gf - b.ga) - (a.gf - a.ga) ||
      b.gf - a.gf
    );

    // Take best 8
    const top8 = allThirds.slice(0, 8);

    // ── Build combination key (sorted group letters) ──
    const combinationKey = top8.map(t => t.group).sort().join('');

    // ── Look up the official FIFA Annex C mapping ──
    // mapping[i] = group letter of 3rd-place team for slot i
    // Slot order: [1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L]
    const mapping = THIRD_PLACE_MAP[combinationKey];

    // Build lookup: group → team name
    const thirdByGroup = {};
    top8.forEach(t => { thirdByGroup[t.group] = t.name; });

    // ── Map R32 slot labels to actual teams ──
    // The 8 third-place slots appear in R32_SLOTS in this order, corresponding to:
    // Match 1 (1E slot), Match 2 (1I slot), Match 7 (1D slot), Match 8 (1G slot),
    // Match 11 (1A slot), Match 12 (1L slot), Match 15 (1B slot), Match 16 (1K slot)
    // mapping array indices: 0=1A, 1=1B, 2=1D, 3=1E, 4=1G, 5=1I, 6=1K, 7=1L
    const SLOT_ORDER_IN_R32 = [3, 5, 2, 4, 0, 7, 1, 6]; // which mapping index each 3rd slot uses
    let thirdSlotIdx = 0;

    const getTeam = (label) => {
      if (label.startsWith('Winner Group '))    return winner(label.slice(-1));
      if (label.startsWith('Runner-up Group ')) return runnerUp(label.slice(-1));
      if (label.startsWith('3rd Group ')) {
        const slotIdx = SLOT_ORDER_IN_R32[thirdSlotIdx++];
        if (mapping && mapping[slotIdx]) {
          const sourceGroup = mapping[slotIdx];
          return thirdByGroup[sourceGroup] || `3rd Group ${sourceGroup}`;
        }
        // Fallback: assign in ranking order if combination not found
        const fallback = top8[thirdSlotIdx - 1];
        return fallback ? fallback.name : 'TBD';
      }
      return label;
    };

    const r32 = R32_SLOTS.map(label => getTeam(label));
    onBuildKnockout(r32);
  };

  return (
    <div>
      {groupMode === 'simple' ? (
        <div className="info-bar" style={{display:'none'}}></div>
      ) : (
        <div className="info-bar">Enter match results — standings update automatically. Use the <strong>Scores</strong> toggle above to predict exact scores.</div>
      )}
      <div className="group-grid">
        {GROUP_KEYS.map(gk =>
          <AdvancedGroupCard key={gk} groupKey={gk} matchResults={data.matchResults} onUpdateMatch={onUpdateMatch} scoreMode={scoreMode} locked={locked}/>
        )}
      </div>
      {!locked && !groupStageConfirmed && <button className={`build-btn ${canBuild?'active':'disabled'}`} onClick={()=>canBuild&&handleBuild()}>Build knockout bracket →</button>}
      {groupStageConfirmed && <div className="info-bar" style={{color:'#2a6a2a',background:'rgba(42,106,42,0.07)',border:'0.5px solid rgba(42,106,42,0.2)'}}>✅ Group stage confirmed — knockout bracket locked in.</div>}
    </div>
  );
}

// ─── Knockout Stage ────────────────────────────────────────────────────────────

function KnockoutStage({ knockout, onUpdate, lockedRounds, scoreMode, onClearDismissed, confirmedStages }) {
  const ko = knockout;
  const isRoundDone = (key) => confirmedStages?.has(key) || false;

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
    const arr = [...ko[roundKey]];
    arr[matchIdx] = team;
    onUpdate({ ...ko, [roundKey]: arr });
    if (onClearDismissed) onClearDismissed(roundKey);
  };

  const advSF = (matchIdx, team) => {
    if (lockedRounds?.has('sf')) return;
    const slotA = matchIdx * 2, slotB = matchIdx * 2 + 1;
    const loser = [ko.sf[slotA], ko.sf[slotB]].find(x => x !== team && !isSlotLabel(x)) || 'TBD';
    const final = [...ko.final]; final[matchIdx] = team;
    const third = [...ko.third]; third[matchIdx] = loser;
    onUpdate({ ...ko, final, third });
    if (onClearDismissed) onClearDismissed('sf');
  };

  const advFinal = (team) => {
    if (lockedRounds?.has('final')) return;
    onUpdate({ ...ko, winner: team });
    if (onClearDismissed) onClearDismissed('final');
  };

  const advThird = (team) => {
    onUpdate({ ...ko, thirdPlace: team });
  };

  const isRoundLocked = (key) => lockedRounds?.has(key) || false;
  const getScore = (roundKey, matchIdx) => (ko.koScores || {})[`${roundKey}-${matchIdx}`];

  const matchH = scoreMode ? 100 : 80;
  const gap0 = 6;
  const gap1 = (matchH+gap0)*2-matchH, gap2 = (matchH+gap1)*2-matchH, gap3 = (matchH+gap2)*2-matchH;
  const mt1 = (matchH+gap0)/2, mt2 = mt1+(matchH+gap1)/2, mt3 = mt2+(matchH+gap2)/2, mt4 = mt3+(matchH+gap3)/2;

  const renderCol = (label, matches, marginTop, roundKey) => {
    const isDone = roundKey && isRoundDone(roundKey);
    return (
      <div className={`ko-col${isDone ? ' ko-col-done' : ''}`}>
        <div className="ko-col-label">
          {label}{isDone ? ' ✅' : ''}
        </div>
        <div className="ko-col-matches" style={{marginTop}}>
          {matches.map((m,i) => <div key={i}>{i>0&&<div style={{height:m.gap}}/>}{m.node}</div>)}
        </div>
      </div>
    );
  };

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
      onSelectWinner={t=>advSF(s,t)} locked={isRoundLocked('sf')}
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
            {renderCol('Round of 32', mkR32(0), 0, 'r32')}
            {renderCol('Round of 16', mkR16(0), mt1, 'r16')}
            {renderCol('Quarter-finals', mkQF(0), mt2, 'qf')}
            {renderCol('Semi-finals', mkSF(0), mt3, 'sf')}
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
              {ko.winner !== 'TBD' && (
                <div className="second-box">
                  <div className="champ-trophy">🥈</div>
                  <div className="champ-label">RUNNER-UP</div>
                  <div className="champ-team">{ko.final.find(t => t !== ko.winner && t !== 'TBD') || <em>TBD</em>}</div>
                </div>
              )}
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
            {renderCol('Semi-finals', mkSF(1), mt3, 'sf')}
            {renderCol('Quarter-finals', mkQF(1), mt2, 'qf')}
            {renderCol('Round of 16', mkR16(1), mt1, 'r16')}
            {renderCol('Round of 32', mkR32(1), 0, 'r32')}
          </div>
        </div>
      </div>

      {/* Mobile: round-by-round view */}
      <div className="ko-mobile">
        <div className="mobile-round-nav">
          {ROUND_DEFS.map(r => (
            <button key={r.key}
              className={`mobile-round-btn ${mobileRound === r.key ? 'active' : ''} ${isRoundLocked(r.key) ? 'locked' : ''} ${isRoundDone(r.key) ? 'done' : ''}`}
              onClick={() => setMobileRound(r.key)}>
              {r.label}{isRoundLocked(r.key) ? ' 🔒' : ''}{isRoundDone(r.key) ? ' ✅' : ''}
            </button>
          ))}
        </div>
        <div className="mobile-round-title">
          {mobileRoundDef?.fullLabel}
          {confirmedStages?.has(mobileRound) && <span style={{marginLeft:8,fontSize:11,color:'#2a6a2a'}}>✅ confirmed</span>}
        </div>
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
              {ko.winner !== 'TBD' && (
                <div className="second-box" style={{marginTop:6}}>
                  <div className="champ-trophy">🥈</div>
                  <div className="champ-label">RUNNER-UP</div>
                  <div className="champ-team">{ko.final.find(t => t !== ko.winner && t !== 'TBD') || <em>TBD</em>}</div>
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
          {ko.winner !== 'TBD' && (() => { const ru = ko.final.find(t => t !== ko.winner && t !== 'TBD'); return ru ? <div className="result-item"><span>🥈</span><div><div className="result-label">RUNNER-UP</div><div className="result-team">{ru}</div></div></div> : null; })()}
          {ko.thirdPlace !== 'TBD' && <div className="result-item"><span>🥉</span><div><div className="result-label">3RD PLACE</div><div className="result-team">{ko.thirdPlace}</div></div></div>}
        </div>
      )}
    </div>
  );
}

// ─── Stage Completion Modal ───────────────────────────────────────────────────

const STAGE_FULL_LABELS = {
  groups: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final & 3rd Place',
};
const NEXT_STAGE_LABELS = {
  groups: 'Round of 32', r32: 'Round of 16', r16: 'Quarter-finals',
  qf: 'Semi-finals', sf: 'Final & 3rd Place', final: null,
};

function StagePromptModal({ prompt, onConfirm, onGoBack, onGoToPredict, penaltyCost, needsBracketBuild }) {
  if (!prompt) return null;
  const { stage, step } = prompt;
  const stageLabel = STAGE_FULL_LABELS[stage] || stage;
  const nextLabel  = NEXT_STAGE_LABELS[stage];

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        {step === 'confirm' ? (
          <>
            <div className="modal-icon">📋</div>
            <div className="modal-title">Confirm {stageLabel} Results</div>
            <div className="modal-body">
              {prompt.stage === 'groups' && needsBracketBuild ? (
                <span style={{color:'#8b1a1a'}}>
                  ⚠️ You need to <strong>Build the knockout bracket</strong> on the Actual Results → Knockout Stage tab first before confirming the group stage. This ensures all 32 Round of 32 teams are correctly assigned.
                </span>
              ) : (
                <>
                  All {stageLabel} results are now in. Please check carefully before confirming — <strong>re-confirming after going back will cost 1 penalty point</strong> each time.
                  {prompt.reconfirmPenalty > 0 && (
                    <div style={{marginTop:10, padding:'8px 12px', background:'rgba(139,26,26,0.07)', borderRadius:8, color:'#8b1a1a'}}>
                      ⚠️ You previously went back to fix these. Re-confirming now will cost <strong>{prompt.reconfirmPenalty} penalty point{prompt.reconfirmPenalty !== 1 ? 's' : ''}</strong>.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              {!(prompt.stage === 'groups' && needsBracketBuild) && (
                <button className="modal-btn modal-btn-primary" onClick={onConfirm}>
                  ✅ {prompt.reconfirmPenalty > 0 ? `Confirm anyway (−${prompt.reconfirmPenalty}pts)` : 'Yes, these results are correct'}
                </button>
              )}
              <button className="modal-btn modal-btn-secondary" onClick={onGoBack}>
                {prompt.stage === 'groups' && needsBracketBuild ? '← Go build the bracket first' : '✏️ No, let me fix them first'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-icon">⚽</div>
            <div className="modal-title">{stageLabel} Complete!</div>
            <div className="modal-body">
              {nextLabel ? (
                <>
                  Time to update your <strong>{nextLabel}</strong> predictions on the My Prediction tab.
                  {penaltyCost > 0 ? (
                    <> Syncing your bracket with the actual results will cost <strong className="modal-penalty">{penaltyCost} penalty point{penaltyCost !== 1 ? 's' : ''}</strong> — one for each slot that differs from your original prediction.</>
                  ) : (
                    <> Your predictions already match the actual results — no penalty points will be deducted! 🎉</>
                  )}
                  <br /><br />
                  <strong>Important:</strong> You'll need to update your predictions before each knockout round begins, and again after each round ends.
                </>
              ) : (
                <>The tournament is complete! Head to the comparison panel to see your final score.</>
              )}
            </div>
            <div className="modal-actions">
              {nextLabel && (
                <button className="modal-btn modal-btn-primary" onClick={() => onGoToPredict(false)}>
                  🔮 Go to My Prediction tab
                </button>
              )}
              <button className="modal-btn modal-btn-secondary" onClick={() => onGoToPredict(true)}>
                {nextLabel ? 'Stay on Actual Results' : 'Close'}
              </button>
            </div>
          </>
        )}
      </div>
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
  const [predGroupMode, setPredGroupMode]   = useState(saved?.predGroupMode  || 'advanced');
  const [actGroupMode,  setActGroupMode]    = useState(saved?.actGroupMode   || 'advanced');
  const [predScoreMode, setPredScoreMode]   = useState(saved?.predScoreMode  || false);
  const [actScoreMode,  setActScoreMode]    = useState(saved?.actScoreMode   || false);
  const [lockState, setLockState]           = useState(saved?.lockState      || emptyLockState());

  // Stage completion flow state
  const [confirmedStages, setConfirmedStages] = useState(
    new Set(Array.isArray(saved?.confirmedStages) ? saved.confirmedStages : [])
  );
  const [stagePrompt, setStagePrompt]           = useState(null);
  const [dismissedPrompts, setDismissedPrompts] = useState(new Map());
  const [notifiedStages, setNotifiedStages]     = useState(new Set());
  // lockedPredictions: Map of roundKey → snapshot of prediction slots at time of lock
  // e.g. { 'r32': ['Germany', 'France', ...16 teams] } — these are the picks that will be penalised
  const [lockedPredictions, setLockedPredictions] = useState(
    new Map(Object.entries(saved?.lockedPredictions || {}))
  ); // stages where notify was shown

  // ── Save to localStorage whenever any persistent state changes ──
  useEffect(() => {
    saveToStorage({
      prediction, actual, lockState, predGroupMode, actGroupMode, predScoreMode, actScoreMode,
      confirmedStages: [...confirmedStages],
      lockedPredictions: Object.fromEntries(lockedPredictions),
    });
  }, [prediction, actual, lockState, predGroupMode, actGroupMode, predScoreMode, actScoreMode, confirmedStages]);

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
    if (activeTab === 'actual') {
      return !isActualStageLocked(stage, phaseNow, confirmedStages);
    }
    // Prediction tab
    if (isPredictionStageLocked(stage, phaseNow)) return false;
    if (confirmedStages.has(stage)) return false;
    if (phaseNow < SCHEDULE.groups.start) return !lockState.userLocked;
    return true;
  };

  // Per-stage editability for actual tab
  const groupEditable    = isStageEditable('groups');
  const koEditableStages = new Set(STAGE_ORDER.filter(s => isStageEditable(s)));
  const koLockedRounds   = new Set(STAGE_ORDER.filter(s => !koEditableStages.has(s)));

  const setQualifiers = (gk, teams) => {
    if (!isStageEditable('groups')) return;
    setData(prev => ({ ...prev, qualifiers: { ...prev.qualifiers, [gk]: teams } }));
  };
  const updateMatch = (gk, idx, res) => {
    if (!isStageEditable('groups')) return;
    setData(prev => ({ ...prev, matchResults: { ...prev.matchResults, [gk]: { ...(prev.matchResults[gk] || {}), [idx]: res } } }));
    if (activeTab === 'actual') {
      setDismissedPrompts(prev => {
        if (!prev.has('groups')) return prev;
        const next = new Map(prev);
        next.delete('groups');
        return next;
      });
    }
  };

  // ── Stage completion detection ──
  const isGroupStageComplete = (act) => {
    // Advanced mode: all 72 matches entered
    const totalMatches = GROUP_KEYS.reduce((sum, gk) => {
      const complete = Object.values(act.matchResults[gk] || {}).filter(r => {
        if (!r) return false;
        const hg = r.homeGoals, ag = r.awayGoals;
        const bothScores = hg !== '' && hg !== null && hg !== undefined &&
                           ag !== '' && ag !== null && ag !== undefined &&
                           !isNaN(Number(hg)) && !isNaN(Number(ag));
        return bothScores || !!r.result;
      }).length;
      return sum + complete;
    }, 0);
    if (totalMatches >= 72) return true;
    // Simple mode: all 12 groups have at least 3 positions ranked
    const allGroupsRanked = GROUP_KEYS.every(gk => (act.qualifiers[gk]?.length || 0) >= 3);
    if (allGroupsRanked) return true;
    // Also consider if KO bracket was manually built on actual tab
    return act.knockout.r32.some(t => t && !isSlotLabel(t));
  };

  const isKORoundComplete = (act, roundKey) => {
    const round = KO_ROUNDS.find(r => r.key === roundKey);
    if (!round) return false;
    // Winners of roundKey are stored in the NEXT round's array
    // e.g. R32 winners → r16 array, R16 winners → qf array, etc.
    const nextRoundKey = roundKey === 'r32' ? 'r16'
      : roundKey === 'r16' ? 'qf'
      : roundKey === 'qf'  ? 'sf'
      : roundKey === 'sf'  ? 'final'
      : null;
    if (!nextRoundKey) return false;
    const advancers = act.knockout[nextRoundKey] || [];
    return advancers
      .slice(0, round.matchCount)
      .every(t => t && !isSlotLabel(t) && t !== 'TBD');
  };

  // Detect when actual results complete a stage and show the prompt
  useEffect(() => {
    if (stagePrompt) return;
    if (activeTab !== 'actual') return;

    if (!confirmedStages.has('groups') && !dismissedPrompts.has('groups') && !notifiedStages.has('groups') && isGroupStageComplete(actual)) {
      setStagePrompt({ stage: 'groups', step: 'confirm', reconfirmPenalty: 0 });
      return;
    }
    for (const { key } of KO_ROUNDS) {
      if (confirmedStages.has(key)) continue;
      if (dismissedPrompts.has(key)) continue;
      if (notifiedStages.has(key)) continue;
      if (isKORoundComplete(actual, key)) {
        setStagePrompt({ stage: key, step: 'confirm', reconfirmPenalty: 0 });
        return;
      }
    }
    if (!confirmedStages.has('final') && !dismissedPrompts.has('final') && !notifiedStages.has('final') &&
        confirmedStages.has('sf') &&
        actual.knockout.winner !== 'TBD' && !isSlotLabel(actual.knockout.winner)) {
      setStagePrompt({ stage: 'final', step: 'confirm', reconfirmPenalty: 0 });
    }
  }, [actual, confirmedStages, stagePrompt, dismissedPrompts, activeTab, notifiedStages]);

  // Lock in the user's predictions for a KO round — snapshot their current picks
  // These picks will be compared against actual results for penalties
  // countFillPenalties uses locked snapshots

  // Count penalties: compare locked prediction snapshot against actual results
  const countFillPenalties = (stage) => {
    const actualSlots = actual.knockout[stage] || [];
    // Use locked snapshot if available, otherwise use current prediction at confirm time
    const lockedKey = { r16:'r32', qf:'r16', sf:'qf', final:'sf' }[stage];
    const lockedSnap = lockedKey ? lockedPredictions.get(lockedKey) : null;
    // Fall back to current prediction if no manual lock — still charge penalty for wrong picks
    const predSlots = lockedSnap || prediction.knockout[stage] || [];
    return actualSlots.filter((team, i) => {
      if (!team || isSlotLabel(team) || team === 'TBD') return false;
      const predTeam = predSlots[i];
      // No penalty if prediction was never set (TBD/slot label)
      if (!predTeam || isSlotLabel(predTeam) || predTeam === 'TBD') return false;
      return predTeam !== team;
    }).length;
  };

  const buildKnockout = (r32) => {
    setData(prev => ({ ...prev, knockout: { ...emptyKO(), r32 } }));
    setSection('knockout');
  };

  const updateKnockout = (ko) => {
    if (activeTab === 'prediction' && phaseNow >= SCHEDULE.groups.start) return;
    setData(prev => ({ ...prev, knockout: ko }));
  };

  // User manually locks/unlocks (pre-tournament only)
  const handleUserLock = (locked) => setLockState(prev => ({ ...prev, userLocked: locked }));

  // Fill prediction KO bracket from actual results for the given stage — 1pt per change
  const handleFillFromActual = (stage) => {
    if (!stage || !actual.knockout[stage]) return;
    const penalties = countFillPenalties(stage);
    const msg = penalties > 0
      ? `This will update ${penalties} slot${penalties !== 1 ? 's' : ''} in your ${stage.toUpperCase()} bracket to match the actual results, costing you ${penalties} penalty point${penalties !== 1 ? 's' : ''}.\n\nOK to continue?`
      : `This will fill your ${stage.toUpperCase()} bracket with the actual qualified teams. No penalty points since your predictions already match!\n\nOK to continue?`;
    if (!window.confirm(msg)) return;

    const actualSlots = actual.knockout[stage];
    const predSlots   = prediction.knockout[stage] || [];
    const newSlots = actualSlots.map((team, i) => {
      if (team && !isSlotLabel(team) && team !== 'TBD' && predSlots[i] !== team) return team;
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

  // When a KO result changes, clear the dismissed prompt for that round
  // so the confirm dialog can re-appear once the round is complete
  const handleClearDismissed = (roundKey) => {
    const sourceKey = roundKey === 'r16' ? 'r32'
      : roundKey === 'qf'    ? 'r16'
      : roundKey === 'sf'    ? 'qf'
      : roundKey === 'final' ? 'sf'
      : roundKey;
    setDismissedPrompts(prev => {
      if (!prev.has(sourceKey)) return prev;
      const next = new Map(prev);
      next.delete(sourceKey);
      return next;
    });
  };
  const handleStageConfirm = () => {
    const stage = stagePrompt?.stage;

    // Determine which prediction KO array needs syncing from actual
    // Groups confirmed → sync actual.r32 into prediction.r32
    // R32 confirmed → sync actual.r16 into prediction.r16
    // R16 confirmed → sync actual.qf into prediction.qf etc.
    const syncMap = { groups: 'r32', r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final' };
    const syncStage = syncMap[stage] || null;

    // For groups stage, auto-build actual R32 from actual qualifiers if not built yet
    let actualKO = actual.knockout;
    if (stage === 'groups' && actual.knockout.r32.every(t => isSlotLabel(t))) {
      // Simple mode: build from actual.qualifiers
      const actQ = actual.qualifiers;
      const actMR = actual.matchResults;
      // Use advanced standings if available, else simple qualifiers
      const getWinner = (g) => {
        if ((actQ[g]||[]).length > 0) return actQ[g][0];
        const s = calcStandings(g, actMR[g]);
        return s[0]?.name || `Winner Group ${g}`;
      };
      const getRunnerUp = (g) => {
        if ((actQ[g]||[]).length > 1) return actQ[g][1];
        const s = calcStandings(g, actMR[g]);
        return s[1]?.name || `Runner-up Group ${g}`;
      };
      // Get best 8 thirds
      let allThirds = [];
      GROUP_KEYS.forEach(g => {
        const t = (actQ[g]||[])[2] || calcStandings(g, actMR[g])[2]?.name;
        if (t) allThirds.push({ name: t, group: g });
      });
      const top8 = allThirds.slice(0, 8);
      const thirdByGroup = {};
      top8.forEach(t => { thirdByGroup[t.group] = t.name; });
      const combinationKey = top8.map(t => t.group).sort().join('');
      const mapping = THIRD_PLACE_MAP[combinationKey];
      const SLOT_ORDER_IN_R32 = [3, 5, 2, 4, 0, 7, 1, 6];
      let thirdSlotIdx = 0;
      const getTeam = (label) => {
        if (label.startsWith('Winner Group '))    return getWinner(label.slice(-1));
        if (label.startsWith('Runner-up Group ')) return getRunnerUp(label.slice(-1));
        if (label.startsWith('3rd Group ')) {
          const slotIdx = SLOT_ORDER_IN_R32[thirdSlotIdx++];
          if (mapping?.[slotIdx]) return thirdByGroup[mapping[slotIdx]] || label;
          return top8[thirdSlotIdx - 1]?.name || label;
        }
        return label;
      };
      const builtR32 = R32_SLOTS.map(label => getTeam(label));
      actualKO = { ...actual.knockout, r32: builtR32 };
      setActual(prev => ({ ...prev, knockout: { ...prev.knockout, r32: builtR32 } }));
    }

    // Count penalties: how many prediction slots differ from actual
    const penaltyCost = syncStage ? (() => {
      const actualSlots = actualKO[syncStage] || [];
      const predSlots   = prediction.knockout[syncStage] || [];
      return actualSlots.filter((team, i) =>
        team && !isSlotLabel(team) && team !== 'TBD' && predSlots[i] !== team
      ).length;
    })() : 0;

    // ── AUTO-SNAPSHOT and SYNC ──
    if (syncStage) {
      const winnerKey = syncStage;
      const currentPicks = [...(prediction.knockout[winnerKey] || [])];
      if (currentPicks.some(t => t && !isSlotLabel(t) && t !== 'TBD')) {
        setLockedPredictions(prev => new Map([...prev, [stage, currentPicks]]));
      }

      // Build merged koScores: keep user's prediction scores, copy actual scores
      // for this stage only if user didn't enter their own
      const actualScores = actualKO.koScores || {};
      const predScores   = prediction.knockout.koScores || {};
      const mergedScores = { ...predScores };
      const round = KO_ROUNDS.find(r => r.key === stage);
      if (round) {
        for (let i = 0; i < round.matchCount; i++) {
          const sk = `${stage}-${i}`;
          if (actualScores[sk] && !predScores[sk]) mergedScores[sk] = actualScores[sk];
        }
      }

      if (syncStage && actualKO[syncStage]) {
        const actualSlots = actualKO[syncStage];
        const predSlots   = prediction.knockout[syncStage] || [];
        const newSlots = actualSlots.map((team, i) => {
          if (team && !isSlotLabel(team) && team !== 'TBD') return team;
          return predSlots[i] || 'TBD';
        });

        let updatedFuture = {};
        if (syncStage === 'r32') {
          updatedFuture = {
            r16: Array(16).fill('TBD'),
            qf:  Array(8).fill('TBD'),
            sf:  Array(4).fill('TBD'),
            final: ['TBD', 'TBD'],
            third: ['TBD', 'TBD'],
          };
        } else {
          const stillIn = new Set(newSlots.filter(t => t && !isSlotLabel(t) && t !== 'TBD'));
          const allFutureStages = ['r16', 'qf', 'sf'];
          const syncIdx = allFutureStages.indexOf(syncStage);
          const futuresToClear = syncIdx >= 0 ? allFutureStages.slice(syncIdx + 1) : [];
          futuresToClear.forEach(fs => {
            const slots = prediction.knockout[fs] || [];
            updatedFuture[fs] = slots.map(t =>
              (t && !isSlotLabel(t) && t !== 'TBD' && !stillIn.has(t)) ? 'TBD' : t
            );
          });
        }

        const newWinner = updatedFuture.final ? 'TBD' : prediction.knockout.winner;
        const newThird  = updatedFuture.third  ? 'TBD' : prediction.knockout.thirdPlace;

        // Single atomic setPrediction — preserves koScores
        setPrediction(prev => ({
          ...prev,
          knockout: {
            ...prev.knockout,
            [syncStage]: newSlots,
            ...updatedFuture,
            winner: newWinner,
            thirdPlace: newThird,
            koScores: mergedScores, // always use merged scores
          }
        }));

        if (penaltyCost > 0) {
          setLockState(prev => ({ ...prev, penaltyPoints: prev.penaltyPoints + penaltyCost }));
        }
      }
    }
    // Mark stage confirmed and show notify modal
    const dismissCount = dismissedPrompts.get(stage) || 0;
    if (dismissCount > 0) {
      setLockState(prev => ({ ...prev, penaltyPoints: prev.penaltyPoints + dismissCount }));
      const next = new Map(dismissedPrompts);
      next.delete(stage);
      setDismissedPrompts(next);
    }
    setConfirmedStages(prev => new Set([...prev, stage]));
    setStagePrompt(prev => ({ ...prev, step: 'notify', penaltyCost }));
    setNotifiedStages(prev => new Set([...prev, stage]));
  };

  const handleStageGoBack = () => {
    if (stagePrompt) {
      setDismissedPrompts(prev => {
        const next = new Map(prev);
        next.set(stagePrompt.stage, (next.get(stagePrompt.stage) || 0) + 1);
        return next;
      });
      // Remove from notified so re-confirm prompt can fire after dismissing
      setNotifiedStages(prev => {
        const next = new Set(prev);
        next.delete(stagePrompt.stage);
        return next;
      });
    }
    setStagePrompt(null);
  };

  const handleStageNotifyDone = (stayOnActual = false) => {
    setStagePrompt(null);
    if (!stayOnActual) {
      setActiveTab('prediction');
      setSection('knockout');
    }
  };
  // Only counts when data is fully entered, not half-typed
  const hasActualData = () => {
    const mr = actual.matchResults;

    // A match counts only if both scores are filled OR a W/D/L result is selected
    const hasCompleteMatch = Object.values(mr).some(g =>
      Object.values(g || {}).some(r => {
        if (!r) return false;
        const hg = r.homeGoals, ag = r.awayGoals;
        const bothScores = hg !== '' && hg !== null && hg !== undefined &&
                           ag !== '' && ag !== null && ag !== undefined &&
                           !isNaN(Number(hg)) && !isNaN(Number(ag));
        return bothScores || !!r.result;
      })
    );

    // Simple mode: a group counts only when all 4 positions are ranked (qualifiers has 4 entries... 
    // actually we only need top 3 minimum to be meaningful — require at least 2 qualifiers per group)
    const hasCompleteGroup = Object.values(actual.qualifiers).some(v => v?.length >= 3);

    // KO: a round counts when at least one real team (not TBD/slot label) has advanced
    const hasKO = actual.knockout.r16.some(t => t && !isSlotLabel(t)) ||
                  actual.knockout.winner !== 'TBD';

    return hasCompleteMatch || hasCompleteGroup || hasKO;
  };

  // ── Compute live points total for the points bar ──
  const livePoints = (() => {
    if (!hasActualData()) return null;
    const matchMode = predScoreMode ? 'score' : 'wdl';
    // Pass 0 penalty to buildComparison to get raw earned points,
    // then subtract the stored penalty separately — simpler and more reliable
    const { totalEarned } = buildComparison(prediction, actual, matchMode, 0, lockedPredictions);
    return totalEarned - (lockState.penaltyPoints || 0);
  })();

  return (
    <div className="app">
      {/* Stage completion modal */}
      <StagePromptModal
        prompt={stagePrompt}
        onConfirm={handleStageConfirm}
        onGoBack={handleStageGoBack}
        onGoToPredict={handleStageNotifyDone}
        penaltyCost={stagePrompt?.penaltyCost || 0}
        needsBracketBuild={false}
      />

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
              setPredGroupMode('advanced'); setActGroupMode('advanced');
              setPredScoreMode(false); setActScoreMode(false);
              setConfirmedStages(new Set());
              setStagePrompt(null);
              setDismissedPrompts(new Map());
              setNotifiedStages(new Set());
              setLockedPredictions(new Map());
            }
          }}>
          🗑 Reset
        </button>
      </div>

      {/* Points bar — shown when actual data exists */}
      {livePoints !== null && (
        <div className="points-bar">
          <span className="points-bar-label">Your score</span>
          <span className={`points-bar-value ${livePoints < 0 ? 'points-negative' : ''}`}>
            {livePoints > 0 ? `+${livePoints}` : livePoints} pts
          </span>
        </div>
      )}

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

      {/* Prediction update notification — shown when a stage is confirmed on actual tab */}
      {activeTab === 'prediction' && (() => {
        // Find the most recently confirmed stage that needs prediction updates
        const stagesNeedingUpdate = ['groups','r32','r16','qf','sf'].filter(s => {
          if (!confirmedStages.has(s)) return false;
          const nextStage = s === 'groups' ? 'r32' : KO_ROUNDS[KO_ROUNDS.findIndex(r=>r.key===s)+1]?.key;
          if (!nextStage) return false;
          const cost = countFillPenalties(nextStage);
          return cost > 0 || actual.knockout[nextStage]?.some(t => t && !isSlotLabel(t) && t !== 'TBD');
        });
        if (stagesNeedingUpdate.length === 0) return null;
        const latestStage = stagesNeedingUpdate[stagesNeedingUpdate.length - 1];
        const nextStage = latestStage === 'groups' ? 'r32' : KO_ROUNDS[KO_ROUNDS.findIndex(r=>r.key===latestStage)+1]?.key;
        const cost = countFillPenalties(nextStage);
        const nextLabel = NEXT_STAGE_LABELS[latestStage];
        return (
          <div className="update-banner">
            <div className="update-banner-info">
              <span className="update-banner-icon">⚠️</span>
              <div>
                <div className="update-banner-title">Your {nextLabel} bracket has been updated</div>
                <div className="update-banner-sub">
                  {cost > 0
                    ? `${cost} penalty point${cost !== 1 ? 's were' : ' was'} deducted for slots that differed from your original predictions.`
                    : `Your predictions matched the actual bracket — no penalty points deducted! 🎉`}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Re-confirm button for dismissed stage prompts */}
      {activeTab === 'actual' && (() => {
        const dismissedStages = [...dismissedPrompts.keys()];
        if (dismissedStages.length === 0) return null;
        return dismissedStages.map(stage => {
          const count = dismissedPrompts.get(stage) || 0;
          const label = STAGE_FULL_LABELS[stage] || stage;
          return (
            <div key={stage} className="reconfirm-banner">
              <span>⚠️ You went back to fix <strong>{label}</strong> results. Ready to re-confirm?</span>
              <button className="modal-btn modal-btn-primary" style={{padding:'8px 16px',fontSize:13}}
                onClick={() => setStagePrompt({ stage, step: 'confirm', reconfirmPenalty: count })}>
                📋 Re-confirm {label} {count > 0 ? `(−${count}pt penalty)` : ''}
              </button>
            </div>
          );
        });
      })()}

      {/* Comparison panel — only shown when actual data exists */}
      {activeTab === 'actual' && showComparison && (
        hasActualData() ? (
          <ComparisonPanel
            prediction={prediction} actual={actual}
            predGroupMode={predGroupMode} actGroupMode={actGroupMode}
            penaltyPoints={lockState.penaltyPoints}
            scoreMode={predScoreMode}
            lockedPredictions={lockedPredictions}
          />
        ) : (
          <div className="comparison-panel">
            <div className="cmp-title">📊 Prediction Analysis</div>
            <div className="cmp-empty" style={{marginTop:12}}>
              No actual results entered yet. Fill in the Actual Results tab as matches are played to see how your predictions compare.
            </div>
          </div>
        )
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
            {/* Mode picker — redesigned as a clear 3-option selector */}
            <div className="mode-picker">
            {section === 'groups' && (
              <>
                <button
                  className={`mode-option ${!scoreMode ? 'mode-active' : ''}`}
                  onClick={() => { setGMode('advanced'); setSMode(false); }}
                  title="Predict W/D/L for each match. +1pt per correct result on top of position points.">
                  W/D/L
                </button>
                <button
                  className={`mode-option ${scoreMode ? 'mode-active' : ''}`}
                  onClick={() => { setGMode('advanced'); setSMode(true); }}
                  title="Predict exact scores. +3pts per correct score on top of W/D/L and position points.">
                  + Scores
                </button>
              </>
            )}
              {section === 'knockout' && (
                <>
                  <button
                    className={`mode-option ${!scoreMode ? 'mode-active' : ''}`}
                    onClick={() => setSMode(false)}
                    title="Pick who advances. 1pt per correct team.">
                    Results
                  </button>
                  <button
                    className={`mode-option ${scoreMode ? 'mode-active' : ''}`}
                    onClick={() => setSMode(true)}
                    title="Predict exact scores too. +3pts per correct score.">
                    + Scores
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mode description strip */}
          <div className="mode-desc">
            {section === 'groups' && !scoreMode && (
              <span>
                <strong>W/D/L</strong> — predict the result of every group match. Standings update automatically. Earn <strong>1pt</strong> per correct group position <strong>+ 1pt</strong> per correct match result.
              </span>
            )}
            {section === 'groups' && scoreMode && (
              <span>
                <strong>Scores</strong> — predict the exact scoreline of every group match. Earn <strong>1pt</strong> per correct position <strong>+ 1pt</strong> per correct result <strong>+ 3pts</strong> per exact score (4pts total for a perfect match).
              </span>
            )}
            {section === 'knockout' && !scoreMode && (
              <span>
                <strong>Results</strong> — click a team in each match to advance them. Earn <strong>1pt</strong> per correct team advancing.
              </span>
            )}
            {section === 'knockout' && scoreMode && (
              <span>
                <strong>Scores</strong> — predict exact scorelines too. Earn <strong>1pt</strong> per correct team advancing <strong>+ 3pts</strong> per exact score (4pts total for a perfect match).
              </span>
            )}
          </div>

          <div className="content">
            {section === 'groups' && (
              <GroupStage data={data} onSetQualifiers={setQualifiers} onUpdateMatch={updateMatch}
                onBuildKnockout={buildKnockout} groupMode={groupMode} scoreMode={scoreMode}
                locked={!groupEditable}
                groupStageConfirmed={confirmedStages.has('groups')} />
            )}
            {section === 'knockout' && (
              <KnockoutStage knockout={data.knockout} onUpdate={updateKnockout}
                lockedRounds={koLockedRounds}
                scoreMode={scoreMode}
                onClearDismissed={activeTab === 'actual' ? handleClearDismissed : null}
                confirmedStages={confirmedStages} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
