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
app.use(express.static(__dirname));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================
// SEND OTP
// ==========================
app.post('/send-code', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send("Email required");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}`
    });

    req.session.otp = otp;
    req.session.email = email;

    res.send("OTP sent successfully");

  } catch (error) {
    console.error("Mail error:", error);
    res.status(500).send("Error sending code");
  }
});

// ==========================
// LOGIN
// ==========================
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // OTP login
  if (req.session.email === email && req.session.otp === password) {
    req.session.user = { email, role: 'user' };
    return res.redirect('/main');
  }

  // Admin/User login from DB
  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {

    if (err) return res.send("Database error");

    if (results.length > 0) {
      const user = results[0];

      if (user.password === password) {
        req.session.user = {
          email: user.email,
          role: user.role
        };

        return user.role === 'admin'
          ? res.redirect('/admin')
          : res.redirect('/main');
      }
    }

    res.send("Invalid credentials");
  });
});

// ==========================
// GET DATA
// ==========================
app.get('/data', (req, res) => {
  const { state, location } = req.query;

  let query = `SELECT * FROM se_data WHERE 1=1`;
  let params = [];

  if (state && state.trim() !== "") {
    query += " AND state = ?";
    params.push(state);
  }

  if (location && location.trim() !== "") {
    query += " AND location_name = ?";
    params.push(location);
  }

  query += " ORDER BY state ASC, location_name ASC";

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// ==========================
// GET STATES
// ==========================
app.get('/states', (req, res) => {
  const query = `
    SELECT DISTINCT state
    FROM se_data
    WHERE state IS NOT NULL
    ORDER BY state ASC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// ==========================
// GET LOCATIONS
// ==========================
app.get('/locations/:state', (req, res) => {
  const state = req.params.state;

  const query = `
    SELECT DISTINCT location_name
    FROM se_data
    WHERE state = ?
    ORDER BY location_name ASC
  `;

  db.query(query, [state], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// ==========================
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
