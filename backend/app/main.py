import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .erpnext_client import aclose_client
from .routers.auth import router as auth_router
from .routers.distributors import router as distributors_router
from .routers.products import router as products_router
from .routers.users import router as users_router

# Without this, INFO-level logs (OTP delivery, approval/onboarding emails —
# both stubbed as log lines until real SMTP exists) are silently dropped:
# the root logger defaults to WARNING with no handler configured.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    # Releases the pooled connections opened by erpnext_client's shared
    # httpx client — otherwise they leak past process shutdown.
    await aclose_client()


app = FastAPI(title="Uteshiya Medicare Portal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(products_router)
app.include_router(distributors_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
