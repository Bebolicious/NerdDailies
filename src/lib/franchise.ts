import type { Game } from './types'

// Detects when two games belong to the same franchise so the UI can mark
// "close" guesses (e.g. picking "Wolfenstein: The New Order" when the answer
// is "Wolfenstein: The New Colossus") with a yellow tone instead of red.
//
// Heuristic, name-based — no separate catalog. The rules:
//   1. lowercase, strip diacritics, replace punctuation with spaces, keep
//      hyphens (so "Half-Life" stays one token).
//   2. cut everything after the first colon — subtitles after `:` are
//      almost always per-installment titles.
//   3. drop trailing tokens that look like installment markers: pure digits
//      (Portal 2, Persona 5), roman numerals (Final Fantasy VII).
//   4. compare token sequences:
//        - equal → same franchise
//        - one is a full word-aligned prefix of the other (Doom vs
//          Doom Eternal) → same franchise
//        - otherwise require >=2 shared leading tokens so single generic
//          words ("The", "Mario") don't false-positive across unrelated
//          series ("The Witcher" vs "The Last of Us").

const ROMAN = /^[ivxlcdm]+$/i
const COMBINING_DIACRITICS = /[̀-ͯ]/g

function stem(name: string): string[] {
  let s = name.toLowerCase().normalize('NFD').replace(COMBINING_DIACRITICS, '')
  s = s.replace(/[(),.!?'"`]/g, ' ')
  const colonIdx = s.indexOf(':')
  if (colonIdx >= 0) s = s.slice(0, colonIdx)
  const tokens = s.split(/\s+/).filter(Boolean)
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]
    if (/^\d+$/.test(last) || ROMAN.test(last)) {
      tokens.pop()
    } else break
  }
  return tokens
}

export function sharesFranchise(a: Game, b: Game): boolean {
  if (a.id === b.id) return true
  const A = stem(a.name)
  const B = stem(b.name)
  if (A.length === 0 || B.length === 0) return false
  const n = Math.min(A.length, B.length)
  let i = 0
  while (i < n && A[i] === B[i]) i++
  if (i === 0) return false
  if (i === A.length || i === B.length) return true
  return i >= 2
}
