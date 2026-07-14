import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  APPLICATION_VERSION,
  DATABASE_SCHEMA_VERSION,
  type StoredGame,
  type StoredRevision,
} from "../application";
import {
  BUILT_IN_THEMATIC_EVENTS,
  asGameId,
  asPlayerId,
  winnerCandidates,
  type DieValue,
  type GameCommand,
  type GameSetup,
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
import { AudioCues, type SoundCue } from "../infrastructure/platform/audio";
import { ScreenWakeLock } from "../infrastructure/platform/wakeLock";
import { Button, ConfirmDialog } from "../ui/components";
import {
  CompletedGamesDialog,
  type CompletedGameSummary,
} from "../ui/features/home/CompletedGamesDialog";
import {
  HomeScreen,
  type HomeGameSummary,
} from "../ui/features/home/HomeScreen";
import {
  ImportPreviewDialog,
  type ImportPreview,
} from "../ui/features/home/ImportPreviewDialog";
import { SetupWizard, type SetupDraft } from "../ui/features/setup/SetupWizard";
import { AlchemyDialog } from "../ui/features/game/AlchemyDialog";
import { GameCompleteScreen } from "../ui/features/game/GameCompleteScreen";
import { GameTable } from "../ui/features/game/GameTable";
import {
  HistoryDialog,
  type HistoryEntryView,
} from "../ui/features/game/HistoryDialog";
import { MetropolisCorrectionDialog } from "../ui/features/game/MetropolisCorrectionDialog";
import {
  MetropolisDialog,
  type MetropolisProposalView,
} from "../ui/features/game/MetropolisDialog";
import {
  PlayerEditorDialog,
  type PlayerEditorPatch,
} from "../ui/features/game/PlayerEditorDialog";
import {
  RollResolutionDialog,
  type AttackProgressChoice,
} from "../ui/features/game/RollResolutionDialog";
import {
  toGameCompleteView,
  toGameTableView,
  toPlayerEditorValue,
  toRollResolutionView,
} from "../ui/features/game/viewMappers";
import { WinnerDialog } from "../ui/features/game/WinnerDialog";
import { SettingsDialog } from "../ui/features/settings/SettingsDialog";
import { gameController } from "./gameController";
import { PwaUpdate } from "./PwaUpdate";
import { useDevicePreferences } from "./useDevicePreferences";
import { useGameController } from "./useGameController";
import { useOnlineStatus } from "./useOnlineStatus";

type Screen = "home" | "setup" | "game" | "complete";

const colorNames: Record<string, string> = {
  "#b66a1f": "Amber",
  "#286b9b": "Ocean blue",
  "#b43e3e": "Crimson",
  "#2f7551": "Forest green",
};

export function App() {
  const snapshot = useGameController();
  const { preferences, updatePreferences } = useDevicePreferences();
  const online = useOnlineStatus();
  const initialized = useRef(false);
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
  const [rollResolutionPinned, setRollResolutionPinned] = useState(false);
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

  useEffect(
    () => () => {
      audio.close();
    },
    [audio],
  );

  const state = snapshot.activeState;
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
    !rollResolutionPinned &&
    !resolutionBusy &&
    (!state ||
      state.turn.phase === "awaiting-roll" ||
      state.turn.phase === "action-phase" ||
      state.turn.phase === "completed");

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

  function playCue(cue: SoundCue): void {
    if (!preferences.soundEnabled) {
      return;
    }
    void audio.play(cue).catch((error: unknown) => {
      setNotice(`Sound unavailable: ${errorMessage(error)}`);
    });
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
    const setup = setupFromDraft(draft);
    const started = await runOperation(async () => {
      await gameController.startGame(setup);
    });
    if (started) {
      setScreen("game");
      playCue("confirm");
      if (draft.preferences.keepAwake) {
        void requestPersistentStorage()
          .then(() => getStorageStatus())
          .then(setStorageStatus)
          .catch((error: unknown) => {
            setNotice(errorMessage(error));
          });
      }
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
    setRolling(true);
    const completed = await dispatch(command, "roll");
    if (completed) {
      setRollResolutionPinned(true);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, preferences.motion === "reduced" ? 1 : 650);
      });
    }
    setRolling(false);
    return completed;
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
          "confirm",
        );
        if (!confirmed) {
          return;
        }
        current = gameController.getSnapshot().activeState;
      }

      if (
        current?.turn.phase === "resolving-official-result" &&
        current.resolution.official?.progressPending
      ) {
        const acknowledged = await dispatch({
          type: "resolution.progressAcknowledged",
          rollId: current.resolution.official.rollId,
        });
        if (!acknowledged) {
          return;
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
          return;
        }
        current = gameController.getSnapshot().activeState;
      }

      if (
        current?.turn.phase === "resolving-thematic-event" &&
        current.thematicEvents.pendingEvent
      ) {
        const acknowledged = await dispatch(
          {
            type: "event.acknowledged",
            occurrenceId: current.thematicEvents.pendingEvent.occurrenceId,
          },
          "event",
        );
        if (!acknowledged) {
          return;
        }
        current = gameController.getSnapshot().activeState;
      }

      if (current?.turn.phase !== "action-phase") {
        throw new Error("The roll could not reach the action phase.");
      }

      if (!quickRoll) {
        setRollResolutionPinned(false);
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
    const current = gameController.getSnapshot().activeState;
    if (current?.turn.phase !== "action-phase") {
      setNotice("The current roll must reach the action phase first.");
      return;
    }
    if (winnerCandidates(current).length > 0) {
      setRollResolutionPinned(false);
      setWinnerOpen(true);
      return;
    }
    const ended = await dispatch({ type: "turn.ended" }, "confirm");
    if (!ended) {
      return;
    }
    const rolled = await roll({ type: "roll.draw" });
    if (!rolled) {
      setRollResolutionPinned(false);
    }
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
        : snapshot.error
          ? "Save failed"
          : snapshot.lastSavedAt
            ? "Saved"
            : "Ready";
      const saveTone = snapshot.saving
        ? "info"
        : snapshot.error
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
            )}
            onRoll={() => {
              void roll({ type: "roll.draw" });
            }}
            onAlchemy={() => {
              setAlchemyOpen(true);
            }}
            onEditPlayer={(id) => {
              setSelectedPlayerId(asPlayerId(id));
            }}
            onNextRoll={() => {
              void rollNextTurn();
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
        onChange={updatePreferences}
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
            open={alchemyOpen && state.turn.phase === "awaiting-roll"}
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
          !rolling &&
          selectedPlayer === null &&
          state.lastRoll &&
          (rollResolutionPinned ||
            state.turn.phase === "resolving-barbarian-attack" ||
            state.turn.phase === "resolving-official-result" ||
            state.turn.phase === "resolving-thematic-event") ? (
            <RollResolutionDialog
              key={`${state.lastRoll.id}-${state.barbarian.pendingAttack?.id ?? "no-attack"}`}
              open
              view={toRollResolutionView(state)}
              busy={resolutionBusy || snapshot.saving}
              onCorrectAttackPlayer={(id) => {
                setSelectedPlayerId(asPlayerId(id));
              }}
              onContinue={(choices) => {
                void resolveRollResult(false, choices);
              }}
              onQuickRoll={(choices) => {
                void resolveRollResult(true, choices);
              }}
            />
          ) : null}

          {!snapshot.readOnly && selectedPlayer ? (
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
                    "confirm",
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
            open={metropolisCorrectionOpen && !snapshot.readOnly}
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
            open={historyOpen}
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
            open={winnerOpen && !snapshot.readOnly}
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
                "confirm",
              ).then((completed) => {
                if (completed) {
                  setWinnerOpen(false);
                  setScreen("complete");
                }
              });
            }}
          />
        </>
      ) : null}

      <PwaUpdate safeToUpdate={safeToUpdate} />
    </>
  );
}

