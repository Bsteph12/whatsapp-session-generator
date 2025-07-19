const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Stockage temporaire des sessions
const activeSessions = new Map();

// Page d'accueil
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Session Generator - STEPHDEV</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                max-width: 400px;
                width: 100%;
                text-align: center;
            }
            
            .logo {
                font-size: 2.5em;
                color: #25D366;
                margin-bottom: 10px;
            }
            
            h1 {
                color: #333;
                margin-bottom: 10px;
                font-size: 1.8em;
            }
            
            .subtitle {
                color: #666;
                margin-bottom: 30px;
                font-size: 0.9em;
            }
            
            .form-group {
                margin-bottom: 20px;
                text-align: left;
            }
            
            label {
                display: block;
                color: #555;
                margin-bottom: 8px;
                font-weight: 500;
            }
            
            input {
                width: 100%;
                padding: 15px;
                border: 2px solid #e0e0e0;
                border-radius: 10px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            
            input:focus {
                outline: none;
                border-color: #25D366;
            }
            
            .btn {
                width: 100%;
                padding: 15px;
                background: #25D366;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.3s;
            }
            
            .btn:hover {
                background: #20b358;
            }
            
            .btn:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            
            .status {
                margin-top: 20px;
                padding: 15px;
                border-radius: 10px;
                text-align: center;
                display: none;
            }
            
            .status.success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            .status.error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            
            .status.info {
                background: #d1ecf1;
                color: #0c5460;
                border: 1px solid #bee5eb;
            }
            
            .code-display {
                font-family: 'Courier New', monospace;
                font-size: 1.5em;
                font-weight: bold;
                color: #25D366;
                background: #f8f9fa;
                padding: 15px;
                border-radius: 10px;
                margin: 15px 0;
                letter-spacing: 2px;
            }
            
            .instructions {
                background: #fff3cd;
                color: #856404;
                padding: 15px;
                border-radius: 10px;
                margin-top: 15px;
                text-align: left;
                font-size: 0.9em;
            }
            
            .step {
                margin-bottom: 8px;
            }
            
            .download-link {
                display: inline-block;
                margin-top: 15px;
                padding: 10px 20px;
                background: #007bff;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                transition: background 0.3s;
            }
            
            .download-link:hover {
                background: #0056b3;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">📱</div>
            <h1>Session Generator</h1>
            <p class="subtitle">Générateur de session WhatsApp - STEPHDEV</p>
            
            <form id="sessionForm">
                <div class="form-group">
                    <label for="phoneNumber">Numéro de téléphone WhatsApp:</label>
                    <input 
                        type="tel" 
                        id="phoneNumber" 
                        placeholder="ex: 22898133388" 
                        required
                    >
                    <small style="color: #666; font-size: 0.8em;">Format international sans le +</small>
                </div>
                
                <button type="submit" class="btn" id="generateBtn">
                    Générer la session
                </button>
            </form>
            
            <div id="status" class="status"></div>
        </div>

        <script>
            const form = document.getElementById('sessionForm');
            const statusDiv = document.getElementById('status');
            const generateBtn = document.getElementById('generateBtn');
            
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const phoneNumber = document.getElementById('phoneNumber').value.trim();
                
                if (!phoneNumber) {
                    showStatus('error', 'Veuillez entrer un numéro de téléphone valide');
                    return;
                }
                
                generateBtn.disabled = true;
                generateBtn.textContent = 'Génération en cours...';
                
                try {
                    const response = await fetch('/generate-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ phoneNumber })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showPairingCode(data.pairingCode, data.sessionId);
                        checkSessionStatus(data.sessionId);
                    } else {
                        showStatus('error', data.message || 'Erreur lors de la génération');
                    }
                } catch (error) {
                    showStatus('error', 'Erreur de connexion au serveur');
                } finally {
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Générer la session';
                }
            });
            
            function showStatus(type, message) {
                statusDiv.className = \`status \${type}\`;
                statusDiv.innerHTML = message;
                statusDiv.style.display = 'block';
            }
            
            function showPairingCode(code, sessionId) {
                const instructions = \`
                    <div class="code-display">STEPHDEV</div>
                    <div class="instructions">
                        <div class="step">1️⃣ Ouvrez WhatsApp sur votre téléphone</div>
                        <div class="step">2️⃣ Allez dans <strong>Paramètres > Appareils liés</strong></div>
                        <div class="step">3️⃣ Appuyez sur <strong>Lier un appareil</strong></div>
                        <div class="step">4️⃣ Entrez le code: <strong>STEPHDEV</strong></div>
                        <div class="step">5️⃣ Attendez la confirmation...</div>
                    </div>
                \`;
                
                showStatus('info', \`
                    <strong>Code de pairage généré !</strong><br><br>
                    \${instructions}
                    <div id="sessionStatus">⏳ En attente de la connexion...</div>
                \`);
            }
            
            function checkSessionStatus(sessionId) {
                const interval = setInterval(async () => {
                    try {
                        const response = await fetch(\`/session-status/\${sessionId}\`);
                        const data = await response.json();
                        
                        const statusElement = document.getElementById('sessionStatus');
                        
                        if (data.connected) {
                            clearInterval(interval);
                            statusElement.innerHTML = \`
                                ✅ <strong>Connexion réussie !</strong><br><br>
                                <a href="/download/\${sessionId}" class="download-link" download="creds.json">
                                    📥 Télécharger creds.json
                                </a>
                                <div style="margin-top: 10px; font-size: 0.8em; color: #666;">
                                    Copiez ce fichier dans votre dossier de déploiement
                                </div>
                            \`;
                        } else if (data.error) {
                            clearInterval(interval);
                            statusElement.innerHTML = \`❌ Erreur: \${data.error}\`;
                        }
                    } catch (error) {
                        console.error('Erreur lors de la vérification du statut:', error);
                    }
                }, 2000);
                
                // Timeout après 5 minutes
                setTimeout(() => {
                    clearInterval(interval);
                    const statusElement = document.getElementById('sessionStatus');
                    if (statusElement && statusElement.innerHTML.includes('⏳')) {
                        statusElement.innerHTML = '⏰ Timeout - Veuillez réessayer';
                    }
                }, 300000);
            }
        </script>
    </body>
    </html>
  `);
});

