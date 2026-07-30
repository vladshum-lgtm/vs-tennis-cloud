// Wix Bookings availability. Fetches real time slots so the brain never invents one.
//
// Endpoint and auth confirmed against the live site:
//   POST https://www.wixapis.com/_api/service-availability/v2/time-slots
//   headers: Authorization: <IST-prefixed key>, wix-site-id: <siteId>
//   body: { serviceId, fromLocalDate, toLocalDate }  (ISO, no timezone suffix)

import { WIX } from "../config.js";

/**
 * Fetch available slots for a service over a local date range.
 * @param {string} serviceId
 * @param {string} fromLocalDate e.g. "2026-07-25T00:00:00"
 * @param {string} toLocalDate   e.g. "2026-08-01T00:00:00"
 * @returns {Promise<Array>} raw time-slot objects (may be empty)
 */
export async function getAvailability(serviceId, fromLocalDate, toLocalDate) {
  const apiKey = process.env.WIX_API_KEY;
  if (!apiKey) throw new Error("WIX_API_KEY is not set");

  const res = await fetch(WIX.timeSlotsEndpoint, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "wix-site-id": WIX.siteId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ serviceId, fromLocalDate, toLocalDate }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wix availability ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.timeSlots || data.slots || [];
}

/**
 * Turn raw slots into a compact, human-readable string to inject into the prompt.
 * The brain reads this to offer only real slots.
 */
export function formatAvailability(slots) {
  if (!slots || slots.length === 0) return "No open slots were returned for this service/date range.";
  return slots
    .slice(0, 15)
    .map((s) => {
      const start = s.localStartDate || s.startDate || s.start || "";
      return `- ${start}`;
    })
    .join("\n");
}
