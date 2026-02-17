const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your-secret-key-here', // change this to a strong secret
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set secure: true in production with HTTPS
}));
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// MySQL Connection
const db = mysql.createConnection({
  host:     process.env.DB_HOST     || 'localhost',     // fallback for local testing
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'codeforinterview',
  database: process.env.DB_NAME     || 'statutory_db',
  port:     process.env.DB_PORT     || 3306
});

db.connect(err => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  }
  console.log('MySQL Connected successfully');
});

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'venkata.meherhasitha@gmail.com',
    pass: process.env.GMAIL_PASS || 'vwwa voeb zhtw yivv'
  }
});

// 1. Send OTP/Code
app.post('/send-code', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const code = Math.random().toString(36).slice(-8);

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    if (results.length === 0) {
      db.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)', 
        [email, code, 'user'], err => {
          if (err) console.error('Insert error:', err);
        });
    } else {
      db.query('UPDATE users SET password = ? WHERE email = ?', [code, email], err => {
        if (err) console.error('Update error:', err);
      });
    }

    // Send email in background
    transporter.sendMail({
      from: 'venkata.meherhasitha@gmail.com',
      to: email,
      subject: 'Your Login Code',
      text: `Your login code is: ${code}\nUse this as password.`
    }).catch(err => console.error('Email failed:', err));

    res.json({ message: 'Code sent to your email. Check inbox/spam.' });
  });
});

// 2. Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ? AND password = ? AND active = 1', 
    [email, password], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      if (results.length > 0) {
        req.session.user = results[0];
        const redirect = results[0].role === 'admin' ? '/admin' : '/main';
        res.redirect(redirect);
      } else {
        res.status(401).json({ error: 'Invalid email or code' });
      }
    });
});

// 3. Reset password (admin only)
app.post('/reset', (req, res) => {
  const { email } = req.body;

  db.query('SELECT * FROM users WHERE email = ? AND role = "admin"', [email], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(403).json({ error: 'Reset only for admin' });

    const newPass = Math.random().toString(36).slice(-8);
    db.query('UPDATE users SET password = ? WHERE email = ?', [newPass, email], err => {
      if (err) return res.status(500).json({ error: 'Update failed' });

      transporter.sendMail({
        from: 'venkata.meherhasitha@gmail.com',
        to: email,
        subject: 'Admin Password Reset',
        text: `New password: ${newPass}`
      }).catch(err => console.error('Reset email failed:', err));

      res.json({ message: 'New password sent to email' });
    });
  });
});

// 4. Data endpoints
app.get('/data', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  db.query('SELECT * FROM se_data ORDER BY state ASC, location_name ASC', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/states', (req, res) => {
  db.query('SELECT DISTINCT state FROM se_data ORDER BY state ASC', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/locations/:state', (req, res) => {
  db.query('SELECT location_name FROM se_data WHERE state = ? ORDER BY location_name ASC', 
    [req.params.state], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    });
});

// 5. Add row
app.post('/add-row', upload.single('certificate'), (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { entity, state, location_name, status, address, remarks } = req.body;
  const certArray = req.file ? JSON.stringify([`/uploads/${req.file.filename}`]) : '[]';

  db.query(
    'INSERT INTO se_data (entity, state, location_name, status, certificate_link, address, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [entity, state, location_name, status, certArray, address, remarks],
    err => {
      if (err) return res.status(500).json({ error: 'Insert failed' });
      res.json({ message: 'Row added' });
    }
  );
});

// 6. Edit row
app.post('/edit-row/:id', upload.single('certificate'), (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { entity, state, location_name, status, address, remarks } = req.body;
  const id = req.params.id;

  db.query('SELECT certificate_link FROM se_data WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    let certArray = results[0]?.certificate_link ? JSON.parse(results[0].certificate_link) : [];
    if (req.file) certArray.unshift(`/uploads/${req.file.filename}`);

    db.query(
      'UPDATE se_data SET entity=?, state=?, location_name=?, status=?, address=?, remarks=?, certificate_link=? WHERE id=?',
      [entity, state, location_name, status, address, remarks, JSON.stringify(certArray), id],
      err => {
        if (err) return res.status(500).json({ error: 'Update failed' });
        res.json({ message: 'Row updated' });
      }
    );
  });
});

// 7. Delete row
app.post('/delete-row/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  db.query('DELETE FROM se_data WHERE id = ?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ message: 'Row deleted' });
  });
});

// 8. Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/main', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'main.html'));
});
app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});