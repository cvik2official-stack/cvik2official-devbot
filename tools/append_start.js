/*
  append_start.js
  - Tries to append a /start row to the remote Google Sheet using a service account JSON
  - If no credentials found, writes appended CSV locally at DemoFromTableBot/commands-with-start.csv

  Usage: node tools/append_start.js
  Requirements to append remotely:
    - Place a Google service account JSON at ./service-account.json
    - Set TARGET_SHEET_ID env var or edit the SHARING_LINK constant below
*/

const fs = require('fs');
const path = require('path');
// googleapis is only required when attempting a remote append. We'll lazy-load it below.

const SHARING_LINK = process.env.SHARING_LINK || 'https://docs.google.com/spreadsheets/d/1Q42evI_RWCS0k_EwK7T0P8sOftnFl--3UU-y_LF8ke4/edit?usp=sharing';

function sheetIdFromSharing(link) {
  const m = link.match(/\/d\/(.+?)\//);
  return m ? m[1] : null;
}

async function appendRemoteRow(serviceAccountPath, sheetId, row) {
  // Lazy-load googleapis to avoid module error when not installed and remote append not used.
  const { google } = require('googleapis');
  const keyFile = serviceAccountPath;
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const auth = new google.auth.GoogleAuth({ keyFile, scopes });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Append to the first sheet
  const resp = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
  return resp.data;
}

function appendLocal(csvPath, extraRow) {
  const txt = fs.readFileSync(csvPath, 'utf8');
  const outPath = path.join(path.dirname(csvPath), 'commands-with-start.csv');
  fs.writeFileSync(outPath, txt + '\n' + extraRow.join(','), 'utf8');
  return outPath;
}

(async function main(){
  const cfgPath = path.join(process.cwd(), 'DemoFromTableBot', 'bot.json');
  if (!fs.existsSync(cfgPath)) return console.error('Missing DemoFromTableBot/bot.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const csvUrl = cfg.csv_url;

  // download published CSV
  const res = await fetch(csvUrl);
  const txt = await res.text();
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return console.error('CSV has no data rows');

  const header = lines[0].split(',');
  const first = lines[1].split(',');

  // Build /start row using template from first
  const startRow = [...first];
  // Replace the command cell with /start and answer to a friendly text
  const cmdIndex = header.findIndex(h => h.trim() === 'command');
  const answerIndex = header.findIndex(h => h.trim() === 'answer');
  const aliasesIndex = header.findIndex(h => h.trim() === 'aliases');
  const helpIndex = header.findIndex(h => h.trim() === 'help');

  if (cmdIndex >= 0) startRow[cmdIndex] = '/start';
  if (answerIndex >= 0) startRow[answerIndex] = 'Welcome! Use /help to see available commands.';
  if (aliasesIndex >= 0) startRow[aliasesIndex] = '';
  if (helpIndex >= 0) startRow[helpIndex] = 'Start the bot';

  // Try remote append
  const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
  const sheetId = process.env.TARGET_SHEET_ID || sheetIdFromSharing(SHARING_LINK);

  if (fs.existsSync(serviceAccountPath)) {
    try {
      console.log('Found service-account.json — attempting remote append to sheet', sheetId);
      const resp = await appendRemoteRow(serviceAccountPath, sheetId, startRow);
      console.log('Remote append response:', resp);
      return;
    } catch (err) {
      console.error('Remote append failed:', err.message || err);
    }
  } else {
    console.log('No service-account.json found — falling back to local append.');
  }

  // Fallback: write local CSV with appended row
  const tmpPath = path.join(process.cwd(), 'DemoFromTableBot', 'commands-from-demo.csv');
  if (!fs.existsSync(tmpPath)) return console.error('Cannot find downloaded CSV at', tmpPath);
  const out = appendLocal(tmpPath, startRow);
  console.log('Wrote local appended CSV to', out);
})();
