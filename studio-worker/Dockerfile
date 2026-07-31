# BARIO Studio worker — self-hosted, open-source video/voiceover generation
# on RunPod Serverless. Built on RunPod's own official ComfyUI worker image
# (runpod/worker-comfyui) rather than hand-rolling ComfyUI+RunPod plumbing —
# that image already solves GPU driver setup, ComfyUI install, and the
# RunPod handler harness correctly; this Dockerfile only adds the specific
# open-source models (Wan 2.2, Kokoro) and swaps in our own handler.py that
# knows how to route both video and voiceover jobs.
#
# Confirm this base tag is still current before building — check
# https://hub.docker.com/r/runpod/worker-comfyui/tags (verified current as
# of this writing: 5.8.6-base).
FROM runpod/worker-comfyui:5.8.6-base

# --- Wan 2.2 (5B, single-GPU variant) model weights ---
# Apache-2.0 licensed (Alibaba) — confirmed safe for commercial use, unlike
# some other open video models. Filenames/paths per ComfyUI's own official
# example docs: https://comfyanonymous.github.io/ComfyUI_examples/wan22/
# These are multi-GB downloads — expect a genuinely slow first build.
RUN mkdir -p /comfyui/models/diffusion_models /comfyui/models/vae /comfyui/models/text_encoders /workflows && \
    wget -q -O /comfyui/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
      "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" && \
    wget -q -O /comfyui/models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors \
      "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" && \
    wget -q -O /comfyui/models/vae/wan2.2_vae.safetensors \
      "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors"

# --- Official example workflows (API format) — used as templates our
# handler edits per-request (prompt text, source image, duration) rather
# than being hand-authored, since ComfyUI graph JSON is easy to get subtly
# wrong by hand. See docs/customization.md in runpod-workers/worker-comfyui
# for the general pattern this follows. ---
RUN wget -q -O /workflows/text_to_video_wan22_5B.json \
      "https://raw.githubusercontent.com/comfyanonymous/ComfyUI_examples/master/wan22/text_to_video_wan22_5B.json" && \
    wget -q -O /workflows/image_to_video_wan22_5B.json \
      "https://raw.githubusercontent.com/comfyanonymous/ComfyUI_examples/master/wan22/image_to_video_wan22_5B.json"

# --- Kokoro (Apache-2.0) for voiceover — much lighter-weight than video
# generation, no GPU strictly required, but runs on whatever GPU this
# endpoint already has allocated. espeak-ng is Kokoro's own documented
# system-level dependency (phonemization), not optional. ---
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "kokoro>=0.9.4" soundfile numpy

# Preserve the base image's original handler so ours can shell out to the
# same local ComfyUI server it expects at 127.0.0.1:8188 — /start.sh (from
# the base image, unchanged) still launches ComfyUI itself; only which
# Python file handles the actual RunPod job is being swapped here.
COPY handler.py /handler.py
COPY kokoro_tts.py /kokoro_tts.py
