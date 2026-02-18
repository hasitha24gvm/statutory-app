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

// Since HTML files are in root folder
app.use(express.static(__dirname));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// ==========================
// MySQL Connection
// ==========================
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.connect(err => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
  } else {
    console.log('MySQL Connected successfully');
  }
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
// ROUTES
// ==========================

// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Main Dashboard
app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

// Admin Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================
// SEND OTP
// ==========================
app.post('/send-code', (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is ${otp}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      return res.send("Failed to send OTP");
    }

    req.session.otp = otp;
    req.session.email = email;

    res.send("OTP sent successfully");
  });
});

// ==========================
// LOGIN
// ==========================
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {

    if (err) {
      console.error(err);
      return res.send("Database error");
    }

    // If admin/user exists in DB
    if (results.length > 0) {
      const user = results[0];

      if (user.password === password) {

        req.session.user = {
          email: user.email,
          role: user.role
        };

        if (user.role === 'admin') {
          return res.redirect('/admin');
        } else {
          return res.redirect('/main');
        }

      } else {
        return res.send("Invalid credentials");
      }
    }

    // OTP login
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
// GET S&E DATA (IMPORTANT FIX)
// ==========================
app.get('/data', (req, res) => {

  const { state, location } = req.query;

  let query = 'SELECT * FROM se_data WHERE 1=1';
  let params = [];

  if (state && state !== '-- All States --') {
    query += ' AND state = ?';
    params.push(state);
  }

  if (location && location !== '-- All Locations --') {
    query += ' AND location = ?';
    params.push(location);
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(results);
  });
});

// ==========================
// START SERVER (Railway)
// ==========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
