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
import { useHigherLowerPuzzle } from "../hooks/usePuzzle";
import { todayISO, weekNumber, weekStartISO } from "../lib/dates";
import { cn } from "../lib/cn";
import { saveResult } from "../lib/scoreStore";
import {
  HIGHERLOWER_CATEGORIES,
  HIGHERLOWER_PAIR_COUNT,
  type HigherLowerPair,
  type HigherLowerPuzzle,
} from "../lib/types";
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
};

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
  // playerId → choice for the CURRENT pair only. Cleared when advancing pairs.
  // Order of keys is insertion order, so size tells us whose turn is next.
  currentPairPicks?: Record<string, Choice>;
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
  const available = shuffleInPlace(
    CHARACTER_IDS.filter((id) => !used.has(id)),
  );
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
    character: characters[i + 1] ?? CHARACTER_IDS[(i + 1) % CHARACTER_IDS.length],
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

  const correctCount = state.picks.filter((p) => p.correct).length;
  const longestStreak = useMemo(() => longestRun(state.picks), [state.picks]);

  // In multiplayer, the next picker is the player at index = how many have
  // already picked for the current pair. Null when everyone has picked.
  const activePlayer: Player | null = useMemo(() => {
    if (!isMultiplayer || !state.players || !state.pickOrder) return null;
    if (revealed) return null;
    const picked = Object.keys(state.currentPairPicks ?? {}).length;
    const id = state.pickOrder[picked];
    return state.players.find((p) => p.id === id) ?? null;
  }, [
    isMultiplayer,
    state.players,
    state.pickOrder,
    state.currentPairPicks,
    revealed,
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
    Object.keys(state.currentPairPicks ?? {}).length === 0 &&
    introDismissedIndex !== state.index;

  // The index of the round that just became playable (intro popup gone, nobody
  // has picked yet) — or null. Flips to a number the instant a fresh round
  // opens up, which is the cue to buzz the starting player's HUD card.
  const playReadyIndex =
    isMultiplayer &&
    !finished &&
    !revealed &&
    !showRoundIntro &&
    Object.keys(state.currentPairPicks ?? {}).length === 0
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
          text={`Weekly gauntlet. ${total} pairs of games — for each, pick the side with the larger value for the listed stat. Wrong picks don't end the run; you always play all ${total}. Final score = number correct.`}
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

      {!finished && currentPair && (
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
            Turn order is shuffled every round so nobody can piggyback off the
            last picker.
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
      {cfg && (
        <div className="font-display text-[10px] sm:text-xs uppercase tracking-wider font-bold text-right opacity-90 min-w-0">
          {cfg.question}
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
  // Most categories award the larger value; "lowerWins" ones (fastest run,
  // earliest movie) award the smaller.
  const lowerWins = cfg?.lowerWins ?? false;
  const aBeatsB = lowerWins
    ? pair.a.value <= pair.b.value
    : pair.a.value >= pair.b.value;
  const correctSide: Choice = aBeatsB ? "a" : "b";
  // Tie-breaker visual: a true tie isn't really winnable, but if the admin sets
  // identical values we award whichever the player picked.
  const tied = pair.a.value === pair.b.value;
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
          side={pair.b}
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

// ─── player HUD ────────────────────────────────────────────────────────────

function PlayerHud({
  players,
  scores,
  activePlayerId,
  currentPairPicks,
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
          <TagPill tone="teal">
            <Users className="inline h-3 w-3 stroke-[3] mr-1" /> Hot-seat
          </TagPill>
          <div className="font-display text-[10px] uppercase tracking-wider text-ink-soft">
            +{POINTS_PER_CORRECT} per correct pick
          </div>
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto pt-1 pb-2 px-1">
          {ordered.map((p) => {
            const pick = currentPairPicks[p.id];
            const hasPicked = pick !== undefined;
            const isActive = p.id === activePlayerId;
            const isCorrect =
              revealed && currentPair && pick !== undefined
                ? isCorrectChoice(currentPair, pick)
                : null;
            return (
              <PlayerCard
                key={p.id}
                player={p}
                score={scores[p.id] ?? 0}
                isActive={isActive}
                hasPicked={hasPicked}
                revealed={revealed}
                isCorrect={isCorrect}
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
  isCorrect,
  buzz,
}: {
  player: Player;
  score: number;
  isActive: boolean;
  hasPicked: boolean;
  revealed: boolean;
  isCorrect: boolean | null;
  buzz: boolean;
}) {
  const statusBg =
    revealed && isCorrect === true
      ? "bg-lime text-ink-static"
      : revealed && isCorrect === false
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
          isCorrect={isCorrect}
        />
      </div>
    </div>
  );
}

function PickStatus({
  isActive,
  hasPicked,
  revealed,
  isCorrect,
}: {
  isActive: boolean;
  hasPicked: boolean;
  revealed: boolean;
  isCorrect: boolean | null;
}) {
  if (revealed && isCorrect === true)
    return (
      <span className="font-display text-[10px] uppercase tracking-wider font-bold flex items-center gap-1">
        <Check className="h-3 w-3 stroke-[3]" /> +{POINTS_PER_CORRECT}
      </span>
    );
  if (revealed && isCorrect === false)
    return (
      <span className="font-display text-[10px] uppercase tracking-wider font-bold flex items-center gap-1">
        <X className="h-3 w-3 stroke-[3]" /> 0
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
      {puzzle.submitter && (
        <GuestBanner name={puzzle.submitter} gameType="higherlower" />
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
                  : `${p.a.game_name} vs ${p.b.game_name}`}
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
