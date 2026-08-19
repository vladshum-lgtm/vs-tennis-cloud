// server.js — the web channel. Runs on Render. Exposes POST /chat for the website
// widget. Imports the shared brain. The Mac iMessage relay will hit this SAME endpoint,
// so the brain logic lives in exactly one place.

import "dotenv/config";
import crypto from "crypto";
import express from "express";
import cors from "cors";
import { generateReply } from "./brain.js";
import { getAvailability, formatAvailability } from "./lib/wixBookings.js";
import { upsertLead, findContactId, removeTags, addNote } from "./lib/ghl.js";
import { logRow } from "./lib/sheetLog.js";
import { SERVICE_IDS } from "./config.js";

const app = express();
app.use(express.json());

const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : true }));

const sessions = new Map();
const MAX_HISTORY = 10;

function getHistory(id) {
  return sessions.get(id) || [];
}
function pushHistory(id, role, text) {
  const h = getHistory(id);
  h.push({ role, text });
  sessions.set(id, h.slice(-MAX_HISTORY));
}

function looksLikeScheduling(msg) {
  return /\b(book|schedule|available|slot|time|when|sign up|register|trial|class|lesson)\b/i.test(
    msg || ""
  );
}

function floridaNow() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return {
    dayOfWeek: get("weekday"),
    now: `${get("month")} ${get("day")}, ${get("year")} ${get("hour")}:${get("minute")}`,
  };
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/chat", async (req, res) => {
  const { sessionId, message } = req.body || {};
  if (!sessionId || typeof message !== "string") {
    return res.status(400).json({ error: "sessionId and message are required" });
  }

  const { dayOfWeek, now } = floridaNow();

  let availabilityText = "";
  if (looksLikeScheduling(message)) {
    try {
      const from = new Date().toISOString().slice(0, 19);
      const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 19);
      const slots = await getAvailability(SERVICE_IDS.redBallStPete, from, to);
      availabilityText = formatAvailability(slots);
    } catch (err) {
      availabilityText = "";
      console.error("availability fetch failed:", err.message);
    }
  }

  let result;
  try {
    result = await generateReply(getHistory(sessionId), message, {
      dayOfWeek,
      now,
      availabilityText,
    });
  } catch (err) {
    console.error("generateReply failed:", err);
    return res.status(500).json({ reply: "Sorry, something went wrong. Vlad will follow up." });
  }

  pushHistory(sessionId, "user", message);
  if (result.reply) pushHistory(sessionId, "assistant", result.reply);

  if (result.escalate) {
    console.log("ESCALATE:", JSON.stringify(result.escalate));
  }
  if (result.coach_confirmation) {
    console.log("COACH_CONFIRMATION:", JSON.stringify(result.coach_confirmation));
  }
  if (result.lead_capture) {
    console.log("LEAD_CAPTURE:", JSON.stringify(result.lead_capture));
    try {
      const r = await upsertLead(result.lead_capture);
      console.log("GHL upsert:", JSON.stringify(r));
    } catch (err) {
      console.error("GHL upsert failed:", err.message);
    }
  }

  const reply =
    result.reply ||
    (result.escalate ? "Let me check on that and Vlad will follow up shortly." : "");

  logRow([
    new Date().toISOString(),
    sessionId,
    "web",
    message,
    reply,
    result.intent || "",
    result.language || "",
    result.escalate ? result.escalate.reason : "",
    result.coach_confirmation ? "yes" : "",
    result.lead_capture && (result.lead_capture.phone || result.lead_capture.email)
      ? "yes"
      : "",
  ]);

  return res.json({ reply, meta: { intent: result.intent, language: result.language } });
});

