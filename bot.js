// ABEC-FX — Edge Handbook Quiz · Telegram bot
//
// Runs the Telegram bot AND serves the quiz's HTML from the same process,
// so this can deploy as a single Render Web Service (or any other single
// host) — no separate static site needed. Serves the quiz as a Telegram
// Mini App (Web App) and reports the score back into the chat when the
// user finishes a quiz and taps "Send score to chat & close".
//
// Setup:
//   1. Create a bot with @BotFather on Telegram, get its token.
//   2. Copy .env.example to .env and fill in BOT_TOKEN.
//      WEBAPP_URL is usually NOT needed — see "Finding the Mini App URL"
//      below. Only set it if you deployed the webapp separately instead.
//   3. npm install
//   4. npm start
//
// The bot uses long polling for Telegram updates (no inbound webhook
// needed for that), and a tiny built-in HTTP server for everything else:
// serving the quiz page, and answering Render's health check.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT;

// ---------------------------------------------------------------------
// Finding the Mini App URL
// ---------------------------------------------------------------------
// Render automatically sets RENDER_EXTERNAL_URL to this exact service's
// own public URL. Since this same process serves webapp/index.html below
// (whenever PORT is set), that IS the Mini App URL — nothing to copy
// between two services. WEBAPP_URL only needs setting by hand if you
// deployed the quiz page somewhere else instead (GitHub Pages, a
// separate static site, etc.) — in that case it overrides the guess.
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL;

// ---------------------------------------------------------------------
// Link to the ABECFX registration website (where students and results live)
// ---------------------------------------------------------------------
// REG_SITE_URL: the registration site, e.g. https://abecfx.onrender.com
// QUIZ_API_KEY: a long random secret. Set the SAME value on the registration site.
const crypto = require('crypto');
const REG_SITE_URL = (process.env.REG_SITE_URL || '').replace(/\/+$/, '');
const QUIZ_API_KEY = process.env.QUIZ_API_KEY || '';
if (!REG_SITE_URL || !QUIZ_API_KEY) {
  console.warn('REG_SITE_URL / QUIZ_API_KEY not set: students cannot sign in to the quiz or save results until they are.');
}

if (!TOKEN) {
  console.error('Missing BOT_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!WEBAPP_URL || !/^https:\/\//.test(WEBAPP_URL)) {
  console.error(
    'Missing or invalid WEBAPP_URL. On Render this is normally automatic ' +
    '(RENDER_EXTERNAL_URL) — if you\'re running locally or elsewhere, set ' +
    'WEBAPP_URL in .env to a public https:// URL serving webapp/index.html.'
  );
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('ABEC-FX quiz bot starting...');
console.log('Mini App URL:', WEBAPP_URL);

// ---------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------
bot.setMyCommands([
  { command: 'start', description: 'Open the ABEC-FX Edge Handbook quiz' },
  { command: 'quiz', description: 'Open the quiz' },
  { command: 'help', description: 'What this bot does' },
]).catch((e) => console.error('setMyCommands failed:', e.message));

// Persistent "menu button" next to the message box (tap it to open the quiz
// any time, without needing /start). This sets the DEFAULT button for all
// private chats with the bot.
bot.setChatMenuButton({
  menu_button: JSON.stringify({
    type: 'web_app',
    text: 'Open Quiz',
    web_app: { url: WEBAPP_URL },
  }),
}).catch((e) => console.error('setChatMenuButton failed:', e.message));

function sendQuizButton(chatId) {
  return bot.sendMessage(
    chatId,
    '📈 *ABEC-FX — Edge Handbook Quiz*\n\nTest what you know: indicators, trend reading, entries, stop loss, retest zones and risk discipline.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🧠 Open Quiz', web_app: { url: WEBAPP_URL } },
        ]],
      },
    }
  );
}

bot.onText(/^\/start/, (msg) => sendQuizButton(msg.chat.id));
bot.onText(/^\/quiz/, (msg) => sendQuizButton(msg.chat.id));
bot.onText(/^\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'This bot opens the ABEC-FX Edge Handbook quiz as an in-app Mini App.\n\n' +
    '• /quiz — open the quiz\n' +
    '• Tap "Open Quiz" in the menu button next to the message box, any time\n' +
    '• When you finish a quiz, tap "Send score to chat & close" to post your result here'
  );
});

