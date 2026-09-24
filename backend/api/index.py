"""Vercel entrypoint: the unchanged FastAPI app, served as one serverless function.

vercel.json sends every path here; FastAPI routes it as usual (/api/v1/..., /uploads/..., /health).
"""
from app.main import app  # noqa: F401
