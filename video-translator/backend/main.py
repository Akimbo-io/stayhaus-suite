import os
import uuid
import asyncio
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models import JobStatus
from pipeline import jobs, run_pipeline, update_job
from utils import LANGUAGES

app = FastAPI(title="Video Translator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth ---

async def verify_auth(request: Request):
    pass  # Auth disabled


# --- Routes ---

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/languages")
async def get_languages():
    return LANGUAGES


@app.post("/api/translate", dependencies=[Depends(verify_auth)])
async def translate_video(
    video: UploadFile = File(...),
    languages: str = Form(...),  # comma-separated language codes
):
    # Validate languages
    lang_list = [l.strip() for l in languages.split(",") if l.strip()]
    invalid = [l for l in lang_list if l not in LANGUAGES]
    if invalid:
        raise HTTPException(400, f"Invalid languages: {invalid}")
    if not lang_list:
        raise HTTPException(400, "No languages selected")

    # Save uploaded video
    job_id = str(uuid.uuid4())
    work_dir = os.path.join(settings.upload_dir, job_id)
    os.makedirs(work_dir, exist_ok=True)

    video_name = Path(video.filename or "video").stem
    video_path = os.path.join(work_dir, "original.mp4")

    with open(video_path, "wb") as f:
        content = await video.read()
        f.write(content)

    # Init job status
    jobs[job_id] = JobStatus(
        job_id=job_id,
        status="processing",
        current_step="Starting...",
        languages_total=lang_list,
    )

    # Run pipeline in background
    asyncio.create_task(run_pipeline(job_id, video_path, lang_list, video_name))

    return {"job_id": job_id}


@app.get("/api/status/{job_id}", dependencies=[Depends(verify_auth)])
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


@app.get("/api/download/{job_id}/{language}", dependencies=[Depends(verify_auth)])
async def download_video(job_id: str, language: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    final_path = os.path.join(settings.upload_dir, job_id, language, "final.mp4")
    if not os.path.exists(final_path):
        raise HTTPException(404, "Video not ready yet")

    return FileResponse(
        final_path,
        media_type="video/mp4",
        filename=f"translated_{language}.mp4",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
