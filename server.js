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

const EMAIL_USER = process.env.EMAIL_USER || 'balaganeshpalanidurai06@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'roazcaeuoyfxmktz';
// ✅ UPDATED: New OpenRouter API key (change this to your new key)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'sk-or-v1-YOUR_NEW_OPENROUTER_KEY_HERE';
const PORT = process.env.PORT || 5000;

// ✅ Gmail SMTP with port 465 (SSL) + IPv4 fix
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  },
  tls: { rejectUnauthorized: false },
  family: 4  // ✅ Force IPv4 - Fixes ENETUNREACH error
});

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email config error:', error.message);
    console.log('📝 OTPs will be logged to console instead');
  } else {
    console.log('✅ Gmail SMTP ready (port 465, IPv4)');
  }
});

const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    'HTTP-Referer': 'https://aura-ai.vercel.app',
    'X-Title': 'AURA AI Assistant'
  }
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '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' });

const app = express();
app.use(cors());
app.use(express.json());

const otpStore = {};

// Upload setup
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only images allowed!'));
  }
});

// ✅ Firebase config - UNCHANGED (keep as is)
const serviceAccount = {
  "type": "service_account",
  "project_id": "kira-dc450",
  "private_key_id": "82f083c8d14cac912be73e93940578a98e465941",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDE7S2eSg1qmQRq\nJoilKFpVGLBuf2hbeYz4RyagoT5SYQK4r+FjuFVhOaF9WH3b4m9EbwkHxpH7DM1w\neKyOr1P/3I312/+JJZSH8ak56aRZB9R3XjV6yF1tkhZLM1aoM13OlgQYiF/vGz5R\nWpj0keMTf4V2cmCSsN4rfyAtAp2x3TYmoBCRCTc0f14KC/VjqVmNAPnWC6hBuaMs\nmC0p+KAZLkxhUBmWLI/6YFLJ1tII414w/IOBMjwKEmh71sTeQIv6bH3JSWa+R3v+\nCvVy4w9aWE4TtK7sx9Lc54QwgG6bw+rLb8+4UXct17Qn1xd9jgJjdE7CnvPL1Rze\n3Cx8LJj9AgMBAAECggEAHaED5peEuj+omuIOWC8gnEIZNZ7k0DKTI73s0WlBS7q9\n4pTP6CWRbw3xPr9EPIOusxCzvqBBUZEFDgGSEOvPSyVflJjTs0pctTGGgSimqiCT\n9pvNlxozeGttAEaKqMcFu7H1js1iBcNHFo13iwCyNjpPFdmyrw9+dfPsHumQWXTH\nkM9MQHgUO+5VdJPnMgqj1rGIXZCbP2K0cmu/b1tWV3A2DcEvi4jMu8PQ1AVmkDtV\nkToJIMcchR0shSY291Mbl0SnxrwbKQ7u/wDFOzTpY373uBPCdrVpAV3gkF2I+PZc\nUVKMQcOrEkRf1b8uWEQHoCW6atMEt+b/boiDV0X/0QKBgQD71l18nBPmClcqe9kC\n2euhgFewhGkonuSOtbMbJkB7X2YJYXRke7iNp0Dt6vY6sJxFHm56+PMZMnRv/7Ab\nRnxXQwrCOAy6oaKjdw42oXJX0QUToA2CiUN1ODlXyGujPzqS8Ewejg37gpo/CUsK\nDpq/lFHmyQCW/xzZIsgxvyXiCQKBgQDILnX7QOBE+aUbvMqzw1EEuFboKni3ov1G\nEytGnHXvTSe5jnz6BvWoP0yaz675rFHnRoPzZ2Khs1fHRzvo1e5RmjubKAqUvd3Y\nJwmDP567f4CNfZjarHK0uehRSuJapZKKHTDQWbzFBtYFhI1SfoE86T4/uCgai9kB\n14WAl4csVQKBgAZMUyQ1pw2+vnVSiZfXqVvtoMPKW/LnHmIvSx5ns38iYKPlawrE\nSVZJk4cftC69kfrsiujKZxH/QAg5Bcd42M054QAAdNkKB848wP8+xGRL1uupugzE\nsAozcMOwQHjhsO5R0iWFefYLSx4+dkD3IomeBPpXloswMCGCDC2qUSE5AoGAebDE\nyBiIPWYFmPcLwnvZpKTrL/ehqwDKNu8wP5ydlPuySnr0Poo8jCruxq26EM1QfOfB\nDxaqPuJnWh1Trhde6Px5f7i3tfQ2CFCy17a1KAY6f8j6QvTSRks9jy2WrMQ6cPuN\n0Rq8RooBURljT+LXbc/cp5+rwXeCVDxQS/vRkIECgYEAoVRlV9abm35QPORENiLS\njlaUcuAFwXAMOvUBcPyH38lJUMExenx581BRuJAm+y9rj7MtUiBYPESRT3s1W3OM\nAFnTqSiUt2mgLSjk9mXhbceX32qpoL1Eh/pC/iGj9oQl/ZssK+ira3Ag8oYX6dQm\n5JvTPLqL/IGuAM9fImbNjyA=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@kira-dc450.iam.gserviceaccount.com",
  "client_id": "105977211556098130408",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40kira-dc450.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function isTamil(text) { return /[\u0B80-\u0BFF]/.test(text); }

const GROQ_MODELS = ["llama-3.1-8b-instant", "llama3-8b-8192", "gemma2-9b-it", "mixtral-8x7b-32768"];

// ✅ Working vision models
const VISION_MODELS = [
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen-2-vl-7b-instruct:free"
];

// CHAT API
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
          { role: "system", content: "You are AURA, a helpful and friendly AI assistant. Keep responses concise and natural." },
          { role: "user", content: finalMessage }
        ],
        model, stream: true,
      });
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) { res.write(content); hasResponded = true; }
      }
      res.end(); return;
    } catch (err) { console.log(`Groq ${model} failed: ${err.message}`); }
  }
  if (!hasResponded) {
    res.write(isTamilInput ? "மன்னிக்கவும், சேவை தற்போது இல்லை." : "Sorry, AI service is temporarily unavailable.");
    res.end();
  }
});

