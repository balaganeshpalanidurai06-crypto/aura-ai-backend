const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { translate } = require('@vitalets/google-translate-api');
const OpenAI = require('openai');
const Groq = require('groq-sdk');
const sharp = require('sharp');
const SibApiV3Sdk = require('@getbrevo/brevo'); // Updated Brevo Import

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;
const EMAIL_USER = process.env.EMAIL_USER || 'balaganeshpalanidurai06@gmail.com';

// --- BREVO (OTP) INITIALIZATION ---
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// --- AI INITIALIZATION ---
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { 
    'HTTP-Referer': 'http://localhost:5000', 
    'X-Title': 'AURA AI Assistant' 
  }
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- FIREBASE INITIALIZATION ---
// Best Practice: Use Environment Variables for sensitive JSON
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID || "kira-dc450",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL,
  universe_domain: "googleapis.com"
};

if (!admin.apps.length && serviceAccount.private_key) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.apps.length ? admin.firestore() : null;

// --- HELPERS ---
const otpStore = {};
function isTamil(text) { return /[\u0B80-\u0BFF]/.test(text); }
const GROQ_MODELS = ["llama-3.1-8b-instant", "llama3-8b-8192", "gemma2-9b-it", "mixtral-8x7b-32768"];
const VISION_MODELS = ["meta-llama/llama-3.2-11b-vision-instruct:free", "google/gemma-3-12b-it:free"];

// --- API ENDPOINTS ---

// 1. CHAT API
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send("Message required");

  const isTamilInput = isTamil(message);
  let finalMessage = message;
  
  if (isTamilInput) {
    try { const t = await translate(message, { to: 'en' }); finalMessage = t.text; } catch {}
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let hasResponded = false;
  for (const model of GROQ_MODELS) {
    if (hasResponded) break;
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: "You are AURA, a helpful AI assistant." },
          { role: "user", content: finalMessage }
        ],
        model: model,
        stream: true,
      });
      
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) { res.write(content); hasResponded = true; }
      }
      res.end();
      return;
    } catch (err) { console.log(`Groq ${model} failed`); }
  }
  if (!hasResponded) res.end("Service unavailable");
});

// 2. OTP SEND (FIXED BREVO)
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };
  
  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = "AURA AI Verification Code";
    sendSmtpEmail.htmlContent = `<html><body><h1>Your OTP is ${otp}</h1></body></html>`;
    sendSmtpEmail.sender = { name: "AURA AI", email: EMAIL_USER };
    sendSmtpEmail.to = [{ email: email }];

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    res.json({ success: true });
  } catch (err) {
    console.error('Brevo Error:', err);
    res.json({ success: true, devOtp: otp }); // Fallback for dev
  }
});

// 3. OTP VERIFY
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const stored = otpStore[email];
  if (stored && stored.otp === otp && Date.now() < stored.expires) {
    delete otpStore[email];
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Invalid or expired OTP" });
});

// 4. HEALTH CHECK
app.get('/api/health', (req, res) => res.json({ status: "AURA Online" }));

app.listen(PORT, () => console.log(`🚀 AURA Running on ${PORT}`));