const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();

// ==========================
// Multer Setup (Certificate Upload)
// ==========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ==========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================
// Session
// ==========================
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
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
  if (err) console.error('DB Error:', err);
  else console.log('MySQL Connected');
});

// ==========================
// Nodemailer
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

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

// ==========================
// SEND OTP
// ==========================
app.post('/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send("Email required");

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
  } catch (err) {
    console.error("Mail error:", err);
    res.status(500).send("Failed to send OTP");
  }
});

// ==========================
// LOGIN
// ==========================
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // OTP Login
  if (req.session.email === email && req.session.otp === password) {
    req.session.user = { email, role: 'user' };
    return res.redirect('/main');
  }

  // Admin/User DB login
  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.send("DB error");

    if (results.length > 0 && results[0].password === password) {
      req.session.user = {
        email: results[0].email,
        role: results[0].role
      };

      return results[0].role === 'admin'
        ? res.redirect('/admin')
        : res.redirect('/main');
    }

    res.send("Invalid credentials");
  });
});

// ==========================
// LOGOUT
// ==========================
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ==========================
// GET DATA
// ==========================
app.get('/data', (req, res) => {
  const { state, location } = req.query;

  let query = "SELECT * FROM se_data WHERE 1=1";
  let params = [];

  if (state) {
    query += " AND state = ?";
    params.push(state);
  }

  if (location) {
    query += " AND location_name = ?";
    params.push(location);
  }

  query += " ORDER BY state ASC, location_name ASC";

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(results);
  });
});

// ==========================
// STATES
// ==========================
app.get('/states', (req, res) => {
  db.query("SELECT DISTINCT state FROM se_data ORDER BY state ASC", 
  (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(results);
  });
});

// ==========================
// LOCATIONS
// ==========================
app.get('/locations/:state', (req, res) => {
  db.query(
    "SELECT DISTINCT location_name FROM se_data WHERE state = ? ORDER BY location_name ASC",
    [req.params.state],
    (err, results) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(results);
    }
  );
});

// ==========================
// ADD ROW
// ==========================
app.post('/add-row', upload.single('certificate'), (req, res) => {
  const { entity, state, location_name, status, address, remarks } = req.body;

  let certificate_link = null;

  if (req.file) {
    certificate_link = JSON.stringify([`/uploads/${req.file.filename}`]);
  }

  db.query(
    `INSERT INTO se_data 
     (entity, state, location_name, status, certificate_link, address, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entity, state, location_name, status, certificate_link, address, remarks],
    (err) => {
      if (err) return res.status(500).send("Insert failed");
      res.send("Row added");
    }
  );
});

// ==========================
// EDIT ROW
// ==========================
app.post('/edit-row/:id', upload.single('certificate'), (req, res) => {
  const id = req.params.id;
  const { entity, state, location_name, status, address, remarks } = req.body;

  db.query("SELECT certificate_link FROM se_data WHERE id = ?", [id],
  (err, results) => {
    if (err) return res.status(500).send("Error");

    let certificates = [];

    if (results[0].certificate_link) {
      try {
        certificates = JSON.parse(results[0].certificate_link);
      } catch {
        certificates = [results[0].certificate_link];
      }
    }

    if (req.file) {
      certificates.push(`/uploads/${req.file.filename}`);
    }

    db.query(
      `UPDATE se_data 
       SET entity=?, state=?, location_name=?, status=?, 
           certificate_link=?, address=?, remarks=?
       WHERE id=?`,
      [
        entity,
        state,
        location_name,
        status,
        JSON.stringify(certificates),
        address,
        remarks,
        id
      ],
      (err2) => {
        if (err2) return res.status(500).send("Update failed");
        res.send("Updated");
      }
    );
  });
});

// ==========================
// DELETE ROW
// ==========================
app.post('/delete-row/:id', (req, res) => {
  db.query("DELETE FROM se_data WHERE id = ?", [req.params.id],
  (err) => {
    if (err) return res.status(500).send("Delete failed");
    res.send("Deleted");
  });
});

// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
