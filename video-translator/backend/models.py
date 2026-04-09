from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel


class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class Segment(BaseModel):
    start: float
    end: float
    original: str
    translated: str
    words: List[WordTiming]
    speaker: str = "Speaker 1"


class TranslateRequest(BaseModel):
    languages: List[str]


class JobStatus(BaseModel):
    job_id: str
    status: str  # "processing", "completed", "error"
    current_step: str = ""
    current_language: str = ""
    languages_done: List[str] = []
    languages_total: List[str] = []
    error: Optional[str] = None
