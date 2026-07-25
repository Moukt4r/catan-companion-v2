import { useMemo, useState } from "react";
import type { DevicePreferences } from "../../../application/devicePreferences";
import {
  WORLD_EVENTS_CATALOG,
  SEASONS,
  SEASON_LABELS,
  SEASON_ICONS,
  DEFAULT_SEASON_CONFIG,
  type WorldEventCategory,
  type Season,
  type RoundsPerSeason,
  type SeasonConfig,
} from "../../../domain";
import resourceIllustration from "../../../assets/illustrations/resource-landscape.webp";
import { Button, PlayerMarker, StatusBanner } from "../../components";
import {
  EVENT_DIE_ART,
  SEASON_ART,
  WORLD_EVENT_ART,
} from "../../illustrationCatalog";

/**
 * Human-readable guidance for the World Event frequency slider.
 * The percent is the chance per eligible turn, so the reciprocal reads as
 * "about one event every N turns".
 */
function eventFrequencyDescription(percent: number): string {
  if (percent === 0) {
    return "No world events.";
  }
  if (percent >= 100) {
    return "A world event on every eligible turn.";
  }
  const turns = Math.round(100 / percent);
  const cooldown =
    percent >= 50
      ? "Back-to-back events are allowed."
      : percent >= 25
        ? "At least one turn between events."
        : "At least two turns between events.";
  return `About one event every ${turns} eligible turn${turns === 1 ? "" : "s"}. ${cooldown}`;
}

const playerColors = [
  { name: "Amber", value: "#b66a1f" },
  { name: "Ocean blue", value: "#286b9b" },
  { name: "Crimson", value: "#b43e3e" },
  { name: "Forest green", value: "#2f7551" },
];

const worldEventPackOptions: ReadonlyArray<{
  id: WorldEventCategory;
  name: string;
  description: string;
}> = [
  {
    id: "nature",
    name: "Weather & Harvest",
    description: "Storms, droughts, harvests, and changing production.",
  },
  {
    id: "economy",
    name: "Trade & Markets",
    description: "Bank trades, maritime commerce, and table-wide resources.",
  },
  {
    id: "military",
    name: "Conflict & Defense",
    description: "Knights, raiders, the robber, and fortification.",
  },
  {
    id: "diplomacy",
    name: "Diplomacy & Intrigue",
    description: "Player trade, embargoes, catch-up, and negotiation.",
  },
  {
    id: "society",
    name: "Festivals & Progress",
    description: "Cities, improvements, celebrations, and epidemics.",
  },
];

const allWorldEventPacks = worldEventPackOptions.map((pack) => pack.id);

const eventDiePreviewOptions = [
  ["barbarian", "Ship"],
  ["science", "Science"],
  ["trade", "Trade"],
  ["politics", "Politics"],
] as const;

export interface SetupPlayerDraft {
  draftId: string;
  name: string;
  color: string;
}

export interface SetupDraft {
  title: string;
  players: SetupPlayerDraft[];
  firstPlayerDraftId: string;
  twoPlayerHouseMode: boolean;
  victoryTarget: number;
  eventPercent: number;
  numberedReshuffleThreshold: number;
  worldEventPacks: WorldEventCategory[];
  seasonConfig?: SeasonConfig;
  preferences: DevicePreferences;
}

interface SetupWizardProps {
  initialPreferences: DevicePreferences;
  onCancel: () => void;
  onStart: (draft: SetupDraft) => void;
}

type SetupStep = "players" | "rules" | "preferences" | "review";

function makePlayer(index: number): SetupPlayerDraft {
  const color = playerColors[index] ?? playerColors[0];
  if (!color) {
    throw new Error("Player color palette is empty.");
  }

  return {
    draftId: `player-${index + 1}`,
    name: "",
    color: color.value,
  };
}

