import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  preventClose?: boolean;
}

export function Dialog({
  children,
  closeLabel = "Close",
  description,
  onClose,
  open,
  preventClose = false,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        if (preventClose) {
          event.preventDefault();
          return;
        }
        onClose();
      }}
      onClose={() => {
        if (open && !preventClose) {
          onClose();
        }
      }}
    >
      <div className="dialog__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        {!preventClose ? (
          <Button
            variant="quiet"
            size="small"
            aria-label={closeLabel}
            onClick={onClose}
          >
            Close
          </Button>
        ) : null}
      </div>
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}
