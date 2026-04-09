from __future__ import annotations
import subprocess
import json
import os
from typing import List

# Ensure local ffmpeg is on PATH
os.environ["PATH"] = os.path.expanduser("~/.local/bin") + ":" + os.environ.get("PATH", "")


def get_video_info(video_path: str) -> dict:
    """Get video resolution and duration using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", video_path
        ],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout)
    video_stream = next(s for s in data["streams"] if s["codec_type"] == "video")
    return {
        "width": int(video_stream["width"]),
        "height": int(video_stream["height"]),
        "duration": float(data["format"]["duration"]),
    }


def extract_audio(video_path: str, output_path: str) -> str:
    """Extract audio from video as 16kHz mono WAV."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            output_path
        ],
        capture_output=True, check=True
    )
    return output_path


def replace_audio(video_path: str, audio_path: str, output_path: str) -> str:
    """Replace video audio track with new audio."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
            "-c:v", "copy", "-map", "0:v:0", "-map", "1:a:0",
            "-shortest", output_path
        ],
        capture_output=True, check=True
    )
    return output_path


def burn_captions(video_path: str, ass_path: str, output_path: str, fonts_dir: str) -> str:
    """Burn ASS subtitles into video."""
    # Escape paths for FFmpeg filter
    ass_escaped = ass_path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    fonts_escaped = fonts_dir.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", f"ass={ass_escaped}:fontsdir={fonts_escaped}",
            "-c:a", "copy", output_path
        ],
        capture_output=True, check=True
    )
    return output_path


def build_atempo_chain(factor: float) -> str:
    """Build atempo filter chain for factors outside 0.5-2.0 range."""
    if abs(factor - 1.0) < 0.01:
        return ""
    filters = []
    f = factor
    while f > 2.0:
        filters.append("atempo=2.0")
        f /= 2.0
    while f < 0.5:
        filters.append("atempo=0.5")
        f *= 2.0
    filters.append(f"atempo={f:.4f}")
    return ",".join(filters)


def stretch_audio_segment(input_path: str, output_path: str, factor: float) -> str:
    """Time-stretch an audio segment by the given factor."""
    chain = build_atempo_chain(factor)
    if not chain:
        # No stretching needed, just copy
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            capture_output=True, check=True
        )
    else:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", input_path,
                "-filter:a", chain,
                "-acodec", "pcm_s16le", output_path
            ],
            capture_output=True, check=True
        )
    return output_path


def extract_speaker_audio(audio_path: str, segments: list, speaker: str, output_path: str) -> str:
    """Extract and concatenate all audio clips for a specific speaker.

    Used to get a clean sample of each speaker's voice for cloning.
    """
    from pydub import AudioSegment

    full_audio = AudioSegment.from_wav(audio_path)
    speaker_audio = AudioSegment.silent(duration=0)

    for seg in segments:
        if seg.speaker == speaker:
            start_ms = int(seg.start * 1000)
            end_ms = int(seg.end * 1000)
            speaker_audio += full_audio[start_ms:end_ms]

    # Ensure at least 5 seconds for decent voice cloning
    if len(speaker_audio) < 5000:
        # Repeat what we have to get to 5s
        while len(speaker_audio) < 5000:
            speaker_audio += speaker_audio

    speaker_audio.export(output_path, format="wav")
    return output_path


def get_audio_duration(audio_path: str) -> float:
    """Get duration of an audio file in seconds."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", audio_path
        ],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


