import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Crown,
  Minus,
  Play,
  Plus,
  Scale,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { NeoCard } from "../components/ui/NeoCard";
import { NeoButton } from "../components/ui/NeoButton";
import { TagPill } from "../components/ui/TagPill";
import { InfoButton } from "../components/ui/InfoButton";
import { GuestBanner } from "../components/ui/GuestBanner";
import { ScreenEffects } from "../components/ui/ScreenEffects";
import { useHigherLowerPuzzle } from "../hooks/usePuzzle";
import { todayISO, weekNumber, weekStartISO } from "../lib/dates";
import { cn } from "../lib/cn";
import { saveResult } from "../lib/scoreStore";
import {
  HIGHERLOWER_CATEGORIES,
  HIGHERLOWER_PAIR_COUNT,
  type HigherLowerPair,
  type HigherLowerPuzzle,
  type HighLowPairType,
  type SliderConfig,
} from "../lib/types";
import {
  isSliderCorrect,
  scorePiggyback,
  scoreSliderGuess,
  tagLabel,
  type PiggybackPlayerResult,
} from "../lib/higherlowerScoring";
import {
  CHARACTER_IDS,
  characterStyle,
  getCharacter,
  type CharacterId,
} from "../lib/characters";

type Choice = "a" | "b";
type Mode = "solo" | "multiplayer";

type Pick = {
  pairId: string;
  choice: Choice;
  correct: boolean;
  at: number;
  // For slider/piggyback pairs — the host's (or solo player's) guessed value.
  value?: number;
};

// A pair's play mode, defaulting to 'vs' for legacy rows with no pairType.
function pairKind(pair: HigherLowerPair | undefined): HighLowPairType {
  return pair?.pairType ?? "vs";
}

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  // Each player is dealt a distinct character (portrait + identity color).
  character: CharacterId;
};

const POINTS_PER_CORRECT = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

type Session = {
  version: 1;
  // Mode is undefined for a brand-new session — that's the signal to render the
  // mode-picker modal. Legacy v1 sessions (written before multiplayer existed)
  // get backfilled to 'solo' on load so they keep resuming correctly.
  mode?: Mode;
  index: number;
  picks: Pick[]; // Host picks — solo or multiplayer. Mirrors to scoreStore.
  status: "playing" | "finished";
  startedAt: number;
  finishedAt: number | null;
  revealedForIndex: number | null;

  // ─── multiplayer only ────────────────────────────────────────────────────
  players?: Player[]; // the roster; host at [0]. Display order in the HUD.
  scores?: Record<string, number>; // playerId → cumulative score (×100 increments)
  // playerId → choice for the CURRENT pair only (vs pairs). Cleared when
  // advancing pairs. Order of keys is insertion order.
  currentPairPicks?: Record<string, Choice>;
  // playerId → guessed value for the CURRENT pair only (slider/piggyback
  // pairs). Cleared when advancing pairs. Insertion order = turn order taken.
  currentPairValues?: Record<string, number>;
  // Turn order for the CURRENT pair — player ids, fully reshuffled (host
  // included) at the start of every round so nobody can piggyback off the
  // previous picker. Regenerated on each advance; persisted so a reload keeps
  // the same order mid-round.
  pickOrder?: string[];
  // Host opted out of the "<player> starts!" round-intro popups. Lives in the
  // week-keyed session, so it only suppresses popups for THIS week — next
  // week's fresh session brings them back automatically (never hardcoded off).
  hideRoundIntros?: boolean;
};

function emptySession(now: number): Session {
  return {
    version: 1,
    index: 0,
    picks: [],
    status: "playing",
    startedAt: now,
    finishedAt: null,
    revealedForIndex: null,
  };
}

const SESSION_PREFIX = "dailies/higherlower-session/v1/";

