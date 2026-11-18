import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface FolderTitleProps {
  /** Real relative folder path; "" is the library root, which is not renameable. */
  path: string;
  /** What the folder is called on screen (alias when set). */
  label: string;
  /** Last real path segment; shown as a hint when an alias is active. */
  realName: string;
  onRename: (name: string) => Promise<unknown>;
  onReset: () => Promise<unknown>;
  /** A save/reset is in flight; input and buttons are disabled. */
  busy: boolean;
}

/**
 * The folder page heading, editable in place. Renaming only changes the display
 * label — `path` is never touched. Local state is the edit flag, the draft text
 * and the in-flight flag; the actual write is the page's mutation.
 */
export function FolderTitle({ path, label, realName, onRename, onReset, busy }: FolderTitleProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const aliased = label !== realName;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    setDraft(label);
    setEditing(true);
  };

  const stopEditing = () => {
    setEditing(false);
    setSaving(false);
  };

  const commit = async () => {
    if (saving) return;
    const name = draft.trim();
    if (name === "" || name === label) {
      stopEditing();
      return;
    }
    setSaving(true);
    try {
      await onRename(name);
      stopEditing();
    } catch {
      // The page shows the error toast; keep the draft so the typed name isn't lost.
      setSaving(false);
    }
  };

  const reset = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onReset();
      stopEditing();
    } catch {
      setSaving(false);
    }
  };

  const disabled = busy || saving;

  return (
    <div className="flex-1 min-w-0">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void commit();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                stopEditing();
              }
            }}
            onBlur={() => void commit()}
            disabled={disabled}
            maxLength={120}
            aria-label="Folder display name"
            className="w-full bg-transparent border-b border-gold/60 font-display font-bold text-[26px] md:text-[30px] tracking-tight outline-none"
          />
        </form>
      ) : (
        <div className="flex items-center gap-2 min-w-0 group">
          <h1 className="font-display font-bold text-[26px] md:text-[30px] tracking-tight truncate">
            {label}
          </h1>
          {path !== "" && (
            <button
              type="button"
              onClick={startEditing}
              aria-label="Rename folder"
              title="Rename folder"
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-dim/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg transition-opacity"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
      {aliased && (
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          <span className="font-mono text-[11px] text-dim/40 truncate">Real folder: {path}</span>
          {editing && (
            <button
              type="button"
              aria-label="Use real folder name"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void reset()}
              disabled={disabled}
              className="shrink-0 font-mono text-[11px] text-dim/50 hover:text-gold transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
