FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# RDS SSL cert must be at /app/certs/global-bundle.pem
RUN mkdir -p /app/certs
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
