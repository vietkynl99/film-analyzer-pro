import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("films.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS films (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    director TEXT,
    synopsis TEXT,
    status TEXT NOT NULL,
    genre TEXT,
    originalPoster TEXT,
    editedPoster TEXT,
    budget REAL,
    analysis TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/films", (req, res) => {
    const films = db.prepare("SELECT * FROM films ORDER BY createdAt DESC").all();
    res.json(films.map(f => ({
      ...f,
      analysis: f.analysis ? JSON.parse(f.analysis) : null
    })));
  });

  app.post("/api/films", (req, res) => {
    const { id, title, director, synopsis, status, genre, originalPoster, editedPoster, budget } = req.body;
    const stmt = db.prepare(`
      INSERT INTO films (id, title, director, synopsis, status, genre, originalPoster, editedPoster, budget)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title, director, synopsis, status, genre, originalPoster, editedPoster, budget);
    res.status(201).json({ id });
  });

  app.put("/api/films/:id", (req, res) => {
    const { id } = req.params;
    const { title, director, synopsis, status, genre, originalPoster, editedPoster, budget, analysis } = req.body;
    const stmt = db.prepare(`
      UPDATE films 
      SET title = ?, director = ?, synopsis = ?, status = ?, genre = ?, 
          originalPoster = ?, editedPoster = ?, budget = ?, analysis = ?,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(title, director, synopsis, status, genre, originalPoster, editedPoster, budget, JSON.stringify(analysis), id);
    res.json({ success: true });
  });

  app.delete("/api/films/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM films WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
