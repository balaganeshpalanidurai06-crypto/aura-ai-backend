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

// --- GMAIL SMTP FIX ---
const transporter = nodemailer.createTransport({
  service: 'gmail', // Use service instead of host for better Gmail handling
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { rejectUnauthorized: false }
});

// --- AI INITIALIZATION ---
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { 
    'HTTP-Referer': 'https://aura-ai.vercel.app', 
    'X-Title': 'AURA AI' 
  }
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- FIREBASE ---
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

// --- STORAGE ---
const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

const otpStore = {};
const isTamil = (text) => /[\u0B80-\u0BFF]/.test(text);

// --- ENDPOINTS ---

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
  res.end("AURA is catching its breath. Try again!");
});

// 2. VISION (Switch to more stable free models)
app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image" });
  try {
    const buffer = await sharp(req.file.path).resize(600).jpeg({ quality: 80 }).toBuffer();
    const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    fs.unlinkSync(req.file.path);

    // Using Llama 3.2 Vision and Qwen - Higher success rate on OpenRouter Free
    const visionModels = [
      "meta-llama/llama-3.2-11b-vision-instruct:free",
      "google/gemini-pro-1.5-exp" // Keep as fallback
    ];

    let responseText = "";
    for (const model of visionModels) {
      try {
        const result = await openrouter.chat.completions.create({
          model,
          messages: [{ role: "user", content: [
            { type: "text", text: req.body.question || "Analyze this image" },
            { type: "image_url", image_url: { url: base64 } }
          ]}]
        });
        responseText = result.choices[0].message.content;
        if (responseText) break;
      } catch (e) { console.error(`Vision ${model} failed:`, e.message); }
    }
    res.json({ response: responseText || "I can see it, but my vision circuits are a bit hazy. Try again!" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. OTP (With Response Fallback)
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expires: Date.now() + 600000 };

  try {
    await transporter.sendMail({
      from: `"AURA AI" <${EMAIL_USER}>`,
      to: email,
      subject: 'AURA AI Verification Code',
      html: `<div style="background:#000; color:#4aff9e; padding:20px; text-align:center; border-radius:10px;">
              <h2>Verification Code</h2>
              <h1 style="font-size:40px;">${otp}</h1>
             </div>`
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Mail Error:", err.message);
    // Crucial: Return OTP in JSON so frontend can handle it if mail fails
    res.json({ success: true, otp, dev: true }); 
  }
});

app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (otpStore[email]?.otp === otp) {
    delete otpStore[email];
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Invalid or expired OTP" });
});

app.get('/api/health', (req, res) => res.json({ status: "AURA LIVE", port: PORT }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 AURA Online on ${PORT}`));