export function SetupWizard({
  initialPreferences,
  onCancel,
  onStart,
}: SetupWizardProps) {
  const [step, setStep] = useState<SetupStep>("players");
  const [title, setTitle] = useState("Game night");
  const [players, setPlayers] = useState<SetupPlayerDraft[]>([
    makePlayer(0),
    makePlayer(1),
    makePlayer(2),
    makePlayer(3),
  ]);
  const [twoPlayerHouseMode, setTwoPlayerHouseMode] = useState(false);
  const [firstPlayerDraftId, setFirstPlayerDraftId] = useState(
    players[0]?.draftId ?? "",
  );
  const [victoryTarget, setVictoryTarget] = useState(13);
  const [eventPercent, setEventPercent] = useState(8);
  const [numberedReshuffleThreshold, setNumberedReshuffleThreshold] =
    useState(0);

  const [worldEventPacks, setWorldEventPacks] = useState<WorldEventCategory[]>([
    ...allWorldEventPacks,
  ]);
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig>({
    ...DEFAULT_SEASON_CONFIG,
  });
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);

  const playerError = useMemo(() => {
    const names = players.map((player) => player.name.trim());
    if (names.some((name) => name.length === 0)) {
      return "Enter a name for every player.";
    }
    if (
      new Set(names.map((name) => name.toLocaleLowerCase())).size !==
      names.length
    ) {
      return "Player names must be unique.";
    }
    if (
      new Set(players.map((player) => player.color)).size !== players.length
    ) {
      return "Choose a different color for every player.";
    }
    if (
      (twoPlayerHouseMode && players.length !== 2) ||
      (!twoPlayerHouseMode && (players.length < 3 || players.length > 4))
    ) {
      return twoPlayerHouseMode
        ? "Two-player house mode needs exactly two players."
        : "Standard Cities & Knights needs three or four players.";
    }
    if (
      !firstPlayerDraftId ||
      !players.some((player) => player.draftId === firstPlayerDraftId)
    ) {
      return "Choose the first player.";
    }
    return null;
  }, [firstPlayerDraftId, players, twoPlayerHouseMode]);

  const steps: SetupStep[] = ["players", "rules", "preferences", "review"];
  const currentIndex = steps.indexOf(step);

  const goNext = () => {
    if (step === "players" && playerError) {
      setError(playerError);
      return;
    }
    if (step === "rules" && eventPercent > 0 && worldEventPacks.length === 0) {
      setError("Select at least one category pack for World Events.");
      return;
    }
    setError(null);
    const next = steps[currentIndex + 1];
    if (next) {
      setStep(next);
    }
  };

  const goBack = () => {
    setError(null);
    const previous = steps[currentIndex - 1];
    if (previous) {
      setStep(previous);
    } else {
      onCancel();
    }
  };

  const updatePlayer = (draftId: string, patch: Partial<SetupPlayerDraft>) => {
    setPlayers((current) =>
      current.map((player) =>
        player.draftId === draftId ? { ...player, ...patch } : player,
      ),
    );
  };

  const movePlayer = (index: number, offset: -1 | 1) => {
    setPlayers((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      const moved = next[index];
      const replaced = next[target];
      if (!moved || !replaced) {
        return current;
      }
      next[index] = replaced;
      next[target] = moved;
      return next;
    });
  };

  return (
    <main className="app-shell setup-layout">
      <header className="surface setup-header setup-hero">
        <div className="setup-hero__copy">
          <p className="eyebrow">New shared-device game</p>
          <h1>Set up the table</h1>
          <p>
            Choose the players, tune the house rules, and prepare a clear shared
            ledger before the first roll.
          </p>
        </div>
        <ol className="step-list" aria-label="Setup progress">
          {steps.map((item, index) => (
            <li key={item} aria-current={item === step ? "step" : undefined}>
              <span>{index + 1}</span>
              {item}
            </li>
          ))}
        </ol>
        <div className="setup-hero__art" aria-hidden="true">
          <img src={resourceIllustration} alt="" />
        </div>
      </header>

      <section className="surface setup-card">
        {error ? (
          <StatusBanner tone="danger" role="alert">
            {error}
          </StatusBanner>
        ) : null}

        {step === "players" ? (
          <div className="form-stack">
            <div>
              <h2>Players and turn order</h2>
              <p>Names and all game state stay on this device.</p>
            </div>
            <label className="field">
              <span>Game name</span>
              <input
                value={title}
                maxLength={48}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={twoPlayerHouseMode}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setTwoPlayerHouseMode(enabled);
                  if (enabled) {
                    setPlayers((current) => current.slice(0, 2));
                    const firstRemaining = players.slice(0, 2);
                    if (
                      !firstRemaining.some(
                        (player) => player.draftId === firstPlayerDraftId,
                      )
                    ) {
                      setFirstPlayerDraftId(firstRemaining[0]?.draftId ?? "");
                    }
                  } else {
                    setPlayers((current) => {
                      const next = [...current];
                      while (next.length < 3) {
                        next.push(makePlayer(next.length));
                      }
                      return next;
                    });
                  }
                }}
              />
              <span>
                <strong>Allow two-player house mode</strong>
                <small>
                  Standard Cities &amp; Knights is designed for three or four
                  players.
                </small>
              </span>
            </label>

            <div className="player-setup-list">
              {players.map((player, index) => (
                <fieldset key={player.draftId} className="player-setup-row">
                  <legend>Player {index + 1}</legend>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={player.name}
                      maxLength={24}
                      placeholder={`Player ${index + 1}`}
                      onChange={(event) => {
                        updatePlayer(player.draftId, {
                          name: event.target.value,
                        });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Color</span>
                    <select
                      value={player.color}
                      onChange={(event) => {
                        updatePlayer(player.draftId, {
                          color: event.target.value,
                        });
                      }}
                    >
                      {playerColors.map((color) => (
                        <option key={color.value} value={color.value}>
                          {color.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="player-setup-actions">
                    <label className="first-player-choice">
                      <input
                        type="radio"
                        name="first-player"
                        checked={firstPlayerDraftId === player.draftId}
                        onChange={() => {
                          setFirstPlayerDraftId(player.draftId);
                        }}
                      />
                      Starts
                    </label>
                    <div
                      className="order-controls"
                      aria-label={`Move ${player.name || `Player ${index + 1}`}`}
                    >
                      <Button
                        variant="quiet"
                        size="small"
                        aria-label={`Move ${player.name || `Player ${index + 1}`} earlier`}
                        disabled={index === 0}
                        onClick={() => {
                          movePlayer(index, -1);
                        }}
                      >
                        Up
                      </Button>
                      <Button
                        variant="quiet"
                        size="small"
                        aria-label={`Move ${player.name || `Player ${index + 1}`} later`}
                        disabled={index === players.length - 1}
                        onClick={() => {
                          movePlayer(index, 1);
                        }}
                      >
                        Down
                      </Button>
                    </div>
                    <Button
                      variant="quiet"
                      size="small"
                      disabled={players.length <= (twoPlayerHouseMode ? 2 : 3)}
                      onClick={() => {
                        setPlayers((current) =>
                          current.filter(
                            (item) => item.draftId !== player.draftId,
                          ),
                        );
                        if (firstPlayerDraftId === player.draftId) {
                          const remaining = players.filter(
                            (item) => item.draftId !== player.draftId,
                          );
                          setFirstPlayerDraftId(remaining[0]?.draftId ?? "");
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </fieldset>
              ))}
            </div>
            {!twoPlayerHouseMode && players.length < 4 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  const next = makePlayer(players.length);
                  setPlayers((current) => [...current, next]);
                }}
              >
                Add player
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "rules" ? (
          <div className="form-stack">
            <div>
              <h2>Rules and table events</h2>
              <p>
                The official assistant and the intentional house systems stay
                clearly separate.
              </p>
            </div>
            <div className="rules-grid">
              <article>
                <span className="rule-label">Official assistance</span>
                <h3>Base game + Cities &amp; Knights</h3>
                <p>
                  Progress eligibility, barbarian attacks, public counters,
                  turns, and scores.
                </p>
              </article>
              <article>
                <span className="rule-label rule-label--house">House rule</span>
                <h3>Balanced numbered dice</h3>
                <p>
                  All 36 ordered red/yellow outcomes appear once per shuffled
                  cycle.
                </p>
              </article>
              <article className="rules-card rules-card--illustrated">
                <span className="rule-label rule-label--house">House rule</span>
                <h3>Balanced event die</h3>
                <p>
                  Each six-roll cycle has three ships and one of each progress
                  discipline.
                </p>
                <div className="event-die-preview" aria-hidden="true">
                  {eventDiePreviewOptions.map(([event, label]) => (
                    <span key={event} title={label}>
                      <img
                        src={EVENT_DIE_ART[event]}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <small>{label}</small>
                    </span>
                  ))}
                </div>
              </article>
            </div>
            <label className="field">
              <span>Victory target</span>
              <input
                type="number"
                min={5}
                max={30}
                value={victoryTarget}
                onChange={(event) => {
                  setVictoryTarget(
                    Math.min(30, Math.max(5, Number(event.target.value))),
                  );
                }}
              />
            </label>
            <fieldset className="choice-group">
              <legend>World Events</legend>
              <p>
                World Events are thematic house-rule events — entirely separate
                from the official Cities &amp; Knights event die.
              </p>
              <label className="slider-field">
                <span className="slider-field__label">
                  <strong>Event frequency</strong>
                  <span className="slider-field__value">
                    {eventPercent === 0 ? "Off" : `${eventPercent}%`}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={eventPercent}
                  aria-label="World event frequency percent"
                  aria-valuetext={
                    eventPercent === 0 ? "Off" : `${eventPercent} percent`
                  }
                  onChange={(event) => {
                    setEventPercent(Number(event.target.value));
                  }}
                />
                <small>{eventFrequencyDescription(eventPercent)}</small>
              </label>
            </fieldset>

            <fieldset className="choice-group">
              <legend>Deck reshuffle</legend>
              <p>
                The numbered deck normally plays out all 36 cards before a new
                year begins. Reshuffling early keeps the final cards uncertain.
              </p>
              <label className="slider-field">
                <span className="slider-field__label">
                  <strong>Reshuffle when cards remain</strong>
                  <span className="slider-field__value">
                    {numberedReshuffleThreshold === 0
                      ? "Off"
                      : `${numberedReshuffleThreshold} cards`}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={numberedReshuffleThreshold}
                  aria-label="Reshuffle when this many cards remain"
                  aria-valuetext={
                    numberedReshuffleThreshold === 0
                      ? "Off"
                      : `${numberedReshuffleThreshold} cards remaining`
                  }
                  onChange={(event) => {
                    setNumberedReshuffleThreshold(Number(event.target.value));
                  }}
                />
                <small>
                  {numberedReshuffleThreshold === 0
                    ? "Exact coverage: every one of the 36 outcomes is drawn each year."
                    : `A new year begins after card ${36 - numberedReshuffleThreshold}. The ${numberedReshuffleThreshold} undrawn card${numberedReshuffleThreshold === 1 ? " is" : "s are"} announced and listed.`}
                </small>
              </label>
            </fieldset>

            {eventPercent > 0 ? (
              <fieldset className="choice-group">
                <legend>Category packs</legend>
                <p>
                  Select at least one category pack to include in the world
                  event deck.
                </p>
                <div className="pack-grid">
                  {worldEventPackOptions.map((pack) => {
                    const eventCount = WORLD_EVENTS_CATALOG.filter(
                      (event) => event.category === pack.id,
                    ).length;
                    return (
                      <label
                        key={pack.id}
                        className="check-field check-field--illustrated"
                      >
                        <img
                          className="check-field__art"
                          src={WORLD_EVENT_ART[pack.id]}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                        />
                        <input
                          type="checkbox"
                          checked={worldEventPacks.includes(pack.id)}
                          onChange={(event) => {
                            setWorldEventPacks((current) =>
                              event.target.checked
                                ? [...current, pack.id]
                                : current.filter((id) => id !== pack.id),
                            );
                          }}
                        />
                        <span>
                          <strong>{pack.name}</strong>
                          <small>
                            {pack.description} {eventCount} events.
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {worldEventPacks.length === 0 ? (
                  <StatusBanner tone="danger">
                    Select at least one category pack.
                  </StatusBanner>
                ) : null}
              </fieldset>
            ) : null}

            {eventPercent > 0 ? (
              <fieldset className="choice-group">
                <legend>Seasons Mode</legend>
                <p>
                  Optional seasonal bias on World Events. Favored categories
                  appear more often, reduced ones less — but nothing is
                  impossible.
                </p>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={seasonConfig.enabled}
                    onChange={(event) => {
                      setSeasonConfig((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }));
                    }}
                  />
                  <span>
                    <strong>Enable Seasons Mode</strong>
                    <small>
                      Categories shift with the seasons as rounds progress.
                    </small>
                  </span>
                </label>
                {seasonConfig.enabled ? (
                  <>
                    <label className="field">
                      <span>Rounds per season</span>
                      <select
                        value={seasonConfig.roundsPerSeason}
                        onChange={(event) => {
                          setSeasonConfig((current) => ({
                            ...current,
                            roundsPerSeason: Number(
                              event.target.value,
                            ) as RoundsPerSeason,
                          }));
                        }}
                      >
                        <option value={2}>2 rounds</option>
                        <option value={3}>3 rounds (default)</option>
                        <option value={4}>4 rounds</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Starting season</span>
                      <select
                        value={seasonConfig.startingSeason}
                        onChange={(event) => {
                          setSeasonConfig((current) => ({
                            ...current,
                            startingSeason: event.target.value as Season,
                          }));
                        }}
                      >
                        {SEASONS.map((s) => (
                          <option key={s} value={s}>
                            {SEASON_ICONS[s]} {SEASON_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="season-setup-preview" aria-hidden="true">
                      <img
                        src={SEASON_ART[seasonConfig.startingSeason]}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span>
                        {SEASON_ICONS[seasonConfig.startingSeason]}{" "}
                        {SEASON_LABELS[seasonConfig.startingSeason]} at the
                        frontier
                      </span>
                    </div>
                  </>
                ) : null}
              </fieldset>
            ) : null}
          </div>
        ) : null}

        {step === "preferences" ? (
          <div className="form-stack">
            <div>
              <h2>Table-device preferences</h2>
              <p>
                These can be changed later without changing the game record.
              </p>
            </div>
            <label className="field">
              <span>Theme</span>
              <select
                value={preferences.theme}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    theme: event.target.value as DevicePreferences["theme"],
                  }));
                }}
              >
                <option value="system">Use device setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High contrast</option>
              </select>
            </label>
            <label className="field">
              <span>Motion</span>
              <select
                value={preferences.motion}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    motion: event.target.value as DevicePreferences["motion"],
                  }));
                }}
              >
                <option value="system">Use device setting</option>
                <option value="full">Full animation</option>
                <option value="reduced">Reduced motion</option>
              </select>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={preferences.soundEnabled}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    soundEnabled: event.target.checked,
                  }));
                }}
              />
              <span>
                <strong>Sound effects</strong>
                <small>
                  Offline dice, event, season, and barbarian cues with visual
                  equivalents.
                </small>
              </span>
            </label>
            <label className="field field--range">
              <span>
                Sound volume
                <output>{Math.round(preferences.soundVolume * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label="Sound volume"
                min="0"
                max="1"
                step="0.05"
                value={preferences.soundVolume}
                disabled={!preferences.soundEnabled}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    soundVolume: Number(event.target.value),
                  }));
                }}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={preferences.keepAwake}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    keepAwake: event.target.checked,
                  }));
                }}
              />
              <span>
                <strong>Keep screen awake</strong>
                <small>
                  Requested only while the game is open and the browser supports
                  it.
                </small>
              </span>
            </label>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="form-stack">
            <div>
              <h2>Review the table</h2>
              <p>The game is saved before the first turn opens.</p>
            </div>
            <section>
              <h3>{title.trim() || "Game night"}</h3>
              <ol className="review-players">
                {players.map((player) => (
                  <li key={player.draftId}>
                    <PlayerMarker
                      color={player.color}
                      label={player.name.trim() || "Unnamed player"}
                    />
                    {player.draftId === firstPlayerDraftId ? (
                      <strong>First player</strong>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
            <dl className="definition-grid">
              <div>
                <dt>Victory target</dt>
                <dd>{victoryTarget}</dd>
              </div>
              <div>
                <dt>World Events</dt>
                <dd>
                  {eventPercent === 0
                    ? "Off"
                    : `${eventPercent}% per turn · ${worldEventPacks.length} pack${worldEventPacks.length === 1 ? "" : "s"}`}
                </dd>
              </div>
              <div>
                <dt>Deck reshuffle</dt>
                <dd>
                  {numberedReshuffleThreshold === 0
                    ? "Full 36-card year"
                    : `New year at card ${36 - numberedReshuffleThreshold} · ${numberedReshuffleThreshold} left undrawn`}
                </dd>
              </div>
              {eventPercent > 0 && seasonConfig.enabled ? (
                <div>
                  <dt>Seasons</dt>
                  <dd>
                    {SEASON_ICONS[seasonConfig.startingSeason]}{" "}
                    {SEASON_LABELS[seasonConfig.startingSeason]} start ·{" "}
                    {seasonConfig.roundsPerSeason} rounds/season
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Mode</dt>
                <dd>
                  {twoPlayerHouseMode
                    ? "Two-player house mode allowed"
                    : "Standard"}
                </dd>
              </div>
            </dl>
            <StatusBanner tone="warning">
              Balanced dice and World Events are house rules. The app keeps them
              visibly separate from official Cities & Knights guidance.
            </StatusBanner>
          </div>
        ) : null}

        <footer className="setup-footer">
          <Button variant="quiet" onClick={goBack}>
            {currentIndex === 0 ? "Cancel" : "Back"}
          </Button>
          {step === "review" ? (
            <Button
              size="large"
              onClick={() => {
                if (playerError) {
                  setStep("players");
                  setError(playerError);
                  return;
                }
                onStart({
                  title: title.trim() || "Game night",
                  players,
                  firstPlayerDraftId,
                  twoPlayerHouseMode,
                  victoryTarget,
                  eventPercent,
                  numberedReshuffleThreshold,
                  worldEventPacks: eventPercent === 0 ? [] : worldEventPacks,
                  seasonConfig:
                    eventPercent === 0
                      ? { ...DEFAULT_SEASON_CONFIG }
                      : seasonConfig,
                  preferences,
                });
              }}
            >
              Start and save game
            </Button>
          ) : (
            <Button onClick={goNext}>Continue</Button>
          )}
        </footer>
      </section>
    </main>
  );
}
