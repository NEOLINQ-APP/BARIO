"""Thin wrapper around the Kokoro-82M open-source TTS model (Apache-2.0).
API confirmed against https://pypi.org/project/kokoro/'s own usage example —
KPipeline(lang_code) is a generator yielding (graphemes, phonemes, audio_chunk)
tuples; chunks are concatenated and written out as a single WAV file.
"""

import io

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SAMPLE_RATE = 24000
DEFAULT_VOICE = "af_heart"

_pipeline = None


def _get_pipeline() -> "KPipeline":
    global _pipeline
    if _pipeline is None:
        _pipeline = KPipeline(lang_code="a")  # American English
    return _pipeline


def synthesize(text: str, voice_id: str | None = None) -> bytes:
    pipeline = _get_pipeline()
    chunks = [chunk for _, _, chunk in pipeline(text, voice=voice_id or DEFAULT_VOICE)]
    audio = np.concatenate(chunks)

    buffer = io.BytesIO()
    sf.write(buffer, audio, SAMPLE_RATE, format="WAV")
    return buffer.getvalue()
