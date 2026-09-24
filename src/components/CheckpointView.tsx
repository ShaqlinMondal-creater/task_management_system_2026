import { formatWhen } from "../lib";
import type { Checkpoint } from "../types";
import { Modal } from "./Modal";

const STATE_LABEL = { done: "Done", partial: "Partial", open: "Not started" };

export function CheckpointView({
  item,
  holder,
  onClose,
  onEdit,
}: {
  item: Checkpoint;
  holder?: string;
  onClose: () => void;
  onEdit?: () => void;
}) {
  return (
    <Modal title={item.label} onClose={onClose}>
      <div className="stack detail-sheet">
        <p className="muted">
          {item.phase} · {item.group}
          {holder ? ` · ${holder}` : ""}
        </p>
        <p>{item.details?.trim() ? item.details : "No details yet."}</p>
        {item.link ? (
          <a href={item.link} target="_blank" rel="noreferrer">
            {item.link}
          </a>
        ) : (
          <p className="muted">No reference link.</p>
        )}
        {item.photo ? <img className="detail-photo" src={item.photo} alt="" /> : <p className="muted">No photo.</p>}
        <p className="muted">
          {STATE_LABEL[item.state]}
          {item.doneAt ? ` · ${formatWhen(item.doneAt)}` : ""}
        </p>
        {onEdit && (
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={onEdit}>
              Edit checkpoint
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
