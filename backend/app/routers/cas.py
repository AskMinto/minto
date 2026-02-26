from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from ..core.auth import UserContext, get_user_context
from ..db.supabase import get_supabase_client
from ..services.cas_parser import parse_cas_pdf

router = APIRouter(prefix="/cas", tags=["cas"])


class CasConfirmRequest(BaseModel):
    upload_id: str | None = None
    holdings: list[dict]


@router.post("/upload")
async def upload_cas(
    file: UploadFile = File(...),
    user: UserContext = Depends(get_user_context),
):
    pdf_bytes = await file.read()
    parsed = parse_cas_pdf(pdf_bytes)
    status = "parsed" if parsed.get("holdings") else "error"

    supabase = get_supabase_client(user.token)
    record = {
        "user_id": user.user_id,
        "status": status,
        "parsed_holdings": parsed.get("holdings"),
        "errors": parsed.get("errors"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("cas_uploads").insert(record).execute()
    upload_id = None
    if result.data:
        upload_id = result.data[0].get("id")

    return {
        "upload_id": upload_id,
        "holdings": parsed.get("holdings"),
        "missing_mappings": parsed.get("missing_mappings"),
        "errors": parsed.get("errors"),
    }


@router.post("/confirm")
def confirm_cas(payload: CasConfirmRequest, user: UserContext = Depends(get_user_context)):
    supabase = get_supabase_client(user.token)
    rows = []
    for holding in payload.holdings:
        rows.append(
            {
                "user_id": user.user_id,
                "source": "cas",
                "isin": holding.get("isin"),
                "symbol": holding.get("symbol"),
                "exchange": holding.get("exchange"),
                "qty": holding.get("qty"),
                "avg_cost": holding.get("avg_cost"),
                "asset_type": holding.get("asset_type"),
            }
        )
    if rows:
        supabase.table("holdings").insert(rows).execute()
    if payload.upload_id:
        supabase.table("cas_uploads").update({"status": "confirmed"}).eq(
            "id", payload.upload_id
        ).execute()
    return {"status": "ok"}
