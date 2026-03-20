"""GCS client for DPDPA-compliant raw file storage.

Raw documents (CAS, broker P&L, holdings, ITR) are uploaded to GCS
immediately after download from Twilio, then deleted within 60 seconds
of successful parsing.  ADC (Application Default Credentials) are used —
works automatically on Cloud Run.
"""

from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _get_bucket_name() -> str:
    from ..core.config import GCS_BUCKET_NAME
    return GCS_BUCKET_NAME or "minto-wa-uploads"


def _get_client():
    """Return a google.cloud.storage.Client using ADC."""
    from google.cloud import storage  # type: ignore
    return storage.Client()


async def upload_bytes(
    path: str,
    data: bytes,
    content_type: str,
    bucket: Optional[str] = None,
) -> str:
    """Upload raw bytes to GCS and return the gs:// URI.

    Args:
        path: Object path within the bucket e.g. 'wa-uploads/+91.../cas_123.pdf'.
        data: Raw file bytes.
        content_type: MIME type e.g. 'application/pdf'.
        bucket: Bucket name (defaults to GCS_BUCKET_NAME env var).

    Returns:
        Full gs:// URI e.g. 'gs://minto-wa-uploads/wa-uploads/.../cas.pdf'.
    """
    bucket_name = bucket or _get_bucket_name()
    try:
        import asyncio

        loop = asyncio.get_running_loop()

        def _upload():
            client = _get_client()
            b = client.bucket(bucket_name)
            blob = b.blob(path)
            blob.upload_from_file(io.BytesIO(data), content_type=content_type)
            return f"gs://{bucket_name}/{path}"

        gcs_uri = await loop.run_in_executor(None, _upload)
        logger.info(f"GCS upload: {gcs_uri} ({len(data)} bytes)")
        return gcs_uri
    except Exception as e:
        logger.error(f"GCS upload failed for path={path}: {e}")
        raise


async def delete_object(path: str, bucket: Optional[str] = None) -> None:
    """Delete a GCS object.

    Args:
        path: Object path within the bucket (NOT the full gs:// URI).
        bucket: Bucket name (defaults to GCS_BUCKET_NAME env var).
    """
    bucket_name = bucket or _get_bucket_name()
    try:
        import asyncio

        loop = asyncio.get_running_loop()

        def _delete():
            client = _get_client()
            b = client.bucket(bucket_name)
            blob = b.blob(path)
            blob.delete()

        await loop.run_in_executor(None, _delete)
        ts = datetime.now(timezone.utc).isoformat()
        logger.info(f"GCS deleted: gs://{bucket_name}/{path} at {ts}")
    except Exception as e:
        logger.error(f"GCS delete failed for path={path}: {e}")
        raise


def gcs_path_from_uri(uri: str) -> str:
    """Extract the object path from a gs:// URI.

    Example: 'gs://minto-wa-uploads/wa-uploads/foo.pdf' → 'wa-uploads/foo.pdf'
    """
    if uri.startswith("gs://"):
        parts = uri[5:].split("/", 1)
        return parts[1] if len(parts) > 1 else ""
    return uri
