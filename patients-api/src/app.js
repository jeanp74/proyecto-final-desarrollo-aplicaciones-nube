import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// app.use(express.static(__dirname));

const PORT = process.env.PORT || 4001;

// app.get("/", async (_req, res) => {
//   res.sendFile(path.join(__dirname, "index.html"));
// });

const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));

// Listado de métodos y rutas
app.get("/api", async (_req, res) => {
  // res.json({
  //   metodos: {
  //     GET: [
  //       {url: "/db/health", hace: "Health DB"},
  //       {url: "/users", hace: "Listar (SELECT real)"},
  //       {url: "/users/:id", hace: "Obtener usuarios por id"},
  //       {url: "/tables", hace: "Listar tablas de base de datos"},
  //       {url: "/health", hace: "Mantén /health si ya lo tenías"}
  //     ],
  //     POST: [
  //       {url: "/users", hace: "Crear usuario (name & email son obligatorios)"}
  //     ],
  //     PUT: [
  //       {url: "/users/:id", hace: "Actualizar usuario (name & email son obligatorios)"},
  //       {url: "/tables", hace: "Reiniciar tabla"}
  //     ],
  //     DELETE: [
  //       {url: "/users/:id", hace: "Eliminar usuarios por id"}
  //     ]
  //   }
  // });

  res.json({
    metodos: {
      GET: {
        "/db/health": "Health DB*",
        "/users": "Listar (SELECT real)",
        "/users/:id": "Obtener usuarios por id",
        "/tables": "Listar tablas de base de datos",
        "/health": "Mantén /health si ya lo tenías"
      },
      POST: {
        "/users": "Crear usuario (name & email son obligatorios)"
      },
      PUT: {
        "/users/:id": "Actualizar usuario (name & email son obligatorios)",
        "/tables": "Reiniciar tabla"
      },
      DELETE: {
        "/users/:id": "Eliminar usuarios por id"
      }
    }
  });

});


// Health DB
app.get("/db/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.json({ ok: r.rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Listar (SELECT real)
app.get("/users", async (_req, res) => {
  try {
    const r = await pool.query("SELECT id, name, email FROM users_schema.users ORDER BY id ASC");
    res.status(200).json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "query failed", detail: String(e) });
  }
});

// Obtener usuarios por id
app.get("/users/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, name, email FROM users_schema.users WHERE id=$1",
      [req.params.id]
    );
    // res.json(r);
    if (r.rowCount > 0) {
      res.status(200).json(r.rows);
    } else {
      res.status(404).json({ error: "USUARIO NO ENCONTRADO" });
    }
  } catch (e) {
    res.status(500).json({ error: "query failed", detail: String(e) });
  }
});


// Listar tablas de base de datos
app.get("/tables", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM multiapisdb.information_schema.tables");
    res.status(200).json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "query failed", detail: String(e) });
  }
});

// Mantén /health si ya lo tenías
app.get("/health", (_req, res) => res.json({ status: "ok", service: "users-api" }));


// Crear usuario 
app.post("/users", async (req, res) => {

  let errores = [];
  if (req.body.length != undefined) {
    for (let x = 0; x < req.body.length; x++) {
      const { name, email } = req.body[x] ?? {};
      if (!name || !email) errores.push({ error: "name & email son obligatorios para " + (x + 1) });
      // if (!name || !email) return res.status(400).json({ error: "name & email required" });
    }

    if (errores.length > 0) return res.status(400).json(errores);
    // let resultado = { "201": [] };
    let resultado = {};
    resultado["201"] = [];
    try {
      for (let x = 0; x < req.body.length; x++) {
        console.log(req.body[x]);
        const { name, email } = req.body[x] ?? {};

        const r = await pool.query(
          "INSERT INTO users_schema.users(name, email) VALUES($1, $2) RETURNING id, name, email",
          [name, email]
        );
        resultado['201'].push(r.rows);
        // res.status(201).json(r.rows);
        // res.json(r);
      }
      res.status(201).json(resultado);
    } catch (e) {
      return res.status(500).json({ error: "error creando usuario", detail: String(e) });
    }
  } else {
    const { name, email } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ error: "name & email required" });

    try {
      const r = await pool.query(
        "INSERT INTO users_schema.users(name, email) VALUES($1, $2) RETURNING id, name, email",
        [name, email]
      );
      res.status(201).json(r.rows);
      // res.json(r);
    } catch (e) {
      res.status(500).json({ error: "error creando usuario", detail: String(e) });
    }
  }

});


// Actualizar usuario 
app.put("/users/:id", async (req, res) => {
  const { name, email } = req.body ?? {};
  if (!name || !email) return res.status(400).json({ error: "name & email required" });

  try {
    const r = await pool.query(
      "UPDATE users_schema.users SET name=$1, email=$2 WHERE id=$3 RETURNING id, name, email",
      [name, email, req.params.id]
    );
    // res.json(r);
    if (r.rowCount > 0) {
      res.status(200).json(r.rows);
    } else {
      res.status(404).json({ error: "USUARIO NO ENCONTRADO" });
    }
  } catch (e) {
    res.status(500).json({ error: "query failed", detail: String(e) });
  }
});

// Reiniciar tabla
app.put("/tables", async (req, res) => {
  try {
    const r = await pool.query("TRUNCATE TABLE users_schema.users RESTART IDENTITY");
    res.status(200).json({ mensaje: "Tabla reiniciada" });
  } catch (e) {
    res.status(500).json({ error: "query failed", detail: String(e) });
  }
});


// Eliminar usuarios por id
app.delete("/users/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM users_schema.users WHERE id=$1 RETURNING id, name, email",
      [req.params.id]
    );
    // res.json(r);
    if (r.rowCount > 0) {
      res.status(200).json(r.rows);
    } else {
      res.status(404).json({ error: "USUARIO NO ENCONTRADO" });
    }
  } catch (e) {
    res.status(500).json({ error: "query failed", detail: String(e) });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => console.log(`✅ users-api on http://localhost:${PORT}`));