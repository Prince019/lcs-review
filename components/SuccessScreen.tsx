"use client";

import { useState } from "react";
import type { Business } from "@/lib/businesses";
import { copyToClipboard } from "@/lib/clipboard";

export default function SuccessScreen({
  biz,
  text,
  copyFailed,
  onBack,
}: {
  biz: Business;
  text: string;
  copyFailed: boolean;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(!copyFailed);
  const [recopyFailed, setRecopyFailed] = useState(false);

  async function recopy() {
    const ok = await copyToClipboard(text);
    setCopied(ok);
    setRecopyFailed(!ok);
  }

  function openGoogle() {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: biz.slug, type: "outbound" }),
    }).catch(() => {});
    window.open(biz.google_review_url, "_blank", "noopener");
  }

  return (
    <div className="success-wrap">
      {/* Status */}
      <div className="success-hero">
        <div className="success-check" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="success-title">
          {copied ? "Review copied" : "Copy your review"}
        </h2>
        <p className="success-sub" role="status" aria-live="polite">
          {copied
            ? "Paste it into Google to finish."
            : "Tap Copy, then open Google to paste it."}
        </p>
      </div>

      {/* The review */}
      <section className="result-card" aria-label="Your review">
        <div className="result-head">
          <span className="result-title">Your review</span>
          <button
            type="button"
            onClick={recopy}
            className={`copy-pill${copied ? " is-done" : ""}`}
          >
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied
              </>
            ) : (
              "Copy"
            )}
          </button>
        </div>
        <p className="result-text">{text}</p>
        {recopyFailed && (
          <p className="review-error" role="alert">
            Couldn't copy. Press and hold the text above, then tap Copy.
          </p>
        )}
      </section>

      {/* How to post */}
      <section className="how-card" aria-label="How to post">
        <p className="result-title">How to post</p>
        <ol className="how-list">
          <li>
            <span className="how-num">1</span>
            <span>Tap the review box in Google</span>
          </li>
          <li>
            <span className="how-num">2</span>
            <span>
              Press and hold, then tap <b>Paste</b>
            </span>
          </li>
          <li>
            <span className="how-num">3</span>
            <span>
              Tap <b>Post</b>
            </span>
          </li>
        </ol>
      </section>

      <button type="button" onClick={onBack} className="reset-link">
        ← Edit my review
      </button>

      {/* Same sticky bar as the other screens */}
      <div className="action-bar">
        <button type="button" onClick={openGoogle} className="btn-primary">
          Open Google Reviews
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </button>
      </div>
    </div>
  );
}