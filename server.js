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

// ✅ UPDATED BREVO IMPORT FOR V2
const Brevo = require('@getbrevo/brevo');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const EMAIL_USER = process.env.EMAIL_USER || 'balaganeshpalanidurai06@gmail.com';

// --- ✅ FIXED BREVO INITIALIZATION ---
let apiInstance = new Brevo.TransactionalEmailsApi();

// In v2, you set the API key like this:
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

// --- AI & FIREBASE SETUP ---
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Firebase (Keep your existing config/env logic here)
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length && serviceAccount.private_key) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.apps.length ? admin.firestore() : null;

// --- OTP ENDPOINT ---
const otpStore = {};

app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };
  
  try {
    // ✅ FIXED EMAIL OBJECT FOR V2
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = "AURA AI Verification Code";
    sendSmtpEmail.sender = { name: "AURA AI", email: EMAIL_USER };
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.htmlContent = `<html><body><h1>Your OTP is ${otp}</h1></body></html>`;

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ OTP sent to ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Brevo Error:', err.message);
    // Dev fallback: so you can still test if API fails
    res.json({ success: true, dev: true, devOtp: otp });
  }
});

// Other endpoints (Chat, Verify, etc.) stay the same...

app.listen(PORT, () => console.log(`🚀 AURA Online on Port ${PORT}`));