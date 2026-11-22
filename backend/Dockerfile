# Backend Flask + Gunicorn.
# Se construye desde la RAÍZ del repositorio:
#   docker build -f backend/Dockerfile -t inventario-bell-backend .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Las dependencias se copian primero para aprovechar la caché de Docker:
# si solo cambia el código, no se vuelven a instalar.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend

# La aplicación no necesita privilegios de root.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
    CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health',timeout=3)"

CMD ["sh", "-c", "exec gunicorn backend.app:app --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 4 --timeout 120"]
