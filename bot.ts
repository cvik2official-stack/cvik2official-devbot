import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN environment variable');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

type Cmd = { name: string; answer: string; keyboard: string; aliases: string[] };
const commandsMap = new Map<string, Cmd>();

// CSV caching: store parsed commands in a local cache file to avoid repeated network fetches.
const CACHE_FILE = path.join(process.cwd(), '.cache', 'demo_commands.json');
const DEFAULT_TTL = process.env.DEMO_CSV_TTL ? parseInt(process.env.DEMO_CSV_TTL, 10) : 600; // seconds

async function loadCsvCommands(): Promise<Cmd[]> {
  const configPath = path.join(process.cwd(), 'DemoFromTableBot', 'bot.json');
  if (!fs.existsSync(configPath)) return [];
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  let csvUrl = cfg.csv_url;

  // If a local appended CSV exists, prefer it for local testing
  const localAppended = path.join(process.cwd(), 'DemoFromTableBot', 'commands-with-start.csv');
  if (fs.existsSync(localAppended)) {
    csvUrl = 'file://' + localAppended;
  }
  if (!csvUrl) return [];

  // Check cache
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stat = fs.statSync(CACHE_FILE);
      const age = (Date.now() - stat.mtimeMs) / 1000;
      if (age < DEFAULT_TTL) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const cached = JSON.parse(raw) as Cmd[];
        if (Array.isArray(cached) && cached.length) return cached;
      }
    }
  } catch (err) {
    // ignore cache errors and proceed to fetch
    console.error('cache read error', err);
  }

  // Fetch and parse. Support local file paths (file://) as well as remote URLs.
  let txt: string;
  if (csvUrl.startsWith('file://')) {
    const p = csvUrl.replace('file://', '');
    txt = fs.readFileSync(p, 'utf8');
  } else {
    const res = await fetch(csvUrl);
    txt = await res.text();
  }
  // The demo CSV contains unescaped quotes, multiline fields and flexible columns.
  // Use relaxed parsing to tolerate those cases.
  const records = parse(txt, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  trim: true,
  // If a record is malformed (unclosed quote etc.), skip it so the bot can still start.
  skip_records_with_error: true
  });
  const commands: Cmd[] = [];
  for (const r of records) {
    const command = (r.command || '').trim();
    if (!command) continue;
    const name = command.startsWith('/') ? command.slice(1) : command;
    const answer = r.answer || '';
    const keyboard = r.keyboard || '';
    const aliases = (r.aliases || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    commands.push({ name, answer, keyboard, aliases });
  }

  // Ensure cache dir exists and write cache
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(commands, null, 2), 'utf8');
  } catch (err) {
    console.error('cache write error', err);
  }

  return commands;
}

async function registerCommands() {
  const cmds = await loadCsvCommands();
  for (const c of cmds) {
    commandsMap.set(c.name, c);
    bot.command(c.name, async (ctx) => {
      const text = c.answer || ' ';
      if (c.keyboard) {
        const keys: string[] = c.keyboard.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (keys.length > 0) {
          const replyKb = { keyboard: keys.map(k => [{ text: k }]), resize_keyboard: true, one_time_keyboard: true } as any;
          await ctx.reply(text, { reply_markup: replyKb });
          return;
        }
      }
      await ctx.reply(text);
    });
    for (const a of c.aliases) {
      const aliasName = a.replace(/^\//, '');
      commandsMap.set(aliasName, c);
      bot.command(aliasName, async (ctx) => {
        await ctx.reply(c.answer || ' ');
      });
    }
  }

  // Inline callback handler: buttons will use data 'use:<command>'
  bot.callbackQuery(/use:(.+)/, async (ctx) => {
    const matches = ctx.match as RegExpMatchArray | undefined;
    const cmdName = matches?.[1];
    if (!cmdName) return await ctx.answerCallbackQuery({ text: 'No command' });
    const c = commandsMap.get(cmdName.replace(/^\//, ''));
    if (!c) return await ctx.answerCallbackQuery({ text: 'Unknown command' });
    await ctx.answerCallbackQuery({ text: 'Running ' + cmdName });
    await ctx.reply(c.answer || '');
  });

  return cmds;
}

bot.command('demo', async (ctx) => {
  const cmds = await loadCsvCommands();
  if (!cmds || cmds.length === 0) return await ctx.reply('No demo commands available.');
  const first = cmds[0];
  const replyKb = { keyboard: [[{ text: first.name }], [{ text: 'help' }]], resize_keyboard: true, one_time_keyboard: true } as any;
  await ctx.reply(`Reply keyboard example for /${first.name}`, { reply_markup: replyKb });

  const ik = new InlineKeyboard().text('Use command', `use:${first.name}`);
  await ctx.reply('Inline keyboard example:', { reply_markup: ik });
});

bot.on('message', async (ctx) => {
  if (ctx.message?.text) await ctx.reply('You said: ' + ctx.message.text);
});

(async () => {
  await registerCommands();
  await bot.start();
  console.log('Bot started (polling)');
})();

