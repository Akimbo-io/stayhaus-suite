from __future__ import annotations
import pysubs2
from typing import List
from models import Segment


def generate_ass_captions(
    segments: list[Segment],
    output_path: str,
    video_width: int = 1920,
    video_height: int = 1080,
    font_name: str = "Rubik",
    words_per_group: int = 2,
) -> str:
    """Generate ASS subtitle file showing 1-3 words at a time, synced to speech.

    Each group of words appears and disappears exactly when spoken.
    Big centered text, minimalistic style.
    """
    subs = pysubs2.SSAFile()
    subs.info["PlayResX"] = str(video_width)
    subs.info["PlayResY"] = str(video_height)

    # Scale font size based on resolution — big and bold
    base_size = int(video_height * 0.065)  # ~70px at 1080p

    style = pysubs2.SSAStyle(
        fontname=font_name,
        fontsize=base_size,
        primarycolor=pysubs2.Color(255, 255, 255, 0),     # White text
        secondarycolor=pysubs2.Color(255, 255, 255, 0),
        outlinecolor=pysubs2.Color(0, 0, 0, 0),           # Black outline
        backcolor=pysubs2.Color(0, 0, 0, 120),            # Black background box
        bold=True,
        outline=0.0,
        shadow=0.0,
        borderstyle=3,  # 3 = opaque box behind text
        alignment=2,    # Bottom center
        marginv=60,     # Distance from bottom edge
        marginl=40,
        marginr=40,
    )
    subs.styles["Default"] = style

    for seg in segments:
        if not seg.words:
            continue

        # Group words into chunks of 1-3
        words = seg.words
        i = 0
        while i < len(words):
            # Take 1-3 words per group
            group = words[i:i + words_per_group]
            group_text = " ".join(w.word for w in group)
            group_start = int(group[0].start * 1000)
            group_end = int(group[-1].end * 1000)

            # Ensure minimum display time of 200ms
            if group_end - group_start < 200:
                group_end = group_start + 200

            event = pysubs2.SSAEvent(
                start=group_start,
                end=group_end,
                text=group_text,
                style="Default",
            )
            subs.events.append(event)
            i += words_per_group

    subs.save(output_path)
    return output_path
