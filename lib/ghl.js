// lib/ghl.js — push a captured lead into GoHighLevel via the Contacts Upsert API.
// Auth: Private Integration Token in env (GHL_API_TOKEN). Non-fatal by design —
// the caller wraps this in try/catch so a CRM hiccup never breaks the chat reply.

import { GHL } from "../config.js";

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

  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
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
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL upsert ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, contactId: data.contact?.id || data.id || null };
}
