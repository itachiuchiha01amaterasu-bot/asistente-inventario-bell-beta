const { app, BrowserWindow, Menu, dialog, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Dirección de la aplicación publicada. Todos los usuarios comparten los
// mismos datos porque la app sigue viviendo en la nube.
// Para probar otra dirección: INVENTARIO_URL=http://localhost:3000 npm start
const APP_URL =
  process.env.INVENTARIO_URL || "https://asistente-inventario-bell-beta.vercel.app";
const APP_ORIGIN = new URL(APP_URL).origin;
const NOMBRE = "Inventario Bell";

let ventana = null;

function esDelApp(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function abrirFuera(url) {
  try {
    const { protocol } = new URL(url);
    // Solo se abren enlaces web o de correo; nunca archivos locales.
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") {
      shell.openExternal(url);
    }
  } catch {
    // Una URL inválida simplemente se ignora.
  }
}

function rutaEstado() {
  return path.join(app.getPath("userData"), "ventana.json");
}

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(rutaEstado(), "utf8"));
  } catch {
    return {};
  }
}

function guardarEstado() {
  if (!ventana || ventana.isDestroyed()) return;

  try {
    const maximizada = ventana.isMaximized();
    const bounds = maximizada ? leerEstado().bounds || {} : ventana.getBounds();
    fs.writeFileSync(rutaEstado(), JSON.stringify({ bounds, maximizada }));
  } catch {
    // Si no se puede guardar el tamaño, la app debe seguir funcionando.
  }
}

function mostrarSinConexion() {
  if (!ventana || ventana.isDestroyed()) return;

  ventana.loadFile(path.join(__dirname, "offline.html"), {
    query: { url: APP_URL },
  });

  if (!ventana.isVisible()) ventana.show();
}

function cargarApp() {
  if (!ventana || ventana.isDestroyed()) return;

  ventana.loadURL(APP_URL).catch(() => mostrarSinConexion());
}

function crearVentana() {
  const estado = leerEstado();
  const bounds = estado.bounds || {};

  ventana = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: NOMBRE,
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#101010",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (estado.maximizada) ventana.maximize();

  ventana.once("ready-to-show", () => ventana.show());
  cargarApp();

  // Los enlaces externos se abren en el navegador, no dentro de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (esDelApp(url)) return { action: "allow" };

    abrirFuera(url);
    return { action: "deny" };
  });

  ventana.webContents.on("will-navigate", (evento, url) => {
    if (!esDelApp(url) && !url.startsWith("file://")) {
      evento.preventDefault();
      abrirFuera(url);
    }
  });

  ventana.webContents.on(
    "did-fail-load",
    (_evento, codigo, _descripcion, url, esPrincipal) => {
      // -3 es una navegación cancelada normal; no es un fallo real.
      if (!esPrincipal || codigo === -3 || url.startsWith("file://")) return;
      mostrarSinConexion();
    }
  );

  ventana.on("close", guardarEstado);
  ventana.on("closed", () => {
    ventana = null;
  });
}

function crearMenu() {
  const plantilla = [
    {
      label: "Archivo",
      submenu: [{ role: "quit", label: "Salir" }],
    },
    {
      label: "Ver",
      submenu: [
        {
          label: "Recargar",
          accelerator: "CmdOrCtrl+R",
          click: cargarApp,
        },
        { type: "separator" },
        { role: "resetZoom", label: "Tamaño normal" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
        { role: "toggleDevTools", label: "Herramientas de desarrollo" },
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        {
          label: "Abrir en el navegador",
          click: () => shell.openExternal(APP_URL),
        },
        {
          label: "Acerca de",
          click: () =>
            dialog.showMessageBox(ventana, {
              type: "info",
              title: `Acerca de ${NOMBRE}`,
              message: NOMBRE,
              detail:
                `Versión ${app.getVersion()}\n\n` +
                "Cliente de escritorio conectado a la nube. " +
                "Los datos se comparten entre todos los usuarios.",
              buttons: ["Aceptar"],
            }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// Una sola ventana por equipo: al abrir de nuevo, se enfoca la existente.
const bloqueo = app.requestSingleInstanceLock();

if (!bloqueo) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!ventana) return;

    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("com.bell.inventario");

    // Los reportes CSV se descargan con un diálogo para elegir la carpeta.
    session.defaultSession.on("will-download", (_evento, item) => {
      item.setSaveDialogOptions({
        title: "Guardar archivo",
        defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
      });
    });

    crearMenu();
    crearVentana();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
