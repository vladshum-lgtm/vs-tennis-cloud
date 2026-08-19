// lib/ghl.js — push a captured lead into GoHighLevel via the Contacts Upsert API.
// Auth: Private Integration Token in env (GHL_API_TOKEN). Non-fatal by design —
// the caller wraps this in try/catch so a CRM hiccup never breaks the chat reply.

import { GHL } from "../config.js";

function ghlHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL.apiVersion,
    "Content-Type": "application/json",
  };
}

function requireToken() {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  return token;
}

function splitName(name) {
  if (!name) return { firstName: "", lastName: "" };
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

// opts lets non-chat callers (e.g. the Wix form webhook) reuse this same upsert:
//   source — the GHL "source" field. Defaults to the website chat.
//   tags   — the base tags for this contact. Defaults to ["chat-lead"]; pass your
//            own to keep a non-chat lead out of the chat-lead workflows. Location
//            and segment tags are still appended on top of whatever you pass.
export async function upsertLead(lead, opts = {}) {
  const { source = "website chat", tags: baseTags = ["chat-lead"] } = opts;

  const token = requireToken();
  if (!lead || (!lead.phone && !lead.email)) {
    return { skipped: true, reason: "no phone or email yet" };
  }

  const { firstName, lastName } = splitName(lead.name);

  const tags = [...baseTags];
  if (lead.location_pref === "st_pete") tags.push("st-pete");
  if (lead.location_pref === "wesley_chapel") tags.push("wesley-chapel");
  if (lead.segment && lead.segment !== "unknown") tags.push(lead.segment);

  const body = {
    locationId: GHL.locationId,
    firstName,
    lastName,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    tags,
    source,
  };

  const res = await fetch(GHL.upsertEndpoint, {
    method: "POST",
    headers: ghlHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL upsert ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, contactId: data.contact?.id || data.id || null };
}

// GET /contacts/search/duplicate — find an existing contact by email (first priority)
// or phone. Returns the contact id, or null when there's no match. A miss is a normal
// outcome (brand-new lead), not an error, so 404/empty both come back as null.
export async function findContactId({ email, phone } = {}) {
  const token = requireToken();
  if (!email && !phone) return null;

  const params = new URLSearchParams({ locationId: GHL.locationId });
  if (email) params.set("email", email);
  // The duplicate-search endpoint spells the phone param "number", not "phone".
  if (phone) params.set("number", phone);

  const res = await fetch(`${GHL.apiBase}/contacts/search/duplicate?${params}`, {
    headers: ghlHeaders(token),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL duplicate search ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return data.contact?.id || data.contacts?.[0]?.id || null;
}

// DELETE /contacts/{id}/tags — strip tags so they can be re-added as a fresh
// "tag added" event. Body carries the tags to remove; the response is the tag list
// that survived.
export async function removeTags(contactId, tags) {
  const token = requireToken();
  if (!contactId || !tags?.length) return { skipped: true };

  const res = await fetch(`${GHL.apiBase}/contacts/${contactId}/tags`, {
    method: "DELETE",
    headers: ghlHeaders(token),
    body: JSON.stringify({ tags }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL remove tags ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, tags: data.tags || [] };
}

// POST /contacts/{id}/notes — leave a visible activity entry on the contact's
// timeline. Only `body` is required; userId is optional and we have no user to
// attribute it to, so the note lands as an integration note.
export async function addNote(contactId, noteBody) {
  const token = requireToken();
  if (!contactId || !noteBody) return { skipped: true };

  const res = await fetch(`${GHL.apiBase}/contacts/${contactId}/notes`, {
    method: "POST",
    headers: ghlHeaders(token),
    body: JSON.stringify({ body: noteBody }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL add note ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, noteId: data.note?.id || data.id || null };
}
