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
  createEmptyBoardInventory,
  deriveSeason,
  totalActiveMilliseconds,
  winnerCandidates,
  type DieValue,
  type BoardDesignId,
  type GameCommand,
  type GameState,
} from "../domain";
import {
  downloadJson,
  makeBackupFilename,
  makeBoardDesignFilename,
  readJsonFile,
} from "../infrastructure/platform/files";
import {
  downloadBoardPng,
  downloadBoardSvg,
  printBoardDesign,
} from "../infrastructure/platform/boardExport";
import { parseBoardDesignExportDocument } from "../infrastructure/persistence";
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
import { PauseGameDialog } from "../ui/features/game/PauseGameDialog";
import { SaveRecoveryDialog } from "../ui/features/game/SaveRecoveryDialog";
import {
  toGameCompleteView,
  toGameTableView,
} from "../ui/features/game/viewMappers";
import { WinnerDialog } from "../ui/features/game/WinnerDialog";
import { SettingsDialog } from "../ui/features/settings/SettingsDialog";
import { BoardDesignLibraryScreen } from "../ui/features/board-designer/BoardDesignLibraryScreen";
import { BoardDesignerScreen } from "../ui/features/board-designer/BoardDesignerScreen";
import { boardDesignerController } from "./boardDesignerController";
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
import { useBoardDesignerController } from "./useBoardDesignerController";
import { useGameController } from "./useGameController";
import { useOnlineStatus } from "./useOnlineStatus";

type Screen =
  "home" | "setup" | "game" | "complete" | "boards" | "board-designer";

