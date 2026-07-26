// brain.js — the shared chat brain. Channel-agnostic: no iMessage, no HTTP, no Wix
// delivery here. It takes a conversation and returns a structured decision object.
// The website widget (via server.js) and the Mac iMessage relay both call this.
//
// The system prompt lives in prompts/chat-brain-system-prompt.md so a non-coder can
// edit wording via GitHub's web editor without touching this logic.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { filterReply } from "./lib/filters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Load the system prompt (everything below the first '---' line) ---
function loadSystemPrompt() {
  const raw = fs.readFileSync(
    path.join(__dirname, "prompts", "chat-brain-system-prompt.md"),
    "utf8"
  );
  const idx = raw.indexOf("\n---\n");
  const body = idx === -1 ? raw : raw.slice(idx + 5);
  return body.trim();
}

const SYSTEM_PROMPT = loadSystemPrompt();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

// Safe fallback the caller can always act on.
function safeFallback(rawText, reason) {
  return {
    reply: null,
    language: "en",
    intent: "info",
    escalate: { reason, context: (rawText || "").slice(0, 400) },
    coach_confirmation: null,
    lead_capture: null,
  };
}

function extractJson(text) {
  // Strip accidental ```json fences, then parse.
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * generateReply
 * @param {Array<{role:'user'|'assistant', text:string}>} history  last ~10 messages
 * @param {string} message   the incoming message
 * @param {object} context   { now, dayOfWeek, availabilityText }
 * @returns {Promise<object>} the contract object defined at the end of the prompt
 */
export async function generateReply(history = [], message = "", context = {}) {
  const contextBlock = [
    "CURRENT CONTEXT",
    `Today is ${context.dayOfWeek || "unknown"}, ${context.now || "unknown date/time"} (Florida time).`,
    context.availabilityText
      ? `Live availability from Wix Bookings:\n${context.availabilityText}`
      : "No live availability was fetched for this message. Do not offer a specific slot as confirmed.",
  ].join("\n");

  const system = `${SYSTEM_PROMPT}\n\n${contextBlock}`;

  const messages = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text,
    })),
    { role: "user", content: message },
  ];

  let rawText = "";
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
    });
    rawText = (resp.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  } catch (err) {
    return safeFallback(String(err), "anthropic_api_error");
  }

  let parsed;
  try {
    parsed = extractJson(rawText);
  } catch {
    return safeFallback(rawText, "bad_model_output");
  }

  // Normalize + validate the contract, then run the reply through safety filters.
  const result = {
    reply: filterReply(parsed.reply ?? null),
    language: ["en", "es", "ru"].includes(parsed.language) ? parsed.language : "en",
    intent: parsed.intent || "info",
    escalate: parsed.escalate ?? null,
    coach_confirmation: parsed.coach_confirmation ?? null,
    lead_capture: parsed.lead_capture ?? null,
  };

  // If the model wanted to reply but the filter suppressed it, that's an escalation.
  if (parsed.reply && result.reply === null && !result.escalate) {
    result.escalate = { reason: "reply_filtered", context: parsed.reply.slice(0, 400) };
  }

  return result;
}

export { SYSTEM_PROMPT };
