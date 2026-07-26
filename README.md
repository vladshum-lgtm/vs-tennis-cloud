# vs-tennis-cloud

The cloud chat brain for VS Tennis Academy. One brain, multiple channels.

## Architecture

```
                 ┌─────────────────────────┐
  Website widget →│                         │
  (Wix)           │   server.js  (Railway)  │
                  │        │                │
  Mac iMessage   →│     brain.js  ← prompts/chat-brain-system-prompt.md
  relay (later)   │        │                │
                  │   lib/wixBookings.js    │→ Wix Bookings API
                  └─────────────────────────┘
```

- **brain.js** — channel-agnostic. Loads the system prompt, calls Claude, returns a
  structured decision (reply / escalate / coach_confirmation / lead_capture).
  This is the single source of truth for what the assistant says.
- **prompts/chat-brain-system-prompt.md** — the assistant's rules and business facts.
  Edit this to change behavior; non-coders can edit it via GitHub's web editor.
- **server.js** — the website channel. Runs on Railway. Exposes `POST /chat`.
- **mac-relay/** — the future iMessage relay (runs on the Mac, hits `/chat`). Empty for now.

## Local setup

```
npm install
cp .env.example .env      # fill in real keys
npm run test:brain        # runs the 3 isolated brain tests
npm start                 # starts server.js on :8787
```

Test the endpoint:

```
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test1","message":"Do you have red ball classes in St Pete?"}'
```

## Deploy (Railway)

1. Connect this GitHub repo to a new Railway service.
2. Add the variables from `.env.example` under the service's Variables.
3. Railway runs `npm start`. Grab the public URL for the widget + relay to call.

## Editing behavior

Change wording, prices, rules → edit `prompts/chat-brain-system-prompt.md`, commit,
Railway redeploys, and both the website and (later) iMessage pick it up. No Mac access
needed.

## Not here on purpose

Coach phone numbers, the blocked list, iMessage delays/cooldowns, and the exact text
sent TO a coach live in the delivery layer (mac-relay / server side effects), not in
the brain. The brain decides *what to say and when to stop*.
