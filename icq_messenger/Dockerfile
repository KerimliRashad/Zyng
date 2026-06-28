FROM python:3.12-slim AS backend

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app/ ./app/
COPY frontend/index.html ./static/index.html
COPY frontend/static/ ./static/static/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
