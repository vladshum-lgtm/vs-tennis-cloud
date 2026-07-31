// lib/sheetLog.js — append each conversation turn to a Google Sheet via a Google
// Apps Script web app. No OAuth or service account needed — just a POST to the
// deployment URL (SHEETS_LOG_URL). Fire-and-forget and non-fatal: logging must never
// break or slow a chat reply.

export function logRow(row) {
  const url = process.env.SHEETS_LOG_URL;
  if (!url) return;
  // Fire-and-forget: don't await, don't let a failure surface.
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: row }),
  }).catch((err) => console.error("sheet log failed:", err.message));
}
