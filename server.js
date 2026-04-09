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
const EMAIL_PASS = process.env.EMAIL_PASS || 'oyuyeeociyboheqw';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const PORT = process.env.PORT || 5000;

// ✅ Nodemailer with port 465 (SSL) - Works on Render
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

// Verify email connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email config error:', error.message);
  } else {
    console.log('✅ Email ready to send OTPs via Gmail');
  }
});

const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { 'HTTP-Referer': 'http://localhost:5000', 'X-Title': 'AURA AI Assistant' }
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

// Firebase config
const serviceAccount = {
  "type": "service_account",
  "project_id": "kira-dc450",
  "private_key_id": "82f083c8d14cac912be73e93940578a98e465941",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCzs6oPO62Iraco\niKfWXZZAkQb/vp1qDgCtqJHjIRgGbHGDFSF0zW/lNf70fF7dLMTLWkXa93A9JZBq\nO6X7aIPVFQ+hxbxd3r9weYJr+ipmLk4GYqhZZYE4q/nQClIhfq/MNlPuxwhp1xQ+\njGR+/xPw/F70FnvOT+0Q6LV/3K0QlS3aN3LQSZh3TKhzUK0rC9PJScj2z+ZQM5K1\ntO5/oG3yJs1e1ynr5CRiUo4m5ZoOLdMEYIwGqrU8Wq+D0zEj0MNFGKKBNHtnFoMy\nXbGQl701mZovmNbQtkIciwhnrOvA38XmrFAKKhEFk5VBYH+3cqSVyAY+SfbA0RHl\nLz+nXB/fAgMBAAECggEAOXAWTbsp+vNiaArR9qtAMNAKOClhoDnsjpVAWCRGTRtR\nZvAUmwRlHRLWtKeiHLjICCWJCXWoeursT4BUS9j6tlt+fRs6W5isgRNdlAzIi5OG\nXfUf0T8oAAi8FvqNiOY446GDz2DvuADGmD2Ai7UVVyQbZ5JeLTIP2KVBCibrbE5x\nLGRzjfBgZh9DZSD1D6yM2TViItK/bRD9Fz3iy+HZtLZlKUwP1oMZcraQYEDEW3F2\nfogjMZGaEU1yo61xR/Raks2JvZSLopMXxOWnIZNrgsus5kGwnfqIGCi3s+76Ihtw\ndKyJoEJeBhRkmUJYMOuND6kOpict3uS3Y1yajr3fDQKBgQDhMciaWeEnnTNHdMwN\n5PhZSMqa4PBBDboC6Ak2YITv6TgznzIX0SccP/mqBuJf5M83IH0er7MQ5dMAn+b8\nG5nWudKl1PYqNcetNO4hXF/8z0xRNzoI05RYSbqK+RdPw8+wRsJ1jYsbSQ2eUXQp\nhl7E9+LtzKE7EFzwlwrjYGtEVQKBgQDMSL82MWvNuDVPUVwvwugLckAXQpkPWLlq\nKOnLpC4tXPTb+maZ7ZUcvbmpiJehxNdx9CvaLwzDqvPjjJiomfw+kEU6kJVwMJWJ\nVW2bitPcpumFu+ZLbGKBuPHeBm9CSP9PcnOLTAlMOBwGQSBi++BkhJPdWLyGWxaz\n+AbSvljnYwKBgQCt9wuFUdHCDIrEtNG+GhhQwQ7jPsnbN4NvI1majE2mGIC2QFEu\nXQDdrf5s/wx6EASUDaEax5iJgUHTxbNnJttdKgg026OfUBSFFdKwKvBsGKhYRVWr\n4+dBnRNisLL1h8s13jPzI/lGhtTibQJT4d3sQ6MnGWGkgyuJIOXkaWP0UQKBgBog\nm8QUohMXoknYwA+jwAXmwOe4rtbVpDE9tllDUFyg7PhNmF3Lkyyv31UdkTcxc9Sx\nRAKNzfYgoTzTOJsnxqlBznjlERfePuHnuTMRmHM6Ldfa5mNzI04wF08sR4KUz4Kb\nwsdoHDBRZNQv9DJ0wIhapIbE2KfecpLmAAloKvq9AoGADBgDCJEgPAFN0/hndnJB\nLMJwS26Pl6tp6A7NYEYvy0xo1lZboxOEEXj2rdpkQpBCzbGy5Jot+fea99EI+JHY\nabO53tGUn0d0rkFC6q/MJaPgOThkrykj17x1EPsfmFyrubmDGQnfLqNEX4BY66Yo\nY6ARG8AM5UFyEj7IPeyNgws=\n-----END PRIVATE KEY-----\n",
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
const VISION_MODELS = [
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "google/gemma-3-12b-it:free",
  "qwen/qwen2.5-vl-32b-instruct:free"
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
        model: model,
        stream: true,
      });
      
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(content);
          hasResponded = true;
        }
      }
      res.end();
      return;
    } catch (err) {
      console.log(`Groq ${model} failed: ${err.message}`);
    }
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
    const resizedImageBuffer = await sharp(imageFile.path).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const base64Image = `data:image/jpeg;base64,${resizedImageBuffer.toString('base64')}`;
    const prompt = question || "Describe this image in detail. What do you see?";
    let visionResponse = null;
    fs.unlinkSync(imageFile.path);
    
    for (const model of VISION_MODELS) {
      try {
        const response = await openrouter.chat.completions.create({
          model: model,
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: base64Image } }] }]
        });
        visionResponse = response.choices[0].message.content;
        break;
      } catch (err) { console.log(`Vision ${model} failed: ${err.message}`); }
    }
    
    if (!visionResponse) return res.status(500).json({ error: "Failed to analyze image" });
    if (isTamil(prompt)) {
      try { const t = await translate(visionResponse, { to: 'ta' }); return res.json({ response: t.text }); } catch {}
    }
    res.json({ response: visionResponse });
  } catch (error) {
    if (imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    res.status(500).json({ error: "Failed to analyze image" });
  }
});

// ✅ OTP ENDPOINT - Using Nodemailer with port 465
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };
  
  console.log(`📧 Sending OTP to ${email}: ${otp}`);
  
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
    console.log(`✅ OTP sent successfully to ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Email error:', err.message);
    console.log(`⚠️ [DEV] OTP for ${email}: ${otp}`);
    res.json({ success: true, dev: true, devOtp: otp });
  }
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

// History endpoints
app.get('/api/all-history', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || email === 'guest') return res.json([]);
    const snapshot = await db.collection('all_history').where('userEmail', '==', email).get();
    const history = [];
    snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(history.slice(0, 100));
  } catch (err) { res.json([]); }
});

app.post('/api/save-history', async (req, res) => {
  try {
    const { type, question, answer, sessionId, userEmail } = req.body;
    if (!userEmail || userEmail === 'guest') return res.json({ success: true });
    const now = new Date();
    const docRef = await db.collection('all_history').add({
      type, question, answer, sessionId: sessionId || null, userEmail: userEmail,
      timestamp: now.toISOString(), formattedTime: now.toLocaleString(), createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ id: docRef.id, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/history/:id', async (req, res) => {
  try { await db.collection('all_history').doc(req.params.id).delete(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'AURA AI Backend is running with Nodemailer (port 465)!' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AURA Server on Port ${PORT}`);
  console.log(`📧 Gmail SMTP configured on port 465`);
  console.log(`🔥 Firebase connected: kira-dc450\n`);
});