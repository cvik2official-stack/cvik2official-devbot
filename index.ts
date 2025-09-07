// Deno compatible Supabase Edge Function webhook entry
import { serve } from 'std/server';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { Bot } from 'https://cdn.jsdelivr.net/npm/grammy/+esm';

const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

async function getSession(telegramUserId: number) {
  const { data } = await supabase
    .from('telegram_sessions')
    .select('session')
    .eq('telegram_user_id', telegramUserId)
    .single();
  return data?.session ?? null;
}
async function setSession(telegramUserId: number, session: any) {
  await supabase.from('telegram_sessions').upsert({
    telegram_user_id: telegramUserId,
    session,
    updated_at: new Date().toISOString(),
  });
}

bot.command('start', async (ctx) => {
  await setSession(ctx.from!.id, { started: true });
  await ctx.reply('Hello! Bot running on Supabase Edge Function.');
});

bot.on('message', async (ctx) => {
  const s = (await getSession(ctx.from!.id)) || {};
  await setSession(ctx.from!.id, { ...s, lastMessage: ctx.message?.text ?? null });
  await ctx.reply('Received.');
});

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  try {
    const update = await req.json();
    await bot.handleUpdate(update);
    return new Response('OK');
  } catch (err) {
    console.error('bot error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
});