// Constant-time compare so the shared secret can't be guessed a byte at a time.
function secretMatches(given) {
  const expected = process.env.WIX_WEBHOOK_SECRET || "";
  if (!expected || typeof given !== "string" || given.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Wix sends form answers as an array of objects carrying a field title and an input
// value, and the array's position in the payload varies by automation/webhook version
// (submissions, data.submissions, contact.…). So walk the whole body and collect every
// title/value-shaped pair instead of guessing at a path.
const FIELD_TITLE_KEYS = ["title", "label", "fieldName", "fieldTitle", "name", "key"];
const FIELD_VALUE_KEYS = ["value", "inputValue", "fieldValue", "values", "answer", "text"];

function collectWixFields(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectWixFields(item, out, depth + 1);
    return out;
  }
  const titleKey = FIELD_TITLE_KEYS.find((k) => typeof node[k] === "string");
  const valueKey = FIELD_VALUE_KEYS.find((k) => node[k] != null);
  if (titleKey && valueKey) out.push({ title: node[titleKey], value: node[valueKey] });
  for (const v of Object.values(node)) collectWixFields(v, out, depth + 1);
  return out;
}

// An input value can be a string, a list (checkboxes), or an object ({value}, {first,last}).
function flattenWixValue(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(flattenWixValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    for (const k of ["value", "text", "formattedValue", "label", "email", "phone", "number"]) {
      if (v[k] != null && typeof v[k] !== "object") return flattenWixValue(v[k]);
    }
    const parts = [v.first, v.firstName, v.middle, v.last, v.lastName].filter(
      (p) => typeof p === "string" && p.trim()
    );
    if (parts.length) return parts.join(" ").trim();
  }
  return "";
}

function pickByTitle(fields, patterns) {
  for (const pattern of patterns) {
    for (const f of fields) {
      if (!pattern.test(String(f.title || "").trim())) continue;
      const value = flattenWixValue(f.value);
      if (value) return value;
    }
  }
  return "";
}

// The form's "Preferred contact method" answer -> a GHL tag, so a workflow can
// reach a lead the way they asked. Unknown or missing answers get no tag.
const CONTACT_PREF_TAGS = {
  "phone call": "pref-call",
  "text message": "pref-text",
  "email": "pref-email",
};

function contactPrefTags(value) {
  const tag = CONTACT_PREF_TAGS[String(value || "").trim().toLowerCase()];
  return tag ? [tag] : [];
}

// A returning lead already carries these tags, so re-adding them is a no-op in GHL and
// the "tag added" workflow never fires. Strip them first and the re-add becomes a real
// tag-added event again. Every pref tag goes, not just this submission's — someone who
// asked for a call last time and a text this time must not keep the stale one.
const RETRIGGER_TAGS = ["wix-form-lead", "pref-call", "pref-text", "pref-email"];

// GHL applies the delete asynchronously; re-adding in the same breath can land before
// the removal settles and be swallowed as a no-op. A short pause makes the pair stick.
const TAG_SETTLE_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST /wix-lead — a Wix form submission lands here (via a Wix automation/webhook)
// and becomes a GHL contact. Same upsert path as chat leads, different tags so a
// GHL workflow can target form leads on their own.
app.post("/wix-lead", async (req, res) => {
  if (!process.env.WIX_WEBHOOK_SECRET) {
    console.error("WIX_LEAD: WIX_WEBHOOK_SECRET is not set — rejecting.");
    return res.status(401).json({ error: "unauthorized" });
  }

  const given = req.get("x-wix-secret") || req.query.secret;
  if (!secretMatches(given)) {
    console.warn("WIX_LEAD: rejected request with bad or missing secret");
    return res.status(401).json({ error: "unauthorized" });
  }

  // TEMPORARY debug logging — drop once the real Wix payload shape is confirmed.
  console.log("WIX_RAW:", JSON.stringify(req.body));

  const body = req.body || {};
  const fields = collectWixFields(body);
  // Some payloads also carry a structured contact object alongside the field array.
  const contact = body.contact || (body.data && body.data.contact) || {};

  const first = pickByTitle(fields, [/^first\s*name$/i, /\bfirst\s*name\b/i]);
  const last = pickByTitle(fields, [/^last\s*name$/i, /\blast\s*name\b/i]);
  const fullName = pickByTitle(fields, [/^(full\s*)?name$/i, /\byour\s*name\b/i]);

  // Flat {name,email,phone} bodies still win; nested form fields fill the gaps.
  const name =
    (typeof body.name === "string" && body.name.trim()) ||
    [first, last].filter(Boolean).join(" ").trim() ||
    fullName ||
    flattenWixValue(contact.name) ||
    "";
  const email =
    (typeof body.email === "string" && body.email.trim()) ||
    pickByTitle(fields, [/^e-?mail$/i, /\be-?mail\b/i]) ||
    flattenWixValue(contact.email || contact.emails) ||
    "";
  const phone =
    (typeof body.phone === "string" && body.phone.trim()) ||
    pickByTitle(fields, [/^phone$/i, /\bphone\b/i, /\bmobile\b/i]) ||
    flattenWixValue(contact.phone || contact.phones) ||
    "";

  const contactPref = pickByTitle(fields, [/preferred\s*contact/i]);
  const childAge = pickByTitle(fields, [/child.?s?\s*age/i, /^age$/i]);
  const programFor = pickByTitle(fields, [/who\s*is\s*the\s*program\s*for/i]);

  const extras = [
    ["Preferred contact method", contactPref],
    ["Child's age", childAge],
    ["Program for", programFor],
  ].filter(([, v]) => v);

  const note = [
    body.message || body.notes || pickByTitle(fields, [/\bmessage\b/i, /\bnotes?\b/i]),
    ...extras.map(([label, v]) => `${label}: ${v}`),
  ]
    .filter(Boolean)
    .join(" | ");

  console.log("WIX_LEAD:", JSON.stringify({ name, email, phone, note }));

  // Always 200 back to Wix — a missing email/phone is a form-content problem, not a
  // technical failure, and a non-2xx makes Wix flag the automation as broken.
  if (!email && !phone) {
    console.warn("WIX_LEAD: submission had neither email nor phone — skipping GHL upsert.");
    return res.json({ ok: true, crm: false, skipped: "no email or phone" });
  }

  // Every step below is non-fatal on its own: never fail the form submission back to
  // Wix over a CRM hiccup, and never let a failed tag strip stop the upsert.

  // 1. Clear the form tags off a returning contact so re-adding them counts as a new
  //    "tag added" event. A brand-new lead has no contact to look up — skip straight
  //    to the upsert, which fires the workflow on its own.
  let contactId = null;
  try {
    contactId = await findContactId({ email, phone });
    if (contactId) {
      const r = await removeTags(contactId, RETRIGGER_TAGS);
      console.log("WIX_LEAD GHL remove tags:", JSON.stringify(r));
      await sleep(TAG_SETTLE_MS);
    }
  } catch (err) {
    console.error("WIX_LEAD GHL tag reset failed:", err.message);
  }

  // 2. Upsert with the tags back on — this is the event the GHL workflow listens for.
  let crmOk = false;
  try {
    const r = await upsertLead(
      { name, email, phone },
      { source: "wix form", tags: ["wix-form-lead", ...contactPrefTags(contactPref)] }
    );
    crmOk = !!r.ok;
    contactId = r.contactId || contactId;
    console.log("WIX_LEAD GHL upsert:", JSON.stringify(r));
  } catch (err) {
    console.error("WIX_LEAD GHL upsert failed:", err.message);
  }

  // 3. A note on every submission, so a repeat inquiry is visible on the timeline even
  //    when the contact record itself comes back unchanged.
  try {
    if (contactId) {
      const { dayOfWeek, now } = floridaNow();
      const noteBody = [
        "Wix form submission",
        `Submitted: ${dayOfWeek}, ${now} (ET)`,
        `Preferred contact method: ${contactPref || "—"}`,
        `Child's age: ${childAge || "—"}`,
        `Program for: ${programFor || "—"}`,
        `Phone: ${phone || "—"}`,
        `Email: ${email || "—"}`,
      ].join("\n");
      const r = await addNote(contactId, noteBody);
      console.log("WIX_LEAD GHL note:", JSON.stringify(r));
    } else {
      console.warn("WIX_LEAD: no contact id — skipping note.");
    }
  } catch (err) {
    console.error("WIX_LEAD GHL note failed:", err.message);
  }

  logRow([
    new Date().toISOString(),
    email || phone || "",
    "wix-form",
    note,
    "",
    "wix_form_lead",
    "",
    "",
    "",
    "yes",
  ]);

  return res.json({ ok: true, crm: crmOk });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`vs-tennis-cloud listening on :${PORT}`));