function setupFromDraft(draft: SetupDraft): GameSetup {
  const ids = new Map(
    draft.players.map((player) => [
      player.draftId,
      asPlayerId(crypto.randomUUID()),
    ]),
  );
  const firstPlayerId = ids.get(draft.firstPlayerDraftId);
  if (!firstPlayerId) {
    throw new Error("First player is missing from setup.");
  }

  return {
    title: draft.title,
    mode: draft.twoPlayerHouseMode ? "two-player-house-rule" : "standard",
    players: draft.players.map((player) => {
      const id = ids.get(player.draftId);
      if (!id) {
        throw new Error("Player setup ID is missing.");
      }
      const colorLabel = colorNames[player.color] ?? player.color;
      return {
        id,
        name: player.name.trim(),
        color: {
          id: colorLabel.toLocaleLowerCase().replaceAll(/\s+/g, "-"),
          label: colorLabel,
          hex: player.color,
          distinguishabilityKey: player.color,
        },
      };
    }),
    firstPlayerId,
    victoryTarget: draft.victoryTarget,
    thematicCadence: draft.eventCadence,
    thematicEventsEnabled: true,
    thematicEventCatalog: BUILT_IN_THEMATIC_EVENTS.map((event) => ({
      ...event,
    })),
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

function toHomeSummary(game: StoredGame): HomeGameSummary {
  const player =
    game.players.find(
      (candidate) => candidate.id === game.currentTurn.playerId,
    ) ?? game.players[0];
  return {
    id: game.id,
    title: game.title,
    currentPlayerName: game.currentTurn.playerName,
    currentPlayerColor: player?.colorHex ?? "#286b9b",
    round: game.currentTurn.round,
    updatedAt: game.updatedAt,
    players: game.players.map((entry) => entry.name),
  };
}

function toSavedGameSummary(game: StoredGame): CompletedGameSummary {
  const winner = game.winnerId
    ? game.players.find((player) => player.id === game.winnerId)
    : undefined;
  const current =
    game.players.find((player) => player.id === game.currentTurn.playerId) ??
    game.players[0];
  return {
    id: game.id,
    title: game.title,
    status: game.lifecycle === "completed" ? "completed" : "archived",
    currentPlayerName: game.currentTurn.playerName,
    currentPlayerColor: current?.colorHex ?? "#286b9b",
    updatedAt: game.updatedAt,
    rounds: game.currentTurn.round,
    turns: Math.max(0, game.currentTurn.turnNumber - 1),
    playerNames: game.players.map((player) => player.name),
    ...(winner
      ? {
          winnerName: winner.name,
          winnerColor: winner.colorHex,
        }
      : {}),
  };
}

function toImportPreview(
  preview: ReturnType<typeof gameController.getSnapshot>["importPreview"],
): ImportPreview | null {
  if (!preview) {
    return null;
  }
  return {
    title: preview.title,
    players: preview.playerNames,
    turns: preview.completedTurns,
    updatedAt: preview.updatedAt,
    sourceVersion: preview.sourceApplicationVersion,
    status: "Validated backup",
  };
}

function toHistoryEntries(
  revisions: StoredRevision[],
  activeRevisionId: string | null,
): HistoryEntryView[] {
  return revisions.map((revision) => {
    const playerId = revision.summary.playerIds[0];
    const player = playerId
      ? revision.state.players.find((candidate) => candidate.id === playerId)
      : undefined;
    return {
      id: revision.id,
      sequence: revision.sequence,
      createdAt: revision.createdAt,
      playerName: player?.name ?? null,
      title: historyTitle(revision),
      detail: revision.summary.text,
      houseRule:
        revision.summary.kind === "roll-drawn" ||
        revision.summary.kind === "alchemy-used" ||
        revision.summary.kind === "thematic-event-acknowledged",
      active: revision.id === activeRevisionId,
    };
  });
}

function historyTitle(revision: StoredRevision): string {
  const titles: Record<StoredRevision["summary"]["kind"], string> = {
    "alchemy-used": "Alchemy roll",
    "attack-confirmed": "Barbarian attack",
    "game-completed": "Game completed",
    "game-created": "Game created",
    "metropolis-cancelled": "Metropolis cancelled",
    "metropolis-confirmed": "Metropolis confirmed",
    "metropolis-proposed": "Metropolis proposed",
    "player-adjusted": "Public state updated",
    "resolution-acknowledged": "Resolution acknowledged",
    "roll-drawn": "Balanced roll",
    "thematic-event-acknowledged": "House event",
    "turn-ended": "Turn ended",
  };
  return titles[revision.summary.kind];
}

function toMetropolisProposalView(
  state: NonNullable<
    ReturnType<typeof gameController.getSnapshot>["activeState"]
  >,
  proposal: NonNullable<
    NonNullable<
      ReturnType<typeof gameController.getSnapshot>["activeState"]
    >["metropolises"]["pendingProposal"]
  >,
): MetropolisProposalView {
  const next = proposal.to
    ? state.players.find((player) => player.id === proposal.to?.holderId)
    : null;
  const previous =
    proposal.from && proposal.from.holderId !== proposal.to?.holderId
      ? state.players.find((player) => player.id === proposal.from?.holderId)
      : null;
  return {
    discipline: proposal.discipline,
    nextHolder: next
      ? {
          id: next.id,
          name: next.name,
          color: next.color.hex,
        }
      : null,
    previousHolder: previous
      ? {
          id: previous.id,
          name: previous.name,
          color: previous.color.hex,
        }
      : null,
    status: proposal.to?.status ?? null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}
