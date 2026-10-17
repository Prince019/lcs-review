"use client";

import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/businesses";
import { copyToClipboard } from "@/lib/clipboard";
import SuccessScreen from "./SuccessScreen";

/* ── Config ─────────────────────────────────────────────── */
const POLISH_LIMIT = 3;
const NOTE_MIN_WORDS = 3; // only matters if the customer types instead of tapping
const NOTE_MAX_CHARS = 400;
const FINAL_MIN_CHARS = 15; // sanity floor for the final text only
const STORAGE_KEY = "lcs_polish_count";

// The customer taps; we turn taps into plain sentences for the AI.
// Every phrase is something the customer explicitly chose, so the
// "based only on your words" promise stays true.
const HIGHLIGHTS = [
  { id: "staff", label: "Friendly staff", phrase: "the staff were friendly and helpful" },
  { id: "fast", label: "Fast service", phrase: "the service was quick" },
  { id: "solved", label: "Problem solved", phrase: "they solved my problem properly" },
  { id: "price", label: "Fair pricing", phrase: "they were honest and the pricing was fair" },
  { id: "clear", label: "Explained clearly", phrase: "they explained everything clearly" },
  { id: "pro", label: "Professional", phrase: "the team and the place felt professional" },
  { id: "quality", label: "Quality work", phrase: "the quality of the work was excellent" },
  { id: "recommend", label: "Would recommend", phrase: "I would recommend them to others" },
] as const;

type View = "pick" | "draft" | "done";

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function composeRawText(selectedIds: string[], note: string) {
  const phrases = HIGHLIGHTS.filter((h) => selectedIds.includes(h.id)).map(
    (h) => h.phrase
  );
  const parts = ["I had a great experience here."];
  if (phrases.length) parts.push(`What stood out: ${joinList(phrases)}.`);
  if (note) parts.push(note);
  return parts.join(" ");
}

