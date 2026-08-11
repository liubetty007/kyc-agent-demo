import asyncio
import base64
import binascii
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field


class OcrRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    file: str = Field(min_length=1)
    file_type: int | None = Field(default=None, alias="fileType")
    use_doc_orientation_classify: bool | None = Field(default=None, alias="useDocOrientationClassify")
    use_doc_unwarping: bool | None = Field(default=None, alias="useDocUnwarping")
    use_textline_orientation: bool | None = Field(default=None, alias="useTextlineOrientation")
    visualize: bool | None = False


app = FastAPI(title="Private PaddleOCR", docs_url=None, redoc_url=None, openapi_url=None)
_pipeline: Any | None = None
_pipeline_lock = asyncio.Lock()


def _max_input_bytes() -> int:
    try:
        return max(1, int(os.environ.get("PADDLEOCR_MAX_INPUT_BYTES", "20971520")))
    except ValueError:
        return 20 * 1024 * 1024


def _decode_file(value: str) -> bytes:
    estimated_size = (len(value) * 3) // 4
    if estimated_size > _max_input_bytes():
        raise HTTPException(status_code=413, detail="OCR input exceeds the size limit.")
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail="OCR input is not valid Base64.") from error
    if not data:
        raise HTTPException(status_code=400, detail="OCR input is empty.")
    if len(data) > _max_input_bytes():
        raise HTTPException(status_code=413, detail="OCR input exceeds the size limit.")
    return data


def _jsonable(value: Any, depth: int = 0) -> Any:
    if depth > 10:
        return None
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _jsonable(item, depth + 1) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item, depth + 1) for item in value]
    if hasattr(value, "tolist"):
        return _jsonable(value.tolist(), depth + 1)
    if hasattr(value, "json"):
        result = value.json
        return _jsonable(result() if callable(result) else result, depth + 1)
    if hasattr(value, "to_dict"):
        return _jsonable(value.to_dict(), depth + 1)
    try:
        return _jsonable(dict(value), depth + 1)
    except (TypeError, ValueError):
        return str(value)


def _create_pipeline() -> Any:
    from paddleocr import PaddleOCR

    return PaddleOCR(
        device=os.environ.get("PADDLEOCR_DEVICE", "cpu"),
        ocr_version="PP-OCRv5",
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="PP-OCRv5_mobile_rec",
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_textline_orientation=True,
    )


async def _get_pipeline() -> Any:
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    async with _pipeline_lock:
        if _pipeline is None:
            _pipeline = await asyncio.to_thread(_create_pipeline)
    return _pipeline


def _predict(pipeline: Any, path: str, request: OcrRequest) -> list[dict[str, Any]]:
    results = pipeline.predict(
        path,
        use_doc_orientation_classify=request.use_doc_orientation_classify,
        use_doc_unwarping=request.use_doc_unwarping,
        use_textline_orientation=request.use_textline_orientation,
    )
    return [{"prunedResult": _jsonable(result), "ocrImage": None} for result in results]


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(request: OcrRequest) -> dict[str, Any]:
    if request.file_type not in (None, 0, 1):
        raise HTTPException(status_code=400, detail="fileType must be 0 for PDF or 1 for image.")

    data = _decode_file(request.file)
    suffix = ".pdf" if request.file_type == 0 else ".png"
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="ocr-", suffix=suffix, delete=False) as temp_file:
            temp_file.write(data)
            temp_path = temp_file.name

        pipeline = await _get_pipeline()
        results = await asyncio.to_thread(_predict, pipeline, temp_path, request)
        return {
            "logId": str(uuid.uuid4()),
            "errorCode": 0,
            "errorMsg": "Success",
            "result": {"ocrResults": results},
        }
    except HTTPException:
        raise
    except Exception as error:
        print(f"PaddleOCR inference failed: {type(error).__name__}", flush=True)
        raise HTTPException(status_code=500, detail="OCR inference failed.") from None
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
