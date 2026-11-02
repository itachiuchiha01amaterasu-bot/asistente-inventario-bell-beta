# 🚀 Guía de Despliegue - Inventario App

Este documento explica paso a paso cómo subir el proyecto a GitHub, Render (backend) y Vercel (frontend), usando Supabase como base de datos.

---

## 📁 Archivos del proyecto y qué hacer con cada uno

| Archivo | Ubicación | ¿Editar? | ¿Subir a GitHub? |
|---------|-----------|----------|------------------|
| `backend/app.py` | `backend/app.py` | ✅ Ya editado (pool de conexiones, parsear_contenido, health) | ✅ Sí |
| `backend/.env.example` | `backend/.env.example` | ✅ Creado (solo ejemplo) | ✅ Sí |
| `backend/.env` | `backend/.env` | ✅ **TÚ debes crearlo** con tus claves reales | ❌ **NO** (está en .gitignore) |
| `frontend/.env.example` | `frontend/.env.example` | ✅ Creado (solo ejemplo) | ✅ Sí |
| `frontend/.env.local` | `frontend/.env.local` | ✅ Para desarrollo local (localhost) | ❌ No (en .gitignore) |
| `/.env` | `/.env` | ⚠️ Tiene tu IA_API_KEY real — **NO subir** | ❌ No (en .gitignore) |
| `/.gitignore` | `/.gitignore` | ✅ Actualizado | ✅ Sí |

---

## 🔐 Paso 1: Crear tu archivo `.env` del backend (LOCALMENTE)

No subas este archivo a GitHub. Crea `backend/.env` con tus datos reales:

```env
DATABASE_URL=postgresql+pg8000://postgres.xxx:TU_PASSWORD@aws-0-xxx.pooler.supabase.com:5432/postgres
IA_BASE_URL=https://openrouter.ai/api/v1
IA_API_KEY=sk-or-v1-tu_clave_real
IA_MODEL=nvidia/nemotron-3.5-lightning:free
IA_FALLBACK_MODELS=openrouter/free,liquid/lfm-2.5-2.6b:free
PORT=8000
JWT_SECRET_KEY=CAMBIA_POR_UNA_CLAVE_LARGA_Y_UNICA
```

> Si usas solo SQLite para pruebas locales: `DATABASE_URL=sqlite:///inventario.db`

---

## 🐙 Paso 2: Subir a GitHub

Desde la carpeta raíz del proyecto:

```bash
cd /home/oswaldo/Proyectos/inventario_app
git init
git add .
git commit -m "Initial commit: inventario app"
git remote add origin https://github.com/TU_USUARIO/inventario_app.git
git branch -M main
git push -u origin main
```

---

## 🗄️ Paso 3: Configurar Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto
2. Ve a **Settings → Database → Connection pooling**
3. Copia el **Connection string (URI)** del **Session pooler (puerto 5432)**
   > ⚠️ Usa el Session pooler, no el Transaction pooler (6543): `pg8000` usa
   > prepared statements y el modo transaction puede dar errores.
4. En la URL, cambia `postgresql://` por `postgresql+pg8000://` y **elimina**
   cualquier `?pgbouncer=true` (pg8000 no lo entiende).
5. Pégala en `DATABASE_URL` de tu `backend/.env` y en las variables de entorno
   de Render. El SSL lo configura automáticamente `backend/app.py`.
6. Si la contraseña fue rechazada, ve a **Settings → Database → Reset database
   password** y genera una nueva.

---

## 🖥️ Paso 4: Desplegar Backend en Render

1. Ve a [render.com](https://render.com)
2. **New + → Web Service**
3. Conecta tu repositorio de GitHub
4. Configura:
   - **Name:** `inventario-backend`
   - **Root Directory:** *(dejar vacío, usar la raíz del repositorio)*
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn backend.app:app`
   > ⚠️ La raíz debe ser el repositorio completo porque `app.py` importa
   > `backend.models`, `backend.auth`, etc. Si pones Root Directory = `backend`,
   > el arranque fallará con `ModuleNotFoundError: No module named 'backend'`.
5. Agrega las **Environment Variables**:
   - `DATABASE_URL` → tu connection string de Supabase (con `postgresql+pg8000://`)
   - `IA_BASE_URL` → `https://openrouter.ai/api/v1`
   - `IA_API_KEY` → tu clave de OpenRouter
   - `IA_MODEL` → `nvidia/nemotron-3.5-lightning:free`
   - `IA_FALLBACK_MODELS` → `openrouter/free,liquid/lfm-2.5-2.6b:free`
   - `JWT_SECRET_KEY` → una clave larga y segura
   - `PORT` → `10000`

Render te dará una URL como: `https://inventario-backend.onrender.com`

---

## ⚡ Paso 5: Desplegar Frontend en Vercel

1. Ve a [vercel.com](https://vercel.com)
2. **Add New → Project**
3. Importa tu repositorio `inventario_app`
4. Configura:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `frontend`
5. Agrega **Environment Variable**:
   - `NEXT_PUBLIC_API_URL` → `https://inventario-backend.onrender.com`

Vercel te dará una URL como: `https://inventario-app.vercel.app`

---

## ✅ Paso 6: Probar

1. Abre tu frontend en Vercel
2. Inicia sesión con el super_admin (crea uno con `python crear_super_admin.py` si no existe)
3. Prueba editar una variante y cerrar sesión

---

## ⚠️ Advertencias importantes

- **Nunca subas `.env` a GitHub.** Contiene tus claves reales.
- **IA_API_KEY:** Es tu clave real de OpenRouter. Guárdala segura.
- **JWT_SECRET_KEY:** Cámbiala por algo único y largo en producción.
- **Base de datos:** SQLite en Render se borra cada despliegue. Usa Supabase PostgreSQL para producción.