// Endpoint pour générer une session
app.post('/generate-session', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.json({ success: false, message: 'Numéro de téléphone requis' });
    }
    
    const sessionId = Date.now().toString();
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    
    // Créer le dossier de session
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['STEPHDEV Bot', 'Chrome', '20.0.04'],
      logger: pino({ level: 'silent' })
    });
    
    // Stocker la session
    activeSessions.set(sessionId, {
      sock,
      connected: false,
      error: null,
      phoneNumber,
      sessionPath
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    // Gestion des événements de connexion
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      const session = activeSessions.get(sessionId);
      
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          session.error = 'Déconnecté de WhatsApp';
        } else {
          session.error = 'Connexion fermée';
        }
        activeSessions.set(sessionId, session);
      } else if (connection === 'open') {
        session.connected = true;
        activeSessions.set(sessionId, session);
        console.log(`✅ Session ${sessionId} connectée pour ${phoneNumber}`);
      }
    });
    
    // Demander le code de pairage avec "STEPHDEV"
    if (!sock.authState.creds.registered) {
      try {
        // On force le code à être "STEPHDEV" 
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`📱 Code de pairage pour ${phoneNumber}: STEPHDEV`);
        
        res.json({
          success: true,
          pairingCode: 'STEPHDEV',
          sessionId: sessionId,
          message: 'Code de pairage généré avec succès'
        });
      } catch (error) {
        console.error('Erreur lors du pairing:', error);
        res.json({
          success: false,
          message: 'Erreur lors de la génération du code de pairage'
        });
      }
    } else {
      res.json({
        success: false,
        message: 'Appareil déjà enregistré'
      });
    }
    
  } catch (error) {
    console.error('Erreur serveur:', error);
    res.json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// Vérifier le statut d'une session
app.get('/session-status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.json({ error: 'Session non trouvée' });
  }
  
  res.json({
    connected: session.connected,
    error: session.error
  });
});

// Télécharger le fichier creds.json
app.get('/download/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session || !session.connected) {
    return res.status(404).json({ error: 'Session non trouvée ou non connectée' });
  }
  
  const credsPath = path.join(session.sessionPath, 'creds.json');
  
  if (!fs.existsSync(credsPath)) {
    return res.status(404).json({ error: 'Fichier creds.json non trouvé' });
  }
  
  res.setHeader('Content-Disposition', 'attachment; filename="creds.json"');
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(credsPath);
  
  // Nettoyer la session après téléchargement
  setTimeout(() => {
    try {
      if (session.sock) {
        session.sock.end();
      }
      if (fs.existsSync(session.sessionPath)) {
        fs.rmSync(session.sessionPath, { recursive: true, force: true });
      }
      activeSessions.delete(sessionId);
      console.log(`🧹 Session ${sessionId} nettoyée`);
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
    }
  }, 5000);
});

// Nettoyage automatique des sessions expirées (toutes les 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    const sessionAge = now - parseInt(sessionId);
    
    // Supprimer les sessions de plus de 10 minutes
    if (sessionAge > 600000) {
      try {
        if (session.sock) {
          session.sock.end();
        }
        if (fs.existsSync(session.sessionPath)) {
          fs.rmSync(session.sessionPath, { recursive: true, force: true });
        }
        activeSessions.delete(sessionId);
        console.log(`🧹 Session expirée ${sessionId} supprimée`);
      } catch (error) {
        console.error('Erreur lors du nettoyage automatique:', error);
      }
    }
  }
}, 600000);

// Créer le dossier sessions s'il n'existe pas
if (!fs.existsSync(path.join(__dirname, 'sessions'))) {
  fs.mkdirSync(path.join(__dirname, 'sessions'), { recursive: true });
}

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 Accédez à votre application sur: http://localhost:${PORT}`);
});
