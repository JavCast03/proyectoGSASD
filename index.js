const express = require("express");
const app = express();

// Railway asignará el puerto automáticamente usando process.env.PORT
const PORT = process.env.PORT || 3000;

// Para leer datos del formulario POST
app.use(express.urlencoded({ extended: true }));

// "Base de datos" en memoria
let tareas = [];
let idActual = 1;

// Página principal
app.get("/", (req, res) => {
  const listaTareas = tareas
    .map(
      (t) => `
      <li>
        ${t.texto}
        <form action="/borrar/${t.id}" method="POST" style="display:inline">
          <button type="submit">Borrar</button>
        </form>
      </li>
    `
    )
    .join("");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Gestor de tareas - Railway + Node</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 2rem auto;
          }
          h1 {
            text-align: center;
          }
          input[type="text"] {
            width: 70%;
            padding: 0.4rem;
          }
          button {
            padding: 0.4rem 0.8rem;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <h1>Gestor de tareas</h1>
        <p>App hecha en Node + Express · Desplegada en Railway</p>

        <form action="/tareas" method="POST">
          <input type="text" name="texto" placeholder="Escribe una tarea..." required />
          <button>Añadir</button>
        </form>

        <h2>Tareas:</h2>
        <ul>${listaTareas || "<li>No hay tareas aún.</li>"}</ul>
      </body>
    </html>
  `);
});

app.post("/tareas", (req, res) => {
  const texto = req.body.texto?.trim();
  if (texto) {
    tareas.push({ id: idActual++, texto });
  }
  res.redirect("/");
});

// Borrar tarea
app.post("/borrar/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  tareas = tareas.filter((t) => t.id !== id);
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
