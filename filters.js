// Reply safety filters. These are the last line of defense before a reply reaches
// a person. If a reply trips a filter, we suppress it (return null) so nothing
// bad leaks to the client — the escalate path in server.js handles the human handoff.
//
// Ported from the iMessage agent's hard-won filter list. Keep additions here so
// both channels (web + iMessage relay) share the same protection.

const LEAK_PATTERNS = [
  /escalate/i,                    // escalation marker must never reach a client
  /no response needed/i,
  /according to (my|the) instructions/i,
  /as an ai\b/i,
  /i don'?t speak russian/i,
  /я не знаю кто/i,
  /anything else i can help/i,
  /system prompt/i,
];

/**
 * Returns true if the reply text is safe to send.
 */
export function isReplySafe(text) {
  if (typeof text !== "string") return false;
  return !LEAK_PATTERNS.some((re) => re.test(text));
}

/**
 * Runs a reply through the filters. Returns the reply if safe, otherwise null.
 * A suppressed reply should be treated by the caller as "escalate / send holding line".
 */
export function filterReply(text) {
  if (text === null || text === undefined) return null;
  return isReplySafe(text) ? text : null;
}
