// 1. SERVEUR WEB (pour l'interface de génération de codes)
// Ce fichier doit être votre point d'entrée sur Render

const express = require('express');
const fs = require('fs');
const path = require('path');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 10000;

// Store pour les codes de pairage en mémoire
let pairingCodes = {};
let activeSockets = {};

app.use(express.json());
app.use(express.static('public'));

// Route pour l'interface web
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Générateur de Code WhatsApp</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .phone-input {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e5e9;
            border-radius: 10px;
            font-size: 18px;
            margin: 20px 0;
            text-align: center;
        }
        .generate-btn {
            background: linear-gradient(45deg, #25D366, #128C7E);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
            width: 100%;
            transition: transform 0.2s;
        }
        .generate-btn:hover { transform: translateY(-2px); }
        .code-display {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border: 2px solid #25D366;
        }
        .pairing-code {
            font-size: 24px;
            font-weight: bold;
            color: #25D366;
            letter-spacing: 2px;
        }
        .instructions {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
            text-align: left;
        }
        .step { margin: 10px 0; }
        .status { margin: 20px 0; padding: 10px; border-radius: 5px; }
        .loading { background: #fff3cd; color: #856404; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔗 Générateur de Code WhatsApp</h1>
        <p>Entrez votre numéro pour générer un code de pairage</p>
        
        <input type="text" id="phoneInput" class="phone-input" placeholder="237698711207" maxlength="15">
        <small style="color: #666;">Format international sans le +</small>
        
        <button onclick="generateCode()" class="generate-btn">Générer la session</button>
        
        <div id="status" class="status" style="display: none;"></div>
        
        <div id="codeSection" style="display: none;">
            <div class="code-display">
                <h3>Code de pairage généré !</h3>
                <div class="pairing-code" id="pairingCode">XXXX-XXXX</div>
            </div>
            
            <div class="instructions">
                <div class="step">📱 <strong>1</strong> Ouvrez WhatsApp sur votre téléphone</div>
                <div class="step">⚙️ <strong>2</strong> Allez dans Paramètres → Appareils liés</div>
                <div class="step">🔗 <strong>3</strong> Appuyez sur "Lier un appareil"</div>
                <div class="step">🔢 <strong>4</strong> Entrez le code: <strong id="codeRepeat">XXXX-XXXX</strong></div>
                <div class="step">⏳ <strong>5</strong> Attendez la confirmation...</div>
            </div>
        </div>
    </div>

    <script>
        async function generateCode() {
            const phone = document.getElementById('phoneInput').value.trim();
            const status = document.getElementById('status');
            const codeSection = document.getElementById('codeSection');
            
            if (!phone || phone.length < 10) {
                showStatus('Veuillez entrer un numéro valide', 'error');
                return;
            }
            
            showStatus('Génération du code en cours...', 'loading');
            codeSection.style.display = 'none';
            
            try {
                const response = await fetch('/generate-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('pairingCode').textContent = data.code;
                    document.getElementById('codeRepeat').textContent = data.code;
                    codeSection.style.display = 'block';
                    showStatus('Code généré avec succès !', 'success');
                    
                    // Vérifier le statut de connexion
                    checkConnectionStatus(phone);
                } else {
                    showStatus('Erreur: ' + data.error, 'error');
                }
            } catch (err) {
                showStatus('Erreur de connexion au serveur', 'error');
            }
        }
        
        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }
        
        async function checkConnectionStatus(phone) {
            // Vérifier toutes les 5 secondes si la connexion est établie
            const interval = setInterval(async () => {
                try {
                    const response = await fetch('/check-status/' + phone);
                    const data = await response.json();
                    
                    if (data.connected) {
                        showStatus('✅ Connecté avec succès !', 'success');
                        clearInterval(interval);
                    } else if (data.error) {
                        showStatus('❌ ' + data.error, 'error');
                        clearInterval(interval);
                    }
                } catch (err) {
                    console.log('Erreur lors de la vérification:', err);
                }
            }, 5000);
            
            // Arrêter la vérification après 5 minutes
            setTimeout(() => clearInterval(interval), 300000);
        }
    </script>
</body>
</html>
  `);
});

// API pour générer un code de pairage
app.post('/generate-code', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.json({ success: false, error: 'Numéro requis' });
    }
    
    console.log(`🔄 Génération du code pour ${phone}`);
    
    // Nettoyer les anciennes sessions si elles existent
    if (activeSockets[phone]) {
      try {
        activeSockets[phone].end();
        delete activeSockets[phone];
      } catch (e) {}
    }
    
    const sessionPath = `./session_${phone}`;
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      logger: pino({ level: 'silent' })
    });
    
    activeSockets[phone] = sock;
    sock.ev.on('creds.update', saveCreds);
    
    // Gérer les événements de connexion
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'open') {
        console.log(`✅ ${phone} connecté`);
        pairingCodes[phone] = { ...pairingCodes[phone], connected: true };
        
        // Envoyer le fichier creds.json via WhatsApp
        sendCredsFile(sock, phone, sessionPath);
        
      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log(`📵 ${phone} déconnecté, code ${code}`);
        
        if (code === DisconnectReason.loggedOut) {
          pairingCodes[phone] = { ...pairingCodes[phone], error: 'Déconnecté' };
          delete activeSockets[phone];
        }
      }
    });
    
    // Générer le code de pairage
    if (!sock.authState.creds.registered) {
      try {
        let code = await sock.requestPairingCode(phone);
        code = code.match(/.{1,4}/g).join("-");
        
        console.log(`🔗 Code généré pour ${phone}: ${code}`);
        
        pairingCodes[phone] = {
          code,
          generated: new Date(),
          connected: false
        };
        
        res.json({ success: true, code });
      } catch (err) {
        console.error(`❌ Erreur pairing ${phone}:`, err.message);
        res.json({ success: false, error: err.message });
      }
    } else {
      res.json({ success: false, error: 'Déjà connecté' });
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error);
    res.json({ success: false, error: error.message });
  }
});

// API pour vérifier le statut de connexion
app.get('/check-status/:phone', (req, res) => {
  const { phone } = req.params;
  const status = pairingCodes[phone] || {};
  
  res.json({
    connected: status.connected || false,
    error: status.error || null,
    hasCode: !!status.code
  });
});

// Fonction pour envoyer le fichier creds.json
async function sendCredsFile(sock, phone, sessionPath) {
  try {
    console.log(`📤 Envoi du fichier creds.json à ${phone}`);
    
    const credsPath = path.join(sessionPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const credsBuffer = fs.readFileSync(credsPath);
      
      await sock.sendMessage(phone + '@s.whatsapp.net', {
        document: credsBuffer,
        fileName: 'creds.json',
        mimetype: 'application/json',
        caption: '✅ *Fichier de session généré !*\n\n📁 Téléchargez ce fichier et placez-le dans le dossier `session` de votre déploiement.\n\n⚠️ *Important :* Gardez ce fichier secret !'
      });
      
      console.log(`✅ Fichier creds.json envoyé à ${phone}`);
    }
  } catch (error) {
    console.error(`❌ Erreur envoi fichier ${phone}:`, error);
  }
}

// Nettoyer les anciennes sessions au démarrage
function cleanupOldSessions() {
  console.log('🧹 Nettoyage des anciennes sessions...');
  
  fs.readdirSync('./')
    .filter(dir => dir.startsWith('session_'))
    .forEach(dir => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`🗑️ Session ${dir} supprimée`);
      } catch (e) {
        console.log(`⚠️ Impossible de supprimer ${dir}`);
      }
    });
}

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 Interface disponible sur: http://localhost:${PORT}`);
  cleanupOldSessions();
});
