from __future__ import annotations
import json
import re
import time
from typing import List
from google import genai
from config import settings
from models import Segment, WordTiming


client = genai.Client(api_key=settings.gemini_api_key)
MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.0-flash"]


async def transcribe_and_translate(audio_path: str, target_language: str) -> list[Segment]:
    """Transcribe audio with speaker diarization and translate to target language."""

    uploaded_file = client.files.upload(file=audio_path)

    prompt = f"""Transcribe this audio with precise timestamps, identify different speakers, and translate it to {target_language}.

Return ONLY a valid JSON array (no markdown, no code fences) where each element represents a sentence or phrase:
[
  {{
    "start": 0.0,
    "end": 2.5,
    "speaker": "Speaker 1",
    "original": "original text here",
    "translated": "translated text in {target_language}"
  }}
]

Rules:
- "start" and "end" are timestamps in seconds (float)
- "speaker" must consistently identify each unique voice (e.g. "Speaker 1", "Speaker 2", "Speaker 3")
- The SAME person must always have the SAME speaker label throughout
- Keep segments short (1-2 sentences max)
- Be precise with timestamps
- Return ONLY valid JSON, nothing else"""

    # Try each model with retries
    last_error = None
    for model in MODELS:
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[uploaded_file, prompt],
                )
                break
            except Exception as e:
                last_error = e
                if "503" in str(e) or "UNAVAILABLE" in str(e) or "overloaded" in str(e).lower():
                    time.sleep(2 * (attempt + 1))
                    continue
                raise
        else:
            continue
        break
    else:
        raise last_error

    raw = response.text.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    data = json.loads(raw)

    segments = []
    for item in data:
        start = float(item["start"])
        end = float(item["end"])
        translated = item["translated"]
        speaker = item.get("speaker", "Speaker 1")

        words = translated.split()
        if len(words) > 0:
            duration = end - start
            word_duration = duration / len(words)
            word_timings = [
                WordTiming(
                    word=w,
                    start=round(start + i * word_duration, 3),
                    end=round(start + (i + 1) * word_duration, 3),
                )
                for i, w in enumerate(words)
            ]
        else:
            word_timings = []

        segments.append(Segment(
            start=start,
            end=end,
            original=item["original"],
            translated=translated,
            words=word_timings,
            speaker=speaker,
        ))

    try:
        client.files.delete(name=uploaded_file.name)
    except Exception:
        pass

    return segments
