# 💻 Instalar Inventario Bell como aplicación de escritorio

Esta versión instala un **acceso directo normal** en Windows o Linux y abre la
aplicación en su propia ventana. No requiere Docker, Python ni Node.

La app se conecta a la versión publicada en la nube, así que **todos los
usuarios y equipos siguen viendo los mismos datos**. Solo necesita internet.

| Característica | Esta app de escritorio | Docker local |
|----------------|------------------------|--------------|
| Instalación | Instalador `.exe`, `.deb` o AppImage | Requiere Docker |
| Datos | Compartidos en la nube | Locales en el equipo |
| Internet | Necesario | No necesario |
| Varios usuarios | Sí, todos ven lo mismo | Solo en la misma PC/red |

---

## 1. Descargar el instalador

Entra a la sección **Releases** del repositorio:

<https://github.com/itachiuchiha01amaterasu-bot/asistente-inventario-bell-beta/releases/latest>

Busca la release **“Inventario Bell · última versión”** y descarga el archivo
que corresponda:

| Sistema | Archivo |
|---------|---------|
| Windows 10/11 (64 bits) | `InventarioBell-Setup-1.0.0.exe` |
| Linux Debian/Ubuntu (64 bits) | `InventarioBell-1.0.0-amd64.deb` |
| Linux otras distros (64 bits) | `InventarioBell-1.0.0-x86_64.AppImage` |

> Los instaladores no están firmados digitalmente. Windows puede mostrar un
> aviso de SmartScreen; es normal en aplicaciones sin certificado de pago.

---

## 2. Instalar en Windows

1. Descarga `InventarioBell-Setup-1.0.0.exe`.
2. Haz doble clic.
3. Si aparece **“Windows protegió tu PC”**:
   - Clic en **Más información**.
   - Clic en **Ejecutar de todas formas**.
4. Elige la carpeta (o deja la que propone) y pulsa **Instalar**.
5. Al terminar se abre la app y queda un acceso directo **Inventario Bell** en
   el escritorio y en el menú Inicio.

Para desinstalarla: **Configuración → Aplicaciones → Inventario Bell →
Desinstalar**. Los datos de la nube no se borran.

---

## 3. Instalar en Linux

### Opción A: Debian / Ubuntu / Linux Mint (recomendado)

Descarga el `.deb` y haz doble clic, o desde una terminal:

```bash
cd ~/Descargas
sudo apt install ./InventarioBell-1.0.0-amd64.deb
```

Queda en el menú de aplicaciones como **Inventario Bell**.

Para desinstalar:

```bash
sudo apt remove inventario-bell
```

### Opción B: AppImage (cualquier distro)

1. Descarga el `.AppImage`.
2. Dale permiso de ejecución:
   ```bash
   chmod +x InventarioBell-1.0.0-x86_64.AppImage
   ```
3. Haz doble clic o ejecútalo:
   ```bash
   ./InventarioBell-1.0.0-x86_64.AppImage
   ```

Si aparece un error de **FUSE**, instala el soporte o usa el `.deb`:

```bash
sudo apt install libfuse2
```

Para desinstalar, simplemente borra el archivo `.AppImage`.

---

## 4. Primer uso

1. Abre **Inventario Bell**.
2. Inicia sesión con tu usuario y contraseña.
3. El login pide un captcha de suma o resta; es normal.

Si todavía no existe el administrador, la app mostrará el login pero no podrás
entrar como `admin`. En ese caso hay que crearlo una vez desde el servidor
(consulta `DESPLIEGUE.md`) o usar la versión Docker (`DOCKER.md`).

---

## 5. Qué incluye la ventana

- **Archivo → Salir**: cierra la app.
- **Ver → Recargar**: vuelve a cargar la aplicación.
- **Ver → Acercar / Alejar**: cambia el tamaño del contenido.
- **Ayuda → Abrir en el navegador**: abre la misma app en el navegador.
- **Descargas**: los reportes CSV piden dónde guardar el archivo.

La app recuerda el tamaño y la posición de la ventana. Si se abre dos veces, se
enfoca la ventana existente en lugar de duplicarla.

---

## 6. Actualizaciones

La app siempre carga la versión publicada en la nube, así que los cambios del
inventario, la tienda y los reportes aparecen solos.

Cuando haya una versión nueva del instalador:

1. Descarga el instalador más reciente desde **Releases**.
2. Instálalo encima de la versión anterior.
3. Tus datos siguen en la nube; no hay que migrar nada.

---

## 7. Si no hay internet

La app muestra una pantalla **“Sin conexión”** con un botón **Reintentar**.

- Si el backend gratuito de Render estaba dormido, la primera carga puede
  tardar hasta un minuto.
- Revisa la conexión y vuelve a intentar.
- La app no guarda datos localmente: necesita internet para funcionar.

---

## 8. Problemas frecuentes

| Problema | Solución |
|----------|----------|
| Windows muestra SmartScreen | **Más información → Ejecutar de todas formas**. |
| El instalador de Windows no abre | Verifica que sea un equipo de 64 bits y que el archivo se haya descargado completo. |
| Linux: “no se puede ejecutar” el AppImage | `chmod +x` al archivo. |
| Linux: error de FUSE | `sudo apt install libfuse2` o usa el `.deb`. |
| La app queda en “Sin conexión” | Revisa internet; espera si Render está despertando; pulsa Reintentar. |
| No puedo iniciar sesión | Verifica usuario/contraseña y que el captcha sea correcto. |
| Quiero abrirla desde el navegador | Menú **Ayuda → Abrir en el navegador**. |

---

## 9. Para desarrollar o recompilar

```bash
cd desktop
npm install
npm start
```

Para probar contra otra dirección (por ejemplo, el frontend local):

```bash
INVENTARIO_URL=http://localhost:3000 npm start
```

Para generar instaladores en tu equipo:

```bash
# Linux: AppImage + .deb
npm run dist:linux

# Windows: instalador NSIS (debe ejecutarse en Windows)
npm run dist:win
```

Los archivos quedan en `desktop/dist/`.

La compilación automática para ambos sistemas está en
`.github/workflows/desktop.yml`: se ejecuta al cambiar algo en `desktop/`, al
publicar un tag `desktop-v*` o manualmente desde **Actions → App de escritorio →
Run workflow**. Al terminar, actualiza la release `desktop-latest`.

### Cambiar la dirección de la nube

La URL está en `desktop/main.js`:

```js
const APP_URL =
  process.env.INVENTARIO_URL || "https://asistente-inventario-bell-beta.vercel.app";
```

Si cambias el dominio de Vercel, actualiza esa constante y vuelve a compilar.
