from __future__ import annotations
import os
from typing import Dict, List
from pydub import AudioSegment
from models import JobStatus, Segment, WordTiming
from services.ffmpeg import (
    extract_audio, get_video_info, get_audio_duration,
    stretch_audio_segment, replace_audio, burn_captions,
    extract_speaker_audio,
)
from services.gemini import transcribe_and_translate
from services.elevenlabs import clone_voice, generate_tts_segment, delete_voice
from services.captions import generate_ass_captions
from config import settings


# In-memory job store
jobs: dict[str, JobStatus] = {}


def update_job(job_id: str, **kwargs):
    if job_id in jobs:
        for k, v in kwargs.items():
            setattr(jobs[job_id], k, v)


def get_unique_speakers(segments: list[Segment]) -> list[str]:
    """Get list of unique speakers in order of first appearance."""
    seen = set()
    speakers = []
    for seg in segments:
        if seg.speaker not in seen:
            seen.add(seg.speaker)
            speakers.append(seg.speaker)
    return speakers


def fit_segments_to_timeline(
    tts_paths: list[str],
    segments: list[Segment],
    video_duration: float,
    work_dir: str,
    output_path: str,
) -> list[Segment]:
    """Speed-adjust each TTS segment to fit its original time slot, then concatenate.

    Returns updated segments with word timings matching the original timestamps.
    """
    combined = AudioSegment.silent(duration=0)
    fitted_segments = []

    for i, (seg, tts_path) in enumerate(zip(segments, tts_paths)):
        target_duration = seg.end - seg.start
        tts_duration = get_audio_duration(tts_path)

        # Calculate gap before this segment
        if i == 0:
            gap = seg.start
        else:
            gap = seg.start - segments[i - 1].end

        if gap > 0:
            combined += AudioSegment.silent(duration=int(gap * 1000))

        # Speed-adjust to fit original time slot
        if tts_duration > 0 and target_duration > 0:
            factor = tts_duration / target_duration
        else:
            factor = 1.0

        stretched_path = os.path.join(work_dir, f"fitted_{i:04d}.wav")
        stretch_audio_segment(tts_path, stretched_path, factor)

        stretched_audio = AudioSegment.from_wav(stretched_path)

        # Trim or pad to exact target duration
        target_ms = int(target_duration * 1000)
        if len(stretched_audio) > target_ms:
            stretched_audio = stretched_audio[:target_ms]
        elif len(stretched_audio) < target_ms:
            stretched_audio += AudioSegment.silent(duration=target_ms - len(stretched_audio))

        combined += stretched_audio

        try:
            os.remove(stretched_path)
        except OSError:
            pass

        # Word timings use original timestamps
        translated_words = seg.translated.split()
        new_words = []
        if len(translated_words) > 0:
            word_dur = target_duration / len(translated_words)
            for j, w in enumerate(translated_words):
                new_words.append(WordTiming(
                    word=w,
                    start=round(seg.start + j * word_dur, 3),
                    end=round(seg.start + (j + 1) * word_dur, 3),
                ))

        fitted_segments.append(Segment(
            start=seg.start,
            end=seg.end,
            original=seg.original,
            translated=seg.translated,
            words=new_words,
            speaker=seg.speaker,
        ))

    # Pad/trim to exact video duration
    current_ms = len(combined)
    target_ms = int(video_duration * 1000)
    if current_ms < target_ms:
        combined += AudioSegment.silent(duration=target_ms - current_ms)
    elif current_ms > target_ms:
        combined = combined[:target_ms]

    combined.export(output_path, format="wav")
    return fitted_segments


