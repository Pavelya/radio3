FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install piper-tts and flask
RUN pip install --no-cache-dir piper-tts flask

# Create directories
RUN mkdir -p /app/models /app/cache

# Download voice model (US English, medium quality, ~65MB)
RUN curl -L https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx \
    -o /app/models/en_US-lessac-medium.onnx && \
    curl -L https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json \
    -o /app/models/en_US-lessac-medium.onnx.json

WORKDIR /app
COPY server.py .

EXPOSE 5002

CMD ["python", "server.py"]