function loadSession(week: string): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + week);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (parsed.version !== 1) return null;
    // Legacy sessions written before multiplayer shipped had no mode. Only
    // treat them as resumable solo runs if there's actual progress — a
    // mode-less session with nothing in it is effectively fresh (e.g. left
    // over from someone bouncing off the setup modal), and should re-show
    // the picker.
    if (!parsed.mode) {
      const hasProgress =
        parsed.picks.length > 0 ||
        parsed.index > 0 ||
        parsed.status === "finished";
      if (!hasProgress) return null;
      parsed.mode = "solo";
    }
    // Multiplayer sessions written before per-round shuffling shipped have no
    // pickOrder. Seed one from the roster so the in-progress round keeps a
    // valid turn order; the next advance reshuffles it.
    if (parsed.mode === "multiplayer" && parsed.players && !parsed.pickOrder) {
      parsed.pickOrder = parsed.players.map((p) => p.id);
    }
    // Sessions written before characters shipped have players with the old
    // `tone` field instead of `character`. Backfill distinct characters by
    // index so they keep rendering.
    if (parsed.mode === "multiplayer" && parsed.players) {
      parsed.players = parsed.players.map((p, i) =>
        p.character
          ? p
          : { ...p, character: CHARACTER_IDS[i % CHARACTER_IDS.length] },
      );
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(week: string, state: Session) {
  try {
    localStorage.setItem(SESSION_PREFIX + week, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fully reshuffled turn order for one round — every player, host included, so
// the lead-off picker is random each round and "piggybacking" off whoever went
// first last round is pointless.
function makePickOrder(players: Player[]): string[] {
  return shuffleInPlace(players.map((p) => p.id));
}

// Deal `n` distinct characters at random. With n = MAX_PLAYERS the whole roster
// is used; for fewer players it's a random subset.
function randomCharacters(n: number): CharacterId[] {
  return shuffleInPlace([...CHARACTER_IDS]).slice(0, n);
}

// Resize a character deal to `target` players WITHOUT disturbing the ones
// already assigned: shrinking just drops the tail, growing appends fresh
// randoms picked only from characters not already in use.
function adjustCharacters(prev: CharacterId[], target: number): CharacterId[] {
  if (target <= prev.length) return prev.slice(0, target);
  const used = new Set(prev);
  const available = shuffleInPlace(CHARACTER_IDS.filter((id) => !used.has(id)));
  return [...prev, ...available.slice(0, target - prev.length)];
}

function makePlayers(names: string[], characters: CharacterId[]): Player[] {
  // Host is always roster slot [0] (stable HUD position). Per-round turn order
  // is randomized separately via makePickOrder. Characters were dealt in the
  // setup modal and travel with each player (host keeps slot-0's character).
  const [hostName, ...restNames] = names;
  const host: Player = {
    id: "host",
    name: hostName.trim() || "Host",
    isHost: true,
    character: characters[0] ?? CHARACTER_IDS[0],
  };
  const rest: Player[] = restNames.map((name, i) => ({
    id: `p${i + 2}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || `Player ${i + 2}`,
    isHost: false,
    character:
      characters[i + 1] ?? CHARACTER_IDS[(i + 1) % CHARACTER_IDS.length],
  }));
  shuffleInPlace(rest);
  return [host, ...rest];
}

export function HigherLowerGame() {
  const today = todayISO();
  const week = weekStartISO(today);
  const puzzle = useHigherLowerPuzzle(week);
  if (!puzzle)
    return <div className="text-sm text-ink-soft">Loading gauntlet…</div>;
  return <Gauntlet key={puzzle.id} puzzle={puzzle} week={week} />;
}

function Gauntlet({
  puzzle,
  week,
}: {
  puzzle: HigherLowerPuzzle;
  week: string;
}) {
  const pairs = puzzle.pairs;
  const total = pairs.length || HIGHERLOWER_PAIR_COUNT;
  const [state, setState] = useState<Session>(
    () => loadSession(week) ?? emptySession(Date.now()),
  );
  // Once the host clicks "Close" on the multiplayer leaderboard modal, we hide
  // it for the rest of the session (the host can still reopen via a button on
  // the solo finale card behind it).
  const [leaderboardOpen, setLeaderboardOpen] = useState(true);
  // The "X starts!" round-intro popup shows once per round in hot-seat. We
  // track the last pair index whose intro was dismissed so it doesn't re-pop
  // after the host closes it (or the countdown auto-starts the round).
  const [introDismissedIndex, setIntroDismissedIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    // Don't persist until the host has actually committed to a mode. This
    // way clicking "Back to dailies" on the setup modal leaves nothing
    // behind — the picker re-appears next time they open the game.
    if (!state.mode) return;
    persistSession(week, state);
  }, [week, state]);

  const currentPair: HigherLowerPair | undefined = pairs[state.index];
  const finished = state.status === "finished";
  const revealed = state.revealedForIndex === state.index;
  const isMultiplayer = state.mode === "multiplayer";
  const kind = pairKind(currentPair);

  // Unified "how many players have committed this round" — vs pairs live in
  // currentPairPicks, slider/piggyback pairs in currentPairValues.
  const pickedCount =
    kind === "vs"
      ? Object.keys(state.currentPairPicks ?? {}).length
      : Object.keys(state.currentPairValues ?? {}).length;

  const correctCount = state.picks.filter((p) => p.correct).length;
  const longestStreak = useMemo(() => longestRun(state.picks), [state.picks]);

  // In multiplayer, the next picker is the player at index = how many have
  // already picked for the current pair. Null when everyone has picked.
  const activePlayer: Player | null = useMemo(() => {
    if (!isMultiplayer || !state.players || !state.pickOrder) return null;
    if (revealed) return null;
    const id = state.pickOrder[pickedCount];
    return state.players.find((p) => p.id === id) ?? null;
  }, [isMultiplayer, state.players, state.pickOrder, pickedCount, revealed]);

  // Per-player slider/piggyback results for the revealed round (display only —
  // the scores were already committed in the reducer with the same functions).
  const roundResults: Record<string, PiggybackPlayerResult> | null =
    useMemo(() => {
      if (!isMultiplayer || !revealed || !currentPair || kind === "vs")
        return null;
      const cfg = HIGHERLOWER_CATEGORIES[currentPair.category];
      if (!cfg.slider || !state.pickOrder || !state.currentPairValues)
        return null;
      if (kind === "piggyback") {
        return scorePiggyback(
          cfg.slider,
          currentPair.a.value,
          state.pickOrder,
          state.currentPairValues,
        );
      }
      // slider — reuse the piggyback shape without split/bluff (all splits 1)
      const out: Record<string, PiggybackPlayerResult> = {};
      for (const id of state.pickOrder) {
        const v = state.currentPairValues[id];
        if (v === undefined) continue;
        const s = scoreSliderGuess(cfg.slider, currentPair.a.value, v);
        out[id] = {
          value: v,
          base: s.points,
          split: 1,
          points: s.points,
          tag: s.tag,
          diff: s.diff,
          isBar: false,
        };
      }
      return out;
    }, [
      isMultiplayer,
      revealed,
      currentPair,
      kind,
      state.pickOrder,
      state.currentPairValues,
    ]);

  // The player who leads off the current round (pickOrder[0]). Drives the
  // round-intro popup.
  const startingPlayer: Player | null = useMemo(() => {
    if (!isMultiplayer || !state.players || !state.pickOrder) return null;
    const id = state.pickOrder[0];
    return state.players.find((p) => p.id === id) ?? null;
  }, [isMultiplayer, state.players, state.pickOrder]);

  // Show the round-intro popup at the top of each hot-seat round: in
  // multiplayer, before anyone has picked, and not yet dismissed for this pair.
  const showRoundIntro =
    isMultiplayer &&
    !finished &&
    !revealed &&
    !state.hideRoundIntros &&
    !!startingPlayer &&
    pickedCount === 0 &&
    introDismissedIndex !== state.index;

  // The index of the round that just became playable (intro popup gone, nobody
  // has picked yet) — or null. Flips to a number the instant a fresh round
  // opens up, which is the cue to buzz the starting player's HUD card.
  const playReadyIndex =
    isMultiplayer && !finished && !revealed && !showRoundIntro && pickedCount === 0
      ? state.index
      : null;

  // Host's in-popup checkbox to silence the round-intro popups for the rest of
  // this week. Stored on the week-keyed session so it resets next week.
  const onToggleHideIntros = useCallback((next: boolean) => {
    setState((prev) => ({ ...prev, hideRoundIntros: next }));
  }, []);

  const onConfirmSolo = useCallback(() => {
    setState((prev) => ({ ...prev, mode: "solo" }));
  }, []);

  const onConfirmMultiplayer = useCallback(
    (names: string[], characters: CharacterId[]) => {
      setState((prev) => {
        const players = makePlayers(names, characters);
        return {
          ...prev,
          mode: "multiplayer",
          players,
          scores: Object.fromEntries(players.map((p) => [p.id, 0])),
          currentPairPicks: {},
          pickOrder: makePickOrder(players),
        };
      });
      setLeaderboardOpen(true);
      setIntroDismissedIndex(null);
    },
    [],
  );

  const onPick = useCallback(
    (choice: Choice) => {
      if (!currentPair || revealed || finished) return;
      setState((prev) => {
        if (prev.mode === "multiplayer") {
          return applyMultiplayerPick(prev, currentPair, choice);
        }
        // Solo path (also handles the legacy backfilled sessions).
        const correct = isCorrect(currentPair, choice);
        return {
          ...prev,
          revealedForIndex: prev.index,
          picks: [
            ...prev.picks,
            { pairId: currentPair.id, choice, correct, at: Date.now() },
          ],
        };
      });
    },
    [currentPair, revealed, finished],
  );

  // Slider / piggyback: a player locks in a numeric guess.
  const onSubmitValue = useCallback(
    (value: number) => {
      if (!currentPair || revealed || finished) return;
      setState((prev) => {
        if (prev.mode === "multiplayer") {
          return applyMultiplayerValue(prev, currentPair, value);
        }
        // Solo slider — score the single guess. (Solo piggyback never reaches
        // here; it's auto-resolved by onSoloPiggyback below.)
        const cfg = HIGHERLOWER_CATEGORIES[currentPair.category];
        const correct = cfg.slider
          ? isSliderCorrect(scoreSliderGuess(cfg.slider, currentPair.a.value, value))
          : true;
        return {
          ...prev,
          revealedForIndex: prev.index,
          picks: [
            ...prev.picks,
            { pairId: currentPair.id, choice: "a", value, correct, at: Date.now() },
          ],
        };
      });
    },
    [currentPair, revealed, finished],
  );

  // Solo + piggyback: the bluff game is hot-seat only, so in solo we bank it as
  // correct and reveal (the player just clicks through). No score interaction.
  const onSoloPiggyback = useCallback(() => {
    if (!currentPair || revealed || finished) return;
    setState((prev) => ({
      ...prev,
      revealedForIndex: prev.index,
      picks: [
        ...prev.picks,
        { pairId: currentPair.id, choice: "a", correct: true, at: Date.now() },
      ],
    }));
  }, [currentPair, revealed, finished]);

  const onNext = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.index + 1;
      if (nextIndex >= total) {
        const finalized: Session = {
          ...prev,
          index: prev.index, // freeze on last
          status: "finished",
          finishedAt: Date.now(),
          revealedForIndex: prev.revealedForIndex,
        };
        const score = finalized.picks.filter((p) => p.correct).length;
        // Mirror to scoreStore so the sidebar/streak picks it up. Higher/Lower
        // has no real "lost" state — completing the gauntlet always counts as
        // solved; the guessCount field carries the score. In multiplayer this
        // still uses the host's picks (which are in `picks`), so daily
        // tracking matches solo behavior.
        saveResult({
          date: week,
          gameType: "higherlower",
          status: "solved",
          guessCount: score,
          guesses: finalized.picks.map((p) => ({
            kind: p.correct ? ("correct" as const) : ("wrong" as const),
            game: { id: -1, name: `pair ${p.pairId}` },
            at: p.at,
          })),
          startedAt: finalized.startedAt,
          finishedAt: finalized.finishedAt!,
        });
        window.dispatchEvent(new Event("dailies:result-saved"));
        return finalized;
      }
      return {
        ...prev,
        index: nextIndex,
        revealedForIndex: null,
        currentPairPicks:
          prev.mode === "multiplayer" ? {} : prev.currentPairPicks,
        currentPairValues:
          prev.mode === "multiplayer" ? {} : prev.currentPairValues,
        // Reshuffle the turn order for the new round (hot-seat only).
        pickOrder:
          prev.mode === "multiplayer" && prev.players
            ? makePickOrder(prev.players)
            : prev.pickOrder,
      };
    });
  }, [total, week]);

  const onPlayAgain = useCallback(() => {
    // Replay resets the session entirely — including the multiplayer roster.
    // The mode picker will reappear so the host can pick again. The "hide
    // intros" choice is week-scoped, so carry it across a same-week replay.
    setState((prev) => ({
      ...emptySession(Date.now()),
      hideRoundIntros: prev.hideRoundIntros,
    }));
    setLeaderboardOpen(true);
    setIntroDismissedIndex(null);
  }, []);

  if (pairs.length === 0) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wider mb-3">
          Higher / Lower
        </h1>
        <NeoCard tone="paper" shadow="md" className="p-5">
          <div className="text-sm">
            No pairs are queued for week #{weekNumber(week)}. Check back later
            or ping the admin.
          </div>
        </NeoCard>
      </div>
    );
  }

  return (
    <div className="max-w-5xl pb-32">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h1 className="font-display text-xl uppercase tracking-wider font-bold flex items-center gap-2">
          <Scale className="h-5 w-5 stroke-[3]" />
          Higher / Lower
          <span className="text-[10px] text-ink-soft font-bold ml-2">
            · Week #{weekNumber(week)}
          </span>
          {isMultiplayer && (
            <TagPill tone="teal" className="ml-1">
              <Users className="inline h-3 w-3 stroke-[3] mr-1" /> Hot-seat
            </TagPill>
          )}
        </h1>
        <InfoButton
          title="Higher / Lower"
          text={`Weekly gauntlet of ${total} rounds. Most are VS — pick the side with the bigger stat. Some are SLIDER — drag to guess the exact value (Bang on = 150, Bullseye = 100, then it decays with distance). In hot-seat, PIGGYBACK rounds let the lead-off player bluff: copy someone and you split points; fool the table and the bluffer banks a bonus. Wrong picks never end the run — you always play all ${total}.`}
        />
      </div>

      {puzzle.theme && (
        <div className="mb-3 text-xs uppercase tracking-[0.2em] text-ink-soft font-display">
          ▸ {puzzle.theme}
        </div>
      )}

      <ScoreBar
        index={Math.min(state.index, total - 1)}
        total={total}
        correct={correctCount}
        finished={finished}
      />

      {isMultiplayer && activePlayer && !finished && (
        <TurnBanner player={activePlayer} pair={currentPair} />
      )}

      {!finished && currentPair && kind === "vs" && (
        <PairScreen
          pair={currentPair}
          revealed={revealed}
          onPick={onPick}
          onNext={onNext}
          isLast={state.index === total - 1}
          // In solo we look up the player's pick directly from the picks array.
          // In multiplayer the "you" framing doesn't apply — multiple players
          // pick per pair — so we hide the "your pick" stamp.
          pickedChoice={
            !isMultiplayer && revealed
              ? (state.picks[state.picks.length - 1]?.choice ?? null)
              : null
          }
          mode={state.mode ?? "solo"}
        />
      )}

      {!finished && currentPair && (kind === "slider" || kind === "piggyback") && (
        <SliderPairScreen
          pair={currentPair}
          kind={kind}
          revealed={revealed}
          isMultiplayer={isMultiplayer}
          isLast={state.index === total - 1}
          activePlayer={activePlayer}
          players={state.players ?? null}
          pickOrder={state.pickOrder ?? null}
          currentPairValues={state.currentPairValues ?? {}}
          roundResults={roundResults}
          soloValue={
            !isMultiplayer && revealed
              ? (state.picks[state.picks.length - 1]?.value ?? null)
              : null
          }
          onSubmitValue={onSubmitValue}
          onSoloPiggyback={onSoloPiggyback}
          onNext={onNext}
        />
      )}

      {finished && (
        <FinaleCard
          puzzle={puzzle}
          picks={state.picks}
          longestStreak={longestStreak}
          total={total}
          week={week}
          onPlayAgain={onPlayAgain}
          onReopenLeaderboard={
            isMultiplayer ? () => setLeaderboardOpen(true) : undefined
          }
        />
      )}

      {/* Sticky bottom HUD — multiplayer only. */}
      {isMultiplayer && state.players && state.scores && (
        <PlayerHud
          players={state.players}
          scores={state.scores}
          activePlayerId={activePlayer?.id ?? null}
          currentPairPicks={state.currentPairPicks ?? {}}
          currentPairValues={state.currentPairValues ?? {}}
          kind={kind}
          roundResults={roundResults}
          revealed={revealed}
          currentPair={currentPair}
          playReadyIndex={playReadyIndex}
          startingPlayerId={startingPlayer?.id ?? null}
          pickOrder={state.pickOrder ?? null}
        />
      )}

      {/* Round-intro popup — hot-seat only. Flies up from the bottom at the
          start of each round announcing who leads off (since turn order is
          reshuffled every round). Closes on the button, on backdrop click, or
          automatically when the 7-second countdown elapses. */}
      {showRoundIntro && startingPlayer && (
        <RoundIntro
          key={state.index}
          player={startingPlayer}
          pairNumber={Math.min(state.index + 1, total)}
          hideForWeek={!!state.hideRoundIntros}
          onToggleHide={onToggleHideIntros}
          onClose={() => setIntroDismissedIndex(state.index)}
        />
      )}

      {/* Setup modal — only rendered on a brand-new session, before mode is
          picked. Backdrop blurs the game card behind. */}
      {!state.mode && (
        <ModeSetup
          onSolo={onConfirmSolo}
          onMultiplayer={onConfirmMultiplayer}
        />
      )}

      {/* End-of-week multiplayer leaderboard — overlays the host's normal
          finale card. Host can close it to see their solo-style breakdown,
          and reopen it via a button on the finale. */}
      {finished &&
        isMultiplayer &&
        leaderboardOpen &&
        state.players &&
        state.scores && (
          <LeaderboardModal
            players={state.players}
            scores={state.scores}
            total={total}
            onClose={() => setLeaderboardOpen(false)}
            onPlayAgain={onPlayAgain}
          />
        )}
    </div>
  );
}

function applyMultiplayerPick(
  prev: Session,
  currentPair: HigherLowerPair,
  choice: Choice,
): Session {
  if (!prev.players || !prev.scores || !prev.pickOrder) return prev;
  const pairPicks = prev.currentPairPicks ?? {};
  const numPicked = Object.keys(pairPicks).length;
  const playerId = prev.pickOrder[numPicked];
  const player = prev.players.find((p) => p.id === playerId);
  if (!player) return prev;
  if (pairPicks[player.id] !== undefined) return prev;

  const correct = isCorrect(currentPair, choice);
  const nextPairPicks: Record<string, Choice> = {
    ...pairPicks,
    [player.id]: choice,
  };

  // Mirror host's pick into the solo-style picks array so the scoreStore mirror
  // at end-of-week still records the host's run accurately.
  const nextPicks = player.isHost
    ? [
        ...prev.picks,
        { pairId: currentPair.id, choice, correct, at: Date.now() },
      ]
    : prev.picks;

  const isLast = numPicked + 1 === prev.players.length;
  if (!isLast) {
    return { ...prev, picks: nextPicks, currentPairPicks: nextPairPicks };
  }

  // Last player just picked — reveal the answer and award +100 to every
  // player whose pick was correct (ties count, matching solo).
  const nextScores: Record<string, number> = { ...prev.scores };
  for (const p of prev.players) {
    const c = nextPairPicks[p.id];
    if (c && isCorrect(currentPair, c)) {
      nextScores[p.id] = (nextScores[p.id] ?? 0) + POINTS_PER_CORRECT;
    }
  }
  return {
    ...prev,
    picks: nextPicks,
    currentPairPicks: nextPairPicks,
    scores: nextScores,
    revealedForIndex: prev.index,
  };
}

// Hot-seat slider / piggyback: record the active player's numeric guess. On the
// last guess, score the whole round (slider curve, plus piggyback split + bluff
// bonuses) and reveal.
function applyMultiplayerValue(
  prev: Session,
  pair: HigherLowerPair,
  value: number,
): Session {
  if (!prev.players || !prev.scores || !prev.pickOrder) return prev;
  const cfg = HIGHERLOWER_CATEGORIES[pair.category];
  if (!cfg.slider) return prev; // safety — should never author a non-slider single
  const vals = prev.currentPairValues ?? {};
  const count = Object.keys(vals).length;
  const playerId = prev.pickOrder[count];
  if (!playerId || vals[playerId] !== undefined) return prev;

  const nextVals: Record<string, number> = { ...vals, [playerId]: value };
  const isLast = count + 1 === prev.players.length;
  if (!isLast) {
    return { ...prev, currentPairValues: nextVals };
  }

  // Everyone has guessed — compute points and reveal.
  const kind = pairKind(pair);
  const perPlayerPoints: Record<string, number> = {};
  if (kind === "piggyback") {
    const res = scorePiggyback(cfg.slider, pair.a.value, prev.pickOrder, nextVals);
    for (const id of Object.keys(res)) perPlayerPoints[id] = res[id].points;
  } else {
    for (const p of prev.players) {
      const v = nextVals[p.id];
      if (v === undefined) continue;
      perPlayerPoints[p.id] = scoreSliderGuess(cfg.slider, pair.a.value, v).points;
    }
  }

  const nextScores: Record<string, number> = { ...prev.scores };
  for (const id of Object.keys(perPlayerPoints)) {
    nextScores[id] = (nextScores[id] ?? 0) + perPlayerPoints[id];
  }

  // Mirror the host's guess into the solo-style picks array for the daily
  // streak. A bullseye-or-better counts as "correct".
  const host = prev.players.find((p) => p.isHost);
  let nextPicks = prev.picks;
  if (host) {
    const hv = nextVals[host.id];
    const correct =
      hv !== undefined && isSliderCorrect(scoreSliderGuess(cfg.slider, pair.a.value, hv));
    nextPicks = [
      ...prev.picks,
      { pairId: pair.id, choice: "a", value: hv, correct, at: Date.now() },
    ];
  }

  return {
    ...prev,
    currentPairValues: nextVals,
    scores: nextScores,
    picks: nextPicks,
    revealedForIndex: prev.index,
  };
}

// ─── character avatar ────────────────────────────────────────────────────────

// Square portrait of a player's character, color-backed (shows through if the
// art has transparency). Host gets a small crown badge in the corner.
function CharacterAvatar({
  characterId,
  isHost,
  showHostBadge = true,
  size,
  badgeSize,
  className,
}: {
  characterId: CharacterId;
  isHost?: boolean;
  // Whether to overlay the corner crown badge on the host's portrait. The setup
  // modal turns this off and shows a larger standalone crown in the row.
  showHostBadge?: boolean;
  size: number;
  // Override the crown badge square size (px). Defaults to proportional to the
  // avatar; the round-intro popup passes a small value so the big portrait
  // isn't dominated by the crown.
  badgeSize?: number;
  className?: string;
}) {
  const c = getCharacter(characterId);
  const badge = badgeSize ?? Math.round(size * 0.46);
  return (
    <div
      className={cn(
        "relative border-[2px] border-stroke overflow-hidden shrink-0",
        className,
      )}
      style={{ width: size, height: size, background: c.background }}
      aria-hidden
    >
      <img
        src={c.img}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      {isHost && showHostBadge && (
        <span
          className="absolute top-0 right-0 bg-mustard text-ink-static border-l-[2px] border-b-[2px] border-stroke flex items-center justify-center"
          style={{ width: badge, height: badge }}
        >
          <Crown size={Math.round(badge * 0.6)} className="stroke-[3]" />
        </span>
      )}
    </div>
  );
}

// ─── setup modal ────────────────────────────────────────────────────────────

function ModeSetup({
  onSolo,
  onMultiplayer,
}: {
  onSolo: () => void;
  onMultiplayer: (names: string[], characters: CharacterId[]) => void;
}) {
  const [picked, setPicked] = useState<Mode | null>(null);
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(() => defaultNames(3));
  // Distinct characters dealt per player slot. Reshuffled whenever the player
  // count changes (and when hot-seat is first picked) so the roster is random.
  const [characters, setCharacters] = useState<CharacterId[]>(() =>
    randomCharacters(3),
  );

  function setCountAndPad(next: number) {
    const clamped = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, next));
    setCount(clamped);
    setNames((prev) => {
      const out = prev.slice(0, clamped);
      while (out.length < clamped) {
        out.push(defaultNames(clamped)[out.length]);
      }
      return out;
    });
    // Keep already-assigned characters; only the incoming player(s) get a fresh
    // random character from the ones not yet in use.
    setCharacters((prev) => adjustCharacters(prev, clamped));
  }

  function patchName(idx: number, value: string) {
    setNames((prev) => prev.map((n, i) => (i === idx ? value : n)));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose how to play Higher / Lower"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-emphasis/70 backdrop-blur-sm" />
      <NeoCard
        tone="paper"
        shadow="lg"
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Scale className="h-4 w-4 stroke-[3]" />
          <div className="font-display text-[10px] uppercase tracking-[0.2em] font-bold">
            Higher / Lower · setup
          </div>
        </div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wider leading-tight mb-3">
          How are you playing?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <ModeButton
            tone="lime"
            label="Solo"
            sub="Play the gauntlet on your own — your score lands on the daily."
            active={picked === "solo"}
            onClick={() => setPicked("solo")}
          />
          <ModeButton
            tone="teal"
            label="Online Hot-seat"
            sub="Share your screen; click for each friend. Host's score still saves to the daily."
            active={picked === "multiplayer"}
            onClick={() => {
              setPicked("multiplayer");
              setCharacters(randomCharacters(count));
            }}
            icon={<Users className="h-4 w-4 stroke-[3]" />}
          />
        </div>

        {picked === "multiplayer" && (
          <div className="flex flex-col gap-4">
            <div className="border-neo-2 bg-cream-soft p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-display text-xs uppercase tracking-wider font-bold flex items-center gap-2">
                <Users className="h-3.5 w-3.5 stroke-[3]" /> Players
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCountAndPad(count - 1)}
                  disabled={count <= MIN_PLAYERS}
                  aria-label="Fewer players"
                  className="border-neo-2 p-1.5 bg-paper hover:bg-coral hover:text-ink-static disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3 w-3 stroke-[3]" />
                </button>
                <div className="font-display text-xl font-bold tabular-nums w-8 text-center">
                  {count}
                </div>
                <button
                  type="button"
                  onClick={() => setCountAndPad(count + 1)}
                  disabled={count >= MAX_PLAYERS}
                  aria-label="More players"
                  className="border-neo-2 p-1.5 bg-paper hover:bg-lime hover:text-ink-static disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3 w-3 stroke-[3]" />
                </button>
                <span className="text-[10px] uppercase tracking-wider text-ink-soft font-display ml-1">
                  · max {MAX_PLAYERS}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {names.map((n, i) => {
                const isHost = i === 0;
                const characterId =
                  characters[i] ?? CHARACTER_IDS[i % CHARACTER_IDS.length];
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 border-neo-2 bg-cream-soft p-2"
                  >
                    <CharacterAvatar
                      characterId={characterId}
                      isHost={isHost}
                      showHostBadge={false}
                      size={36}
                    />
                    <input
                      value={n}
                      onChange={(e) => patchName(i, e.target.value)}
                      placeholder={isHost ? "Host" : `Player ${i + 1}`}
                      className="flex-1 border-neo-2 bg-paper px-2 py-1.5 text-sm font-bold outline-none focus:bg-cream-soft min-w-0"
                    />
                    <span className="font-display text-[9px] uppercase tracking-wider text-ink-soft shrink-0 w-16 text-right">
                      {getCharacter(characterId).label}
                    </span>
                    {isHost && (
                      <Crown
                        className="h-6 w-6 stroke-[3] shrink-0 text-mustard-deep fill-mustard ml-2"
                        aria-label="Host"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-display">
              ▸ Characters are dealt at random · turn order reshuffles every
              round (host included)
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/screenshot"
            className="font-display text-[10px] uppercase tracking-wider text-ink-soft underline mr-auto"
          >
            ← Back to dailies
          </Link>
          <NeoButton
            tone={picked === "multiplayer" ? "teal" : "lime"}
            disabled={!picked}
            onClick={() => {
              if (picked === "solo") onSolo();
              else if (picked === "multiplayer")
                onMultiplayer(names, characters);
            }}
          >
            {picked === "multiplayer" ? "Start hot-seat" : "Play"}
          </NeoButton>
        </div>
      </NeoCard>
    </div>
  );
}

function ModeButton({
  tone,
  label,
  sub,
  active,
  onClick,
  icon,
}: {
  tone: "lime" | "teal";
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-neo shadow-neo text-left p-4 transition-all",
        active
          ? tone === "lime"
            ? "bg-lime text-ink-static"
            : "bg-teal text-ink-static"
          : "bg-paper hover:bg-cream-soft",
        "hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-lg",
        "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
      )}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <div className="font-display text-lg uppercase tracking-wider font-bold leading-none">
          {label}
        </div>
      </div>
      <div className="text-xs opacity-90 leading-snug">{sub}</div>
    </button>
  );
}

function defaultNames(count: number): string[] {
  const names: string[] = ["Host"];
  for (let i = 1; i < count; i++) names.push(`Player ${i + 1}`);
  return names;
}

// ─── round intro popup ──────────────────────────────────────────────────────

const ROUND_INTRO_SECONDS = 10;

function RoundIntro({
  player,
  pairNumber,
  hideForWeek,
  onToggleHide,
  onClose,
}: {
  player: Player;
  pairNumber: number;
  hideForWeek: boolean;
  onToggleHide: (next: boolean) => void;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState(ROUND_INTRO_SECONDS);
  // Keep the latest onClose without re-running the timer effect (which would
  // reset the countdown). The component is keyed by pair index, so a fresh
  // timer starts for each round.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const left =
        ROUND_INTRO_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        setRemaining(0);
        onCloseRef.current();
      } else {
        setRemaining(left);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} starts round ${pairNumber}`}
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:p-8"
    >
      <button
        type="button"
        aria-label="Start round"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer"
      />
      <NeoCard
        tone="paper"
        shadow="lg"
        className="relative w-full max-w-md mb-2 sm:mb-12 p-0 overflow-hidden animate-achievement-pop"
      >
        <div
          className="px-5 py-4 border-b-[3px] border-stroke flex items-center gap-3"
          style={characterStyle(player.character)}
        >
          <CharacterAvatar
            characterId={player.character}
            isHost={player.isHost}
            size={112}
            badgeSize={20}
          />
          <div className="min-w-0 flex-1">
            <div className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide leading-[0.95] text-left">
              <span className="block break-words">{player.name}</span>
              <span className="block">Starts!</span>
            </div>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-ink-soft leading-snug max-w-[55%]">
            Turn order is shuffled every round.
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 font-display text-[10px] uppercase tracking-wider text-ink-soft">
              <span>Auto-start</span>
              <span className="w-9 h-9 border-neo-2 bg-cream-soft text-ink flex items-center justify-center font-bold text-lg tabular-nums">
                {remaining}
              </span>
            </div>
            <NeoButton tone="teal" size="sm" onClick={onClose}>
              <Play className="inline h-3 w-3 mr-1" /> Start
            </NeoButton>
          </div>
        </div>
        <label className="flex items-center gap-2 px-4 py-3 border-t-[3px] border-stroke cursor-pointer select-none hover:bg-cream-soft">
          <input
            type="checkbox"
            checked={hideForWeek}
            onChange={(e) => onToggleHide(e.target.checked)}
            className="w-4 h-4 accent-teal shrink-0"
          />
          <span className="font-display text-[11px] uppercase tracking-wider font-bold">
            Don&apos;t show these popups again this week
          </span>
        </label>
      </NeoCard>
    </div>
  );
}

// ─── in-game pieces ─────────────────────────────────────────────────────────

function TurnBanner({
  player,
  pair,
}: {
  player: Player;
  pair: HigherLowerPair | undefined;
}) {
  const cfg = pair ? HIGHERLOWER_CATEGORIES[pair.category] : null;
  // Single-game rounds ask for an exact value, not a side.
  const prompt = cfg
    ? pairKind(pair) === "vs"
      ? cfg.question
      : (cfg.sliderQuestion ?? `Guess the ${cfg.valueLabel}`)
    : null;
  return (
    <div
      className="border-neo-2 shadow-neo-sm px-3 py-2 mb-2 flex items-center justify-between gap-3 flex-wrap"
      style={characterStyle(player.character)}
    >
      <div className="flex items-center gap-2 min-w-0">
        <CharacterAvatar
          characterId={player.character}
          isHost={player.isHost}
          size={24}
        />
        <div className="font-display text-xs sm:text-sm uppercase tracking-wider font-bold truncate">
          {player.name}
          <span className="opacity-70 ml-1">· your turn</span>
        </div>
      </div>
      {prompt && (
        <div className="font-display text-[10px] sm:text-xs uppercase tracking-wider font-bold text-right opacity-90 min-w-0">
          {prompt}
        </div>
      )}
    </div>
  );
}

function ScoreBar({
  index,
  total,
  correct,
  finished,
}: {
  index: number;
  total: number;
  correct: number;
  finished: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
        {finished
          ? "Finished"
          : `Pair ${Math.min(index + 1, total)} / ${total}`}
      </div>
      <div className="flex-1 h-3 border-neo-2 bg-paper relative min-w-[120px]">
        <div
          className="absolute inset-y-0 left-0 bg-teal transition-[width]"
          style={{
            width: `${(Math.min(index + (finished ? 1 : 0), total) / total) * 100}%`,
          }}
        />
      </div>
      <TagPill tone="teal">
        ✓ {correct} / {total}
      </TagPill>
    </div>
  );
}

function PairScreen({
  pair,
  revealed,
  onPick,
  onNext,
  isLast,
  pickedChoice,
  mode,
}: {
  pair: HigherLowerPair;
  revealed: boolean;
  onPick: (c: Choice) => void;
  onNext: () => void;
  isLast: boolean;
  pickedChoice: Choice | null;
  mode: Mode;
}) {
  const cfg = HIGHERLOWER_CATEGORIES[pair.category];
  // vs pairs always carry a side B; bail defensively if a bad row lacks one.
  const sideB = pair.b;
  if (!sideB) return null;
  // Most categories award the larger value; "lowerWins" ones (fastest run,
  // earliest movie) award the smaller.
  const lowerWins = cfg?.lowerWins ?? false;
  const aBeatsB = lowerWins
    ? pair.a.value <= sideB.value
    : pair.a.value >= sideB.value;
  const correctSide: Choice = aBeatsB ? "a" : "b";
  // Tie-breaker visual: a true tie isn't really winnable, but if the admin sets
  // identical values we award whichever the player picked.
  const tied = pair.a.value === sideB.value;
  const playerWasCorrect = pickedChoice === correctSide || tied;

  return (
    <NeoCard tone="paper" shadow="md" className="p-5 mt-2">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <TagPill tone="teal">{cfg?.label ?? pair.category}</TagPill>
        <div className="font-display text-sm md:text-base uppercase tracking-wider font-bold text-right">
          {cfg?.question ?? "Which is higher?"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-3 md:gap-4">
        <SideCard
          side={pair.a}
          revealed={revealed}
          valueLabel={cfg?.valueLabel ?? "value"}
          isCorrect={correctSide === "a" || tied}
          isPicked={pickedChoice === "a"}
          onPick={() => onPick("a")}
          disabled={revealed}
        />
        <div className="hidden md:flex items-center justify-center font-display text-xl font-bold uppercase tracking-wider text-ink-soft px-2">
          vs
        </div>
        <div className="md:hidden font-display text-xs uppercase tracking-wider text-ink-soft text-center">
          vs
        </div>
        <SideCard
          side={sideB}
          revealed={revealed}
          valueLabel={cfg?.valueLabel ?? "value"}
          isCorrect={correctSide === "b" || tied}
          isPicked={pickedChoice === "b"}
          onPick={() => onPick("b")}
          disabled={revealed}
        />
      </div>

      {revealed && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {mode === "solo" ? (
            <div
              className={cn(
                "border-neo-2 px-3 py-2 font-display text-xs uppercase tracking-wider font-bold flex items-center gap-2",
                playerWasCorrect
                  ? "bg-lime text-ink-static"
                  : "bg-coral text-ink-static",
              )}
            >
              {playerWasCorrect ? (
                <>
                  <Check className="h-4 w-4 stroke-[3]" /> Correct
                </>
              ) : (
                <>
                  <X className="h-4 w-4 stroke-[3]" /> Wrong
                </>
              )}
              {tied && (
                <span className="ml-2 opacity-80">· tied — counted</span>
              )}
            </div>
          ) : (
            // In multiplayer, individual hits/misses are surfaced on each
            // player card — we just need to label the reveal here.
            <div className="border-neo-2 px-3 py-2 font-display text-xs uppercase tracking-wider font-bold flex items-center gap-2 bg-cream-soft">
              <Check className="h-4 w-4 stroke-[3]" /> Revealed · scores updated
            </div>
          )}
          <NeoButton tone="teal" onClick={onNext}>
            {isLast ? "See results" : "Next pair"}{" "}
            <ChevronRight className="inline h-4 w-4 ml-1" />
          </NeoButton>
        </div>
      )}
    </NeoCard>
  );
}

function SideCard({
  side,
  revealed,
  valueLabel,
  isCorrect,
  isPicked,
  onPick,
  disabled,
}: {
  side: HigherLowerPair["a"];
  revealed: boolean;
  valueLabel: string;
  isCorrect: boolean;
  isPicked: boolean;
  onPick: () => void;
  disabled: boolean;
}) {
  const valueDisplay = side.display ?? formatNumber(side.value);
  const borderTone = revealed
    ? isCorrect
      ? "bg-lime text-ink-static"
      : "bg-coral text-ink-static"
    : "bg-paper";
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={cn(
        "border-neo shadow-neo text-left transition-all overflow-hidden relative group",
        borderTone,
        !disabled &&
          "hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-lg",
        disabled && "cursor-default",
      )}
      aria-label={`Pick ${side.game_name}`}
    >
      <CoverArt side={side} />
      <div className="p-4">
        <div className="font-display text-base sm:text-lg uppercase tracking-wider font-bold leading-tight">
          {side.game_name}
        </div>
        <div className="mt-3 border-t-2 border-stroke pt-2">
          <div className="font-display text-[10px] uppercase tracking-wider opacity-80">
            {valueLabel}
          </div>
          <div
            className={cn(
              "font-display font-bold leading-none mt-1 tabular-nums",
              revealed ? "text-2xl" : "text-2xl",
            )}
          >
            {revealed ? valueDisplay : "???"}
          </div>
        </div>
      </div>
      {revealed && isPicked && (
        <div
          className={cn(
            "absolute top-2 left-2 border-neo-2 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider font-bold",
            "bg-paper text-ink",
          )}
        >
          your pick
        </div>
      )}
    </button>
  );
}

function CoverArt({ side }: { side: HigherLowerPair["a"] }) {
  if (side.cover_url) {
    return (
      <div className="aspect-[3/2] bg-cream-soft border-b-[3px] border-stroke overflow-hidden">
        <img
          src={side.cover_url}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  // Fallback placeholder so missing covers still look intentional.
  const initial = side.game_name.charAt(0).toUpperCase();
  return (
    <div className="aspect-[3/2] bg-cream-soft border-b-[3px] border-stroke flex items-center justify-center">
      <span className="font-display text-6xl font-bold text-ink-soft">
        {initial}
      </span>
    </div>
  );
}

// ─── slider / piggyback pairs ────────────────────────────────────────────────

function formatSliderValue(v: number, slider: SliderConfig): string {
  if (!Number.isInteger(v)) return `${v.toFixed(1)}${slider.unit ?? ""}`;
  // Only large counts get thousands separators — years/scores stay bare.
  const num = Math.abs(v) >= 10000 ? v.toLocaleString() : String(v);
  return `${num}${slider.unit ?? ""}`;
}

function midpointValue(slider: SliderConfig): number {
  const mid = (slider.min + slider.max) / 2;
  const snapped =
    Math.round((mid - slider.min) / slider.step) * slider.step + slider.min;
  return Number(snapped.toFixed(2));
}

// The fancy value slider. A floating value bubble tracks the thumb over a
// brutalist filled track.
function GuessSlider({
  slider,
  value,
  onChange,
  tone = "teal",
}: {
  slider: SliderConfig;
  value: number;
  onChange: (v: number) => void;
  tone?: "teal" | "mustard";
}) {
  const pct = ((value - slider.min) / (slider.max - slider.min)) * 100;
  return (
    <div className="mt-4 select-none">
      <div className="relative h-14">
        <div
          className="absolute -translate-x-1/2 transition-[left] duration-75"
          style={{ left: `${pct}%` }}
        >
          <div className="border-neo-2 bg-paper shadow-neo-sm px-3 py-1.5 font-display text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
            {formatSliderValue(value, slider)}
          </div>
          <div className="w-2.5 h-2.5 border-r-[2px] border-b-[2px] border-stroke bg-paper rotate-45 mx-auto -mt-[6px]" />
        </div>
      </div>
      <div className="relative">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 border-neo-2 bg-cream-soft overflow-hidden pointer-events-none">
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              tone === "mustard" ? "bg-mustard" : "bg-teal",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "relative w-full h-6 cursor-pointer bg-transparent",
            tone === "mustard" ? "accent-mustard" : "accent-teal",
          )}
          aria-label="Your guess"
        />
      </div>
      <div className="flex justify-between mt-1 font-display text-[10px] uppercase tracking-wider text-ink-soft tabular-nums">
        <span>{formatSliderValue(slider.min, slider)}</span>
        <span>{formatSliderValue(slider.max, slider)}</span>
      </div>
    </div>
  );
}

// One player's (or the solo player's) turn to set a value. Keyed by player id
// at the call site so it remounts fresh — resetting the slider — each turn.
function SliderInput({
  slider,
  tone,
  submitLabel,
  onSubmit,
}: {
  slider: SliderConfig;
  tone: "teal" | "mustard";
  submitLabel: string;
  onSubmit: (v: number) => void;
}) {
  const [value, setValue] = useState(() => midpointValue(slider));
  return (
    <div>
      <GuessSlider slider={slider} value={value} onChange={setValue} tone={tone} />
      <div className="mt-4 flex justify-end">
        <NeoButton tone={tone} onClick={() => onSubmit(value)}>
          {submitLabel}
        </NeoButton>
      </div>
    </div>
  );
}

function SingleGameCard({
  side,
  valueLabel,
  revealed,
  actualDisplay,
}: {
  side: HigherLowerPair["a"];
  valueLabel: string;
  revealed: boolean;
  actualDisplay: string;
}) {
  // Compact card: a small square cover to the left of the centered title +
  // value block, so the round stays tight and the slider + player HUD all fit
  // on one screen. The art is incidental here; the value is the star.
  const initial = side.game_name.charAt(0).toUpperCase();
  return (
    <div className="border-neo shadow-neo p-4 flex items-center justify-center gap-4">
      <div className="w-24 h-24 border-neo-2 bg-cream-soft overflow-hidden flex items-center justify-center shrink-0">
        {side.cover_url ? (
          <img
            src={side.cover_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-display text-4xl font-bold text-ink-soft">
            {initial}
          </span>
        )}
      </div>
      <div className="text-center min-w-0">
        <div className="font-display text-base sm:text-lg uppercase tracking-wider font-bold leading-tight">
          {side.game_name}
        </div>
        <div className="mt-2 font-display text-[10px] uppercase tracking-wider opacity-70">
          {valueLabel}
        </div>
        <div
          className={cn(
            "font-display text-3xl font-bold leading-none tabular-nums mt-1",
            revealed ? "text-ink" : "text-ink-soft",
          )}
        >
          {revealed ? actualDisplay : "???"}
        </div>
      </div>
    </div>
  );
}

// Piggyback only: the guesses already on the table, so followers can see (and
// decide to trust or fade) the bar.
function LockedGuessList({
  players,
  pickOrder,
  values,
  slider,
}: {
  players: Player[];
  pickOrder: string[];
  values: Record<string, number>;
  slider: SliderConfig;
}) {
  const locked = pickOrder.filter((id) => values[id] !== undefined);
  if (locked.length === 0) return null;
  return (
    <div className="mt-4 border-neo-2 bg-cream-soft p-3">
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
        <Sparkles className="h-3 w-3 stroke-[3]" /> On the table
      </div>
      <div className="flex flex-wrap gap-2">
        {locked.map((id) => {
          const p = players.find((x) => x.id === id);
          if (!p) return null;
          const isBar = pickOrder[0] === id;
          return (
            <div
              key={id}
              className={cn(
                "border-neo-2 px-2 py-1 flex items-center gap-2",
                isBar ? "bg-mustard text-ink-static" : "bg-paper",
              )}
            >
              <CharacterAvatar
                characterId={p.character}
                isHost={p.isHost}
                size={20}
              />
              <span className="font-display text-[11px] uppercase tracking-wider font-bold">
                {p.name}
              </span>
              <span className="font-display text-sm font-bold tabular-nums">
                {formatSliderValue(values[id], slider)}
              </span>
              {isBar && (
                <span className="font-display text-[9px] uppercase tracking-wider opacity-80">
                  the bar
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SliderResultRow({
  player,
  result,
  slider,
  piggyback,
}: {
  player: Player;
  result: PiggybackPlayerResult;
  slider: SliderConfig;
  piggyback: boolean;
}) {
  const good = result.tag !== "off";
  return (
    <div
      className={cn(
        "border-neo-2 px-3 py-2 flex items-center gap-3",
        good
          ? "bg-lime text-ink-static"
          : result.points > 0
            ? "bg-mustard text-ink-static"
            : "bg-coral text-ink-static",
      )}
    >
      <CharacterAvatar
        characterId={player.character}
        isHost={player.isHost}
        size={28}
      />
      <div className="min-w-0 flex-1">
        <div className="font-display text-xs uppercase tracking-wider font-bold truncate flex items-center gap-2">
          {player.name}
          {result.isBar && (
            <span className="border-neo-2 bg-paper text-ink px-1.5 py-0.5 text-[9px] leading-none">
              Bar
            </span>
          )}
        </div>
        <div className="font-display text-[10px] uppercase tracking-wider opacity-80">
          Guessed {formatSliderValue(result.value, slider)} · {tagLabel(result.tag)}
          {result.tag === "off" && ` · ${result.diff} off`}
        </div>
        {piggyback && (result.split > 1 || !!result.bluffBonus) && (
          <div className="font-display text-[10px] uppercase tracking-wider font-bold mt-0.5 flex flex-wrap gap-x-3">
            {result.split > 1 && <span>Piggybacked ÷{result.split}</span>}
            {result.bluffBonus ? (
              <span>
                Bluff fooled {result.fooled} · +{result.bluffBonus}
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="font-display text-xl font-bold tabular-nums shrink-0">
        +{result.points}
      </div>
    </div>
  );
}

function SoloSliderResult({
  slider,
  actual,
  guess,
}: {
  slider: SliderConfig;
  actual: number;
  guess: number;
}) {
  const s = scoreSliderGuess(slider, actual, guess);
  const good = s.tag !== "off";
  return (
    <div
      className={cn(
        "border-neo-2 px-3 py-2 font-display text-xs uppercase tracking-wider font-bold flex items-center justify-between gap-2",
        good ? "bg-lime text-ink-static" : "bg-cream-soft",
      )}
    >
      <span className="flex items-center gap-2">
        {good ? (
          <Check className="h-4 w-4 stroke-[3]" />
        ) : (
          <X className="h-4 w-4 stroke-[3]" />
        )}
        You guessed {formatSliderValue(guess, slider)} · {tagLabel(s.tag)}
        {s.tag === "off" && ` · ${s.diff} off`}
      </span>
      <span className="text-lg tabular-nums">+{s.points}</span>
    </div>
  );
}

function SliderPairScreen({
  pair,
  kind,
  revealed,
  isMultiplayer,
  isLast,
  activePlayer,
  players,
  pickOrder,
  currentPairValues,
  roundResults,
  soloValue,
  onSubmitValue,
  onSoloPiggyback,
  onNext,
}: {
  pair: HigherLowerPair;
  kind: HighLowPairType;
  revealed: boolean;
  isMultiplayer: boolean;
  isLast: boolean;
  activePlayer: Player | null;
  players: Player[] | null;
  pickOrder: string[] | null;
  currentPairValues: Record<string, number>;
  roundResults: Record<string, PiggybackPlayerResult> | null;
  soloValue: number | null;
  onSubmitValue: (v: number) => void;
  onSoloPiggyback: () => void;
  onNext: () => void;
}) {
  const cfg = HIGHERLOWER_CATEGORIES[pair.category];
  const slider = cfg.slider;
  const isPiggyback = kind === "piggyback";

  if (!slider) {
    // Shouldn't happen (editor restricts single-game pairs to slider cats), but
    // fail soft so a bad row doesn't wedge the gauntlet.
    return (
      <NeoCard tone="paper" shadow="md" className="p-5 mt-2">
        <div className="text-sm text-ink-soft">
          This category can't be played as a {kind} pair.
        </div>
        <NeoButton tone="teal" className="mt-3" onClick={onNext}>
          Next pair
        </NeoButton>
      </NeoCard>
    );
  }

  const actualDisplay = pair.a.display ?? formatSliderValue(pair.a.value, slider);
  const barIsActive =
    isPiggyback && pickOrder && activePlayer && pickOrder[0] === activePlayer.id;

  return (
    <NeoCard tone="paper" shadow="md" className="p-5 mt-2">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <TagPill tone={isPiggyback ? "mustard" : "teal"}>
          {isPiggyback ? (
            <>
              <Sparkles className="inline h-3 w-3 stroke-[3] mr-1" /> Piggyback
              Bluff
            </>
          ) : (
            <>
              <SlidersHorizontal className="inline h-3 w-3 stroke-[3] mr-1" />{" "}
              {cfg.label} slider
            </>
          )}
        </TagPill>
        <div className="font-display text-sm md:text-base uppercase tracking-wider font-bold text-right">
          {cfg.sliderQuestion ?? `Guess the ${cfg.valueLabel}`}
        </div>
      </div>

      <SingleGameCard
        side={pair.a}
        valueLabel={cfg.valueLabel}
        revealed={revealed}
        actualDisplay={actualDisplay}
      />

      {isPiggyback && isMultiplayer && !revealed && players && pickOrder && (
        <LockedGuessList
          players={players}
          pickOrder={pickOrder}
          values={currentPairValues}
          slider={slider}
        />
      )}

      {!revealed &&
        (isMultiplayer ? (
          activePlayer ? (
            <div className="mt-2">
              {barIsActive && (
                <div className="font-display text-[10px] uppercase tracking-wider text-mustard-deep font-bold mb-1">
                  ▸ You set the bar — bluff if you dare
                </div>
              )}
              <SliderInput
                key={activePlayer.id}
                slider={slider}
                tone={isPiggyback ? "mustard" : "teal"}
                submitLabel={`Lock in ${activePlayer.name}'s guess`}
                onSubmit={onSubmitValue}
              />
            </div>
          ) : null
        ) : isPiggyback ? (
          <div className="mt-4 border-neo-2 bg-cream-soft p-4 flex flex-col gap-3">
            <div className="font-display text-xs uppercase tracking-wider font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 stroke-[3]" /> Hot-seat only
            </div>
            <div className="text-xs text-ink-soft leading-snug">
              Piggyback Bluff needs a table of players. In solo it's banked as
              correct so your gauntlet keeps flowing.
            </div>
            <div className="flex justify-end">
              <NeoButton tone="lime" onClick={onSoloPiggyback}>
                Count as correct →
              </NeoButton>
            </div>
          </div>
        ) : (
          <SliderInput
            key="solo"
            slider={slider}
            tone="teal"
            submitLabel="Lock in guess"
            onSubmit={onSubmitValue}
          />
        ))}

      {revealed && (
        <div className="mt-5 flex flex-col gap-3">
          {isMultiplayer && roundResults && players && pickOrder ? (
            <div className="flex flex-col gap-2">
              {pickOrder.map((id) => {
                const p = players.find((x) => x.id === id);
                const r = roundResults[id];
                if (!p || !r) return null;
                return (
                  <SliderResultRow
                    key={id}
                    player={p}
                    result={r}
                    slider={slider}
                    piggyback={isPiggyback}
                  />
                );
              })}
            </div>
          ) : soloValue !== null ? (
            <SoloSliderResult
              slider={slider}
              actual={pair.a.value}
              guess={soloValue}
            />
          ) : isPiggyback ? (
            <div className="border-neo-2 bg-lime text-ink-static px-3 py-2 font-display text-xs uppercase tracking-wider font-bold flex items-center gap-2">
              <Check className="h-4 w-4 stroke-[3]" /> Counted as correct
              (hot-seat game)
            </div>
          ) : null}
          <div className="flex justify-end">
            <NeoButton tone="teal" onClick={onNext}>
              {isLast ? "See results" : "Next pair"}{" "}
              <ChevronRight className="inline h-4 w-4 ml-1" />
            </NeoButton>
          </div>
        </div>
      )}
    </NeoCard>
  );
}

// ─── player HUD ────────────────────────────────────────────────────────────

function PlayerHud({
  players,
  scores,
  activePlayerId,
  currentPairPicks,
  currentPairValues,
  kind,
  roundResults,
  revealed,
  currentPair,
  playReadyIndex,
  startingPlayerId,
  pickOrder,
}: {
  players: Player[];
  scores: Record<string, number>;
  activePlayerId: string | null;
  currentPairPicks: Record<string, Choice>;
  currentPairValues: Record<string, number>;
  kind: HighLowPairType;
  roundResults: Record<string, PiggybackPlayerResult> | null;
  revealed: boolean;
  currentPair: HigherLowerPair | undefined;
  playReadyIndex: number | null;
  startingPlayerId: string | null;
  pickOrder: string[] | null;
}) {
  // Buzz the starting player's card while a fresh round is playable but nobody
  // has picked (playReadyIndex non-null). The class drops out between rounds —
  // during the intro popup and once the lead-off pick lands — so it re-applies
  // and the one-shot animation replays at the top of every round.
  const buzzId = playReadyIndex !== null ? startingPlayerId : null;
  const isVs = kind === "vs";

  // Display the cards in this round's turn order (left → right), so the panel
  // mirrors who picks when even though the order is reshuffled each round.
  const ordered = pickOrder
    ? (pickOrder
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as Player[])
    : players;

  return (
    <div className="sticky bottom-3 mt-6 z-20">
      <NeoCard tone="paper" shadow="lg" className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <TagPill tone={kind === "piggyback" ? "mustard" : "teal"}>
            {kind === "piggyback" ? (
              <>
                <Sparkles className="inline h-3 w-3 stroke-[3] mr-1" /> Piggyback
              </>
            ) : kind === "slider" ? (
              <>
                <SlidersHorizontal className="inline h-3 w-3 stroke-[3] mr-1" />{" "}
                Slider
              </>
            ) : (
              <>
                <Users className="inline h-3 w-3 stroke-[3] mr-1" /> Hot-seat
              </>
            )}
          </TagPill>
          <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
            {isVs ? `+${POINTS_PER_CORRECT} per correct pick` : "closest wins"}
          </div>
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto pt-1 pb-2 px-1">
          {ordered.map((p) => {
            const hasPicked = isVs
              ? currentPairPicks[p.id] !== undefined
              : currentPairValues[p.id] !== undefined;
            const isActive = p.id === activePlayerId;
            let revealPoints: number | null = null;
            let revealGood: boolean | null = null;
            if (revealed) {
              if (isVs) {
                const pick = currentPairPicks[p.id];
                const ok =
                  currentPair && pick !== undefined
                    ? isCorrectChoice(currentPair, pick)
                    : null;
                revealGood = ok;
                revealPoints =
                  ok === null ? null : ok ? POINTS_PER_CORRECT : 0;
              } else {
                const r = roundResults?.[p.id];
                revealPoints = r ? r.points : null;
                revealGood = r ? r.tag !== "off" : null;
              }
            }
            return (
              <PlayerCard
                key={p.id}
                player={p}
                score={scores[p.id] ?? 0}
                isActive={isActive}
                hasPicked={hasPicked}
                revealed={revealed}
                revealPoints={revealPoints}
                revealGood={revealGood}
                buzz={p.id === buzzId}
              />
            );
          })}
        </div>
      </NeoCard>
    </div>
  );
}

function PlayerCard({
  player,
  score,
  isActive,
  hasPicked,
  revealed,
  revealPoints,
  revealGood,
  buzz,
}: {
  player: Player;
  score: number;
  isActive: boolean;
  hasPicked: boolean;
  revealed: boolean;
  revealPoints: number | null;
  revealGood: boolean | null;
  buzz: boolean;
}) {
  const statusBg =
    revealed && revealGood === true
      ? "bg-lime text-ink-static"
      : revealed && revealGood === false && (revealPoints ?? 0) > 0
        ? "bg-mustard text-ink-static"
        : revealed && revealGood === false
          ? "bg-coral text-ink-static"
          : isActive
            ? "bg-paper"
            : hasPicked
              ? "bg-cream-soft"
              : "bg-paper";
  // Border treatment: every card carries a thin 2px stroke so the row reads
  // cleanly against the brutalist backdrop. The active player swaps the
  // stroke for the game's teal accent (same width, so no layout shift) and
  // gets a chunky offset shadow to lift it visually.
  const borderClass = isActive && !revealed ? "border-teal" : "border-stroke";
  return (
    <div
      className={cn(
        "shrink-0 min-w-[120px] max-w-[180px] p-2 flex flex-col items-stretch gap-1.5 transition-all border-[2px]",
        borderClass,
        statusBg,
        isActive && !revealed && "shadow-neo",
        revealed && "shadow-neo-sm",
        buzz && "animate-buzz",
      )}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="flex items-center gap-2">
        <CharacterAvatar
          characterId={player.character}
          isHost={player.isHost}
          size={28}
        />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xs uppercase tracking-wider font-bold leading-tight truncate">
            {player.name}
          </div>
          <div className="font-display text-[9px] uppercase tracking-wider opacity-70">
            {player.isHost ? "Host" : "Hot-seat"}
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-display text-lg font-bold tabular-nums leading-none">
          {score}
        </div>
        <PickStatus
          isActive={isActive && !revealed}
          hasPicked={hasPicked}
          revealed={revealed}
          revealPoints={revealPoints}
          revealGood={revealGood}
        />
      </div>
    </div>
  );
}

function PickStatus({
  isActive,
  hasPicked,
  revealed,
  revealPoints,
  revealGood,
}: {
  isActive: boolean;
  hasPicked: boolean;
  revealed: boolean;
  revealPoints: number | null;
  revealGood: boolean | null;
}) {
  if (revealed && revealPoints !== null)
    return (
      <span className="font-display text-[10px] uppercase tracking-wider font-bold flex items-center gap-1">
        {revealGood ? (
          <Check className="h-3 w-3 stroke-[3]" />
        ) : revealPoints > 0 ? null : (
          <X className="h-3 w-3 stroke-[3]" />
        )}
        {revealPoints > 0 ? `+${revealPoints}` : "0"}
      </span>
    );
  if (isActive)
    return (
      <span className="font-display text-[10px] uppercase tracking-wider font-bold animate-pulse">
        Pick →
      </span>
    );
  if (hasPicked)
    return (
      <span className="font-display text-[10px] uppercase tracking-wider opacity-70">
        Locked
      </span>
    );
  return (
    <span className="font-display text-[10px] uppercase tracking-wider opacity-50">
      Waiting
    </span>
  );
}

// ─── leaderboard ──────────────────────────────────────────────────────────

function LeaderboardModal({
  players,
  scores,
  total,
  onClose,
  onPlayAgain,
}: {
  players: Player[];
  scores: Record<string, number>;
  total: number;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const ranked = [...players]
    .map((p) => ({ player: p, score: scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const maxScore = total * POINTS_PER_CORRECT;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hot-seat leaderboard"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-emphasis/80 backdrop-blur-sm" />
      <NeoCard
        tone="paper"
        shadow="lg"
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto p-5"
      >
        <button
          onClick={onClose}
          aria-label="Close leaderboard"
          className="absolute top-3 right-3 border-neo-2 p-1.5 bg-paper hover:bg-coral hover:text-ink-static"
        >
          <X className="h-3.5 w-3.5 stroke-[3]" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-4 w-4 stroke-[3]" />
          <div className="font-display text-[10px] uppercase tracking-[0.2em] font-bold">
            Hot-seat results
          </div>
        </div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wider leading-tight mb-4">
          Leaderboard
        </h2>
        <div className="flex flex-col gap-2 mb-5">
          {ranked.map((row, i) => {
            const pct = maxScore > 0 ? (row.score / maxScore) * 100 : 0;
            return (
              <div
                key={row.player.id}
                className={cn(
                  "border-neo-2 p-3 flex items-center gap-3",
                  i === 0
                    ? "bg-lime text-ink-static"
                    : i === 1
                      ? "bg-mustard text-ink-static"
                      : "bg-paper",
                )}
              >
                <div className="font-display text-2xl font-bold tabular-nums w-8 text-center">
                  {i + 1}
                </div>
                <CharacterAvatar
                  characterId={row.player.character}
                  isHost={row.player.isHost}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-sm uppercase tracking-wider font-bold leading-tight truncate">
                    {row.player.name}
                    {row.player.isHost && (
                      <span className="opacity-70 text-[10px] ml-1">
                        · host
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 border-[2px] border-stroke bg-cream-soft relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-teal"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="font-display text-xl font-bold tabular-nums">
                  {row.score}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-display mb-4">
          ▸ Only the host's score saves to the daily streak — everyone else
          plays for fun and bragging rights.
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <NeoButton tone="paper" size="sm" onClick={onPlayAgain}>
            Play again
          </NeoButton>
          <NeoButton tone="teal" size="sm" onClick={onClose}>
            Close
          </NeoButton>
        </div>
      </NeoCard>
    </div>
  );
}

// ─── finale (solo & host's daily mirror) ──────────────────────────────────

function FinaleCard({
  puzzle,
  picks,
  longestStreak,
  total,
  week,
  onPlayAgain,
  onReopenLeaderboard,
}: {
  puzzle: HigherLowerPuzzle;
  picks: Pick[];
  longestStreak: number;
  total: number;
  week: string;
  onPlayAgain: () => void;
  onReopenLeaderboard?: () => void;
}) {
  const correct = picks.filter((p) => p.correct).length;
  const rank = rankForScore(correct, total);
  const [copied, setCopied] = useState(false);
  const share = useMemo(
    () => buildShareString(picks, total, week, rank.title),
    [picks, total, week, rank.title],
  );
  return (
    <NeoCard tone="paper" shadow="md" className="p-5 mt-2 relative">
      <ScreenEffects
        type={puzzle.effectType}
        emoji={puzzle.effectEmoji}
        color={puzzle.effectColor}
        active
      />
      {(puzzle.bannerText || puzzle.submitter) && (
        <GuestBanner
          gameType="higherlower"
          submitter={puzzle.submitter}
          text={puzzle.bannerText}
          color={puzzle.bannerColor}
        />
      )}
      <div className="flex flex-col gap-4">
        <NeoCard tone="teal" shadow="md" className="p-5">
          <div className="font-display text-[10px] uppercase tracking-wider font-bold">
            Final score
          </div>
          <div className="font-display text-5xl font-bold mt-1 leading-none tabular-nums">
            {correct} / {total}
          </div>
          <div className="mt-3 inline-block border-neo-2 bg-paper text-ink px-3 py-1.5">
            <span className="font-display text-[10px] uppercase tracking-wider font-bold mr-2">
              Rank
            </span>
            <span className="font-display text-sm font-bold">{rank.title}</span>
            <span className="text-[10px] ml-2 opacity-70">{rank.blurb}</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider font-display mt-3 opacity-80">
            Longest correct streak: {longestStreak}
          </div>
        </NeoCard>

        <PairBreakdown puzzle={puzzle} picks={picks} />

        <div className="flex flex-wrap items-center gap-3">
          <NeoButton
            tone="mustard"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(share).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <Share2 className="inline h-3 w-3 mr-1" />{" "}
            {copied ? "Copied!" : "Copy share"}
          </NeoButton>
          <NeoButton tone="paper" size="sm" onClick={onPlayAgain}>
            Replay this week
          </NeoButton>
          {onReopenLeaderboard && (
            <NeoButton tone="teal" size="sm" onClick={onReopenLeaderboard}>
              <Trophy className="inline h-3 w-3 mr-1" /> Show leaderboard
            </NeoButton>
          )}
          <Link
            to="/screenshot"
            className="font-display text-xs uppercase tracking-wider font-bold underline"
          >
            Back to dailies →
          </Link>
        </div>

        <pre className="bg-paper border-neo-2 text-ink p-2 text-[11px] font-display whitespace-pre overflow-x-auto self-start">
          {share}
        </pre>
      </div>
    </NeoCard>
  );
}

function PairBreakdown({
  puzzle,
  picks,
}: {
  puzzle: HigherLowerPuzzle;
  picks: Pick[];
}) {
  return (
    <div>
      <div className="font-display text-[10px] uppercase tracking-wider font-bold mb-2">
        Pair-by-pair
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {puzzle.pairs.map((p, i) => {
          const pick = picks.find((x) => x.pairId === p.id);
          const ok = pick?.correct;
          const cfg = HIGHERLOWER_CATEGORIES[p.category];
          return (
            <div
              key={p.id}
              className={cn(
                "border-neo-2 px-3 py-2 flex items-center justify-between gap-2",
                pick === undefined
                  ? "bg-cream-soft text-ink-soft"
                  : ok
                    ? "bg-lime text-ink-static"
                    : "bg-coral text-ink-static",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display text-xs font-bold tabular-nums w-6">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-[10px] uppercase tracking-wider opacity-80 truncate">
                  {cfg?.label ?? p.category}
                </span>
              </div>
              <div className="font-display text-xs truncate">
                {pick === undefined
                  ? "—"
                  : p.b
                    ? `${p.a.game_name} vs ${p.b.game_name}`
                    : p.a.game_name}
              </div>
              <span className="font-display text-xs font-bold">
                {pick === undefined ? "·" : ok ? "✓" : "✗"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function isCorrect(pair: HigherLowerPair, choice: Choice): boolean {
  if (!pair.b) return true; // single-game pair — no vs comparison to make
  if (pair.a.value === pair.b.value) return true; // tie counts as correct
  // Default: higher value wins. lowerWins categories (fastest run, earliest
  // movie adaptation) flip it so the smaller value is the right pick.
  const lowerWins = HIGHERLOWER_CATEGORIES[pair.category]?.lowerWins ?? false;
  const aWins = lowerWins
    ? pair.a.value < pair.b.value
    : pair.a.value > pair.b.value;
  return choice === "a" ? aWins : !aWins;
}

// Local alias used by the HUD — kept separate so the call site reads as
// "is THIS choice correct" without confusion with the host-specific path.
function isCorrectChoice(pair: HigherLowerPair, choice: Choice): boolean {
  return isCorrect(pair, choice);
}

function longestRun(picks: Pick[]): number {
  let best = 0;
  let cur = 0;
  for (const p of picks) {
    if (p.correct) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

function rankForScore(
  correct: number,
  total: number,
): { title: string; blurb: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.95)
    return { title: "Analyst", blurb: "You read the sales charts for fun." };
  if (pct >= 0.8)
    return { title: "Scholar", blurb: "Encyclopedic and pointed." };
  if (pct >= 0.6)
    return { title: "Enthusiast", blurb: "Plenty of healthy guessing." };
  if (pct >= 0.4) return { title: "Tourist", blurb: "You saw the highlights." };
  return { title: "Coin flipper", blurb: "Heads, every time." };
}

function buildShareString(
  picks: Pick[],
  total: number,
  week: string,
  rankTitle: string,
): string {
  const grid = picks
    .map((p) => (p.correct ? "🟩" : "🟥"))
    .concat(Array(Math.max(0, total - picks.length)).fill("⬜"))
    .join("");
  return `Higher/Lower · Week ${weekNumber(week)}
${picks.filter((p) => p.correct).length} / ${total} · ${rankTitle}
${grid}`;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}
