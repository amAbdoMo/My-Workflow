import { useLayoutEffect, useRef } from "react";

export default function ProjectDeleteDialog({ project, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    cancelButtonRef.current.focus();
    return () => dialog.close();
  }, []);

  function dismiss(action) {
    dialogRef.current.close();
    action();
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal unsaved-modal project-delete-modal"
      aria-labelledby="delete-project-title"
      aria-describedby="delete-project-description"
      onCancel={(event) => {
        event.preventDefault();
        dismiss(onCancel);
      }}
    >
      <div className="modal-header">
        <div>
          <p className="card-kicker">Project deletion</p>
          <h2 id="delete-project-title">Delete project?</h2>
        </div>
        <button className="icon-action" type="button" aria-label="Cancel project deletion" onClick={() => dismiss(onCancel)}>
          X
        </button>
      </div>
      <div className="unsaved-modal-body">
        <div className="unsaved-icon" aria-hidden="true">!</div>
        <div className="unsaved-copy" id="delete-project-description">
          <p>Delete <strong className="delete-project-name">{project.name}</strong> and its notes and payment records?</p>
          <p className="muted">This cannot be undone.</p>
        </div>
      </div>
      <div className="modal-actions">
        <button ref={cancelButtonRef} type="button" onClick={() => dismiss(onCancel)}>Cancel</button>
        <button className="delete-project-confirm" type="button" onClick={() => dismiss(onConfirm)}>Delete project</button>
      </div>
    </dialog>
  );
}
