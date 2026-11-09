# 🚀 Guía de Despliegue - Inventario App

Arquitectura:

| Componente | Plataforma | Estado |
|------------|-----------|--------|
| Código | GitHub | ✅ Subido |
| Base de datos | Supabase (PostgreSQL) | ✅ Tablas y admin creados |
| Backend (Flask) | Render | ⏳ Pendiente |
| Frontend (Next.js) | Vercel | ⏳ Pendiente |

Repositorio: <https://github.com/itachiuchiha01amaterasu-bot/asistente-inventario-bell-beta>

---

## 🔐 Variables de entorno

### Backend (local y Render)

```env
DATABASE_URL=postgresql+pg8000://postgres.xxx:TU_PASSWORD@aws-0-xxx.pooler.supabase.com:5432/postgres
IA_BASE_URL=https://openrouter.ai/api/v1
IA_API_KEY=sk-or-v1-tu_clave_real
IA_MODEL=openrouter/free
IA_FALLBACK_MODELS=liquid/lfm-2.5-2.6b:free,nvidia/nemotron-3.5-lightning:free
IA_TIMEOUT=20
JWT_SECRET_KEY=CAMBIA_POR_UNA_CLAVE_LARGA_Y_UNICA
```

- Si usas solo SQLite para pruebas locales: `DATABASE_URL=sqlite:///inventario.db`
- Nunca subas `.env` a GitHub (ya está en `.gitignore`).

### Frontend (Vercel)

```env
NEXT_PUBLIC_API_URL=https://TU-BACKEND.onrender.com
```

---

## 🗄️ Supabase (ya configurado)

Detalles importantes para que la conexión siga funcionando:

1. Usa el **Session pooler (puerto 5432)**, no el Transaction pooler (6543):
   `pg8000` usa prepared statements y el modo transaction puede fallar.
2. Cambia `postgresql://` por `postgresql+pg8000://` y elimina `?pgbouncer=true`.
3. `backend/app.py` configura SSL equivalente a `sslmode=require` (cifra sin
   verificar la CA). Si quieres verificación completa, descarga el certificado
   en **Database settings → SSL Configuration → Download certificate** y define
   `DB_SSL_CA=/ruta/al/certificado.crt`.
4. Credenciales del super_admin: usuario `admin`. La contraseña está guardada
   localmente en `~/.inventario_admin_password` (permisos 600, fuera del repo).
   Para cambiarla: `python -m backend.resetear_admin`.

Si la contraseña de la base se rechaza, ve a **Settings → Database → Reset
database password** y actualiza `DATABASE_URL`.

---

## 🖥️ Render (backend)

### Opción A — Blueprint (recomendada)

El repo incluye `render.yaml`, que ya define build, arranque, health check y
variables. Solo faltan los secretos.

1. Entra a [render.com](https://render.com) e inicia sesión con GitHub.
2. **New + → Blueprint**.
3. Selecciona el repositorio `asistente-inventario-bell-beta`.
4. Render leerá `render.yaml` y pedirá los valores marcados como secretos:
   - `DATABASE_URL` → la URI de Supabase (`postgresql+pg8000://...:5432/postgres`)
   - `IA_API_KEY` → tu clave de OpenRouter
5. **Apply / Deploy**.

### Opción B — Web Service manual

- **Name:** `inventario-backend`
- **Root Directory:** *(vacío: la raíz del repositorio)*
- **Runtime:** `Python 3`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn backend.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`
- **Health Check Path:** `/health`
- Variables: las de la sección anterior (Render genera `JWT_SECRET_KEY` solo
  en el Blueprint; en manual pon una propia).

> ⚠️ La raíz debe ser el repositorio completo porque `app.py` importa
> `backend.models`, `backend.auth`, etc. Si pones Root Directory = `backend`,
> el arranque falla con `ModuleNotFoundError: No module named 'backend'`.

Render dará una URL tipo `https://inventario-backend.onrender.com`.
Verifica: `https://inventario-backend.onrender.com/health` →
`{"service":"inventario_app","status":"ok"}`.

> El plan gratuito suspende el servicio tras ~15 min sin tráfico; la primera
> petición tras la pausa tarda ~30-50 s. Es normal.

---

## ⚡ Vercel (frontend)

1. Entra a [vercel.com](https://vercel.com) e inicia sesión con GitHub.
2. **Add New → Project** e importa el repositorio.
3. Configura:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `frontend`
4. **Environment Variable:**
   - `NEXT_PUBLIC_API_URL` → `https://inventario-backend.onrender.com`
5. **Deploy**.

> `NEXT_PUBLIC_API_URL` se incrusta en el build: si la cambias, hay que
> redesplegar (Deployments → Redeploy).

---

## ✅ Verificación final

1. Abre la URL de Vercel.
2. Inicia sesión con `admin` y la contraseña de `~/.inventario_admin_password`.
3. Comprueba que carga el inventario (viene de Supabase).
4. Prueba el asistente: `agrega pan integral 1 kilo marca pipon, 3 unidades`.
5. Recarga la página: el producto debe seguir ahí (persistencia real).

### Si algo falla

| Síntoma | Causa probable |
|---------|----------------|
| Login falla solo en Vercel | `NEXT_PUBLIC_API_URL` mal o sin redesplegar |
| Error de CORS | Debe estar activo `CORS(app)` en `backend/app.py` |
| `password authentication failed` | Contraseña de Supabase incorrecta |
| `prepared statement ... already exists` | Estás usando el puerto 6543; usa 5432 |
| `ModuleNotFoundError: No module named 'backend'` | Root Directory mal configurado en Render |
| Backend tarda en responder | Plan gratuito de Render despertando |

---

## ⚠️ Seguridad

- **Nunca subas `.env` a GitHub.** Contiene claves reales.
- **IA_API_KEY:** clave de OpenRouter; si se filtra, revócala y genera otra.
- **JWT_SECRET_KEY:** única y larga en producción.
- **Contraseña de Supabase:** si se compartió por chat o correo, resetéala.
- **SQLite en Render se borra en cada despliegue.** Producción usa Supabase.