// VISION API
app.post('/api/vision', upload.single('image'), async (req, res) => {
  const { question } = req.body;
  const imageFile = req.file;
  if (!imageFile) return res.status(400).json({ error: "No image uploaded" });

  try {
    const resizedImageBuffer = await sharp(imageFile.path)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const base64Image = `data:image/jpeg;base64,${resizedImageBuffer.toString('base64')}`;
    const prompt = question || "Describe this image in detail. What do you see?";
    let visionResponse = null;

    fs.unlinkSync(imageFile.path);

    for (const model of VISION_MODELS) {
      try {
        console.log(`🖼️ Trying vision model: ${model}`);
        const response = await openrouter.chat.completions.create({
          model,
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: base64Image } }] }]
        });
        visionResponse = response.choices[0].message.content;
        console.log(`✅ Vision success with: ${model}`);
        break;
      } catch (err) { console.log(`❌ Vision ${model} failed: ${err.message}`); }
    }

    if (!visionResponse) {
      visionResponse = "I can see the image you uploaded. However, I'm having trouble analyzing it in detail right now. Please try again or ask a specific question about the image.";
    }

    if (isTamil(prompt)) {
      try { const t = await translate(visionResponse, { to: 'ta' }); return res.json({ response: t.text }); } catch {}
    }
    res.json({ response: visionResponse });

  } catch (error) {
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    console.error('❌ Vision error:', error);
    res.status(500).json({ error: "Failed to analyze image. Please try again." });
  }
});

// ✅ OTP ENDPOINT - Always return OTP in response
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };

  console.log(`📧 OTP for ${email}: ${otp}`);

  let emailSent = false;
  try {
    await transporter.sendMail({
      from: `"AURA AI" <${EMAIL_USER}>`,
      to: email,
      subject: 'AURA AI — Your Verification Code',
      html: `<div style="font-family:'Segoe UI',sans-serif;max-width:420px;margin:auto;padding:32px;background:#0d1117;border-radius:16px;border:1px solid #1a2a1a;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:28px;font-weight:900;letter-spacing:3px;color:#4aff9e;">AURA</span>
          <div style="font-size:10px;color:#666;letter-spacing:2px;margin-top:2px;">ADVANCED ROBOTIC ASSISTANT</div>
        </div>
        <p style="color:#ccc;font-size:14px;margin-bottom:8px;">Your verification code:</p>
        <div style="font-size:42px;font-weight:900;color:#4aff9e;letter-spacing:12px;text-align:center;padding:20px 0;border:1px solid #4aff9e33;border-radius:12px;background:#0a1a0a;">${otp}</div>
        <p style="color:#666;font-size:12px;margin-top:20px;text-align:center;">Valid for <strong style="color:#4aff9e;">10 minutes</strong>. Do not share this code with anyone.</p>
      </div>`
    });
    emailSent = true;
    console.log(`✅ Email sent to ${email}`);
  } catch (err) {
    console.error('❌ Email error:', err.message);
  }

  res.json({ 
    success: true, 
    otp: otp,
    emailSent: emailSent,
    message: emailSent ? 'OTP sent to your email' : 'Check console for OTP'
  });
});

