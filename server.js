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
const nodemailer = require('nodemailer');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const EMAIL_USER = process.env.EMAIL_USER || 'balaganeshpalanidurai06@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'roazcaeuoyfxmktz';

// --- 📧 GMAIL SMTP (RENDER STABILITY FIX) ---
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { rejectUnauthorized: false },
  family: 4 // ✅ CRITICAL: Forces IPv4 to fix ENETUNREACH on Render
});

// --- 🤖 AI INITIALIZATION ---
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { 
    'HTTP-Referer': 'https://aura-ai.vercel.app', 
    'X-Title': 'AURA AI' 
  }
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- 🔥 FIREBASE ---
const serviceAccount = {
  type: "service_account",
  project_id: "kira-dc450",
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  client_email: "firebase-adminsdk-fbsvc@kira-dc450.iam.gserviceaccount.com",
};

if (!admin.apps.length && serviceAccount.private_key) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.apps.length ? admin.firestore() : null;

// --- 📁 STORAGE ---
const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

const otpStore = {};
const isTamil = (text) => /[\u0B80-\u0BFF]/.test(text);

// --- 🛠️ ENDPOINTS ---

// 1. CHAT (Stable Groq Models)
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send("No message");

  let finalMsg = message;
  if (isTamil(message)) {
    try { const t = await translate(message, { to: 'en' }); finalMsg = t.text; } catch {}
  }

  res.setHeader("Content-Type", "text/event-stream");
  const models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"];

  for (const model of models) {
    try {
      const stream = await groq.chat.completions.create({
        messages: [{ role: "user", content: finalMsg }],
        model, stream: true,
      });
      for await (const chunk of stream) {
        res.write(chunk.choices[0]?.delta?.content || "");
      }
      return res.end();
    } catch (e) { console.error(`Groq ${model} failed`); }
  }
  res.end("AURA system rebooting... Try again.");
});

// 2. 👁️ VISION (OpenRouter Free Model Fallback)
app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image" });
  try {
    const buffer = await sharp(req.file.path).resize(600).jpeg({ quality: 80 }).toBuffer();
    const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    fs.unlinkSync(req.file.path);

    // ✅ Using the most reliable models available for free right now
    const visionModels = [
      "google/gemini-flash-1.5-8b", 
      "mistralai/pixtral-12b:free",
      "google/gemini-pro-1.5-exp"
    ];

    let responseText = "";
    for (const model of visionModels) {
      try {
        console.log(`Trying Vision: ${model}`);
        const result = await openrouter.chat.completions.create({
          model,
          messages: [{ role: "user", content: [
            { type: "text", text: req.body.question || "Identify everything in this image." },
            { type: "image_url", image_url: { url: base64 } }
          ]}]
        });
        responseText = result.choices[0].message.content;
        if (responseText) break;
      } catch (e) { console.error(`${model} down.`); }
    }
    res.json({ response: responseText || "Vision is currently under maintenance." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. 🔑 OTP (IPv4 Fixed)
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expires: Date.now() + 600000 };

  try {
    await transporter.sendMail({
      from: `"AURA AI" <${EMAIL_USER}>`,
      to: email,
      subject: 'AURA AI - Verification',
      html: `<div style="background:#0a0a0a; color:#4aff9e; padding:30px; text-align:center; border:2px solid #4aff9e;">
              <h2>AURA Verification Code</h2>
              <h1 style="font-size:50px; letter-spacing:10px;">${otp}</h1>
             </div>`
    });
    res.json({ success: true, message: "Email sent" });
  } catch (err) {
    console.error("Mail Error:", err.message);
    // ✅ Fallback: Backend returns OTP if email fails so you can still log in
    res.json({ success: true, otp, dev: true, message: "Email failed, see response" }); 
  }
});

app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (otpStore[email]?.otp === otp) {
    delete otpStore[email];
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Invalid OTP" });
});

app.get('/api/health', (req, res) => res.json({ status: "AURA ONLINE" }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AURA Core Online on ${PORT}`));