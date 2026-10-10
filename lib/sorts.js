// Sorting helpers shared by the Library and Profile pages.

// When a song was recorded: the date you set, else its release date, else when it was added
export function recordedKey(t) {
  return String(t.recorded_date || t.release_date || t.created_at || '').slice(0, 10);
}

export const byTitle = (a, b) =>
  String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true });

export const byRecordedNewest = (a, b) => recordedKey(b).localeCompare(recordedKey(a)) || byTitle(a, b);
export const byRecordedOldest = (a, b) => recordedKey(a).localeCompare(recordedKey(b)) || byTitle(a, b);

// The file's "last modified" date, as YYYY-MM-DD in local time (a good first guess for when it was recorded)
export function fileDate(file) {
  if (!file?.lastModified) return '';
  const d = new Date(file.lastModified);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
