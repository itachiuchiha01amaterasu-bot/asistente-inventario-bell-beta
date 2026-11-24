# 🐳 Inventario Bell con Docker (Windows y Linux)

> 💡 ¿Buscas instalar la app como una aplicación normal, sin Docker? Usa el
> instalador de escritorio: consulta **[DESKTOP.md](DESKTOP.md)**.

La aplicación completa corre con Docker: **PostgreSQL + backend Flask + frontend Next.js**.
No hace falta instalar Python ni Node en el equipo; solo Docker.

```
Navegador
   │  http://localhost:3000
   ▼
Frontend (Next.js, puerto 3000)
   │  http://localhost:8000/api/...
   ▼
Backend (Flask/Gunicorn, puerto 8000)
   │  red interna de Docker
   ▼
PostgreSQL (puerto 5432, no se publica)
```

---

## 1. Requisitos

### Windows 10/11
1. Instala **Docker Desktop** desde <https://www.docker.com/products/docker-desktop/>.
2. Durante la instalación deja activado **WSL 2** (es lo recomendado).
3. Abre Docker Desktop y espera a que diga **Engine running**.
4. Usa **PowerShell** o **Git Bash** para los comandos.

> Si PowerShell no reconoce `docker`, cierra y vuelve a abrir la terminal.

### Linux
1. Instala Docker Engine y el plugin de Compose. En Ubuntu/Debian:
   ```bash
   sudo apt update
   sudo apt install docker.io docker-compose-v2
   sudo systemctl enable --now docker
   ```
   También puedes seguir la guía oficial: <https://docs.docker.com/engine/install/>
2. Para usar `docker` sin `sudo`:
   ```bash
   sudo usermod -aG docker "$USER"
   ```
   Cierra sesión y vuelve a entrar.
3. Comprueba:
   ```bash
   docker run --rm hello-world
   docker compose version
   ```

---

## 2. Arranque rápido

Desde la raíz del repositorio (`inventario_app/`):

```bash
docker compose up -d --build
```

La primera vez descarga PostgreSQL, instala dependencias y compila el frontend;
puede tardar varios minutos. Las siguientes veces es mucho más rápido.

Comprueba que todo esté sano:

```bash
docker compose ps
```

Deben aparecer `db`, `backend` y `frontend` como `healthy` o `running`.
Luego abre:

- Aplicación: <http://localhost:3000>
- API: <http://localhost:8000/health>

### Crear el primer super_admin

El registro público solo crea usuarios con rol `user`. Para poder administrar el
inventario hace falta un `super_admin`. Créalo una sola vez:

**Linux / macOS / Git Bash**
```bash
ADMIN_PASSWORD='TuClaveSegura123' docker compose --profile init run --rm admin
```

**Windows PowerShell**
```powershell
$env:ADMIN_PASSWORD = "TuClaveSegura123"
docker compose --profile init run --rm admin
Remove-Item Env:ADMIN_PASSWORD
```

Usuario por defecto: `admin` · correo `admin@inventario.local`.
Puedes cambiarlos con `ADMIN_USERNAME` y `ADMIN_EMAIL`.

> El mismo comando sirve para **cambiar la contraseña** del super_admin
> (actualiza el usuario si ya existe).
>
> El login pide un captcha de suma o resta; es normal.

---

## 3. Configuración opcional

Sin crear ningún archivo, la aplicación arranca con valores por defecto para
uso local. Para personalizar, crea `.env.docker` a partir del ejemplo:

```bash
cp .env.docker.example .env.docker
```

Edítalo y ejecuta Compose indicando ese archivo:

```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker --profile init run --rm admin
```

> En Windows, `cp` funciona en Git Bash. En PowerShell usa
> `Copy-Item .env.docker.example .env.docker`.

Variables principales:

| Variable | Por defecto | Para qué sirve |
|----------|-------------|----------------|
| `FRONTEND_PORT` | `3000` | Puerto de la aplicación |
| `BACKEND_PORT` | `8000` | Puerto de la API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL que usa el **navegador** para llamar a la API |
| `POSTGRES_USER` | `bell` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | `bell_local_password` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | `bell` | Nombre de la base |
| `JWT_SECRET_KEY` | clave local | Firma de las sesiones |
| `ADMIN_USERNAME` | `admin` | Usuario del primer super_admin |
| `ADMIN_EMAIL` | `admin@inventario.local` | Correo del super_admin |
| `ADMIN_PASSWORD` | vacío | Contraseña del super_admin (mínimo 8) |
| `IA_API_KEY` | vacío | Clave de OpenRouter para el chat con IA |

> `NEXT_PUBLIC_API_URL` se **incrusta al compilar** el frontend. Si la cambias,
> reconstruye: `docker compose build frontend && docker compose up -d frontend`.

> Si usas caracteres especiales en `POSTGRES_PASSWORD`, escríbelos codificados
> para URL dentro de `DATABASE_URL` (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).
> Lo más simple es usar solo letras, números, guiones y guiones bajos.

