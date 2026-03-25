"""PDF table extractor via Gemini File API.

Uploads a PDF to the Gemini File API, prompts for full table extraction,
deletes the upload immediately, and returns the extracted text.

All SDK calls are run in a thread pool to avoid blocking the FastAPI event loop.
"""

from __future__ import annotations

import asyncio
import io
import logging

logger = logging.getLogger(__name__)

_EXTRACT_PROMPT = (
    "Extract all tables and structured data from this financial document. "
    "For each table, output a CSV block with a header row and all data rows. "
    "Preserve all numerical values exactly as they appear — do not summarise or omit rows. "
    "Separate each table with a blank line and a label like '# Table: <description>'. "
    "Include every page. Do not add commentary — output data only."
)


def _client():
    from google import genai
    from ..core.config import GEMINI_API_KEY
    return genai.Client(api_key=GEMINI_API_KEY)


def _model_id() -> str:
    from ..core.model_config import model_config
    # Use Flash for extraction — fast, cheap, handles table extraction well
    return model_config._data.get("research_agent", {}).get("model", "gemini-3.1-flash-lite-preview")


def extract_pdf_tables_sync(pdf_bytes: bytes, filename: str = "document.pdf") -> str:
    """Synchronous version — runs the Gemini File API calls directly (blocking).

    Used from synchronous FastAPI route handlers (run in thread pool by uvicorn).
    Avoids the async/event-loop cancellation issue when the Cloud Run upstream
    connection drops mid-wait.
    """
    client = _client()
    model_id = _model_id()
    import time

    try:
        file_ref = client.files.upload(
            file=io.BytesIO(pdf_bytes),
            config={"mime_type": "application/pdf", "display_name": filename},
        )
    except Exception as e:
        logger.error(f"pdf_extractor_sync: upload failed for {filename}: {e}")
        return ""

    # Poll for ACTIVE
    try:
        for _ in range(30):
            f = client.files.get(name=file_ref.name)
            if f.state.name == "ACTIVE":
                break
            time.sleep(1)
        else:
            logger.error(f"pdf_extractor_sync: file {file_ref.name} never became ACTIVE")
            return ""
    except Exception as e:
        logger.error(f"pdf_extractor_sync: polling failed for {file_ref.name}: {e}")
        return ""

    extracted = ""
    generation_error = None
    try:
        response = client.models.generate_content(
            model=model_id,
            contents=[_EXTRACT_PROMPT, f],
        )
        extracted = response.text or ""
    except Exception as e:
        generation_error = e
        logger.error(f"pdf_extractor_sync: generation failed for {file_ref.name}: {e}")

    try:
        client.files.delete(name=file_ref.name)
    except Exception as e:
        logger.warning(f"pdf_extractor_sync: delete failed for {file_ref.name}: {e}")

    if generation_error and not extracted:
        # Raise so the router can return a meaningful error to the user
        # rather than silently surfacing as "likely_invalid"
        raise RuntimeError(f"Gemini table extraction failed: {generation_error}") from generation_error

    return extracted


async def extract_pdf_tables(pdf_bytes: bytes, filename: str = "document.pdf") -> str:
    """Upload PDF to Gemini File API, extract all tables as CSV text, delete upload.

    Args:
        pdf_bytes: Raw (decrypted) PDF bytes.
        filename:  Display name used in the File API upload.

    Returns:
        Extracted text string. Empty string on failure.
    """
    client = _client()
    model_id = "gemini-3.1-flash-lite-preview"

    # Upload
    try:
        file_ref = await asyncio.to_thread(
            client.files.upload,
            file=io.BytesIO(pdf_bytes),
            config={"mime_type": "application/pdf", "display_name": filename},
        )
    except Exception as e:
        logger.error(f"pdf_extractor: upload failed for {filename}: {e}")
        return ""

    # Wait for ACTIVE state
    try:
        for _ in range(30):
            f = await asyncio.to_thread(client.files.get, name=file_ref.name)
            if f.state.name == "ACTIVE":
                break
            await asyncio.sleep(1)
        else:
            logger.error(f"pdf_extractor: file {file_ref.name} never became ACTIVE")
            return ""
    except Exception as e:
        logger.error(f"pdf_extractor: polling failed for {file_ref.name}: {e}")
        return ""

    # Generate
    extracted = ""
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model_id,
            contents=[_EXTRACT_PROMPT, f],
        )
        extracted = response.text or ""
    except Exception as e:
        logger.error(f"pdf_extractor: generation failed for {file_ref.name}: {e}")

    # Delete upload immediately (DPDPA)
    try:
        await asyncio.to_thread(client.files.delete, name=file_ref.name)
    except Exception as e:
        logger.warning(f"pdf_extractor: delete failed for {file_ref.name}: {e}")

    return extracted
