import os
from typing import List
from PIL import Image
from models import ImageJobStatus
from services.gemini import translate_image
from config import settings
from utils import LANGUAGES

# In-memory job store
jobs: dict[str, ImageJobStatus] = {}


def update_job(job_id: str, **kwargs):
    """Update job status."""
    if job_id in jobs:
        for k, v in kwargs.items():
            setattr(jobs[job_id], k, v)


def save_high_quality(img: Image.Image, output_path: str) -> None:
    """Save image at high quality as PNG."""
    if img.mode == 'RGBA':
        img = img.convert('RGB')
    img.save(output_path, 'PNG', compress_level=1)


async def run_image_pipeline(
    job_id: str,
    image_path: str,
    languages: List[str],
    original_format: str
):
    """Full image translation pipeline using Gemini image generation."""

    work_dir = os.path.join(settings.upload_dir, job_id)

    try:
        # Process each language
        for lang in languages:
            lang_dir = os.path.join(work_dir, lang)
            os.makedirs(lang_dir, exist_ok=True)

            language_name = LANGUAGES.get(lang, lang)

            # Generate translated image using Gemini
            update_job(
                job_id,
                current_step=f"Generating {language_name} version...",
                current_language=lang
            )

            result_image = await translate_image(image_path, lang, language_name)

            # Save the result
            output_path = os.path.join(lang_dir, "translated.png")
            save_high_quality(result_image, output_path)

            # Mark done
            done = jobs[job_id].languages_done + [lang]
            update_job(job_id, languages_done=done)

        update_job(job_id, status="completed", current_step="Done!")

    except Exception as e:
        update_job(job_id, status="error", error=str(e))
        raise
