import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../ui/components/Button";

interface PwaUpdateProps {
  safeToUpdate?: boolean;
}

export function PwaUpdate({ safeToUpdate = true }: PwaUpdateProps) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  });

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <aside className="pwa-toast" aria-live="polite">
      <p>
        {offlineReady
          ? "The companion is ready offline."
          : safeToUpdate
            ? "An update is ready."
            : "An update is ready and will wait until the current resolution is complete."}
      </p>
      <div className="button-row">
        {needRefresh ? (
          <Button
            size="small"
            disabled={!safeToUpdate}
            onClick={() => {
              void updateServiceWorker(true);
            }}
          >
            Update now
          </Button>
        ) : null}
        <Button
          size="small"
          variant="quiet"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          Dismiss
        </Button>
      </div>
    </aside>
  );
}
