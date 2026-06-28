FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/

# frontend: index.html в корень статики, static/* рядом
COPY frontend/index.html ./static/index.html
COPY frontend/static/css/ ./static/css/
COPY frontend/static/js/ ./static/js/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
