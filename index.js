const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// ¿Tenemos DATABASE_URL? -> entonces usamos PostgreSQL (Railway)
const useDb = !!process.env.DATABASE_URL;

// Cliente de PostgreSQL (solo si estamos en Railway / hay DATABASE_URL)
let pool;
if (useDb) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  console.log("Modo BBDD: usando PostgreSQL (Railway).");
} else {
  console.log("Modo local: usando almacenamiento en memoria (sin BBDD).");
}

// Almacenamiento en memoria para modo local
let tareasMemoria = [];
let idMemoria = 1;

// ---------- Funciones de acceso a datos (BBDD o memoria) ----------

async function getTareas() {
  if (useDb) {
    const result = await pool.query(
      "SELECT id, texto, completada, creada_en FROM tareas ORDER BY creada_en DESC"
    );
    return result.rows;
  } else {
    return tareasMemoria;
  }
}

async function crearTarea(texto) {
  if (useDb) {
    await pool.query("INSERT INTO tareas (texto) VALUES ($1)", [texto]);
  } else {
    tareasMemoria.unshift({
      id: idMemoria++,
      texto,
      completada: false,
      creada_en: new Date(),
    });
  }
}

async function toggleTarea(id) {
  if (useDb) {
    await pool.query(
      "UPDATE tareas SET completada = NOT completada WHERE id = $1",
      [id]
    );
  } else {
    tareasMemoria = tareasMemoria.map((t) =>
      t.id === id ? { ...t, completada: !t.completada } : t
    );
  }
}

async function borrarTarea(id) {
  if (useDb) {
    await pool.query("DELETE FROM tareas WHERE id = $1", [id]);
  } else {
    tareasMemoria = tareasMemoria.filter((t) => t.id !== id);
  }
}

