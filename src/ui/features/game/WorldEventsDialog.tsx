import { Dialog } from "../../components";
import {
  WorldEventGuideList,
  type WorldEventGuideView,
} from "./worldEventGuide";

export type {
  WorldEventGuideEntry,
  WorldEventGuideView,
} from "./worldEventGuide";

interface WorldEventsDialogProps {
  open: boolean;
  view: WorldEventGuideView;
  onClose: () => void;
}

export function WorldEventsDialog({
  onClose,
  open,
  view,
}: WorldEventsDialogProps) {
  return (
    <Dialog
      open={open}
      title="World Events"
      description="Every event that can still come up in this game, and what it does."
      onClose={onClose}
    >
      {!view.enabled ? (
        <p>World Events are switched off for this game.</p>
      ) : (
        <>
          <dl className="event-guide-summary">
            <div>
              <dt>In this game</dt>
              <dd>{view.totalCount} events</dd>
            </div>
            {view.deck ? (
              <>
                <div>
                  <dt>Seen this year</dt>
                  <dd>
                    {view.deck.drawnCount} of {view.totalCount}
                  </dd>
                </div>
                <div>
                  <dt>Chance per turn</dt>
                  <dd>{view.deck.percent}%</dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className="fine-print">
            The deck draws each event once before reshuffling, so anything not
            yet seen this year is still to come.
          </p>
          <WorldEventGuideList view={view} />
        </>
      )}
    </Dialog>
  );
}
