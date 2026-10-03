// Shared lyric helpers (browser and server).

// Lines that get timed: skips blank lines and section tags like [Chorus].
export function lyricLines(lyrics = '') {
  return String(lyrics)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isLabel(l));
}

// Section headers and singer labels, e.g. [Chorus], (Hook), "Smoove:", "Spoken Intro: Smoove"
function isLabel(l) {
  if (/^\[.*\]$/.test(l) || /^\(.*\)$/.test(l)) return true;
  if (/:\s*$/.test(l)) return true;
  const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
  if (m && /\b(intro|outro|verse|chorus|hook|bridge|pre-?chorus|interlude|refrain|spoken|ad-?libs?)\b/i.test(m[1]) && m[2].split(/\s+/).filter(Boolean).length <= 3) {
    return true;
  }
  return false;
}

const norm = (w) => w.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '');

function same(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

// lines: string[]; words: [{ word, start }] from speech recognition.
// Returns [{ t, text }] with one start time per line, always increasing.
export function alignLyrics(lines, words, duration = 0) {
  const lw = [];
  lines.forEach((text, li) => {
    for (const w of text.split(/\s+/)) {
      const n = norm(w);
      if (n) lw.push({ n, li });
    }
  });
  const tw = words.map((w) => ({ n: norm(w.word || ''), t: w.start })).filter((w) => w.n && Number.isFinite(w.t));

  // Longest common subsequence between lyric words and heard words
  const A = lw.length;
  const B = tw.length;
  const dp = Array.from({ length: A + 1 }, () => new Uint16Array(B + 1));
  for (let i = A - 1; i >= 0; i--) {
    for (let j = B - 1; j >= 0; j--) {
      dp[i][j] = same(lw[i].n, tw[j].n) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lineTimes = new Array(lines.length).fill(null);
  let i = 0;
  let j = 0;
  while (i < A && j < B) {
    if (same(lw[i].n, tw[j].n)) {
      if (lineTimes[lw[i].li] === null) lineTimes[lw[i].li] = tw[j].t;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  // Fill lines nobody matched by spacing them between their neighbours
  const end = duration || (tw.length ? tw[tw.length - 1].t + 4 : lines.length * 4);
  for (let k = 0; k < lines.length; k++) {
    if (lineTimes[k] !== null) continue;
    let p = k - 1;
    while (p >= 0 && lineTimes[p] === null) p--;
    let n = k + 1;
    while (n < lines.length && lineTimes[n] === null) n++;
    const t0 = p >= 0 ? lineTimes[p] : 0;
    const t1 = n < lines.length ? lineTimes[n] : end;
    const gaps = n - p;
    for (let m = p + 1; m < n; m++) lineTimes[m] = t0 + ((t1 - t0) * (m - p)) / gaps;
    k = n - 1;
  }

  // Keep times increasing
  let last = -1;
  return lines.map((text, k) => {
    const t = Math.max(lineTimes[k] ?? 0, last + 0.05);
    last = t;
    return { t: Math.round(t * 100) / 100, text };
  });
}

// Index of the line that is playing at time t.
export function activeLine(synced, t) {
  if (!synced?.length) return -1;
  let lo = 0;
  let hi = synced.length - 1;
  if (t < synced[0].t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (synced[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
