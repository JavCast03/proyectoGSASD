const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// ¿Tenemos DATABASE_URL? -> modo Railway
const useDb = !!process.env.DATABASE_URL;

// PostgreSQL Pool
let pool;
if (useDb) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  console.log("Modo BBDD: usando PostgreSQL.");
} else {
  console.log("Modo local sin BBDD (almacenamiento memoria).");
}

// Datos locales para modo sin BBDD
let tareasMemoria = [];
let idMemoria = 1;
let usuariosMemoria = [];
let idUsuarioMemoria = 1;

// ------------------- Inicializar Base de Datos -------------------
async function initDb() {
  if (!useDb) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tareas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      completada BOOLEAN NOT NULL DEFAULT FALSE,
      creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Tablas users y tareas listas.");
}

// ------------------- Middleware -------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sesiones
app.use(
  session({
    secret: "gsasd-super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Railway usa HTTP normal, no HTTPS interno
      maxAge: 1000 * 60 * 60, // 1 hora
    },
  })
);

// Middleware para proteger rutas
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

// ------------------- Funciones de usuarios -------------------
async function createUser(username, password) {
  const hash = await bcrypt.hash(password, 10);

  if (useDb) {
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hash]
    );
  } else {
    usuariosMemoria.push({
      id: idUsuarioMemoria++,
      username,
      password: hash,
    });
  }
}

async function findUserByUsername(username) {
  if (useDb) {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [
      username,
    ]);
    return result.rows[0];
  } else {
    return usuariosMemoria.find((u) => u.username === username);
  }
}

// ------------------- Funciones de tareas -------------------
async function getTareas(userId) {
  if (useDb) {
    const result = await pool.query(
      "SELECT id, texto, completada, creada_en FROM tareas WHERE user_id=$1 ORDER BY creada_en DESC",
      [userId]
    );
    return result.rows;
  } else {
    return tareasMemoria.filter((t) => t.user_id === userId);
  }
}

async function crearTarea(userId, texto) {
  if (useDb) {
    await pool.query(
      "INSERT INTO tareas (user_id, texto) VALUES ($1, $2)",
      [userId, texto]
    );
  } else {
    tareasMemoria.unshift({
      id: idMemoria++,
      user_id: userId,
      texto,
      completada: false,
      creada_en: new Date(),
    });
  }
}

async function toggleTarea(id, userId) {
  if (useDb) {
    await pool.query(
      "UPDATE tareas SET completada = NOT completada WHERE id = $1 AND user_id=$2",
      [id, userId]
    );
  } else {
    tareasMemoria = tareasMemoria.map((t) =>
      t.id === id && t.user_id === userId
        ? { ...t, completada: !t.completada }
        : t
    );
  }
}

async function borrarTarea(id, userId) {
  if (useDb) {
    await pool.query(
      "DELETE FROM tareas WHERE id = $1 AND user_id=$2",
      [id, userId]
    );
  } else {
    tareasMemoria = tareasMemoria.filter(
      (t) => !(t.id === id && t.user_id === userId)
    );
  }
}

// ------------------- Vistas: LOGIN & REGISTRO -------------------

app.get("/login", (req, res) => {
  res.send(`
  <html>
    <head>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex justify-content-center align-items-center" style="height:100vh;">
      <div class="card shadow p-4" style="width: 350px;">
        <h3 class="text-center mb-3">Iniciar sesión</h3>
        <form action="/login" method="POST">
          <input class="form-control mb-2" type="text" name="username" placeholder="Usuario" required>
          <input class="form-control mb-3" type="password" name="password" placeholder="Contraseña" required>
          <button class="btn btn-primary w-100">Entrar</button>
        </form>
        <p class="text-center mt-3">
          ¿No tienes cuenta? <a href="/register">Regístrate</a>
        </p>
      </div>
    </body>
  </html>
  `);
});

