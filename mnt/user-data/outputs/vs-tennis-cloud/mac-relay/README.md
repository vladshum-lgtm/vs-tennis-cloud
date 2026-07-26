# mac-relay (not built yet)

This folder will hold the thin iMessage relay that runs on the dedicated Mac.

It is intentionally empty for now. The relay does NOT contain brain logic — it only:
1. watches the Mac's Messages database for new incoming texts,
2. POSTs `{ sessionId, message }` to the cloud `/chat` endpoint (this repo, on Railway),
3. sends the returned `reply` back via AppleScript.

Because the brain lives in the cloud, editing the prompt or logic never requires
touching this Mac again. Build this only after `server.js` is live on Railway and the
website widget is working.
