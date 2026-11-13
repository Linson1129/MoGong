FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Only the package metadata and the source are needed; tests and tooling stay out of the image.
COPY pyproject.toml ./
COPY app ./app
RUN pip install .

# Explicit rather than relying on the REPO_ROOT default, which resolves to / inside a container.
ENV MOGONG_LAYOUTS_DIR=/data/layouts \
    MOGONG_COMPILED_DIR=/data/compiled
RUN mkdir -p /data/layouts /data/compiled

EXPOSE 8100

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
