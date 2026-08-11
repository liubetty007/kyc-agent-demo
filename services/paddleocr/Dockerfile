FROM python:3.11.13-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    PADDLEOCR_DEVICE=cpu \
    PADDLEOCR_MAX_INPUT_BYTES=20971520

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --requirement requirements.txt

COPY app.py ./

RUN useradd --create-home --uid 10001 paddleocr \
    && chown -R paddleocr:paddleocr /app /home/paddleocr
USER paddleocr

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --timeout-keep-alive 10"]

