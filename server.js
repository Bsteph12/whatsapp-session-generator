const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store des sessions actives
const activeSessions = new Map();

// Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour démarrer le processus de pairage
app.post('/start-pairing', async (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber || phoneNumber.length < 8) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide' });
  }

  const sessionId = Date.now().toString();
  
  try {
    const { version } = await fetchLatestBaileysVersion();
    const sessionPath = `./temp_sessions/${sessionId}`;
    
    // Créer le dossier de session temporaire
    if (!fs.existsSync('./temp_sessions')) {
      fs.mkdirSync('./temp_sessions', { recursive: true });
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Chrome', 'Ubuntu', '20.0.04'],
      logger: pino({ level: 'silent' })
    });

    // Stocker la session
    activeSessions.set(sessionId, {
      sock,
      saveCreds,
      phoneNumber,
      sessionPath,
      connected: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const session = activeSessions.get(sessionId);
      
      if (connection === 'open' && session) {
        console.log(`✅ Session ${sessionId} connectée pour ${phoneNumber}`);
        session.connected = true;
        
        // Envoyer le fichier creds.json via WhatsApp
        await sendCredsFile(sock, phoneNumber, sessionPath);
        
        // Nettoyer après envoi
        setTimeout(() => {
          cleanupSession(sessionId);
        }, 10000);
        
        io.emit('connection-success', { sessionId });
        
      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          io.emit('connection-error', { sessionId, error: 'Déconnecté' });
        }
        cleanupSession(sessionId);
      }
    });

    // Générer le code de pairage
    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(phoneNumber);
      const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
      
      res.json({ 
        success: true, 
        sessionId, 
        pairingCode: formattedCode 
      });
    } else {
      res.status(400).json({ error: 'Numéro déjà enregistré' });
    }

  } catch (error) {
    console.error('Erreur lors du pairage:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du code' });
  }
});

async function sendCredsFile(sock, phoneNumber, sessionPath) {
  try {
    const credsPath = path.join(sessionPath, 'creds.json');
    
    if (fs.existsSync(credsPath)) {
      const credsContent = fs.readFileSync(credsPath);
      
      // Envoyer le fichier via WhatsApp
      await sock.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
        document: credsContent,
        fileName: 'creds.json',
        mimetype: 'application/json',
        caption: '🤖 *Configuration de votre Bot WhatsApp*\n\n' +
                '📁 Téléchargez ce fichier `creds.json`\n' +
                '📂 Placez-le dans le dossier `session/` de votre bot\n' +
                '🚀 Lancez votre bot avec `node index.js`\n\n' +
                '⚠️ *Important:* Gardez ce fichier secret et ne le partagez jamais!'
      });

      console.log(`📤 Fichier creds.json envoyé à ${phoneNumber}`);
    }
  } catch (error) {
    console.error('Erreur envoi fichier:', error);
  }
}

function cleanupSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    try {
      session.sock?.end();
      // Supprimer le dossier de session temporaire
      if (fs.existsSync(session.sessionPath)) {
        fs.rmSync(session.sessionPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Erreur nettoyage session:', error);
    }
    activeSessions.delete(sessionId);
  }
}

// Nettoyer les sessions orphelines toutes les 5 minutes
setInterval(() => {
  for (const [sessionId, session] of activeSessions.entries()) {
    if (!session.connected && Date.now() - parseInt(sessionId) > 300000) { // 5 min
      cleanupSession(sessionId);
    }
  }
}, 300000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Serveur démarré sur le port ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
});
