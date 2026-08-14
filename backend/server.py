import logging
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.background import BackgroundTask
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
PROJECT_DIR = ROOT_DIR.parent
load_dotenv(ROOT_DIR / ".env")

REQUIRED_ENV = ("MONGO_URL", "DB_NAME")
missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
if missing:
    raise RuntimeError(
        "Faltan variables de entorno obligatorias: "
        + ", ".join(missing)
        + f". Copiá {ROOT_DIR / '.env.example'} a {ROOT_DIR / '.env'} y completalas."
    )

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Voxel Cup API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("voxel-cup")


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "Voxel Cup API"}


@api_router.get("/health")
async def health():
    mongo_ok = True
    detail = "ok"
    try:
        await client.admin.command("ping")
    except Exception as exc:  # noqa: BLE001
        mongo_ok = False
        detail = str(exc)
    return {
        "status": "ok" if mongo_ok else "degraded",
        "mongo": detail,
        "db": os.environ["DB_NAME"],
        "time": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(payload: StatusCheckCreate):
    status_obj = StatusCheck(**payload.model_dump())
    doc = status_obj.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in checks:
        if isinstance(check["timestamp"], str):
            check["timestamp"] = datetime.fromisoformat(check["timestamp"])
    return checks


EXPORTIGNORE = PROJECT_DIR / ".exportignore"
FALLBACK_IGNORE = (
    "node_modules/", ".venv/", "venv/", "__pycache__/", ".git/", ".emergent/",
    "build/", "dist/", "coverage/", ".cache/", "test_reports/", ".logs/",
    ".env", ".env.local", "*.pyc", "*.log", "*.zip", ".DS_Store",
)


def _load_ignore_patterns() -> tuple[set[str], list[str]]:
    """Lee .exportignore. Devuelve (directorios excluidos, patrones de archivo)."""
    lines: List[str] = []
    if EXPORTIGNORE.exists():
        lines = [
            line.strip()
            for line in EXPORTIGNORE.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
    if not lines:
        lines = list(FALLBACK_IGNORE)
    dirs = {p.rstrip("/") for p in lines if p.endswith("/")}
    files = [p for p in lines if not p.endswith("/")]
    return dirs, files


def _should_include(rel: Path, patterns: tuple[set[str], list[str]]) -> bool:
    excluded_dirs, file_patterns = patterns
    if any(part in excluded_dirs for part in rel.parts):
        return False
    posix = rel.as_posix()
    for pattern in file_patterns:
        if fnmatch(rel.name, pattern) or fnmatch(posix, pattern):
            return False
    return True


def _build_zip(dest: Path) -> int:
    patterns = _load_ignore_patterns()
    count = 0
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in PROJECT_DIR.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(PROJECT_DIR)
            if not _should_include(rel, patterns):
                continue
            zf.write(path, Path("voxel-cup") / rel)
            count += 1
    return count


@api_router.get("/export/zip")
@api_router.get("/project/download")
@api_router.get("/download/source")
async def export_zip():
    """Empaqueta el código fuente completo y lo devuelve por streaming desde disco."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    tmp = Path(tempfile.mkstemp(prefix="voxel-cup-", suffix=".zip")[1])
    files = _build_zip(tmp)
    logger.info("export zip: %s archivos, %s bytes", files, tmp.stat().st_size)
    return FileResponse(
        tmp,
        media_type="application/zip",
        filename=f"voxel-cup-{stamp}.zip",
        headers={"Cache-Control": "no-store", "X-Export-Files": str(files)},
        background=BackgroundTask(lambda: tmp.unlink(missing_ok=True)),
    )


app.include_router(api_router)

# Multiplayer rooms: WebSocket relay + REST endpoints (see rooms.py).
from rooms import router as rooms_router, start_cleanup_task, stop_cleanup_task  # noqa: E402

app.include_router(rooms_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Export-Files"],
)


@app.on_event("startup")
async def startup_rooms_cleanup():
    await start_cleanup_task()


@app.on_event("shutdown")
async def shutdown_db_client():
    await stop_cleanup_task()
    client.close()
