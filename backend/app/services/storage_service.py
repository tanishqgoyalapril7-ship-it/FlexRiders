"""Uploaded files: campaign banners and rider proof photos.

Every file is referenced in the database as "/uploads/<folder>/<name>", wherever it is stored:
- Local development: files live in UPLOAD_DIR and the backend serves /uploads directly.
- Hosted (SUPABASE_URL and SUPABASE_SECRET_KEY set): files live in the PRIVATE Supabase Storage bucket
  STORAGE_BUCKET. /uploads/<path> answers with a redirect to a short-lived signed URL, so the bucket
  can't be listed or read directly and shared links expire. File names are random (UUID), so a path
  can't be guessed.
"""
import os
import shutil
import uuid
from typing import Optional

import httpx

from app.core.config import settings

PREFIX = "/uploads/"


class StorageError(RuntimeError):
    """The file couldn't be stored; shown to the user as a server error."""


def remote() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY)


def _base() -> str:
    return settings.SUPABASE_URL.rstrip("/") + "/storage/v1"


def _headers(extra: Optional[dict] = None) -> dict:
    key = settings.SUPABASE_SECRET_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}", **(extra or {})}


def signed_url(path: str, expires_in: int = 3600) -> Optional[str]:
    """Temporary address of a stored file (path relative to the bucket, e.g. "campaigns/x.jpg")."""
    res = httpx.post(
        f"{_base()}/object/sign/{settings.STORAGE_BUCKET}/{path.lstrip('/')}",
        json={"expiresIn": expires_in},
        headers=_headers(),
        timeout=15,
    )
    if res.status_code >= 300:
        return None
    return settings.SUPABASE_URL.rstrip("/") + "/storage/v1" + res.json()["signedURL"]


def save(content: bytes, extension: str, folder: str, content_type: str = "application/octet-stream") -> str:
    """Stores the file and returns its "/uploads/<folder>/<name>" reference."""
    path = f"{folder}/{uuid.uuid4().hex}{extension}"
    if remote():
        res = httpx.post(
            f"{_base()}/object/{settings.STORAGE_BUCKET}/{path}",
            content=content,
            headers=_headers({"Content-Type": content_type, "x-upsert": "false"}),
            timeout=30,
        )
        if res.status_code >= 300:
            raise StorageError(f"Photo storage failed ({res.status_code}). Please try again.")
    else:
        directory = os.path.join(settings.UPLOAD_DIR, folder)
        os.makedirs(directory, exist_ok=True)
        with open(os.path.join(settings.UPLOAD_DIR, path), "wb") as f:
            f.write(content)
    return PREFIX + path


def delete(url: Optional[str]) -> None:
    """Best effort: removes one stored file (a missing file is not an error)."""
    if not url or not url.startswith(PREFIX):
        return
    path = url[len(PREFIX):]
    if remote():
        httpx.request("DELETE", f"{_base()}/object/{settings.STORAGE_BUCKET}", json={"prefixes": [path]}, headers=_headers(), timeout=30)
        return
    local = os.path.join(settings.UPLOAD_DIR, path)
    if os.path.isfile(local):
        os.remove(local)


def _list_files(folder: str) -> list:
    """Every file path under a folder in the bucket (Supabase lists one level at a time)."""
    files, offset = [], 0
    while True:
        res = httpx.post(
            f"{_base()}/object/list/{settings.STORAGE_BUCKET}",
            json={"prefix": folder, "limit": 1000, "offset": offset},
            headers=_headers(),
            timeout=30,
        )
        items = res.json() if res.status_code == 200 else []
        for item in items:
            path = f"{folder}/{item['name']}"
            files.extend([path] if item.get("id") else _list_files(path))  # No id = a sub-folder
        if len(items) < 1000:
            return files
        offset += 1000


def delete_folder(folder: str) -> None:
    """Best effort: removes every file in a folder and its sub-folders (used by the data reset)."""
    if remote():
        files = _list_files(folder)
        for i in range(0, len(files), 500):
            httpx.request("DELETE", f"{_base()}/object/{settings.STORAGE_BUCKET}", json={"prefixes": files[i:i + 500]}, headers=_headers(), timeout=30)
        return
    path = os.path.join(settings.UPLOAD_DIR, folder)
    if os.path.isdir(path):
        shutil.rmtree(path)


def ensure_bucket() -> str:
    """Creates the private bucket if it doesn't exist yet. Returns "created" or "exists"."""
    res = httpx.post(
        f"{_base()}/bucket",
        json={
            "id": settings.STORAGE_BUCKET, "name": settings.STORAGE_BUCKET, "public": False,
            "file_size_limit": 8 * 1024 * 1024, "allowed_mime_types": ["image/jpeg", "image/png", "image/webp", "image/heic"],
        },
        headers=_headers(),
        timeout=30,
    )
    if res.status_code < 300:
        return "created"
    if "already exists" in res.text.lower() or res.status_code == 409:
        return "exists"
    raise StorageError(f"Could not create the storage bucket: {res.status_code} {res.text[:200]}")
