import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  APPLICATION_VERSION,
  DATABASE_SCHEMA_VERSION,
  type StoredGame,
} from "../application";
import {
  asEventOccurrenceId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  currentTurnActiveMilliseconds,
  deriveSeason,
  totalActiveMilliseconds,
  winnerCandidates,
  type DieValue,
  type GameCommand,
  type GameState,
  type PlayerId,
} from "../domain";
import {
  downloadJson,
  makeBackupFilename,
  readJsonFile,
} from "../infrastructure/platform/files";
import {
  buildSanitizedDiagnostics,
  copyText,
} from "../infrastructure/platform/diagnostics";
import {
  getStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from "../infrastructure/platform/storage";
import {
  AudioCues,
  type SoundCue,
  type SoundPlayOptions,
} from "../infrastructure/platform/audio";
import { ScreenWakeLock } from "../infrastructure/platform/wakeLock";
import { Button, ConfirmDialog } from "../ui/components";
import { CompletedGamesDialog } from "../ui/features/home/CompletedGamesDialog";
import { HomeScreen } from "../ui/features/home/HomeScreen";
import { ImportPreviewDialog } from "../ui/features/home/ImportPreviewDialog";
import { SetupWizard, type SetupDraft } from "../ui/features/setup/SetupWizard";
import { AlchemyDialog } from "../ui/features/game/AlchemyDialog";
import { GameCompleteScreen } from "../ui/features/game/GameCompleteScreen";
import { GameTable } from "../ui/features/game/GameTable";
import { HistoryDialog } from "../ui/features/game/HistoryDialog";
import { MetropolisCorrectionDialog } from "../ui/features/game/MetropolisCorrectionDialog";
import { MetropolisDialog } from "../ui/features/game/MetropolisDialog";
import {
  PlayerEditorDialog,
  type PlayerEditorPatch,
} from "../ui/features/game/PlayerEditorDialog";
import { PauseGameDialog } from "../ui/features/game/PauseGameDialog";
import {
  RollResolutionDialog,
  type AttackProgressChoice,
} from "../ui/features/game/RollResolutionDialog";
import { SaveRecoveryDialog } from "../ui/features/game/SaveRecoveryDialog";
import {
  toGameCompleteView,
  toGameTableView,
  toPlayerEditorValue,
  toRollResolutionView,
} from "../ui/features/game/viewMappers";
import { WinnerDialog } from "../ui/features/game/WinnerDialog";
import { SettingsDialog } from "../ui/features/settings/SettingsDialog";
import {
  errorMessage,
  setupFromDraft,
  toHistoryEntries,
  toHomeSummary,
  toImportPreview,
  toMetropolisProposalView,
  toSavedGameSummary,
} from "./appMappers";
import { gameController } from "./gameController";
import { PwaUpdate } from "./PwaUpdate";
import { useDevicePreferences } from "./useDevicePreferences";
import { useClockNow } from "./useClockNow";
import { useGameController } from "./useGameController";
import { useOnlineStatus } from "./useOnlineStatus";

type Screen = "home" | "setup" | "game" | "complete";

export function App() {
  const snapshot = useGameController();
  const { preferences, updatePreferences } = useDevicePreferences();
  const online = useOnlineStatus();
  const initialized = useRef(false);
  const previousScreen = useRef<Screen>("home");
  const clockStartRequests = useRef(new Set<string>());
  const soundedEventOccurrences = useRef(new Set<string>());
  const [screen, setScreen] = useState<Screen>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedGamesOpen, setSavedGamesOpen] = useState(false);
  const [alchemyOpen, setAlchemyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [winnerOpen, setWinnerOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(
    null,
  );
  const [metropolisCorrectionOpen, setMetropolisCorrectionOpen] =
    useState(false);
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [newGameConfirmation, setNewGameConfirmation] = useState(false);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [resumeGameId, setResumeGameId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(
    null,
  );
  const [audio] = useState(() => new AudioCues());
  const [wakeLock] = useState(() => new ScreenWakeLock());

  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;
    void gameController.initialize().catch((error: unknown) => {
      setNotice(errorMessage(error));
    });
    void getStorageStatus()
      .then(setStorageStatus)
      .catch((error: unknown) => {
        setNotice(errorMessage(error));
      });
  }, []);

  useEffect(() => {
    if (previousScreen.current === screen) {
      return;
    }
    previousScreen.current = screen;
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    const shouldKeepAwake =
      preferences.keepAwake &&
      screen === "game" &&
      snapshot.activeState?.status === "active";
    let cancelled = false;

    const updateWakeLock = async () => {
      try {
        if (shouldKeepAwake && document.visibilityState === "visible") {
          await wakeLock.acquire();
        } else {
          await wakeLock.release();
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(`Wake lock unavailable: ${errorMessage(error)}`);
        }
      }
    };

    void updateWakeLock();
    const onVisibility = () => {
      void updateWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLock.release();
    };
  }, [preferences.keepAwake, screen, snapshot.activeState?.status, wakeLock]);

  useEffect(() => {
    audio.setVolume(preferences.soundVolume);
    audio.setMuted(!preferences.soundEnabled);
  }, [audio, preferences.soundEnabled, preferences.soundVolume]);

  useEffect(
    () => () => {
      audio.close();
    },
    [audio],
  );

  const state = snapshot.activeState;
  const clockRunning =
    state?.clock !== undefined && state.clock.runningSince !== null;
  const clockNow = useClockNow(screen === "game" && clockRunning);
  const clockAt = asIsoTimestamp(new Date(clockNow).toISOString());
  const clockPaused =
    state?.clock?.pausedAt !== null && state?.clock?.pausedAt !== undefined;
  const activeRecord = snapshot.games.find(
    (game) => game.lifecycle === "active",
  );
  const homeSummary = activeRecord ? toHomeSummary(activeRecord) : null;
  const savedGames = useMemo(
    () =>
      snapshot.games
        .filter((game) => game.lifecycle !== "active")
        .map(toSavedGameSummary),
    [snapshot.games],
  );
  const historyEntries = useMemo(
    () => toHistoryEntries(snapshot.revisionHistory, state?.revisionId ?? null),
    [snapshot.revisionHistory, state?.revisionId],
  );
  const winnerCandidate = state
    ? (state.players.find((player) =>
        winnerCandidates(state).includes(player.id),
      ) ?? null)
    : null;
  const selectedPlayer =
    state && selectedPlayerId
      ? (state.players.find((player) => player.id === selectedPlayerId) ?? null)
      : null;
  const safeToUpdate =
    !snapshot.saving &&
    snapshot.pendingSave === null &&
    !resolutionBusy &&
    (!state ||
      state.turn.phase === "awaiting-roll" ||
      state.turn.phase === "action-phase" ||
      state.turn.phase === "completed");

  useEffect(() => {
    if (
      screen !== "game" ||
      !state ||
      state.status !== "active" ||
      state.clock !== undefined ||
      snapshot.readOnly ||
      snapshot.saving ||
      clockStartRequests.current.has(state.id)
    ) {
      return;
    }
    clockStartRequests.current.add(state.id);
    void gameController
      .dispatch({ type: "clock.started" })
      .catch((error: unknown) => {
        clockStartRequests.current.delete(state.id);
        setNotice(errorMessage(error));
      });
  }, [
    screen,
    snapshot.readOnly,
    snapshot.saving,
    state,
    state?.clock,
    state?.id,
    state?.status,
  ]);

  async function runOperation(
    operation: () => Promise<void>,
  ): Promise<boolean> {
    try {
      setNotice(null);
      await operation();
      return true;
    } catch (error) {
      setNotice(errorMessage(error));
      return false;
    }
  }

  function playCue(cue: SoundCue, options?: SoundPlayOptions): void {
    if (!preferences.soundEnabled) {
      return;
    }
    void audio.play(cue, options).catch((error: unknown) => {
      setNotice(`Sound unavailable: ${errorMessage(error)}`);
    });
  }

  function playRollOutcomeCue(current: GameState | null): void {
    const result = current?.lastRoll;
    if (!current || !result) return;

    if (result.eventFace !== "barbarian") {
      playCue({ type: "progress", discipline: result.eventFace });
      return;
    }

    const attack = current.barbarian.pendingAttack;
    if (attack) {
      playCue({
        type: "barbarian-attack",
        outcome: attack.outcome.type,
      });
      return;
    }

    playCue({
      type: "barbarian-advance",
      spacesRemaining: Math.max(
        0,
        current.barbarian.rules.trackLength - current.barbarian.shipPosition,
      ),
    });
  }

  function playPendingWorldEventCue(
    current: GameState | null,
    delaySeconds = 0.24,
  ): void {
    if (!preferences.soundEnabled) return;
    const event = current?.thematicEvents.pendingEvent;
    if (!event || soundedEventOccurrences.current.has(event.occurrenceId)) {
      return;
    }
    soundedEventOccurrences.current.add(event.occurrenceId);
    playCue(
      {
        type: "world-event",
        eventId: event.eventId,
        category: event.category ?? "society",
        tone: event.tone ?? "mixed",
        impact: event.impact ?? 1,
      },
      { delaySeconds },
    );
  }

  function setSoundEnabled(enabled: boolean): void {
    audio.setMuted(!enabled);
    updatePreferences({ soundEnabled: enabled });
    if (!enabled) return;
    audio.setVolume(preferences.soundVolume);
    void audio.play({ type: "confirm" }).catch((error: unknown) => {
      setNotice(`Sound unavailable: ${errorMessage(error)}`);
    });
  }

  function changePreferences(patch: Partial<typeof preferences>): void {
    if (patch.soundVolume !== undefined) {
      audio.setVolume(patch.soundVolume);
    }
    if (patch.soundEnabled !== undefined) {
      setSoundEnabled(patch.soundEnabled);
      return;
    }
    updatePreferences(patch);
  }

  function navigateToLoadedGame(): void {
    const loaded = gameController.getSnapshot().activeState;
    setScreen(loaded?.status === "completed" ? "complete" : "game");
  }

  async function resumeSavedGame(id: string): Promise<void> {
    if (
      activeRecord &&
      activeRecord.id !== id &&
      activeRecord.lifecycle === "active"
    ) {
      setResumeGameId(id);
      return;
    }
    const resumed = await runOperation(async () => {
      await gameController.resumeGame(asGameId(id));
    });
    if (resumed) {
      setSavedGamesOpen(false);
      navigateToLoadedGame();
    }
  }

  async function startGame(draft: SetupDraft): Promise<void> {
    updatePreferences(draft.preferences);
    audio.setVolume(draft.preferences.soundVolume);
    const setup = setupFromDraft(draft);
    const started = await runOperation(async () => {
      await gameController.startGame(setup);
    });
    if (started) {
      setScreen("game");
      void requestPersistentStorage()
        .then(() => getStorageStatus())
        .then(setStorageStatus)
        .catch((error: unknown) => {
          setNotice(errorMessage(error));
        });
    }
  }

  async function dispatch(
    command: GameCommand,
    cue?: SoundCue,
  ): Promise<boolean> {
    const completed = await runOperation(async () => {
      await gameController.dispatch(command);
    });
    if (completed && cue) {
      playCue(cue);
    }
    return completed;
  }

  async function roll(command: GameCommand): Promise<boolean> {
    // This synchronous call unlocks Web Audio inside the user's gesture on
    // Safari/iOS before the durable command crosses an async boundary.
    playCue({ type: "dice-roll" });
    setRolling(true);
    let completed: boolean;
    try {
      completed = await dispatch(command);
      if (completed) {
        await new Promise<void>((resolve) => {
          window.setTimeout(
            resolve,
            preferences.motion === "reduced" ? 1 : 650,
          );
        });
        playRollOutcomeCue(gameController.getSnapshot().activeState);
      }
    } finally {
      setRolling(false);
    }

    if (!completed) {
      return false;
    }

    setResolutionBusy(true);
    try {
      const acknowledged = await acknowledgeOfficialRollSteps();
      if (acknowledged) {
        playPendingWorldEventCue(gameController.getSnapshot().activeState);
      }
      return acknowledged;
    } finally {
      setResolutionBusy(false);
    }
  }

  async function acknowledgeOfficialRollSteps(): Promise<boolean> {
    let current = gameController.getSnapshot().activeState;
    if (current?.turn.phase !== "resolving-official-result") {
      return true;
    }

    const official = current.resolution.official;
    if (!official) {
      setNotice("The current roll is missing its official resolution.");
      return false;
    }

    if (official.progressPending) {
      const acknowledged = await dispatch({
        type: "resolution.progressAcknowledged",
        rollId: official.rollId,
      });
      if (!acknowledged) {
        return false;
      }
      current = gameController.getSnapshot().activeState;
    }

    if (
      current?.turn.phase === "resolving-official-result" &&
      current.resolution.official?.productionPending
    ) {
      const acknowledged = await dispatch({
        type: "resolution.productionAcknowledged",
        rollId: current.resolution.official.rollId,
      });
      if (!acknowledged) {
        return false;
      }
    }

    return true;
  }

  async function continueOfficialRoll(): Promise<void> {
    setResolutionBusy(true);
    try {
      await acknowledgeOfficialRollSteps();
    } finally {
      setResolutionBusy(false);
    }
  }

  async function resolveRollResult(
    quickRoll: boolean,
    choices: AttackProgressChoice[],
  ): Promise<void> {
    setResolutionBusy(true);
    try {
      let current = gameController.getSnapshot().activeState;
      if (!current?.lastRoll) {
        throw new Error("There is no roll result to resolve.");
      }

      if (current.turn.phase === "resolving-barbarian-attack") {
        const proposal = current.barbarian.pendingAttack;
        if (!proposal) {
          throw new Error("The barbarian attack proposal is missing.");
        }
        const confirmed = await dispatch(
          {
            type: "attack.confirmed",
            proposalId: proposal.id,
            ...(choices.length === 0
              ? {}
              : {
                  progressChoices: choices.map((choice) => ({
                    playerId: asPlayerId(choice.playerId),
                    discipline: choice.discipline,
                  })),
                }),
          },
          { type: "confirm" },
        );
        if (!confirmed) {
          return;
        }
        current = gameController.getSnapshot().activeState;
      }

      const officialAcknowledged = await acknowledgeOfficialRollSteps();
      if (!officialAcknowledged) {
        return;
      }
      current = gameController.getSnapshot().activeState;

      if (
        current?.turn.phase === "resolving-thematic-event" &&
        current.thematicEvents.pendingEvent
      ) {
        playPendingWorldEventCue(current, 0.08);
        const acknowledged = await dispatch({
          type: "event.acknowledged",
          occurrenceId: current.thematicEvents.pendingEvent.occurrenceId,
        });
        if (!acknowledged) {
          return;
        }
        current = gameController.getSnapshot().activeState;
      }

      if (current?.turn.phase !== "action-phase") {
        throw new Error("The roll could not reach the action phase.");
      }

      if (!quickRoll) {
        return;
      }

      await rollNextTurn();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setResolutionBusy(false);
    }
  }

  async function rollNextTurn(): Promise<void> {
    if (preferences.soundEnabled) {
      // A resumed game may not have an unlocked context yet. Do this before
      // the turn-ending dispatch crosses the user's click boundary.
      void audio.unlock().catch((error: unknown) => {
        setNotice(`Sound unavailable: ${errorMessage(error)}`);
      });
    }
    const current = gameController.getSnapshot().activeState;
    if (current?.turn.phase !== "action-phase") {
      setNotice("The current roll must reach the action phase first.");
      return;
    }
    if (winnerCandidates(current).length > 0) {
      setWinnerOpen(true);
      return;
    }
    const previousSeason = current.setup.seasonConfig?.enabled
      ? deriveSeason(current.setup.seasonConfig, current.turn.round).season
      : null;
    const ended = await dispatch({ type: "turn.ended" });
    if (!ended) {
      return;
    }

    const next = gameController.getSnapshot().activeState;
    const nextSeason = next?.setup.seasonConfig?.enabled
      ? deriveSeason(next.setup.seasonConfig, next.turn.round).season
      : null;
    if (previousSeason && nextSeason && previousSeason !== nextSeason) {
      playCue({ type: "season-change", season: nextSeason });
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, preferences.motion === "reduced" ? 1 : 520);
      });
    } else {
      playCue({ type: "confirm" });
    }
    await roll({ type: "roll.draw" });
  }

  async function exportStoredGame(game: StoredGame): Promise<void> {
    const document = await gameController.exportGame(game.id);
    downloadJson(document, makeBackupFilename(game.title));
    setNotice(`Exported ${game.title}.`);
  }

  async function handlePlayerSave(patch: PlayerEditorPatch): Promise<void> {
    if (!selectedPlayerId) {
      return;
    }
    const scoreAdjustment =
      patch.scoreDelta === 0
        ? {}
        : {
            scoreAdjustment: {
              delta: patch.scoreDelta,
              reason: "manual" as const,
              ...(patch.scoreNote ? { note: patch.scoreNote } : {}),
            },
          };
    const saved = await dispatch({
      type: "player.publicStateAdjusted",
      playerId: selectedPlayerId,
      patch: {
        ordinaryCities: patch.ordinaryCities,
        activeKnights: patch.activeKnights,
        improvements: patch.improvements,
        ...scoreAdjustment,
      },
    });
    if (saved) {
      setSelectedPlayerId(null);
    }
  }

  const page = renderPage();

  function renderPage(): ReactNode {
    if (screen === "setup") {
      return (
        <SetupWizard
          initialPreferences={preferences}
          onCancel={() => {
            setScreen("home");
          }}
          onStart={(draft) => {
            void startGame(draft);
          }}
        />
      );
    }

    if (screen === "complete" && state?.status === "completed") {
      return (
        <GameCompleteScreen
          view={toGameCompleteView(state)}
          onExport={() => {
            const record = snapshot.games.find((game) => game.id === state.id);
            if (record) {
              void runOperation(async () => {
                await exportStoredGame(record);
              });
            }
          }}
          onHome={() => {
            setScreen("home");
          }}
          onNewGame={() => {
            setScreen("setup");
          }}
        />
      );
    }

    if (screen === "game" && state) {
      const savedLabel = snapshot.saving
        ? "Saving"
        : snapshot.pendingSave || snapshot.error
          ? "Save failed"
          : snapshot.lastSavedAt
            ? "Saved"
            : "Ready";
      const saveTone = snapshot.saving
        ? "info"
        : snapshot.pendingSave || snapshot.error
          ? "danger"
          : "success";

      return (
        <>
          {snapshot.readOnly ? (
            <div
              className="app-notice app-notice--warning app-notice--secondary"
              role="status"
            >
              <span>
                Another tab controls this game. This tab mirrors durable state
                without allowing changes.
              </span>
              <Button
                size="small"
                disabled={snapshot.loading || snapshot.saving}
                onClick={() => {
                  void runOperation(async () => {
                    const acquired = await gameController.takeControl();
                    if (!acquired) {
                      throw new Error(
                        "The other tab still controls this game.",
                      );
                    }
                  });
                }}
              >
                Take control
              </Button>
            </div>
          ) : null}
          <GameTable
            view={toGameTableView(
              state,
              {
                savedLabel,
                saveTone,
              },
              !online,
              rolling,
              snapshot.readOnly,
              clockAt,
            )}
            busy={rolling || resolutionBusy || snapshot.saving}
            soundEnabled={preferences.soundEnabled}
            onToggleSound={() => {
              setSoundEnabled(!preferences.soundEnabled);
            }}
            onRoll={() => {
              void roll({ type: "roll.draw" });
            }}
            onAlchemy={() => {
              setAlchemyOpen(true);
            }}
            onAdjustScore={(id, delta) => {
              void dispatch(
                {
                  type: "player.publicStateAdjusted",
                  playerId: asPlayerId(id),
                  patch: {
                    scoreAdjustment: {
                      delta,
                      reason: "manual",
                    },
                  },
                },
                { type: "confirm" },
              );
            }}
            onEditPlayer={(id) => {
              setSelectedPlayerId(asPlayerId(id));
            }}
            onNextRoll={() => {
              void rollNextTurn();
            }}
            onContinueRoll={() => {
              void continueOfficialRoll();
            }}
            onAcknowledgeEvent={() => {
              const event = state.thematicEvents.pendingEvent;
              if (event) {
                void dispatch({
                  type: "event.acknowledged",
                  occurrenceId: event.occurrenceId,
                });
              }
            }}
            onResolveEvent={(occurrenceId) => {
              void dispatch(
                {
                  type: "event.resolved",
                  occurrenceId: asEventOccurrenceId(occurrenceId),
                },
                { type: "confirm" },
              );
            }}
            onPause={() => {
              void dispatch({ type: "clock.paused" }, { type: "confirm" });
            }}
            onHistory={() => {
              setHistoryOpen(true);
            }}
            onSettings={() => {
              setSettingsOpen(true);
            }}
            onExport={() => {
              const record = snapshot.games.find(
                (game) => game.id === state.id,
              );
              if (record) {
                void runOperation(async () => {
                  await exportStoredGame(record);
                });
              }
            }}
            onConfirmWinner={() => {
              setWinnerOpen(true);
            }}
          />
        </>
      );
    }

    return (
      <HomeScreen
        activeGame={homeSummary}
        archivedCount={savedGames.length}
        loading={!snapshot.initialized || snapshot.loading}
        error={notice ?? snapshot.error?.message ?? null}
        onResume={() => {
          if (activeRecord) {
            void resumeSavedGame(activeRecord.id);
          }
        }}
        onNewGame={() => {
          if (activeRecord) {
            setNewGameConfirmation(true);
          } else {
            setScreen("setup");
          }
        }}
        onImport={(file) => {
          void runOperation(async () => {
            const input = await readJsonFile(file);
            await gameController.previewImport(input);
          });
        }}
        onSettings={() => {
          setSettingsOpen(true);
        }}
        onViewArchive={() => {
          setSavedGamesOpen(true);
        }}
      />
    );
  }

  return (
    <>
      {page}

      {(notice ?? snapshot.error?.message) &&
      snapshot.pendingSave === null &&
      (screen !== "home" || snapshot.recovery !== null) ? (
        <aside
          className={`app-notice${snapshot.recovery ? " app-notice--danger" : ""}`}
          role="alert"
        >
          <span>{notice ?? snapshot.error?.message}</span>
          <div className="button-row">
            {snapshot.recovery?.validAncestorRevisionId ? (
              <Button
                size="small"
                onClick={() => {
                  void runOperation(async () => {
                    await gameController.recoverActive();
                  });
                }}
              >
                Restore verified revision
              </Button>
            ) : null}
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                setNotice(null);
                gameController.clearError();
              }}
            >
              Dismiss
            </Button>
          </div>
        </aside>
      ) : null}

      <SettingsDialog
        open={settingsOpen}
        preferences={preferences}
        storageStatus={storageStatus}
        appVersion={APPLICATION_VERSION}
        schemaVersion={DATABASE_SCHEMA_VERSION}
        onChange={changePreferences}
        onPreviewSound={() => {
          playCue({
            type: "world-event",
            eventId: "preview-world-event",
            category: "economy",
            tone: "boon",
            impact: 2,
          });
        }}
        onRequestPersistentStorage={async () => {
          await runOperation(async () => {
            const persisted = await requestPersistentStorage();
            setStorageStatus(await getStorageStatus());
            setNotice(
              persisted === false
                ? "The browser declined persistent storage; exports remain available."
                : "Saved-game storage is protected where the browser supports it.",
            );
          });
        }}
        onCopyDiagnostics={async () => {
          await runOperation(async () => {
            const text = buildSanitizedDiagnostics({
              appVersion: APPLICATION_VERSION,
              schemaVersion: DATABASE_SCHEMA_VERSION,
              activeRevision: state?.revisionId ?? null,
              lastSavedAt: snapshot.lastSavedAt,
              storage: storageStatus,
              season:
                state?.setup.seasonConfig?.enabled === true
                  ? (() => {
                      const info = deriveSeason(
                        state.setup.seasonConfig,
                        state.turn.round,
                      );
                      return {
                        name: info.season,
                        roundInSeason: info.roundInSeason,
                        roundsPerSeason:
                          state.setup.seasonConfig.roundsPerSeason,
                      };
                    })()
                  : null,
            });
            await copyText(text);
            setNotice("Sanitized diagnostics copied.");
          });
        }}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />

      <CompletedGamesDialog
        open={savedGamesOpen}
        games={savedGames}
        onResume={(id) => {
          void resumeSavedGame(id);
        }}
        onExport={(id) => {
          const record = snapshot.games.find((game) => game.id === id);
          if (record) {
            void runOperation(async () => {
              await exportStoredGame(record);
            });
          }
        }}
        onDelete={setDeleteGameId}
        onClose={() => {
          setSavedGamesOpen(false);
        }}
      />

      <ImportPreviewDialog
        open={snapshot.importPreview !== null}
        preview={toImportPreview(snapshot.importPreview)}
        onConfirm={() => {
          void runOperation(async () => {
            await gameController.confirmImport();
            navigateToLoadedGame();
          });
        }}
        onCancel={() => {
          gameController.cancelImport();
        }}
      />

      <ConfirmDialog
        open={newGameConfirmation}
        title="Start another game?"
        description="The current game will be archived and can be resumed from Saved games."
        confirmLabel="Archive and continue"
        onCancel={() => {
          setNewGameConfirmation(false);
        }}
        onConfirm={() => {
          void runOperation(async () => {
            await gameController.archiveActive();
            setNewGameConfirmation(false);
            setScreen("setup");
          });
        }}
      />

      <ConfirmDialog
        open={deleteGameId !== null}
        title="Delete this saved game?"
        description="This removes every local revision. Export it first if you may need it later."
        confirmLabel="Delete permanently"
        danger
        onCancel={() => {
          setDeleteGameId(null);
        }}
        onConfirm={() => {
          const id = deleteGameId;
          if (!id) {
            return;
          }
          void runOperation(async () => {
            await gameController.deleteGame(asGameId(id));
            setDeleteGameId(null);
          });
        }}
      />

      <ConfirmDialog
        open={resumeGameId !== null}
        title="Resume another saved game?"
        description="The current game will be archived before the selected game becomes active."
        confirmLabel="Archive current and resume"
        onCancel={() => {
          setResumeGameId(null);
        }}
        onConfirm={() => {
          const id = resumeGameId;
          if (!id) {
            return;
          }
          void runOperation(async () => {
            await gameController.resumeGame(asGameId(id));
            setResumeGameId(null);
            setSavedGamesOpen(false);
            navigateToLoadedGame();
          });
        }}
      />

      {state && screen === "game" ? (
        <>
          <AlchemyDialog
            open={
              !clockPaused &&
              alchemyOpen &&
              state.turn.phase === "awaiting-roll"
            }
            onCancel={() => {
              setAlchemyOpen(false);
            }}
            onConfirm={(red, yellow) => {
              setAlchemyOpen(false);
              void roll({
                type: "roll.alchemy",
                red: red as DieValue,
                yellow: yellow as DieValue,
              });
            }}
          />

          {!snapshot.readOnly &&
          !clockPaused &&
          !rolling &&
          selectedPlayer === null &&
          state.lastRoll &&
          state.turn.phase === "resolving-barbarian-attack" ? (
            <RollResolutionDialog
              key={`${state.lastRoll.id}-${state.barbarian.pendingAttack?.id ?? "no-attack"}`}
              open
              view={toRollResolutionView(state, clockAt)}
              busy={resolutionBusy || snapshot.saving}
              onCorrectAttackPlayer={(id) => {
                setSelectedPlayerId(asPlayerId(id));
              }}
              onPause={() => {
                void dispatch({ type: "clock.paused" }, { type: "confirm" });
              }}
              onContinue={(choices) => {
                void resolveRollResult(false, choices);
              }}
              onQuickRoll={(choices) => {
                void resolveRollResult(true, choices);
              }}
            />
          ) : null}

          {!snapshot.readOnly && !clockPaused && selectedPlayer ? (
            <PlayerEditorDialog
              key={`${selectedPlayer.id}-${state.revisionId}`}
              player={toPlayerEditorValue(state, selectedPlayer.id)}
              onSave={(patch) => {
                void handlePlayerSave(patch);
              }}
              onClose={() => {
                setSelectedPlayerId(null);
              }}
            />
          ) : null}

          {!snapshot.readOnly &&
          !clockPaused &&
          state.metropolises.pendingProposal &&
          selectedPlayer === null ? (
            <MetropolisDialog
              proposal={toMetropolisProposalView(
                state,
                state.metropolises.pendingProposal,
              )}
              onConfirm={() => {
                const proposal = state.metropolises.pendingProposal;
                if (proposal) {
                  void dispatch(
                    {
                      type: "metropolis.proposalConfirmed",
                      proposalId: proposal.id,
                    },
                    { type: "confirm" },
                  );
                }
              }}
              onReject={() => {
                const proposal = state.metropolises.pendingProposal;
                if (proposal) {
                  void dispatch({
                    type: "metropolis.proposalCancelled",
                    proposalId: proposal.id,
                  }).then((completed) => {
                    if (completed) {
                      setMetropolisCorrectionOpen(true);
                    }
                  });
                }
              }}
            />
          ) : null}

          <MetropolisCorrectionDialog
            open={
              metropolisCorrectionOpen && !snapshot.readOnly && !clockPaused
            }
            players={state.players.map((player) => ({
              id: player.id,
              name: player.name,
              color: player.color.hex,
              improvements: player.improvements,
            }))}
            onPropose={(discipline, holderId, status) => {
              void dispatch({
                type: "metropolis.correctionProposed",
                discipline,
                holderId: holderId ? asPlayerId(holderId) : null,
                status,
              }).then((completed) => {
                if (completed) {
                  setMetropolisCorrectionOpen(false);
                }
              });
            }}
            onClose={() => {
              setMetropolisCorrectionOpen(false);
            }}
          />

          <HistoryDialog
            open={historyOpen && !clockPaused}
            entries={historyEntries}
            canUndo={snapshot.canUndo && !snapshot.readOnly}
            canRedo={snapshot.canRedo && !snapshot.readOnly}
            onUndo={() => {
              void runOperation(async () => {
                await gameController.undo();
              });
            }}
            onRedo={() => {
              void runOperation(async () => {
                await gameController.redo();
              });
            }}
            onClose={() => {
              setHistoryOpen(false);
            }}
          />

          <WinnerDialog
            open={winnerOpen && !snapshot.readOnly && !clockPaused}
            player={
              winnerCandidate
                ? {
                    id: winnerCandidate.id,
                    name: winnerCandidate.name,
                    color: winnerCandidate.color.hex,
                    victoryPoints: state.scoreLedger
                      .filter((entry) => entry.playerId === winnerCandidate.id)
                      .reduce((total, entry) => total + entry.delta, 0),
                  }
                : null
            }
            target={state.setup.victoryTarget}
            onClose={() => {
              setWinnerOpen(false);
            }}
            onConfirm={() => {
              if (!winnerCandidate) {
                return;
              }
              void dispatch(
                {
                  type: "game.completed",
                  winnerId: winnerCandidate.id,
                },
                { type: "confirm" },
              ).then((completed) => {
                if (completed) {
                  setWinnerOpen(false);
                  setScreen("complete");
                }
              });
            }}
          />

          <PauseGameDialog
            open={clockPaused}
            currentPlayerName={
              state.players[state.turn.currentPlayerIndex]?.name ??
              "Current player"
            }
            currentPlayerColor={
              state.players[state.turn.currentPlayerIndex]?.color.hex ??
              "#286b9b"
            }
            currentTurnMs={currentTurnActiveMilliseconds(state, clockAt)}
            totalGameMs={totalActiveMilliseconds(state, clockAt)}
            canResume={!snapshot.readOnly}
            busy={snapshot.saving}
            onResume={() => {
              void dispatch({ type: "clock.resumed" }, { type: "confirm" });
            }}
          />
        </>
      ) : null}

      <SaveRecoveryDialog
        open={snapshot.pendingSave !== null}
        message={
          snapshot.pendingSave?.message ??
          "The latest action could not be confirmed saved."
        }
        busy={snapshot.saving}
        onRetry={() => {
          void runOperation(async () => {
            await gameController.retryPendingSave();
            const retriedState = gameController.getSnapshot().activeState;
            if (retriedState?.status === "completed") {
              setWinnerOpen(false);
              setScreen("complete");
            }
          });
        }}
        onExport={() => {
          void runOperation(async () => {
            const document = await gameController.exportPendingSave();
            downloadJson(
              document,
              makeBackupFilename(`${document.game.title}-emergency`),
            );
            setNotice("Emergency backup exported.");
          });
        }}
        onRevert={() => {
          void runOperation(async () => {
            await gameController.revertPendingSave();
          });
        }}
      />

      {!clockPaused ? <PwaUpdate safeToUpdate={safeToUpdate} /> : null}
    </>
  );
}
