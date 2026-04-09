import os
import uuid
import asyncio
from io import BytesIO
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image

from config import settings
from models import ImageJobStatus
from pipeline import jobs, run_image_pipeline
from utils import LANGUAGES

app = FastAPI(title="Image Translator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/languages")
async def get_languages():
    return LANGUAGES


@app.post("/api/translate-image")
async def translate_image(
    image: UploadFile = File(...),
    languages: str = Form(...),
):
    """Upload image and start translation job."""

    # Parse and validate languages
    lang_list = [l.strip() for l in languages.split(",") if l.strip()]
    invalid = [l for l in lang_list if l not in LANGUAGES]
    if invalid:
        raise HTTPException(400, f"Invalid languages: {invalid}")
    if not lang_list:
        raise HTTPException(400, "No languages selected")

    # Read and validate image
    content = await image.read()
    try:
        img = Image.open(BytesIO(content))
        img_format = img.format or "PNG"

        # Check format
        if img_format not in ['PNG', 'JPEG', 'WEBP', 'JPG']:
            raise HTTPException(400, "Unsupported format. Use PNG, JPEG, or WEBP.")

        # Check dimensions
        if img.width > 7680 or img.height > 4320:
            raise HTTPException(400, "Image too large. Max 8K resolution.")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Invalid image file: {str(e)}")

    # Create job directory
    job_id = str(uuid.uuid4())
    work_dir = os.path.join(settings.upload_dir, job_id)
    os.makedirs(work_dir, exist_ok=True)

    # Save original image
    ext = img_format.lower()
    if ext == 'jpeg':
        ext = 'jpg'
    image_path = os.path.join(work_dir, f"original.{ext}")
    with open(image_path, "wb") as f:
        f.write(content)

    # Initialize job status
    jobs[job_id] = ImageJobStatus(
        job_id=job_id,
        status="processing",
        current_step="Starting...",
        languages_total=lang_list,
    )

    # Run pipeline in background
    asyncio.create_task(run_image_pipeline(job_id, image_path, lang_list, img_format))

    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    """Get job status."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


@app.get("/api/download/{job_id}/{language}")
async def download_image(job_id: str, language: str):
    """Download translated image."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    if language not in LANGUAGES:
        raise HTTPException(400, f"Invalid language: {language}")

    final_path = os.path.join(settings.upload_dir, job_id, language, "translated.png")

    if not os.path.exists(final_path):
        raise HTTPException(404, "Image not ready yet")

    language_name = LANGUAGES.get(language, language)

    return FileResponse(
        final_path,
        media_type="image/png",
        filename=f"translated_{language_name}.png",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
