// Tracks whether the player has already been offered Blur Reveal · Back Cover
// on a given day, so the invite pops at most once per drop. Declining is not a
// lockout — the sidebar's hard-mode tile is always the way in; this only stops
// the unsolicited modal from re-appearing every time /blur is revisited.

const KEY_PREFIX = 'dailies/blurback-prompt/v1/'

export function wasBackCoverAsked(date: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + date) === 'asked'
  } catch {
    // Private-mode / storage-disabled: treat as already asked so we never
    // trap the player in a modal that can't remember being dismissed.
    return true
  }
}

export function markBackCoverAsked(date: string) {
  try {
    localStorage.setItem(KEY_PREFIX + date, 'asked')
  } catch {
    // Non-fatal — worst case the invite shows again next visit.
  }
}