// ---------------------------------------------------------------------
// Receiving the score back from the Mini App
// ---------------------------------------------------------------------
// The webapp calls Telegram.WebApp.sendData(JSON.stringify(payload)) when
// the user taps "Send score to chat & close". Telegram delivers that as a
// normal message with a `web_app_data` field, then closes the Mini App.
bot.on('message', (msg) => {
  if (!msg.web_app_data) return;

  let payload;
  try {
    payload = JSON.parse(msg.web_app_data.data);
  } catch (e) {
    bot.sendMessage(msg.chat.id, '🎯 Quiz finished! (Could not parse the result details.)');
    return;
  }

  if (payload.type !== 'abecfx_quiz_result') return;

  const { name, score, total, pct, verdict, missedCount, grade } = payload;
  const emoji = pct >= 80 ? '🟢' : pct >= 60 ? '🟡' : '🔴';
  const who = name ? `*${name}*` : 'You';

  let text = `${emoji} *Quiz complete*\n\n` +
    `${who} scored *${score} / ${total}* (${pct}%)${grade ? ` — Grade *${grade}*` : ''}\n` +
    `${verdict || ''}\n`;

  if (missedCount > 0) {
    text += `\nMissed: ${missedCount} question${missedCount === 1 ? '' : 's'} — open the quiz again and use "Retry missed only" to drill those.`;
  }

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));

console.log('Bot is running. Press Ctrl+C to stop.');

// ---------------------------------------------------------------------
// Built-in web server — serves the quiz page + Render's health check
// ---------------------------------------------------------------------
// Only runs when PORT is set, which Render sets automatically for a Web
// Service (and which you'd leave unset for a Background Worker, or when
// running locally with just `npm start`). This is what lets one Render
// service be both the bot and the Mini App's page — no second service,
// no copying a URL between them.
const webappFile = path.join(__dirname, 'webapp', 'index.html');

if (PORT) {
  let html;
  try {
    html = fs.readFileSync(webappFile);
  } catch (e) {
    console.error(`Could not read ${webappFile}:`, e.message);
  }

  // ---- Telegram sign-in check -------------------------------------------------
  // The Mini App sends Telegram's signed "initData". Verifying it proves the request really comes
  // from a Telegram user, and tells us their Telegram id.
  function verifyInitData(initData) {
    if (!initData || initData.length > 4096) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
    const a = Buffer.from(calc), b = Buffer.from(hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
    if (!(age >= 0 && age < 24 * 3600)) return null;
    try {
      const user = JSON.parse(params.get('user') || '{}');
      return user && user.id ? { id: String(user.id) } : null;
    } catch (e) { return null; }
  }

  // Small per-Telegram-account limit so nobody can hammer the registration site through the bot.
  const hits = new Map();
  function limited(id) {
    const now = Date.now();
    const arr = (hits.get(id) || []).filter((t) => now - t < 10 * 60 * 1000);
    arr.push(now);
    hits.set(id, arr);
    if (hits.size > 5000) hits.clear();
    return arr.length > 40;
  }

  function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let tooBig = false;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (tooBig) return;
        if (size > 20000) { tooBig = true; reject(new Error('too large')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (tooBig) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  // Forward to the registration site with the shared secret.
  async function callSite(pathAndQuery, options = {}) {
    const r = await fetch(REG_SITE_URL + pathAndQuery, {
      ...options,
      headers: { 'x-quiz-key': QUIZ_API_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    let body = {};
    try { body = await r.json(); } catch (e) { /* non-JSON error page */ }
    return { status: r.status, body };
  }

  async function handleApi(req, res, url) {
    if (!REG_SITE_URL || !QUIZ_API_KEY) {
      return sendJson(res, 503, { error: 'The quiz is not connected to the student records yet.' });
    }
    const user = verifyInitData(req.headers['x-telegram-init-data']);
    if (!user) {
      return sendJson(res, 401, { error: 'Open this quiz from the Telegram bot so we can sign you in.' });
    }
    if (limited(user.id)) return sendJson(res, 429, { error: 'Too many requests. Please wait a few minutes.' });

    try {
      if (req.method === 'GET' && url.pathname === '/api/student') {
        const out = await callSite('/api/quiz/student?reg=' + encodeURIComponent(url.searchParams.get('reg') || ''));
        return sendJson(res, out.status, out.body);
      }
      if (req.method === 'POST' && url.pathname === '/api/submit') {
        const b = await readJson(req);
        const out = await callSite('/api/quiz/result', {
          method: 'POST',
          body: JSON.stringify({
            reg: b.reg, score: b.score, total: b.total, breakdown: b.breakdown, telegramId: user.id,
          }),
        });
        return sendJson(res, out.status, out.body);
      }
      return sendJson(res, 404, { error: 'Not found.' });
    } catch (e) {
      if (e.message === 'too large') return sendJson(res, 413, { error: 'That request is too large.' });
      console.error('API error:', e.message);
      return sendJson(res, 502, { error: 'Could not reach the student records. Please try again shortly.' });
    }
  }

  http
    .createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        handleApi(req, res, url);
        return;
      }
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }
      if (html) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ABEC-FX quiz bot is running, but webapp/index.html was not found.\n');
      }
    })
    .listen(PORT, () => {
      console.log(`Serving the quiz page on port ${PORT} — this is also the Mini App URL.`);
    });
}
