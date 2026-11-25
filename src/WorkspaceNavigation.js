import { useEffect, useRef } from "react";

const SECTIONS = [
  ["schedule", "Schedule", "schedule"],
  ["snippets", "Snippets", "code"],
  ["email", "Email Migration", "mail"],
  ["todos", "To-Do", "checklist"],
];

const ICON_PATHS = {
  schedule: "M7 2v4m10-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 11 2 2 5-5",
  code: "M8 7l-5 5 5 5m8-10 5 5-5 5m-2-13-4 16",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  checklist: "M3 7l2 2 4-4m-6 11 2 2 4-4m3-7h9m-9 9h9",
  clients: "M3 21v-2a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v2m2-7a5 5 0 0 1 3 5v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-8a4 4 0 0 1 0 8",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-2-7h4l1 3 2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2v-2L2 9l2-4 3 1 2-1z",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  chevron: "M9 5l7 7-7 7",
  edit: "M4 20l5-1L21 7l-4-4L5 15zm11-15 4 4",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  warning: "M12 3L2 21h20zm0 7v4m0 3h.1",
  moon: "M20 16A9 9 0 0 1 8 4a9 9 0 1 0 12 12z",
  bell: "M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9m-9 12a3 3 0 0 0 6 0",
  more: "M4.5 12h1m6 0h1m6 0h1",
};

export function WorkspaceIcon({ name }) {
  return (
    <svg className="workspace-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function WorkspaceNavigation({ activeTab, onSelect }) {
  return (
    <nav className="app-tabs workspace-nav" aria-label="Main sections">
      <span className="workspace-nav-label">Workspace</span>
      {SECTIONS.map(([tab, label, icon]) => (
        <button key={tab} type="button" className={`tab-button${activeTab === tab ? " tab-button-active" : ""}`} aria-current={activeTab === tab ? "page" : undefined} onClick={() => onSelect(tab)}>
          <WorkspaceIcon name={icon} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function WorkspaceHeading({ title, description, children }) {
  return (
    <header className="workspace-heading">
      <div><h2>{title}</h2><p className="muted">{description}</p></div>
      {children}
    </header>
  );
}

export function WorkspaceBreadcrumb({ activeTab }) {
  const label = SECTIONS.find(([tab]) => tab === activeTab)?.[1] ?? "Settings";
  return (
    <div className="workspace-breadcrumb">
      <span>Workspace</span><WorkspaceIcon name="chevron" /><strong>{label}</strong>
    </div>
  );
}

export function WorkspaceActions({ label, className = "", children }) {
  return (
    <details
      className={`workspace-actions ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.firstElementChild.focus();
      }}
    >
      <summary aria-label={label} title={label}><WorkspaceIcon name="more" /></summary>
      <div className="workspace-actions-list" onClick={(event) => {
        if (!event.target.closest("button")) return;
        const disclosure = event.currentTarget.parentElement;
        disclosure.firstElementChild.focus();
        disclosure.open = false;
      }}>
        {children}
      </div>
    </details>
  );
}

function visibleTabStops(panel) {
  return Array.from(panel.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex="0"]'))
    .filter((element) => !element.disabled && element.getClientRects().length > 0);
}

function keepDialogFocus(event, onDismiss) {
  if (event.key === "Escape" && !event.defaultPrevented) {
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  }
  if (event.key !== "Tab") return;
  const stops = visibleTabStops(event.currentTarget);
  const leaving = event.shiftKey ? stops[0] : stops.at(-1);
  if (document.activeElement !== leaving) return;
  event.preventDefault();
  (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
}

export function WorkspaceDialog({ onDismiss, children, ...props }) {
  const panel = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    panel.current.querySelector(".modal-header button")?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return (
    <section {...props} ref={panel} role="dialog" aria-modal="true" onKeyDown={(event) => keepDialogFocus(event, onDismiss)}>
      {children}
    </section>
  );
}
