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

// MySQL Connection
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
    process.exit(1);
  }
  console.log('MySQL Connected successfully');
});

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'venkata.meherhasitha@gmail.com',
    pass: process.env.GMAIL_PASS || 'vwwa voeb zhtw yivv'
  }
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/main', (req, res) => res.sendFile(path.join(__dirname, 'main.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.post('/send-code', (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Your OTP Code - Statutory App',
    text: `Dear User,\n\nYour OTP code is: ${otp}\n\nThis code is valid for 5 minutes.\n\nDo not share this code.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email send error:', error);
      return res.json({ error: 'Failed to send OTP. Please try again.' });
    }

    // Store OTP in session (NOT in DB)
    req.session.otp = otp;
    req.session.email = email;
    console.log(`OTP sent successfully to ${email}: ${otp}`);

    res.json({ success: 'OTP sent to your email!' });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.json({ error: 'Database error' });
    }

    if (results.length > 0) {
      const user = results[0];
      if (user.password === password) {
        req.session.user = { email, role: user.role };
        return res.json({ success: 'Logged in as ' + user.role, redirect: user.role === 'admin' ? '/admin' : '/main' });
      } else {
        return res.json({ error: 'Invalid password' });
      }
    }

    // User login with OTP
    if (req.session.email === email && req.session.otp === password) {
      req.session.user = { email, role: 'user' };
      return res.json({ success: 'Logged in as user', redirect: '/main' });
    }

    res.json({ error: 'Invalid credentials or OTP' });
  });
});

// All other routes (data, add-row, edit-row, delete-row, states, locations, upload, etc.) 
// MUST remain exactly as they are in your file.
// Do NOT delete or change them.

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port ' + (process.env.PORT || 3000));
});