app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
  const stored = otpStore[email];
  if (!stored) return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
  if (Date.now() > stored.expires) { delete otpStore[email]; return res.status(400).json({ error: 'OTP expired. Please request a new one.' }); }
  if (stored.otp !== otp.trim()) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
  delete otpStore[email];
  res.json({ success: true });
});

// PER-USER HISTORY
app.get('/api/all-history', async (req, res) => {
  try {
    const { email } = req.query;
    console.log('📜 History request for email:', email);
    if (!email || email === 'guest') return res.json([]);
    const snapshot = await db.collection('all_history').where('userEmail', '==', email).get();
    const history = [];
    snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    console.log(`✅ Found ${history.length} records for ${email}`);
    res.json(history.slice(0, 100));
  } catch (err) { console.error('History fetch error:', err); res.json([]); }
});

app.post('/api/save-history', async (req, res) => {
  try {
    const { type, question, answer, sessionId, userEmail } = req.body;
    if (!userEmail || userEmail === 'guest') return res.json({ success: true });
    const now = new Date();
    const docRef = await db.collection('all_history').add({
      type, question, answer, sessionId: sessionId || null, userEmail,
      timestamp: now.toISOString(), formattedTime: now.toLocaleString(), createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`💾 Saved ${type} for ${userEmail}`);
    res.json({ id: docRef.id, success: true });
  } catch (err) { console.error('Save error:', err); res.status(500).json({ error: err.message }); }
});

app.delete('/api/history/:id', async (req, res) => {
  try { await db.collection('all_history').doc(req.params.id).delete(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/voice-history', async (req, res) => {
  try {
    const snapshot = await db.collection('all_history').where('type','==','voice').orderBy('timestamp','desc').limit(50).get();
    const history = []; snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/save-voice', async (req, res) => {
  try {
    const { question, answer, userEmail } = req.body; const now = new Date();
    const docRef = await db.collection('all_history').add({ type:'voice', question, answer, userEmail: userEmail||'guest', timestamp:now.toISOString(), formattedTime:now.toLocaleString(), createdAt:admin.firestore.FieldValue.serverTimestamp() });
    res.json({ id: docRef.id, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/voice-history/:id', async (req, res) => {
  try { await db.collection('all_history').doc(req.params.id).delete(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat-history', async (req, res) => {
  try {
    const snapshot = await db.collection('all_history').where('type','==','chat').orderBy('timestamp','desc').limit(50).get();
    const history = []; snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/save-chat', async (req, res) => {
  try {
    const { question, answer, userEmail } = req.body; const now = new Date();
    const docRef = await db.collection('all_history').add({ type:'chat', question, answer, userEmail: userEmail||'guest', timestamp:now.toISOString(), formattedTime:now.toLocaleString(), createdAt:admin.firestore.FieldValue.serverTimestamp() });
    res.json({ id: docRef.id, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/chat-history/:id', async (req, res) => {
  try { await db.collection('all_history').doc(req.params.id).delete(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history', async (req, res) => {
  try {
    const snapshot = await db.collection('all_history').orderBy('timestamp','desc').limit(20).get();
    const history = []; snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/start-session', async (req, res) => {
  try {
    const { userEmail } = req.body; const now = new Date();
    const docRef = await db.collection('all_history').add({ type:'voice', startTime:now.toLocaleString(), startTimestamp:now.getTime(), endTime:null, duration:null, userText:"", userEmail: userEmail||'guest', timestamp:now.toISOString(), createdAt:admin.firestore.FieldValue.serverTimestamp() });
    res.json({ id: docRef.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/end-session', async (req, res) => {
  try {
    const { id, message } = req.body; const now = new Date();
    const docRef = db.collection('all_history').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).send("Not found");
    const diff = now.getTime() - doc.data().startTimestamp;
    await docRef.update({ endTime:now.toLocaleString(), duration:`${Math.floor(diff/60000)}m ${Math.floor((diff%60000)/1000)}s`, userText:message });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/delete/:id', async (req, res) => {
  try { await db.collection('all_history').doc(req.params.id).delete(); res.json({ status: "deleted" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'AURA AI Backend running!' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AURA Server on Port ${PORT}`);
  console.log(`📧 Email configured with IPv4 fix`);
  console.log(`👁️ Vision API ready`);
  console.log(`🔥 Firebase connected: kira-dc450\n`);
});