export function App() {
  const snapshot = useGameController();
  const boardSnapshot = useBoardDesignerController();
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
  const [metropolisCorrectionOpen, setMetropolisCorrectionOpen] =
    useState(false);
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [newGameConfirmation, setNewGameConfirmation] = useState(false);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [deleteBoardDesign, setDeleteBoardDesign] = useState<{
    id: BoardDesignId;
    revision: number;
  } | null>(null);
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
    void boardDesignerController.initialize().catch((error: unknown) => {
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

    // The board owns every attack detail, so the only cue left is that an
    // attack happened. The ship resets to 0 when it lands.
    if (current.barbarian.shipPosition === 0) {
      playCue({
        type: "barbarian-attack",
        outcome: "board-authoritative",
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

    // A rolled 7 asks the table to do something physical: discard down to the
    // hand limit, then move the robber. Acknowledging it here left the
    // resolution phase in the same tick, so those instructions appeared and
    // vanished before anyone could read them. Hold the resolution open and let
    // the table dismiss it once the robber has actually moved.
    const rolled = gameController.getSnapshot().activeState;
    if (rolled?.lastRoll?.total === 7) {
      return true;
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
      // A 7 skips the automatic acknowledgement in `roll`, so this is where its
      // world event cue lands instead.
      const acknowledged = await acknowledgeOfficialRollSteps();
      if (acknowledged) {
        playPendingWorldEventCue(gameController.getSnapshot().activeState);
      }
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

    // Auto-roll for the next player (one-click turn advancement).
    await roll({ type: "roll.draw" });
  }

  async function alchemyNextTurn(): Promise<void> {
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
    }

    // Open alchemy dialog for the next player instead of auto-rolling.
    setAlchemyOpen(true);
  }

  async function exportStoredGame(game: StoredGame): Promise<void> {
    const document = await gameController.exportGame(game.id);
    downloadJson(document, makeBackupFilename(game.title));
    setNotice(`Exported ${game.title}.`);
  }

  async function exportBoardDesign(
    format: "json" | "svg" | "png" | "print",
  ): Promise<void> {
    const design = boardDesignerController.getSnapshot().activeDesign;
    if (!design) {
      throw new Error("No board design is open.");
    }
    if (format === "json") {
      const document = await boardDesignerController.exportDesign(design.id);
      downloadJson(
        document,
        makeBoardDesignFilename(design.name, "json"),
        "application/vnd.catan-table-companion.board+json",
      );
      setNotice(`Exported ${design.name}.`);
      return;
    }
    if (format === "svg") {
      downloadBoardSvg(design);
      setNotice(`Exported ${design.name} as SVG.`);
      return;
    }
    if (format === "png") {
      await downloadBoardPng(design);
      setNotice(`Exported ${design.name} as PNG.`);
      return;
    }
    printBoardDesign(design);
  }

  async function adjustImprovement(
    playerId: string,
    discipline: "science" | "trade" | "politics",
    delta: -1 | 1,
  ): Promise<void> {
    const current = gameController.getSnapshot().activeState;
    const player = current?.players.find(
      (candidate) => candidate.id === asPlayerId(playerId),
    );
    if (!player) {
      return;
    }
    const next = player.improvements[discipline] + delta;
    if (next < 0 || next > 5) {
      return;
    }
    // Crossing level 4 or 5 can open a metropolis claim, which the domain
    // raises as a pending proposal off the back of this same command.
    await dispatch({
      type: "player.publicStateAdjusted",
      playerId: asPlayerId(playerId),
      patch: {
        improvements: {
          ...player.improvements,
          [discipline]: next,
        },
      },
    });
  }

  const page = renderPage();

  function renderPage(): ReactNode {
    if (
      screen === "boards" ||
      (screen === "board-designer" && boardSnapshot.activeDesign === null)
    ) {
      return (
        <BoardDesignLibraryScreen
          designs={boardSnapshot.designs}
          loading={!boardSnapshot.initialized || boardSnapshot.loading}
          error={notice ?? boardSnapshot.error?.message ?? null}
          onBack={() => {
            setNotice(null);
            setScreen("home");
          }}
          onCreateClassic={() => {
            void runOperation(async () => {
              await boardDesignerController.createDesign();
              setScreen("board-designer");
            });
          }}
          onCreateBlank={() => {
            void runOperation(async () => {
              await boardDesignerController.createDesign(
                "Untitled island",
                createEmptyBoardInventory(),
              );
              setScreen("board-designer");
            });
          }}
          onOpen={(id) => {
            void runOperation(async () => {
              await boardDesignerController.openDesign(id);
              setScreen("board-designer");
            });
          }}
          onDuplicate={(id) => {
            void runOperation(async () => {
              await boardDesignerController.duplicateDesign(id);
              setScreen("board-designer");
            });
          }}
          onDelete={(id, revision) => {
            setDeleteBoardDesign({ id, revision });
          }}
          onImport={(file) => {
            void runOperation(async () => {
              const input = await readJsonFile(file);
              const document = parseBoardDesignExportDocument(input);
              await boardDesignerController.importDesign(document.design);
              setScreen("board-designer");
            });
          }}
        />
      );
    }

    if (screen === "board-designer" && boardSnapshot.activeDesign !== null) {
      return (
        <BoardDesignerScreen
          design={boardSnapshot.activeDesign}
          saving={boardSnapshot.saving}
          error={notice ?? boardSnapshot.error?.message ?? null}
          canUndo={boardSnapshot.canUndo}
          canRedo={boardSnapshot.canRedo}
          onBack={() => {
            boardDesignerController.closeDesign();
            setNotice(null);
            setScreen("boards");
          }}
          onCommand={boardDesignerController.dispatch}
          onResizeFootprint={async (width, height) => {
            await runOperation(() =>
              boardDesignerController.resizeFootprint(width, height),
            );
          }}
          onGenerate={async () => {
            await runOperation(() => boardDesignerController.generate());
          }}
          onUndo={async () => {
            await runOperation(() => boardDesignerController.undo());
          }}
          onRedo={async () => {
            await runOperation(() => boardDesignerController.redo());
          }}
          onExport={(format) => {
            void runOperation(() => exportBoardDesign(format));
          }}
        />
      );
    }

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
            onAdjustImprovement={(id, discipline, delta) => {
              void adjustImprovement(id, discipline, delta);
            }}
            onNextRoll={() => {
              void rollNextTurn();
            }}
            onAlchemyNextTurn={() => {
              void alchemyNextTurn();
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
        onBoardDesigner={() => {
          setNotice(null);
          setScreen("boards");
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
      ((screen !== "home" &&
        screen !== "boards" &&
        screen !== "board-designer") ||
        snapshot.recovery !== null) ? (
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
        open={deleteBoardDesign !== null}
        title="Delete this board design?"
        description="This permanently removes the local design. Export it first if you may need it later."
        confirmLabel="Delete permanently"
        danger
        onCancel={() => {
          setDeleteBoardDesign(null);
        }}
        onConfirm={() => {
          const target = deleteBoardDesign;
          if (!target) {
            return;
          }
          setDeleteBoardDesign(null);
          void runOperation(async () => {
            await boardDesignerController.deleteDesign(
              target.id,
              target.revision,
            );
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

          {/* Barbarian attacks are now auto-resolved; the physical board
              is authoritative. The resolution dialog is no longer shown. */}

          {/* City improvements are tracked inline on each player card, so the
              per-player editor dialog is gone entirely. */}

          {!snapshot.readOnly &&
          !clockPaused &&
          state.metropolises.pendingProposal ? (
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
