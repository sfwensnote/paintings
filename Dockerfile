FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    HOST=0.0.0.0 \
    ART_MUSEUM_DB=/data/art_museum.sqlite3

WORKDIR /app

COPY backend/ ./backend/
COPY admin/ ./admin/
COPY frontend/ ./frontend/
COPY database/ ./database/
COPY manifest.webmanifest ./manifest.webmanifest
COPY paints/*.webp ./paints/

RUN useradd --system --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data \
    && chown -R app:app /app /data

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'),timeout=3).read()"

CMD ["python", "backend/server.py"]
