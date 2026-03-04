from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import cas, chats, dashboard, financial_profiles, holdings, market, risk, zerodha

app = FastAPI(title="Minto API")

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


@app.get("/")
def root():
    return {"status": "ok"}
