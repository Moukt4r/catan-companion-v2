import type { DevicePreferences } from "../../../application/devicePreferences";
import type { StorageStatus } from "../../../application/storage";
import { Button, Dialog, StatusBanner } from "../../components";

interface SettingsDialogProps {
  open: boolean;
  preferences: DevicePreferences;
  storageStatus: StorageStatus | null;
  appVersion: string;
  schemaVersion: number;
  onChange: (patch: Partial<DevicePreferences>) => void;
  onRequestPersistentStorage: () => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
  onClose: () => void;
}

function formatBytes(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsDialog({
  appVersion,
  onChange,
  onClose,
  onCopyDiagnostics,
  onRequestPersistentStorage,
  open,
  preferences,
  schemaVersion,
  storageStatus,
}: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      title="Device settings"
      description="These preferences apply to this browser, not to one saved game."
      onClose={onClose}
    >
      <div className="form-stack">
        <label className="field">
          <span>Theme</span>
          <select
            value={preferences.theme}
            onChange={(event) => {
              onChange({
                theme: event.target.value as DevicePreferences["theme"],
              });
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
              onChange({
                motion: event.target.value as DevicePreferences["motion"],
              });
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
              onChange({
                soundEnabled: event.target.checked,
              });
            }}
          />
          <span>
            <strong>Sound cues</strong>
            <small>
              Short synthesized sounds; every cue also has a visual equivalent.
            </small>
          </span>
        </label>

        <label className="check-field">
          <input
            type="checkbox"
            checked={preferences.keepAwake}
            onChange={(event) => {
              onChange({
                keepAwake: event.target.checked,
              });
            }}
          />
          <span>
            <strong>Keep screen awake during a game</strong>
            <small>Used only when the browser supports wake lock.</small>
          </span>
        </label>

        <section className="settings-section" aria-labelledby="storage-heading">
          <h3 id="storage-heading">Local storage</h3>
          {storageStatus ? (
            <>
              <dl className="definition-grid">
                <div>
                  <dt>Protected from automatic cleanup</dt>
                  <dd>{storageStatus.persisted ? "Yes" : "Not yet"}</dd>
                </div>
                <div>
                  <dt>Used</dt>
                  <dd>{formatBytes(storageStatus.usage)}</dd>
                </div>
                <div>
                  <dt>Available quota</dt>
                  <dd>{formatBytes(storageStatus.quota)}</dd>
                </div>
              </dl>
              {!storageStatus.persisted ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void onRequestPersistentStorage();
                  }}
                >
                  Protect saved games
                </Button>
              ) : null}
            </>
          ) : (
            <StatusBanner>
              Storage details will appear after the app finishes loading.
            </StatusBanner>
          )}
        </section>

        <section className="settings-section" aria-labelledby="about-heading">
          <h3 id="about-heading">About</h3>
          <dl className="definition-grid">
            <div>
              <dt>Application version</dt>
              <dd>{appVersion}</dd>
            </div>
            <div>
              <dt>Game schema</dt>
              <dd>{schemaVersion}</dd>
            </div>
          </dl>
          <p className="fine-print">
            Unofficial companion. CATAN and Cities &amp; Knights are trademarks
            of their respective owners. This app uses original presentation and
            house-rule balanced dice.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void onCopyDiagnostics();
            }}
          >
            Copy sanitized diagnostics
          </Button>
        </section>
      </div>
    </Dialog>
  );
}
