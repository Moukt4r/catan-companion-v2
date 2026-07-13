import { Button, Dialog } from "../../components";

interface ThematicEventDialogProps {
  open: boolean;
  title: string;
  instruction: string;
  category: string;
  onAcknowledge: () => void;
}

export function ThematicEventDialog({
  category,
  instruction,
  onAcknowledge,
  open,
  title,
}: ThematicEventDialogProps) {
  return (
    <Dialog
      open={open}
      preventClose
      title={title}
      description={`${category} table event`}
      onClose={() => undefined}
    >
      <article className="thematic-event">
        <span className="rule-label rule-label--house">House event</span>
        <p>{instruction}</p>
        <Button size="large" block onClick={onAcknowledge}>
          Event completed
        </Button>
      </article>
    </Dialog>
  );
}
