const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// ==========================
// MySQL Connection
// ==========================
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'codeforinterview',
  database: process.env.DB_NAME || 'statutory_db',
  port: process.env.DB_PORT || 3306
});

db.connect(err => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
    console.error('Server will continue running without DB connection');
  }
  console.log('MySQL Connected successfully');
});

// ==========================
// Nodemailer Setup
// ==========================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// ==========================
// Routes
// ==========================

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'index.html'))
);

app.get('/main', (req, res) =>
  res.sendFile(path.join(__dirname, 'main.html'))
);

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'admin.html'))
);

// ==========================
// Send OTP
// ==========================
app.post('/send-code', (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is ${otp}`   // ✅ FIXED
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email error:', error);
      return res.send("Failed to send OTP");
    }

    req.session.otp = otp;
    req.session.email = email;

    res.send("OTP sent to email successfully");
  });
});

// ==========================
// Login
// ==========================
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {

    if (err) {
      console.error(err);
      return res.send("Database error");
    }

    // ======================
    // If user exists in DB
    // ======================
    if (results.length > 0) {
      const user = results[0];

      if (user.password === password) {

        req.session.user = {
          email: user.email,
          role: user.role
        };

        // 🔥 Redirect based on role
        if (user.role === 'admin') {
          return res.redirect('/admin');
        } else {
          return res.redirect('/main');
        }

      } else {
        return res.send("Invalid credentials");
      }
    }

    // ======================
    // OTP Login (If user not in DB)
    // ======================
    if (req.session.email === email && req.session.otp === password) {

      req.session.user = {
        email: email,
        role: 'user'
      };

      return res.redirect('/main');
    }

    res.send("Invalid OTP or email");
  });
});

// ==========================
// Server Start (Railway Fix)
// ==========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
