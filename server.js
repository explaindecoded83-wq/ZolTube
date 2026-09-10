const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "change-this-secret";

const db = new Database("zolTube.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  filename TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1024 * 1024 * 500
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function token(user) {
  return jwt.sign(
    { id: user.id },
    SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    req.user = jwt.verify(
      h.replace("Bearer ", ""),
      SECRET
    );
    next();
  } catch {
    res.status(401).json({
      error: "Login required"
    });
  }
}

/* =========================
   REGISTER
========================= */

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (
    !name ||
    !email ||
    !password ||
    password.length < 6
  ) {
    return res.status(400).json({
      error: "Name, email and a 6+ character password are required"
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    const info = db
      .prepare(
        "INSERT INTO users(name,email,password,channel) VALUES(?,?,?,?)"
      )
      .run(
        name,
        email,
        hash,
        name + " Channel"
      );

    const user = db
      .prepare(
        "SELECT id,name,email,channel FROM users WHERE id=?"
      )
      .get(info.lastInsertRowid);

    res.json({
      token: token(user),
      user
    });

  } catch (e) {
    res.status(400).json({
      error: "Email may already be registered"
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};

  const user = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(email || "");

  if (
    !user ||
    !(await bcrypt.compare(
      password || "",
      user.password
    ))
  ) {
    return res.status(401).json({
      error: "Invalid email or password"
    });
  }

  res.json({
    token: token(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      channel: user.channel
    }
  });
});

/* =========================
   GET VIDEOS
========================= */

app.get("/api/videos", (req, res) => {
  const rows = db
    .prepare(`
      SELECT
        v.id,
        v.title,
        v.description,
        v.filename,
        v.views,
        v.created_at,
        u.name,
        u.channel
      FROM videos v
      JOIN users u ON u.id = v.user_id
      ORDER BY v.id DESC
    `)
    .all();

  res.json(rows);
});

/* =========================
   UPLOAD VIDEO
========================= */

app.post(
  "/api/videos",
  auth,
  upload.single("video"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Video file required"
      });
    }

    const title = (req.body.title || "").trim();

    if (!title) {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        error: "Title required"
      });
    }

    const info = db
      .prepare(
        "INSERT INTO videos(user_id,title,description,filename) VALUES(?,?,?,?)"
      )
      .run(
        req.user.id,
        title,
        req.body.description || "",
        req.file.filename
      );

    res.json(
      db
        .prepare("SELECT * FROM videos WHERE id=?")
        .get(info.lastInsertRowid)
    );
  }
);

/* =========================
   VIDEO STREAM
========================= */

app.get("/api/videos/:id/stream", (req, res) => {

  const v = db
    .prepare("SELECT filename FROM videos WHERE id=?")
    .get(req.params.id);

  if (!v) {
    return res.sendStatus(404);
  }

  const file = path.join(
    __dirname,
    "uploads",
    v.filename
  );

  if (!fs.existsSync(file)) {
    return res.sendStatus(404);
  }

  const stat = fs.statSync(file);
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": "video/mp4"
    });

    return fs
      .createReadStream(file)
      .pipe(res);
  }

  const [s, e] = range
    .replace("bytes=", "")
    .split("-");

  const start = parseInt(s);
  const end = e
    ? parseInt(e)
    : stat.size - 1;

  res.writeHead(206, {
    "Content-Range":
      `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length":
      end - start + 1,
    "Content-Type": "video/mp4"
  });

  fs
    .createReadStream(file, {
      start,
      end
    })
    .pipe(res);
});

/* =========================
   VIEW COUNT
========================= */

app.post(
  "/api/videos/:id/view",
  (req, res) => {

    db
      .prepare(
        "UPDATE videos SET views=views+1 WHERE id=?"
      )
      .run(req.params.id);

    res.json({
      ok: true
    });
  }
);

/* =========================
   CURRENT USER
========================= */

app.get("/api/me", auth, (req, res) => {

  const u = db
    .prepare(
      "SELECT id,name,email,channel FROM users WHERE id=?"
    )
    .get(req.user.id);

  res.json(u);
});

/* =========================
   HOME PAGE
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  res.status(400).json({
    error: err.message
  });
});

/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `ZolTube running on port ${PORT}`
    );
  }
);
