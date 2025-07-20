const express = require('express');
const cors = require('cors');
const fs = require('fs');
const pino = require('pino');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const SESSIONS_DIR = './sessions';
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

app.post('/api/pair', async (req, res) => {
  const number = req.body.number;
  if (!number) return res.status(400).json({ error: 'Numéro requis' });

  const sessionId = `session-${Date.now()}`;
  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Render', 'Chrome', '1.0'],
    printQRInTerminal: false,
  });
  sock.ev.on('creds.update', saveCreds);

  try {
    let code = await sock.requestPairingCode(number);
    code = code.match(/.{1,4}/g).join('-');
    return res.json({ code, sessionId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur de pairing' });
  }
});

app.get('/api/download/:sessionId', (req, res) => {
  const credsPath = path.join(SESSIONS_DIR, req.params.sessionId, 'creds.json');
  if (!fs.existsSync(credsPath)) return res.status(404).json({ error: 'Session introuvable' });
  res.download(credsPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend prêt sur :${PORT}`));
