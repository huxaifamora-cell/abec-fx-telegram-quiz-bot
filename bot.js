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

  const { name, score, total, pct, verdict, missedCount } = payload;
  const emoji = pct >= 80 ? '🟢' : pct >= 60 ? '🟡' : '🔴';
  const who = name ? `*${name}*` : 'You';

  let text = `${emoji} *Quiz complete*\n\n` +
    `${who} scored *${score} / ${total}* (${pct}%)\n` +
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

  http
    .createServer((req, res) => {
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
