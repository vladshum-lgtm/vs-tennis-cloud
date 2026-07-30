// lib/ghl.js — push a captured lead into GoHighLevel via the Contacts Upsert API.
// Auth: Private Integration Token in env (GHL_API_TOKEN). Non-fatal by design —
// the caller wraps this in try/catch so a CRM hiccup never breaks the chat reply.

import { GHL } from "../config.js";

function splitName(name) {
  if (!name) return { firstName: "", lastName: "" };
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

export async function upsertLead(lead) {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  if (!lead || (!lead.phone && !lead.email)) {
    return { skipped: true, reason: "no phone or email yet" };
  }

  const { firstName, lastName } = splitName(lead.name);

  const tags = ["chat-lead"];
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
    source: "website chat",
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
