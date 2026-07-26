// test-brain.js — run the brain in isolation, no channels, no Wix.
//   node test-brain.js
// Requires ANTHROPIC_API_KEY in .env. Prints the full contract object per case.
//
// What to look for:
//   Case A: must ask for the child's AGE first — must NOT dump prices.
//   Case B: reply in Spanish; Wesley Chapel => paid drop-in, NOT a free trial.
//   Case C: must NOT self-confirm a private — coach_confirmation or escalate, not a
//           flat "you're booked".

import "dotenv/config";
import { generateReply } from "./brain.js";

const ctx = {
  dayOfWeek: "Saturday",
  now: "July 25, 2026 3:00 PM",
  availabilityText: "", // no live Wix in this isolated test
};

const cases = [
  { name: "A · kids classes, no age given", message: "Hi, I want tennis classes for my kid in St Pete" },
  { name: "B · Spanish, Wesley Chapel", message: "Hola, quiero clases para mi hija en Wesley Chapel" },
  { name: "C · private booking attempt", message: "Can I book a private lesson tomorrow at 6pm?" },
];

for (const c of cases) {
  console.log("\n=== " + c.name + " ===");
  console.log("IN:", c.message);
  try {
    const out = await generateReply([], c.message, ctx);
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