### Usar el chat con IA

Sin `IA_API_KEY` todo funciona menos el chat de lenguaje natural. Para
habilitarlo, consigue una clave gratuita en <https://openrouter.ai/keys> y
define `IA_API_KEY` en `.env.docker` (o en el entorno) antes de arrancar.

---

## 4. Abrir desde el teléfono u otro equipo de la red

1. Averigua la IP local de la computadora:
   - Linux: `hostname -I`
   - Windows: `ipconfig` → *Dirección IPv4*
2. En `.env.docker`:
   ```env
   NEXT_PUBLIC_API_URL=http://192.168.1.50:8000
   ```
   (cambia la IP por la tuya)
3. Reconstruye el frontend:
   ```bash
   docker compose --env-file .env.docker build frontend
   docker compose --env-file .env.docker up -d
   ```
4. Desde el teléfono abre `http://192.168.1.50:3000`.

> La URL debe ser accesible desde el navegador. No uses `http://backend:8000`:
> ese nombre solo existe dentro de la red de Docker.

---

## 5. Comandos útiles

```bash
# Ver estado y salud
docker compose ps

# Ver logs (Ctrl+C para salir)
docker compose logs -f backend
docker compose logs -f frontend

# Detener sin borrar datos
docker compose stop

# Apagar y quitar contenedores (los datos se conservan en el volumen)
docker compose down

# Apagar y BORRAR la base de datos y todo lo guardado
docker compose down -v

# Reconstruir después de cambiar código
docker compose up -d --build

# Reconstruir sin caché (si algo queda raro)
docker compose build --no-cache
docker compose up -d

# Entrar a la base de datos
docker compose exec db psql -U bell -d bell

# Abrir una consola en el backend
docker compose exec backend sh
```

---

## 6. Datos y respaldos

La base de datos se guarda en el volumen `inventario-bell_db_data` y sobrevive a
`docker compose down`, reinicios y actualizaciones. Solo se borra con
`docker compose down -v`.

### Respaldo

**Linux / macOS / Git Bash**
```bash
docker compose exec -T db pg_dump -U bell -d bell > respaldo.sql
```

**Windows PowerShell**
```powershell
docker compose exec -T db pg_dump -U bell -d bell | Out-File -Encoding utf8 respaldo.sql
```

### Restaurar

**Linux / macOS / Git Bash**
```bash
cat respaldo.sql | docker compose exec -T db psql -U bell -d bell
```

**Windows PowerShell**
```powershell
Get-Content respaldo.sql | docker compose exec -T db psql -U bell -d bell
```

> Si cambiaste `POSTGRES_USER` o `POSTGRES_DB`, usa esos nombres.

---

## 7. Actualizar la aplicación

```bash
git pull
docker compose up -d --build
```

La migración de columnas se ejecuta sola al arrancar el backend. Los datos del
volumen se conservan.

---

## 8. Problemas frecuentes

| Síntoma | Causa y solución |
|---------|------------------|
| `Cannot connect to the Docker daemon` | Docker Desktop no está abierto (Windows) o el servicio no corre: `sudo systemctl start docker` (Linux). |
| `permission denied ... docker.sock` | Falta el grupo `docker`: `sudo usermod -aG docker "$USER"` y vuelve a iniciar sesión. |
| `port is already allocated` | Otro programa usa el puerto. Cambia `FRONTEND_PORT`/`BACKEND_PORT` en `.env.docker` y reconstruye el frontend si cambia la URL de la API. |
| La página carga pero no hay datos | El navegador no llega a `NEXT_PUBLIC_API_URL`. Debe ser `http://localhost:8000` o la IP real del equipo; reconstruye el frontend tras cambiarla. |
| `backend` no pasa a `healthy` | Revisa `docker compose logs backend`. Si cambiaste `POSTGRES_PASSWORD` después del primer arranque, la base conserva la clave vieja: restaura la variable anterior o usa `docker compose down -v` (borra datos). |
| El login dice credenciales inválidas | Todavía no creaste el super_admin. Ejecuta el comando de la sección 2. |
| El chat no responde | Falta `IA_API_KEY`, la cuota gratuita se agotó o no hay conexión. El resto de la app sigue funcionando. |
| El primer build tarda mucho | Es normal: descarga imágenes e instala dependencias. En Windows, asegúrate de tener WSL 2 activo. |
| Cambié código y no se refleja | `docker compose up -d --build`. |
| Quiero empezar de cero | `docker compose down -v` y luego `docker compose up -d --build`. |

---

## 9. Relación con Render y Vercel

Estos archivos Docker son **solo para ejecución local**. No cambian el
despliegue en la nube: Render sigue usando `render.yaml` y Vercel la carpeta
`frontend`. Puedes tener ambos funcionando a la vez con bases de datos
separadas.

La única modificación compartida es `DB_SSL`: por defecto sigue activo para
Supabase/Render, y Docker lo desactiva explícitamente con `DB_SSL=false`.
