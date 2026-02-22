require('dotenv').config();
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
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

/* ================= MYSQL CONNECTION ================= */

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

  // ======= initialise schema =======
  // this will run every time the app starts; it makes sure the
  // tables exist and seeds an admin user. on Railway free tier the
  // database is ephemeral, so restarting the container wipes data.
  // re-creating the tables prevents the "Database error" popup.
  const initSql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      role ENUM('admin','user') NOT NULL
    );

    CREATE TABLE IF NOT EXISTS se_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entity VARCHAR(255),
      state VARCHAR(255),
      location_name VARCHAR(255),
      status VARCHAR(255),
      certificate_link TEXT,
      address TEXT,
      remarks TEXT
    );

    INSERT IGNORE INTO users (email,password,role)
      VALUES ('admin@gmail.com','adminpass','admin');
  `;

  db.query(initSql, initErr => {
    if (initErr) {
      console.error('initialisation query failed', initErr);
    } else {
      console.log('database initialised (tables created/seeded)');
    }
  });
});

/* ================= MAIL CONFIG ================= */

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'venkata.meherhasitha@gmail.com',
    pass: process.env.GMAIL_PASS || 'vwwa voeb zhtw yivv'
  }
});

/* ================= ROUTES ================= */

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'index.html'))
);

app.get('/main', (req, res) =>
  res.sendFile(path.join(__dirname, 'main.html'))
);

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'admin.html'))
);

/* ================= FILTER ROUTES ================= */

app.get('/states', (req, res) => {
  db.query(
    'SELECT DISTINCT state FROM se_data ORDER BY state ASC',
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    }
  );
});

app.get('/locations/:state', (req, res) => {
  db.query(
    'SELECT DISTINCT location_name FROM se_data WHERE state = ? ORDER BY location_name ASC',
    [req.params.state],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    }
  );
});

app.get('/data', (req, res) => {

  const { state, location } = req.query;

  let query = 'SELECT * FROM se_data WHERE 1=1';
  let params = [];

  if (state) {
    query += ' AND state = ?';
    params.push(state);
  }

  if (location) {
    query += ' AND location_name = ?';
    params.push(location);
  }

  query += ' ORDER BY state ASC, location_name ASC';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

/* ================= ADD ROW ================= */

app.post('/add-row', upload.single('certificate'), (req, res) => {

  const { entity, state, location_name, status, address, remarks } = req.body;

  let certificateLinks = [];

  if (req.file) {
    certificateLinks.push(`/uploads/${req.file.filename}`);
  }

  const query = `
    INSERT INTO se_data
    (entity, state, location_name, status, certificate_link, address, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [
      entity,
      state,
      location_name,
      status,
      JSON.stringify(certificateLinks),
      address,
      remarks
    ],
    err => {
      if (err) return res.status(500).json({ error: 'Insert failed' });
      res.json({ success: true });
    }
  );
});

/* ================= EDIT ROW ================= */

app.post('/edit-row/:id', upload.single('certificate'), (req, res) => {

  const id = req.params.id;
  const { entity, state, location_name, status, address, remarks } = req.body;

  db.query(
    'SELECT certificate_link FROM se_data WHERE id = ?',
    [id],
    (err, results) => {

      if (err) return res.status(500).json({ error: 'Fetch failed' });

      let certs = [];
      if (results[0].certificate_link) {
        try {
          certs = JSON.parse(results[0].certificate_link);
        } catch {
          certs = [results[0].certificate_link];
        }
      }

      if (req.file) {
        certs.push(`/uploads/${req.file.filename}`);
      }

      const updateQuery = `
        UPDATE se_data
        SET entity=?, state=?, location_name=?, status=?,
            certificate_link=?, address=?, remarks=?
        WHERE id=?
      `;

      db.query(
        updateQuery,
        [
          entity,
          state,
          location_name,
          status,
          JSON.stringify(certs),
          address,
          remarks,
          id
        ],
        err2 => {
          if (err2) return res.status(500).json({ error: 'Update failed' });
          res.json({ success: true });
        }
      );
    }
  );
});

/* ================= DELETE ================= */

app.post('/delete-row/:id', (req, res) => {
  db.query(
    'DELETE FROM se_data WHERE id = ?',
    [req.params.id],
    err => {
      if (err) return res.status(500).json({ error: 'Delete failed' });
      res.json({ success: true });
    }
  );
});

/* ================= LOGIN ================= */

app.post('/login', (req, res) => {

  const { email, password } = req.body;

  db.query(
    'SELECT * FROM users WHERE email = ?',
    [email],
    (err, results) => {

      if (err) return res.json({ error: 'Database error' });

      if (results.length > 0) {

        const user = results[0];

        // 🔵 ADMIN LOGIN (password based)
        if (user.role === 'admin') {
          if (user.password === password) {
            req.session.user = { email, role: 'admin' };
            return res.json({ success: true, role: 'admin' });
          } else {
            return res.json({ error: 'Invalid admin password' });
          }
        }

        // 🟢 USER LOGIN (OTP based)
        if (user.role === 'user') {
          if (req.session.email === email && req.session.otp === password) {
            req.session.user = { email, role: 'user' };
            return res.json({ success: true, role: 'user' });
          } else {
            return res.json({ error: 'Invalid OTP' });
          }
        }
      }

      return res.json({ error: 'User not found' });

    }
  );
});

/* ================= LOGOUT ================= */

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ================= OTP ================= */

app.post('/send-code', (req, res) => {

  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is ${otp}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) {
      console.error(error);
      return res.json({ error: 'Failed to send OTP' });
    }

    req.session.otp = otp;
    req.session.email = email;

    res.json({ success: true });
  });
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