app.get("/register", (req, res) => {
  res.send(`
  <html>
    <head>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex justify-content-center align-items-center" style="height:100vh;">
      <div class="card shadow p-4" style="width: 350px;">
        <h3 class="text-center mb-3">Crear cuenta</h3>
        <form action="/register" method="POST">
          <input class="form-control mb-2" type="text" name="username" placeholder="Usuario" required>
          <input class="form-control mb-3" type="password" name="password" placeholder="Contraseña" required>
          <button class="btn btn-success w-100">Registrarse</button>
        </form>
        <p class="text-center mt-3">
          ¿Ya tienes cuenta? <a href="/login">Iniciar sesión</a>
        </p>
      </div>
    </body>
  </html>
  `);
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const exists = await findUserByUsername(username);

  if (exists) {
    return res.send("Ese usuario ya existe. <a href='/register'>Volver</a>");
  }

  await createUser(username, password);
  res.redirect("/login");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);

  if (!user) return res.send("Usuario no encontrado.");

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.send("Contraseña incorrecta.");

  req.session.userId = user.id;
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// ------------------- Ruta principal (protegida) -------------------

app.get("/", requireLogin, async (req, res) => {
  const userId = req.session.userId;

  // Filtros y búsqueda
  const filter = req.query.filter || "all";
  const q = (req.query.q || "").toLowerCase();

  let tareas = await getTareas(userId);

  const total = tareas.length;
  const completadas = tareas.filter((t) => t.completada).length;
  const pendientes = total - completadas;

  // Filtros
  if (filter === "pending") tareas = tareas.filter((t) => !t.completada);
  if (filter === "completed") tareas = tareas.filter((t) => t.completada);

  if (q) tareas = tareas.filter((t) => t.texto.toLowerCase().includes(q));

  const listaTareas = tareas
    .map(
      (t) => `
  <li class="list-group-item d-flex justify-content-between align-items-center">
    <div>
      <span style="${t.completada ? "text-decoration: line-through; color:#777" : ""}">
        ${t.texto}
      </span><br>
      <small class="text-muted">${new Date(t.creada_en).toLocaleString("es-ES")}</small>
    </div>
    <div class="btn-group">
      <form action="/tareas/${t.id}/toggle" method="POST">
        <button class="btn btn-sm ${t.completada ? "btn-warning" : "btn-success"}">
          ${t.completada ? "Pendiente" : "Completar"}
        </button>
      </form>
      <form action="/tareas/${t.id}/borrar" method="POST">
        <button class="btn btn-sm btn-danger">Borrar</button>
      </form>
    </div>
  </li>
  `
    )
    .join("");

  res.send(`
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Mis tareas</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container py-4">
        <div class="d-flex justify-content-between">
          <h2>Mis tareas</h2>
          <a class="btn btn-outline-danger" href="/logout">Cerrar sesión</a>
        </div>
        <hr>

        <div class="mb-2">
          <span class="badge bg-secondary me-1">Total: ${total}</span>
          <span class="badge bg-success me-1">Pendientes: ${pendientes}</span>
          <span class="badge bg-info text-dark">Completadas: ${completadas}</span>
        </div>

        <form action="/tareas" method="POST" class="d-flex gap-2 mb-3">
          <input class="form-control" type="text" name="texto" placeholder="Nueva tarea..." required>
          <button class="btn btn-primary">Añadir</button>
        </form>

        <div class="d-flex justify-content-between mb-3">
          <div class="btn-group">
            <a href="/?filter=all" class="btn btn-sm ${filter === "all" ? "btn-primary" : "btn-outline-primary"}">Todas</a>
            <a href="/?filter=pending" class="btn btn-sm ${filter === "pending" ? "btn-primary" : "btn-outline-primary"}">Pendientes</a>
            <a href="/?filter=completed" class="btn btn-sm ${filter === "completed" ? "btn-primary" : "btn-outline-primary"}">Completadas</a>
          </div>
          <form class="d-flex" method="GET">
            <input type="hidden" name="filter" value="${filter}">
            <input class="form-control form-control-sm" type="text" name="q" placeholder="Buscar..." value="${q}">
            <button class="btn btn-sm btn-outline-secondary ms-1">OK</button>
          </form>
        </div>

        <ul class="list-group">
          ${
            listaTareas ||
            '<li class="list-group-item text-muted">No hay tareas con estos filtros.</li>'
          }
        </ul>
      </div>
    </body>
  </html>
  `);
});

// Crear tarea
app.post("/tareas", requireLogin, async (req, res) => {
  const userId = req.session.userId;
  await crearTarea(userId, req.body.texto);
  res.redirect("/");
});

// Toggle
app.post("/tareas/:id/toggle", requireLogin, async (req, res) => {
  await toggleTarea(parseInt(req.params.id), req.session.userId);
  res.redirect("/");
});

// Borrar
app.post("/tareas/:id/borrar", requireLogin, async (req, res) => {
  await borrarTarea(parseInt(req.params.id), req.session.userId);
  res.redirect("/");
});

// ------------------- API REST protegida -------------------
app.get("/api/tareas", requireLogin, async (req, res) => {
  const tareas = await getTareas(req.session.userId);
  res.json(tareas);
});

// ------------------- Start -------------------

initDb().then(() => {
  app.listen(PORT, () =>
    console.log("Servidor escuchando en puerto " + PORT)
  );
});
