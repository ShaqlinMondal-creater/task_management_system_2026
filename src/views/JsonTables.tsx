import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiEnabled,
  fetchTableDetail,
  fetchTables,
  importTableFiles,
  readJsonFileList,
  updateTableCell,
  type TableDetail,
  type TableInfo,
} from "../api";
import { Tabs } from "../components/System";
import { useStore } from "../store";
import { useToast } from "../toast";
import type { FileName } from "../types";

const DESK_FILES = new Set<FileName>(["users", "projects", "tasks", "assignments", "checkpoints"]);

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function EditableCell({
  value,
  busy,
  onSave,
}: {
  value: unknown;
  busy: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const text = cellText(value);
  const multiline = text.includes("\n") || text.length > 48 || (typeof value === "object" && value !== null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    if (draft === text) {
      setEditing(false);
      return;
    }
    await onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="json-cell"
        disabled={busy}
        title="Click to edit"
        onClick={() => {
          setDraft(text);
          setEditing(true);
        }}
      >
        {text || <span className="muted">empty</span>}
      </button>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={(node) => {
          inputRef.current = node;
        }}
        className="control json-cell-input"
        rows={Math.min(8, Math.max(3, draft.split("\n").length + 1))}
        value={draft}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void commit();
          }
        }}
      />
    );
  }

  return (
    <input
      ref={(node) => {
        inputRef.current = node;
      }}
      className="control json-cell-input"
      value={draft}
      disabled={busy}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setEditing(false);
        }
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
      }}
    />
  );
}

export function JsonTables() {
  const store = useStore();
  const push = useToast();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [active, setActive] = useState("");
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiEnabled()) {
      setLoading(false);
      setError("Set VITE_API_URL to browse API tables.");
      return;
    }
    setLoading(true);
    void fetchTables()
      .then((list) => {
        setTables(list);
        setActive((prev) => prev || list[0]?.name || "");
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not list tables."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!active || !apiEnabled()) {
      setDetail(null);
      return;
    }
    setBusy(true);
    void fetchTableDetail(active)
      .then((next) => {
        setDetail(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : `Could not load ${active}.`))
      .finally(() => setBusy(false));
  }, [active]);

  const options = useMemo(
    () => tables.map((table) => ({ value: table.name, label: `${table.name}.json` })),
    [tables],
  );

  const reloadTables = async (prefer?: string) => {
    const list = await fetchTables();
    setTables(list);
    const next = prefer && list.some((item) => item.name === prefer) ? prefer : list[0]?.name || "";
    setActive(next);
  };

  if (loading) return <p className="muted">Loading tables…</p>;

  return (
    <div className="stack json-tables">
      <header className="panel-head">
        <h2>Tables</h2>
        <span>Live data/*.json · click a cell to edit · Enter to save</span>
      </header>
      <div className="filters">
        <label>
          Import JSON
          <input
            className="control"
            type="file"
            accept=".json,application/json"
            multiple
            disabled={busy}
            onChange={(event) => {
              const list = event.target.files;
              if (!list?.length) return;
              setBusy(true);
              void readJsonFileList(list)
                .then((files) => importTableFiles(files))
                .then(async (result) => {
                  await reloadTables(result.written[0]);
                  const desk = result.written.filter((name): name is FileName => DESK_FILES.has(name as FileName));
                  if (desk.length) await store.refreshCollection(...desk);
                  push(`Imported ${result.written.map((name) => `${name}.json`).join(", ")}`);
                  setError(null);
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "Import failed."))
                .finally(() => {
                  setBusy(false);
                  event.target.value = "";
                });
            }}
          />
        </label>
      </div>
      {!tables.length && <p className="muted">No JSON files found yet. Import your desk JSON files above.</p>}
      {!!options.length && <Tabs value={active} onChange={setActive} options={options} />}
      {error && <p className="form-error">{error}</p>}
      {detail && (
        <div className="ledger-wrap json-table-wrap">
          <table className="ledger json-ledger">
            <thead>
              <tr>
                {detail.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.rows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(detail.columns.length, 1)} className="muted">No rows</td>
                </tr>
              )}
              {detail.rows.map((row) => {
                const rowId = String(row.id ?? "");
                return (
                  <tr key={rowId}>
                    {detail.columns.map((column) => (
                      <td key={`${rowId}-${column}`}>
                        <EditableCell
                          value={row[column]}
                          busy={busy}
                          onSave={async (next) => {
                            setBusy(true);
                            try {
                              const updated = await updateTableCell(detail.name, {
                                rowId,
                                column,
                                value: next,
                              });
                              setDetail(updated);
                              setTables((prev) =>
                                prev.map((item) =>
                                  item.name === updated.name
                                    ? { ...item, rows: updated.rows.length, shape: updated.shape }
                                    : item,
                                ),
                              );
                              if (DESK_FILES.has(updated.name as FileName)) {
                                await store.refreshCollection(updated.name as FileName);
                              }
                              push(`Saved ${updated.name}.${column}`);
                              setError(null);
                            } catch (err: unknown) {
                              setError(err instanceof Error ? err.message : "Could not save cell.");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
