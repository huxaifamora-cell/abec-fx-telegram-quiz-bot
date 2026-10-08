# ABEC-FX Quiz — Telegram Mini App

Turns the ABEC-FX Edge Handbook quiz into a Telegram bot with an in-app
Mini App (Telegram's "Web App" feature). When someone finishes a quiz,
they can tap a button to post their score back into the chat.

It's two pieces, but **one process**:

1. **`webapp/index.html`** — the quiz itself, as one self-contained HTML
   file.
2. **`bot.js`** — a small Node.js bot that talks to Telegram, listens for
   the score Telegram sends back, **and serves `webapp/index.html` over
   HTTP itself**. Telegram requires the Mini App to live at a public
   HTTPS URL (not a login-gated link) — `bot.js` provides that by being
   its own tiny web server, so you only have to deploy one thing (see
   **Deploy on Render** below).

Why not just use the Claude artifact link directly? Claude artifacts are
private by default and served through Claude's own viewer, which blocks
the Telegram SDK script and generally isn't reachable the way a public
Mini App needs to be. The HTML in `webapp/index.html` is the same quiz,
exported so you can host it yourself.

If you'd rather host the quiz page somewhere separate (GitHub Pages,
Netlify, your own server) instead of letting `bot.js` serve it, that
still works — see **Hosting the quiz page separately (optional)** near
the bottom. Most people can skip straight to the next section.

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

## 3. Deploy on Render (one free Web Service, recommended)

This is the simplest path: **one** Render Web Service runs `bot.js`,
which both polls Telegram *and* serves `webapp/index.html` as the Mini
App page. No second service, no copying a URL between them.

### Using render.yaml (one click)

1. Push this whole `abec-fx-telegram-bot` folder to a GitHub repo.
2. In the Render dashboard: **New → Blueprint** → connect the repo.
   Render reads `render.yaml` and proposes a single `abecfx-quiz-bot`
   Web Service on the **free** plan.
3. Click **Apply**.
4. Open the service → **Environment** tab → add `BOT_TOKEN` (from step 2
   above). Save — Render redeploys automatically.
5. Once it's live, open the service's `.onrender.com` URL in a browser —
   you should see the quiz itself, not a plain status message. Then open
   your bot on Telegram and tap **Open Quiz**.

### Manual path (no Blueprint)

1. **New → Web Service** → connect the repo.
2. Build Command: `npm install`. Start Command: `node bot.js`. Plan:
   **Free**.
3. Add the `BOT_TOKEN` environment variable. Deploy.

Render automatically sets `RENDER_EXTERNAL_URL` to this service's own
public URL, and `bot.js` uses that as the Mini App URL — so you never
need to set `WEBAPP_URL` by hand on Render.

### A note on the free plan

Render's free Web Services spin down after ~15 minutes without HTTP
traffic, and spin back up (taking a few seconds) on the next request.
Since `bot.js` serving the quiz page *is* an HTTP request, someone
opening the Mini App will naturally wake it — the Telegram bot's long
polling resumes with it. If you want it to never sleep (so `/start`
replies instantly), either upgrade the service to a paid plan, or set up
a free external pinger (UptimeRobot, cron-job.org, etc.) to request the
service's URL every 5–10 minutes.

### Troubleshooting

If opening the bot shows plain text like *"...webapp/index.html was not
found"* instead of the quiz, the `webapp/` folder didn't make it into
the deploy — double check it was pushed to the repo alongside `bot.js`.

---

## 4. Run the bot locally (optional)

```bash
cd abec-fx-telegram-bot
cp .env.example .env
# edit .env: paste your BOT_TOKEN (leave WEBAPP_URL commented out)

npm install
npm start
```

Locally, with no `PORT` set, `bot.js` only polls Telegram — it won't
have a public URL to serve the quiz from, so set `WEBAPP_URL` in `.env`
to wherever you're hosting `webapp/index.html` for local testing (see
**Hosting the quiz page separately** below), or just deploy to Render
instead, which handles both automatically.

---

## Hosting the quiz page separately (optional)

Skip this unless you specifically don't want `bot.js` serving the page
itself. Host `webapp/index.html` anywhere that serves static HTTPS files
— GitHub Pages, Netlify/Vercel drag-and-drop, your own server — then set
`WEBAPP_URL` in `.env` (or as an environment variable on whatever runs
`bot.js`) to that URL. It overrides the auto-detected Render URL.

- **GitHub Pages:** new public repo → upload `webapp/index.html` →
  **Settings → Pages → Deploy from branch → main → / (root)** → your URL
  is `https://<username>.github.io/<repo>/`.
- **Netlify drop:** [app.netlify.com/drop](https://app.netlify.com/drop),
  drag the `webapp` folder in.

Whichever you pick, open the URL in a normal browser first and confirm
the quiz loads before pointing the bot at it.

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

## How the score gets back into the chat

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
│   └── index.html       ← the quiz; bot.js serves this itself
├── bot.js                ← the bot (long-polling) + built-in web server for the quiz page
├── package.json
├── render.yaml            ← Render Blueprint (one free Web Service)
├── .env.example           ← copy to .env and fill in
└── README.md
```

## Updating the quiz content later

The question bank lives in the `QUESTIONS` array near the top of the
`<script>` block in `webapp/index.html`. Edit it, re-upload/re-deploy that
one file, and the next time someone opens the Mini App they'll get the
new questions — no bot restart needed, since the bot never touches the
quiz content itself.
