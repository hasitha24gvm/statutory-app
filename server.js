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
    subject: 'Your OTP Code',
    text: `Your OTP code is ${otp}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email error:', error);
      res.json({ error: 'Failed to send OTP' });
    } else {
      req.session.otp = otp;
      req.session.email = email;
      req.session.role = 'user'; // Set role for users
      res.json({ success: 'OTP sent to email' });
    }
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.json({ error: 'Database error' });
    if (results.length > 0) {
      const user = results[0];
      if (user.password === password && user.role === 'admin') {
        req.session.user = { email, role: user.role };
        res.json({ success: 'Logged in as admin' });
      } else {
        res.json({ error: 'Invalid admin credentials' });
      }
    } else {
      // For users: Check OTP from session
      if (req.session.email === email && req.session.otp === password) {
        req.session.user = { email, role: 'user' };
        res.json({ success: 'Logged in as user' });
      } else {
        res.json({ error: 'Invalid OTP' });
      }
    }
  });
});

// Other routes ( /data, /add-row, /edit-row, /delete-row, /states, /locations ) remain the same as in your original code...

app.listen(3000, () => console.log('Server running on http://localhost:3000'));