// Inicializar BBDD (solo en modo PostgreSQL)
async function initDb() {
  if (!useDb) {
    console.log("Sin DATABASE_URL, no se inicializa BBDD (modo memoria).");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tareas (
      id SERIAL PRIMARY KEY,
      texto TEXT NOT NULL,
      completada BOOLEAN NOT NULL DEFAULT FALSE,
      creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Tabla 'tareas' lista en PostgreSQL.");
}

// ---------- Middleware ----------

app.use(express.urlencoded({ extended: true })); // formularios HTML
app.use(express.json()); // JSON para la API

// ---------- Rutas HTML ----------

app.get("/", async (req, res) => {
  try {
    let tareas = await getTareas();

    const filter = req.query.filter || "all"; // all | pending | completed
    const q = (req.query.q || "").trim().toLowerCase();

    // Estadísticas
    const total = tareas.length;
    const completadas = tareas.filter((t) => t.completada).length;
    const pendientes = total - completadas;

    // Filtros por estado
    if (filter === "pending") {
      tareas = tareas.filter((t) => !t.completada);
    } else if (filter === "completed") {
      tareas = tareas.filter((t) => t.completada);
    }

    // Búsqueda por texto
    if (q) {
      tareas = tareas.filter((t) =>
        t.texto.toLowerCase().includes(q.toLowerCase())
      );
    }

    const listaTareas = tareas
      .map(
        (t) => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <span style="${
              t.completada ? "text-decoration: line-through; color: #777;" : ""
            }">${t.texto}</span>
            <br/>
            <small class="text-muted">
              Creada: ${new Date(t.creada_en).toLocaleString("es-ES")}
            </small>
          </div>
          <div class="btn-group">
            <form action="/tareas/${t.id}/toggle" method="POST" style="display:inline;">
              <button class="btn btn-sm ${
                t.completada ? "btn-warning" : "btn-success"
              }" type="submit">
                ${t.completada ? "Marcar pendiente" : "Completar"}
              </button>
            </form>
            <form action="/tareas/${t.id}/borrar" method="POST" style="display:inline; margin-left: 0.25rem;">
              <button class="btn btn-sm btn-danger" type="submit">Borrar</button>
            </form>
          </div>
        </li>
      `
      )
      .join("");

    const urlBase = "/";
    const activeClass = (f) =>
      filter === f ? "btn-primary" : "btn-outline-primary";

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Gestor de tareas - Railway + Node</title>
          <link
            href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
            rel="stylesheet"
          />
        </head>
        <body class="bg-light">
          <div class="container py-4">
            <div class="row justify-content-center">
              <div class="col-md-8">
                <div class="card shadow-sm">
                  <div class="card-body">
                    <h1 class="h3 mb-3 text-center">Gestor de tareas</h1>
                    <p class="text-center text-muted mb-4">
                      App en <strong>Node + Express</strong> desplegada en <strong>Railway</strong>${
                        useDb
                          ? " con base de datos <strong>PostgreSQL</strong>."
                          : " usando almacenamiento en memoria (modo local)."
                      }
                    </p>

                    <div class="mb-3">
                      <span class="badge bg-secondary me-1">Total: ${total}</span>
                      <span class="badge bg-success me-1">Pendientes: ${pendientes}</span>
                      <span class="badge bg-info text-dark">Completadas: ${completadas}</span>
                    </div>

                    <h2 class="h5">Nueva tarea</h2>
                    <form action="/tareas" method="POST" class="mb-3 d-flex gap-2">
                      <input
                        type="text"
                        name="texto"
                        class="form-control"
                        placeholder="Escribe una tarea..."
                        required
                      />
                      <button class="btn btn-primary" type="submit">Añadir</button>
                    </form>

                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <div class="btn-group" role="group">
                        <a href="${urlBase}?filter=all" class="btn btn-sm ${activeClass(
      "all"
    )}">Todas</a>
                        <a href="${urlBase}?filter=pending" class="btn btn-sm ${activeClass(
      "pending"
    )}">Pendientes</a>
                        <a href="${urlBase}?filter=completed" class="btn btn-sm ${activeClass(
      "completed"
    )}">Completadas</a>
                      </div>

                      <form method="GET" action="${urlBase}" class="d-flex ms-2">
                        <input type="hidden" name="filter" value="${filter}" />
                        <input
                          type="text"
                          name="q"
                          value="${q}"
                          class="form-control form-control-sm"
                          placeholder="Buscar..."
                        />
                        <button class="btn btn-sm btn-outline-secondary ms-1" type="submit">OK</button>
                      </form>
                    </div>

                    <h2 class="h5">Tareas</h2>
                    <ul class="list-group">
                      ${
                        listaTareas ||
                        '<li class="list-group-item text-muted">No hay tareas para los filtros actuales.</li>'
                      }
                    </ul>

                    <hr class="mt-4" />
                    <p class="text-muted mb-0">
                      También disponible una pequeña API JSON en <code>/api/tareas</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Error en GET /:", err);
    res.status(500).send("Error interno del servidor");
  }
});

// Crear tarea (HTML)
app.post("/tareas", async (req, res) => {
  const texto = req.body.texto?.trim();
  if (!texto) {
    return res.redirect("/");
  }
  try {
    await crearTarea(texto);
    // Siempre volvemos a la página principal
    res.redirect("/");
  } catch (err) {
    console.error("Error al crear tarea:", err);
    res.status(500).send("Error creando tarea");
  }
});

// Marcar / desmarcar completada
app.post("/tareas/:id/toggle", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.redirect("/");
  try {
    await toggleTarea(id);
    res.redirect("/");
  } catch (err) {
    console.error("Error al actualizar tarea:", err);
    res.status(500).send("Error actualizando tarea");
  }
});

// Borrar tarea
app.post("/tareas/:id/borrar", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.redirect("/");
  try {
    await borrarTarea(id);
    res.redirect("/");
  } catch (err) {
    console.error("Error al borrar tarea:", err);
    res.status(500).send("Error borrando tarea");
  }
});

// ---------- API REST sencilla ----------

// Listar tareas en JSON
app.get("/api/tareas", async (req, res) => {
  try {
    const tareas = await getTareas();
    res.json({ useDb, count: tareas.length, tareas });
  } catch (err) {
    console.error("Error en GET /api/tareas:", err);
    res.status(500).json({ error: "Error obteniendo tareas" });
  }
});

// Crear tarea vía JSON: { "texto": "algo" }
app.post("/api/tareas", async (req, res) => {
  const texto = req.body.texto?.trim();
  if (!texto) {
    return res.status(400).json({ error: "Texto requerido" });
  }
  try {
    await crearTarea(texto);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Error en POST /api/tareas:", err);
    res.status(500).json({ error: "Error creando tarea" });
  }
});

// Endpoint de salud
app.get("/health", async (req, res) => {
  try {
    const tareas = await getTareas();
    res.json({ status: "ok", totalTareas: tareas.length, useDb });
  } catch (err) {
    console.error("Error en /health:", err);
    res.status(500).json({ status: "error" });
  }
});

// Iniciar servidor + BBDD (si aplica)
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error inicializando la BBDD:", err);
    process.exit(1);
  });
