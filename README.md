# ABEC FX Quiz — Telegram Mini App

Turns the ABEC FX Edge Handbook quiz into a Telegram bot with an in-app
Mini App (Telegram's "Web App" feature). When someone finishes a quiz,
they can tap a button to post their score back into the chat.

This is two separate pieces:

1. **`webapp/index.html`** — the quiz itself, as one self-contained HTML
   file. It must be hosted on a **public HTTPS URL** that anyone can open
   (not a login-gated link). This is a Telegram requirement, not a
   limitation of this code.
2. **`bot.js`** — a small Node.js bot that points Telegram at that URL and
   listens for the score Telegram sends back.

Why not just use the Claude artifact link directly? Claude artifacts are
private by default and served through Claude's own viewer, which blocks
the Telegram SDK script and generally isn't reachable the way a public
Mini App needs to be. The HTML in `webapp/index.html` is the same quiz,
exported so you can host it yourself.

---

## 1. Host the Mini App (pick the easiest option)

### Option A — GitHub Pages (free, ~2 minutes, recommended)

1. Create a new **public** GitHub repo, e.g. `abecfx-quiz`.
2. Upload `webapp/index.html` to it (via the GitHub web UI's "Add file →
   Upload files", or `git push`).
3. In the repo: **Settings → Pages → Source → Deploy from branch → main
   → / (root)** → Save.
4. After a minute, your URL is:
   `https://<your-username>.github.io/abecfx-quiz/`
   (GitHub automatically serves `index.html` at that path.)

### Option B — Netlify / Vercel drag-and-drop

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) (no account
   needed for a quick test) and drag the `webapp` folder onto the page.
2. You'll get a URL like `https://random-name-123.netlify.app/`.

### Option C — Your own server

Serve `webapp/index.html` as a static file over HTTPS from anywhere you
already host things (nginx, Caddy, a Node static server, etc.).

Whichever option you pick, **open the URL in a normal browser first** and
confirm the quiz loads before wiring up the bot.

---

## 2. Create the bot

1. On Telegram, message **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`, pick a name and a username (must end in `bot`, e.g.
   `AbecFxQuizBot`).
3. BotFather gives you a **token** — a string like
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Keep it secret.

That's all that's required for the inline "Open Quiz" button and the
persistent menu button this bot sets up. (You do *not* need BotFather's
`/setdomain` command — that's only for the Attachment Menu / direct
`t.me/bot/app` links, which this setup doesn't use.)

---

## 3. Run the bot

```bash
cd abec-fx-telegram-bot
cp .env.example .env
# edit .env: paste your BOT_TOKEN, and set WEBAPP_URL to the URL from step 1

npm install
npm start
```

You should see:

```
ABEC FX quiz bot starting...
Mini App URL: https://your-username.github.io/abecfx-quiz/
Bot is running. Press Ctrl+C to stop.
```

Open your bot on Telegram, send `/start`, and tap **Open Quiz**. A menu
button ("Open Quiz") also appears permanently next to the message box.

The bot uses long polling, so it just needs to stay running — no webhook
or inbound domain needed for the bot process itself. You can run it:

- On your own machine/VPS with `npm start` (or `pm2 start bot.js` to keep
  it alive)
- On a free-tier host that runs a persistent process, e.g. Railway,
  Render (background worker), or Fly.io

---

## New: name entry, 15-second timer, downloadable result card

- **Name first.** The setup screen asks for the person's name before the
  Start button enables. It's carried through to the results screen and
  the downloadable card, and is included in the score sent to the bot.
- **15 seconds per question.** A countdown pill and shrinking bar appear
  once a question loads. If time runs out before an answer is picked,
  it's scored as missed, the correct answer is revealed, and the quiz
  auto-advances after ~2 seconds.
- **Downloadable result card.** On the results screen, "📸 Download
  result card" renders a shareable 1080×1350 PNG (canvas-generated, no
  server involved) with the person's name, score and verdict in the
  ABECFX brand colors, and opens it in a preview with a Download button.
  On mobile browsers/webviews where a programmatic download doesn't
  trigger a save dialog, the hint tells them to long-press the image
  instead.

## 4. How the score gets back into the chat

Inside the quiz, after finishing, a **"📤 Send score to chat & close"**
button appears (only when actually opened inside Telegram — it's hidden
in a normal browser). Tapping it calls Telegram's `sendData`, which
Telegram delivers to the bot as a message with a `web_app_data` field.
`bot.js` reads that and replies with the score, e.g.:

```
🟢 Quiz complete
Score: 13 / 15 (87%)
Strong grasp of the system.
```

---

## Files

```
abec-fx-telegram-bot/
├── webapp/
│   └── index.html       ← the quiz, host this publicly
├── bot.js                ← the bot
├── package.json
├── .env.example           ← copy to .env and fill in
└── README.md
```

## Updating the quiz content later

The question bank lives in the `QUESTIONS` array near the top of the
`<script>` block in `webapp/index.html`. Edit it, re-upload/re-deploy that
one file, and the next time someone opens the Mini App they'll get the
new questions — no bot restart needed, since the bot never touches the
quiz content itself.
