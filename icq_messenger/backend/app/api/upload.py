import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = "/app/uploads"
MAX_SIZE = 50 * 1024 * 1024  # 50 MB
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("")
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс 50 МБ)")

    ext = os.path.splitext(file.filename or "file")[1]
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, name)

    with open(path, "wb") as f:
        f.write(data)

    return {
        "url": f"/uploads/{name}",
        "name": file.filename,
        "size": len(data),
        "type": file.content_type or "application/octet-stream",
    }