async def run_pipeline(job_id: str, video_path: str, languages: list[str], video_name: str):
    """Run the full translation pipeline for all requested languages."""
    work_dir = os.path.join(settings.upload_dir, job_id)
    os.makedirs(work_dir, exist_ok=True)

    voice_ids: dict[str, str] = {}  # speaker -> voice_id
    try:
        # Step 1: Get video info
        update_job(job_id, current_step="Analyzing video...")
        info = get_video_info(video_path)
        video_duration = info["duration"]

        # Step 2: Extract audio
        update_job(job_id, current_step="Extracting audio...")
        audio_path = os.path.join(work_dir, "original_audio.wav")
        extract_audio(video_path, audio_path)

        # Step 3: Transcribe first to identify speakers (use first language or just transcribe)
        update_job(job_id, current_step="Identifying speakers...")
        # Do an initial transcription to get speaker info
        initial_segments = await transcribe_and_translate(audio_path, languages[0])
        speakers = get_unique_speakers(initial_segments)
        update_job(job_id, current_step=f"Found {len(speakers)} speakers, cloning voices...")

        # Step 4: Clone each speaker's voice
        for speaker in speakers:
            speaker_audio_path = os.path.join(work_dir, f"speaker_{speaker.replace(' ', '_')}.wav")
            extract_speaker_audio(audio_path, initial_segments, speaker, speaker_audio_path)
            voice_id = clone_voice(speaker_audio_path, f"{video_name}_{speaker.replace(' ', '_')}")
            voice_ids[speaker] = voice_id
            try:
                os.remove(speaker_audio_path)
            except OSError:
                pass

        # Process each language
        for lang_idx, lang in enumerate(languages):
            lang_dir = os.path.join(work_dir, lang)
            os.makedirs(lang_dir, exist_ok=True)

            # Use initial transcription for the first language, re-transcribe for others
            if lang_idx == 0:
                segments = initial_segments
            else:
                update_job(
                    job_id,
                    current_step=f"Translating to {lang}...",
                    current_language=lang,
                )
                segments = await transcribe_and_translate(audio_path, lang)

            # Step 5: Generate TTS per segment using the correct speaker's voice
            update_job(job_id, current_step=f"Generating voices for {lang}...")
            tts_paths = []
            for i, seg in enumerate(segments):
                out_path = os.path.join(lang_dir, f"tts_{i:04d}.wav")
                # Use the correct speaker's cloned voice
                speaker_voice = voice_ids.get(seg.speaker)
                if not speaker_voice:
                    # Fallback: use first speaker's voice if speaker not found
                    speaker_voice = list(voice_ids.values())[0]
                generate_tts_segment(seg.translated, speaker_voice, out_path)
                tts_paths.append(out_path)

            # Step 6: Fit each segment to its exact time slot
            update_job(job_id, current_step=f"Syncing to scenes for {lang}...")
            synced_audio = os.path.join(lang_dir, "synced_audio.wav")
            synced_segments = fit_segments_to_timeline(
                tts_paths, segments, video_duration, lang_dir, synced_audio,
            )

            # Step 7: Replace audio
            update_job(job_id, current_step=f"Replacing audio for {lang}...")
            video_no_captions = os.path.join(lang_dir, "video_no_captions.mp4")
            replace_audio(video_path, synced_audio, video_no_captions)

            # Step 8: Generate captions
            update_job(job_id, current_step=f"Generating captions for {lang}...")
            ass_path = os.path.join(lang_dir, "captions.ass")
            generate_ass_captions(
                synced_segments, ass_path,
                video_width=info["width"],
                video_height=info["height"],
            )

            # Step 9: Burn captions
            update_job(job_id, current_step=f"Burning captions for {lang}...")
            final_path = os.path.join(lang_dir, "final.mp4")
            fonts_dir = os.path.dirname(settings.font_path)
            burn_captions(video_no_captions, ass_path, final_path, fonts_dir)

            # Mark language as done
            done = jobs[job_id].languages_done + [lang]
            update_job(job_id, languages_done=done)

            # Cleanup
            for f in tts_paths + [synced_audio, video_no_captions]:
                try:
                    os.remove(f)
                except OSError:
                    pass

        update_job(job_id, status="completed", current_step="Done!")

    except Exception as e:
        update_job(job_id, status="error", error=str(e))
        raise
    finally:
        # Delete all cloned voices
        for voice_id in voice_ids.values():
            delete_voice(voice_id)
