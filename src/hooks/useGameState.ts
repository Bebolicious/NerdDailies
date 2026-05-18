import { useCallback, useMemo, useRef, useState } from 'react'
import { getResult, saveResult } from '../lib/scoreStore'
import type { GameType, Guess, IgdbGame, PuzzleResult } from '../lib/types'

type Args = {
  date: string
  gameType: GameType
  totalGuesses: number
  answerGameId: number
}

export function useGameState({
  date,
  gameType,
  totalGuesses,
  answerGameId,
}: Args) {
  const existing = useMemo(
    () => getResult(date, gameType),
    [date, gameType],
  )
  const [guesses, setGuesses] = useState<Guess[]>(existing?.guesses ?? [])
  const [status, setStatus] = useState<'playing' | 'solved' | 'lost'>(
    existing?.status === 'solved'
      ? 'solved'
      : existing?.status === 'lost'
        ? 'lost'
        : 'playing',
  )
  const startedAtRef = useRef<number>(existing?.startedAt ?? Date.now())

  const finalize = useCallback(
    (nextGuesses: Guess[], nextStatus: 'solved' | 'lost') => {
      const result: PuzzleResult = {
        date,
        gameType,
        status: nextStatus,
        guessCount: nextGuesses.length,
        guesses: nextGuesses,
        startedAt: startedAtRef.current,
        finishedAt: Date.now(),
      }
      saveResult(result)
      window.dispatchEvent(new Event('dailies:result-saved'))
    },
    [date, gameType],
  )

  const submitGuess = useCallback(
    (game: IgdbGame) => {
      if (status !== 'playing') return
      const correct = game.id === answerGameId
      const guess: Guess = correct
        ? { kind: 'correct', game, at: Date.now() }
        : { kind: 'wrong', game, at: Date.now() }
      const next = [...guesses, guess]
      setGuesses(next)
      if (correct) {
        setStatus('solved')
        finalize(next, 'solved')
      } else if (next.length >= totalGuesses) {
        setStatus('lost')
        finalize(next, 'lost')
      }
    },
    [answerGameId, finalize, guesses, status, totalGuesses],
  )

  const submitSkip = useCallback(() => {
    if (status !== 'playing') return
    const next: Guess[] = [...guesses, { kind: 'skip', at: Date.now() }]
    setGuesses(next)
    if (next.length >= totalGuesses) {
      setStatus('lost')
      finalize(next, 'lost')
    }
  }, [finalize, guesses, status, totalGuesses])

  const wrongCount = guesses.filter(
    (g) => g.kind === 'wrong' || g.kind === 'skip',
  ).length

  return {
    guesses,
    wrongCount,
    status,
    submitGuess,
    submitSkip,
    guessesRemaining: totalGuesses - guesses.length,
  }
}
