from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import alerts, cas, chats, dashboard, financial_profiles, holdings, market, risk, tax_chat, user, zerodha
from .services.alert_poller import scheduler as alert_scheduler, start_alert_scheduler, stop_alert_scheduler
from .whatsapp_bot.reminder_scheduler import start_wa_reminder_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register WhatsApp reminder job on the shared scheduler before it starts
    start_wa_reminder_scheduler(alert_scheduler)
    start_alert_scheduler()
    yield
    stop_alert_scheduler()


app = FastAPI(title="Minto API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(risk.router)
app.include_router(cas.router)
app.include_router(holdings.router)
app.include_router(market.router)
app.include_router(dashboard.router)
app.include_router(chats.router)
app.include_router(zerodha.router)
app.include_router(financial_profiles.router)
app.include_router(alerts.router)
app.include_router(user.router)
app.include_router(tax_chat.router)

from .whatsapp_bot.router import router as whatsapp_router
app.include_router(whatsapp_router, prefix="/whatsapp", tags=["whatsapp"])


@app.get("/")
def root():
    return {"status": "ok"}
