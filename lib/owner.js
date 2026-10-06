// Remembers that this browser belongs to you (the artist), so your own visits
// and plays don't count toward your profile views and play counts.
// Visitors only ever see your Profile and song pages; once you open Create,
// Library, Studio or Connections on a device, that device is marked as yours.
const KEY = 'sp-owner';

export function isOwner() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markOwner() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
}
