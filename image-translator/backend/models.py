from pydantic import BaseModel
from typing import List, Optional


class TextRegion(BaseModel):
    text: str
    x: int
    y: int
    width: int
    height: int
    rotation: float = 0.0
    font_size: int
    font_color: str
    background_color: Optional[str] = None
    is_product_text: bool
    confidence: float = 1.0


class TranslatedRegion(BaseModel):
    original: TextRegion
    translated_text: str
    language: str


class ImageJobStatus(BaseModel):
    job_id: str
    status: str  # "processing", "completed", "error"
    current_step: str = ""
    current_language: str = ""
    languages_done: List[str] = []
    languages_total: List[str] = []
    error: Optional[str] = None
