// ABEC FX — Edge Handbook Quiz · Telegram bot
//
// Serves the quiz as a Telegram Mini App (Web App) and reports the score
// back into the chat when the user finishes a quiz and taps
// "Send score to chat & close" inside the Mini App.
//
// Setup:
//   1. Create a bot with @BotFather on Telegram, get its token.
//   2. Host webapp/index.html on any public HTTPS URL (GitHub Pages,
//      Netlify, Vercel, Cloudflare Pages, your own server — anything).
//      See README.md for the quickest way (GitHub Pages).
//   3. Copy .env.example to .env and fill in BOT_TOKEN and WEBAPP_URL.
//   4. npm install
//   5. npm start
//
// The bot uses long polling, so it just needs to keep running somewhere
// (your own machine, a small VPS, Railway, Render, Fly.io, etc.) — no
// inbound webhook or domain is required for the BOT itself. Only the
// Mini App's HTML needs a public HTTPS URL.

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!TOKEN) {
  console.error('Missing BOT_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!WEBAPP_URL || !/^https:\/\//.test(WEBAPP_URL)) {
  console.error('Missing or invalid WEBAPP_URL. It must be a public https:// URL (see README.md).');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('ABEC FX quiz bot starting...');
console.log('Mini App URL:', WEBAPP_URL);

// ---------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------
bot.setMyCommands([
  { command: 'start', description: 'Open the ABEC FX Edge Handbook quiz' },
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
    '📈 *ABEC FX — Edge Handbook Quiz*\n\nTest what you know: indicators, trend reading, entries, stop loss, retest zones and risk discipline.',
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
    'This bot opens the ABEC FX Edge Handbook quiz as an in-app Mini App.\n\n' +
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
