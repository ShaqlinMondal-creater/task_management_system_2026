import type { ReactNode, RefObject } from "react";

export function Button({
  children,
  kind = "primary",
  small,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  kind?: "primary" | "ghost" | "danger";
  small?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type={type} className={`btn ${kind}${small ? " small" : ""}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  label: string;
}) {
  return <input className="control" type={type} value={value} placeholder={placeholder} aria-label={label} onChange={(event) => onChange(event.target.value)} />;
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select className="control" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
      {options.map((item) => (
        <option key={item.value} value={item.value}>{item.label}</option>
      ))}
    </select>
  );
}

export function MultiSelect({
  values,
  onChange,
  options,
  label,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <div className="checks" role="group" aria-label={label}>
      {options.map((item) => {
        const on = values.includes(item.value);
        return (
          <label key={item.value} className="check">
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? values.filter((id) => id !== item.value) : [...values, item.value])}
            />
            {item.label}
          </label>
        );
      })}
    </div>
  );
}

export function DatePicker({ value, onChange, label, required, disabled }: { value: string; onChange: (value: string) => void; label: string; required?: boolean; disabled?: boolean }) {
  return <input className="control" type="date" value={value} aria-label={label} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
        {children}
      </aside>
    </div>
  );
}

export function Dropdown({
  label,
  children,
  className = "filemenu",
  summaryClass,
  menuClass,
  open,
  onToggle,
  rootRef,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClass?: string;
  menuClass?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  rootRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <details ref={rootRef as RefObject<HTMLDetailsElement>} className={className} open={open} onToggle={(event) => onToggle?.((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className={summaryClass}>{label}</summary>
      <div className={menuClass ? `menu ${menuClass}` : "menu"}>{children}</div>
    </details>
  );
}

export function Tabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={item.value === value} className={item.value === value ? "on" : undefined} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tip">
      {children}
      <span className="tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" className="btn ghost small" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
      <span>{page + 1} / {pages}</span>
      <button type="button" className="btn ghost small" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="ledger-wrap">
      <table className="ledger">
        <thead>
          <tr>{head.map((item, index) => <th key={index}>{item}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="panel">{children}</section>;
}