function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/* ── Component ──────────────────────────────────────────── */
export default function ReviewForm({ biz }: { biz: Business }) {
  const [view, setView] = useState<View>("pick");

  // Step 1 inputs
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // Step 2 state
  const [drafts, setDrafts] = useState<string[]>([]);
  const [draftIdx, setDraftIdx] = useState(0);
  const [draftSource, setDraftSource] = useState(""); // raw text the drafts came from
  const [draft, setDraft] = useState("");
  const [isAi, setIsAi] = useState(true);

  // Request state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [polishCount, setPolishCount] = useState(0);

  // Done state
  const [copyFailed, setCopyFailed] = useState(false);
  const [finalText, setFinalText] = useState("");

  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setPolishCount(Number(stored) || 0);
    } catch {
      // storage can be blocked (private mode) — the server limit still applies
    }
  }, []);

  const trimmedNote = note.trim();
  const noteIsUsable = countWords(trimmedNote) >= NOTE_MIN_WORDS;
  const canWrite = selected.length > 0 || noteIsUsable;
  const remaining = Math.max(0, POLISH_LIMIT - polishCount);
  const rawText = composeRawText(selected, trimmedNote);

  /* ── Helpers ── */
  function toggle(id: string) {
    setError("");
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function logEvent(type: string) {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: biz.slug, type }),
    }).catch(() => {});
  }

  function bumpPolishCount() {
    setPolishCount((c) => {
      const next = c + 1;
      try {
        sessionStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }

  async function fetchDrafts(): Promise<string[] | null> {
    try {
      const res = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: biz.slug, rawText, rating: 5 }),
      });
      const data = await res.json().catch(() => ({}));
      const list: string[] = Array.isArray(data?.drafts)
        ? data.drafts.filter((d: unknown) => typeof d === "string" && d.trim())
        : [];

      if (!res.ok || list.length === 0) {
        const code = data?.error;
        setError(
          code === "rate_limited"
            ? "You've reached the limit for now. You can still use your own words below."
            : "Couldn't write that just now. Try again, or use your own words."
        );
        return null;
      }
      bumpPolishCount();
      return list;
    } catch {
      setError("No connection. Check your internet and try again.");
      return null;
    }
  }

  function showDraft(list: string[], idx: number, source: string) {
    setDrafts(list);
    setDraftIdx(idx);
    setDraftSource(source);
    setDraft(list[idx]);
    setIsAi(true);
    setView("draft");
  }

  /* ── Actions ── */
  async function handleWrite() {
    if (!canWrite || loading) return;
    setError("");

    // Same inputs as last time → reuse drafts, don't burn a try.
    if (drafts.length > 0 && draftSource === rawText) {
      showDraft(drafts, draftIdx, rawText);
      return;
    }

    if (remaining === 0) {
      setError(
        noteIsUsable
          ? "Automatic writing is unavailable right now. You can use your own words instead."
          : "Automatic writing is unavailable right now. Type a few words and use them as your review."
      );
      return;
    }

    setLoading(true);
    const list = await fetchDrafts();
    setLoading(false);
    if (list) showDraft(list, 0, rawText);
  }

  async function handleAnother() {
    if (loading) return;
    setError("");

    // Several drafts came back → cycle through them for free.
    if (drafts.length > 1 && isAi) {
      const next = (draftIdx + 1) % drafts.length;
      setDraftIdx(next);
      setDraft(drafts[next]);
      return;
    }

    if (remaining === 0) return;
    setLoading(true);
    const list = await fetchDrafts();
    setLoading(false);
    if (list) showDraft(list, 0, rawText);
  }

  function useOwnWords() {
    setError("");
    setDraft(trimmedNote);
    setIsAi(false);
    setView("draft");
  }

  function handleCopyAndOpen() {
    const text = draft.trim();
    if (text.length < FINAL_MIN_CHARS) return;

    // Both must start inside the tap, or mobile browsers block the new tab.
    const copying = copyToClipboard(text);
    window.open(biz.google_review_url, "_blank", "noopener");

    logEvent("copy");
    logEvent("outbound");

    copying.then((ok) => {
      setCopyFailed(!ok);
      setFinalText(text);
      setView("done");
    });
  }

  /* ── Views ── */
  if (view === "done") {
    return (
      <SuccessScreen
        biz={biz}
        text={finalText}
        copyFailed={copyFailed}
        onBack={() => setView("draft")}
      />
    );
  }

  if (view === "draft") {
    const canAnother = isAi && (drafts.length > 1 || remaining > 0);
    const another =
      drafts.length > 1
        ? "Show another version"
        : remaining === 1
        ? "Write another version (last one)"
        : "Write another version";

    return (
      <div className="review-form-wrap">
        <div className="review-card suggestion-card">
          <div className="suggestion-header">
            <h2 className="review-label" style={{ margin: 0 }}>
              Your review
            </h2>
            <span className="suggestion-badge">
              {isAi ? "Written from your picks" : "Your own words"}
            </span>
          </div>

          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="review-textarea draft-textarea"
            aria-label="Your review. You can edit it."
            maxLength={800}
            rows={6}
          />
          <p className="review-hint">
            Change anything you like. It's your review.
          </p>

          <div className="suggestion-actions">
            {canAnother && (
              <button
                type="button"
                onClick={handleAnother}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? "Writing…" : another}
              </button>
            )}
          </div>

          {error && (
            <p className="review-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setError("");
              setView("pick");
            }}
            className="reset-link"
          >
            ← Change my answers
          </button>
        </div>

        <p className="review-footnote">
          We copy the text and open Google. You paste and post it yourself,
          nothing is submitted for you.
        </p>

        <div className="action-bar">
          <button
            type="button"
            onClick={handleCopyAndOpen}
            disabled={draft.trim().length < FINAL_MIN_CHARS}
            className="btn-primary"
          >
            Copy &amp; open Google
          </button>
        </div>
      </div>
    );
  }

  // view === "pick"
  return (
    <div className="review-form-wrap">
      <div className="review-card">
        <h2 className="review-label">What stood out? Tap any that fit.</h2>

        <div className="chips" role="group" aria-label="What stood out">
          {HIGHLIGHTS.map((h) => {
            const on = selected.includes(h.id);
            return (
              <button
                key={h.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => toggle(h.id)}
              >
                {on && (
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {h.label}
              </button>
            );
          })}
        </div>

        <label htmlFor="note" className="review-sublabel">
          Anything to add? <span>(optional)</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError("");
          }}
          placeholder="e.g. They fixed my laptop the same day."
          className="review-textarea note-textarea"
          maxLength={NOTE_MAX_CHARS}
          rows={3}
        />
        {note.length > NOTE_MAX_CHARS - 60 && (
          <p className="review-meta">
            {NOTE_MAX_CHARS - note.length} characters left
          </p>
        )}

        {error && (
          <p className="review-error" role="alert">
            {error}
          </p>
        )}

        {noteIsUsable && (
          <button type="button" onClick={useOwnWords} className="reset-link">
            Skip the writing help and use my own words
          </button>
        )}
      </div>

      <div className="action-bar">
        <button
          type="button"
          onClick={handleWrite}
          disabled={!canWrite || loading}
          className="btn-primary"
        >
          {loading ? "Writing your review…" : "Write my review"}
        </button>
        {!canWrite && (
          <p className="action-hint">Tap one option above to continue.</p>
        )}
      </div>

      {/* Only surfaces when it matters */}
      {remaining === 0 && (
        <p className="review-footnote">
          Automatic writing is paused for now. Your own words work just as
          well.
        </p>
      )}
    </div>
  );
}