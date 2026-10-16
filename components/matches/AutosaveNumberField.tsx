"use client";

import { useEffect, useRef, useState } from "react";

export type NumberFieldBaseline = { value: number; revision: string | null; requestId: string };

type Props = {
  label: string;
  value: number;
  revision?: string | null;
  maximum?: number;
  disabled?: boolean;
  className?: string;
  onCommit: (value: number, baseline: NumberFieldBaseline) => Promise<void>;
  onDraftChange?: (key: string, dirty: boolean) => void;
};

// Only direct input creates a draft. Valid changes save on blur; incoming data never saves.
export function AutosaveNumberField({ label, value, revision = null, maximum = 2147483647, disabled, className, onCommit, onDraftChange }: Props) {
  const [draft, setDraft] = useState<{ text: string; baseline: NumberFieldBaseline } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const skipNextBlur = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const hasDraft = draft !== null;

  useEffect(() => {
    if (!hasDraft) return;
    onDraftChange?.(label, true);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => {
      onDraftChange?.(label, false);
      window.removeEventListener("beforeunload", warn);
    };
  }, [hasDraft, label, onDraftChange]);

  function cancel() {
    if (inFlight.current) return;
    setDraft(null);
    setError(null);
    setConflict(false);
    setSaved(false);
  }

  async function commit() {
    if (!draft || disabled || inFlight.current || conflict) return;
    // Clearing is a transient editing state, never a request to write zero.
    if (draft.text === "") { cancel(); return; }
    if (!/^\d+$/.test(draft.text) || !Number.isSafeInteger(Number(draft.text)) || Number(draft.text) > maximum) {
      setError(`Zadejte celé číslo od 0 do ${maximum}.`);
      return;
    }
    // Retyping the original value must not overwrite a newer value from realtime.
    if (Number(draft.text) === draft.baseline.value) { cancel(); return; }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onCommit(Number(draft.text), draft.baseline);
      setDraft(null);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Změna se neuložila. Zkuste uložení znovu.");
      setConflict(cause instanceof Error && cause.name === "MatchSheetConflict");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-1 align-top">
      <input
        ref={input}
        aria-label={label}
        aria-invalid={Boolean(error)}
        title={saving ? "Ukládám…" : draft ? "Rozpracováno — uloží se při opuštění pole" : saved ? "Uloženo" : undefined}
        className={`${className ?? "h-8 w-8 rounded-md border border-[var(--admin-border)] bg-white px-0.5 text-center text-xs outline-none focus:border-[var(--brand-blue)]"} ${draft ? "ring-2 ring-amber-400" : ""}`}
        disabled={disabled || saving}
        inputMode="numeric"
        pattern="[0-9]*"
        type="text"
        value={draft?.text ?? value}
        onFocus={(event) => { skipNextBlur.current = false; event.currentTarget.select(); }}
        onBlur={() => {
          if (skipNextBlur.current) { skipNextBlur.current = false; return; }
          if (!error) void commit();
        }}
        onChange={(event) => {
          const text = event.target.value;
          const requestId = crypto.randomUUID();
          setSaved(false);
          setError(null);
          setConflict(false);
          setDraft((current) => ({
            text,
            baseline: current && !conflict ? { ...current.baseline, requestId } : { value, revision, requestId },
          }));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); void commit(); }
          if (event.key === "Escape") { event.preventDefault(); skipNextBlur.current = true; cancel(); input.current?.blur(); }
        }}
      />
      <span role="status" className="sr-only">{saving ? "Ukládám" : draft ? "Neuložená změna" : saved ? "Uloženo" : ""}</span>
      {saving ? <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-blue-500" /> : null}
      {error ? (
        <div role="alert" className="absolute top-full z-20 mt-1 w-52 rounded border border-red-200 bg-white p-2 text-left text-xs text-red-800 shadow">
          {error}{conflict ? ` Aktuálně uloženo: ${value}. Zadejte opravu znovu, nebo použijte uloženou hodnotu.` : ""}
          <div className="mt-2 flex flex-wrap gap-2">
            {!conflict ? <button type="button" disabled={disabled || saving} onClick={() => void commit()} className="rounded bg-blue-50 px-2 py-1 font-semibold">Zkusit znovu</button> : null}
            <button type="button" disabled={saving} onClick={cancel} className="rounded bg-slate-100 px-2 py-1 font-semibold">Použít uloženou hodnotu</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
