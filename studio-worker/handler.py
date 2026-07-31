"""
BARIO Studio RunPod Serverless handler.

Dispatches on job['input']['jobType']:
  - 'video':     fills in a Wan 2.2 example workflow template (prompt text,
                 optional source image, duration) and runs it through the
                 local ComfyUI server the base image's /start.sh already
                 launches on 127.0.0.1:8188.
  - 'voiceover':  runs Kokoro directly (no ComfyUI involved) — see
                 kokoro_tts.py.

This intentionally talks to ComfyUI over its own stable, documented HTTP API
(POST /prompt, GET /history, GET /view, POST /upload/image) rather than
importing runpod-workers/worker-comfyui's internal handler module — that
module executes `runpod.serverless.start(...)` at import time as a
side-effect of its own top-level code, which would fight with this file for
who's actually the serverless entrypoint. Polling here is plain HTTP
(re-checking /history every couple seconds) rather than the base image's
websocket approach — simpler to get right without a live GPU to test
against, at the cost of slightly coarser progress granularity.

NOT YET LIVE-VERIFIED — see studio-worker/README.md. In particular, the
exact node names Wan 2.2's example workflows use for frame count/duration
should be confirmed against the real downloaded JSON (this code searches
generically rather than hardcoding a node id, but hasn't been run against a
real GPU yet).
"""

import base64
import json
import os
import time
import uuid

import requests
import runpod

COMFY_HOST = "127.0.0.1:8188"
WORKFLOWS_DIR = "/workflows"
FPS = 16  # Wan 2.2's example workflows default to 16fps — used to convert
          # requested duration (seconds) into a frame count.
POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 600


def check_comfy_server(retries: int = 30, delay: float = 2.0) -> bool:
    for _ in range(retries):
        try:
            res = requests.get(f"http://{COMFY_HOST}/")
            if res.status_code == 200:
                return True
        except requests.exceptions.RequestException:
            pass
        time.sleep(delay)
    return False


def load_workflow_template(has_source_image: bool) -> dict:
    filename = "image_to_video_wan22_5B.json" if has_source_image else "text_to_video_wan22_5B.json"
    with open(os.path.join(WORKFLOWS_DIR, filename), "r") as f:
        return json.load(f)


def find_node_by_class(workflow: dict, class_type: str) -> list:
    return [node_id for node_id, node in workflow.items() if node.get("class_type") == class_type]


def find_positive_prompt_node_id(workflow: dict) -> str:
    """Follows the KSampler's `positive` wire back to its CLIPTextEncode
    node, rather than assuming a fixed node id — Wan 2.2's example workflows
    number nodes arbitrarily and may change between versions."""
    sampler_ids = find_node_by_class(workflow, "KSampler") + find_node_by_class(workflow, "KSamplerAdvanced")
    if not sampler_ids:
        raise RuntimeError("No KSampler node found in workflow template")
    positive_ref = workflow[sampler_ids[0]]["inputs"].get("positive")
    if not positive_ref:
        raise RuntimeError("KSampler node has no 'positive' input wired")
    return positive_ref[0]


def set_prompt_text(workflow: dict, prompt: str) -> None:
    node_id = find_positive_prompt_node_id(workflow)
    workflow[node_id]["inputs"]["text"] = prompt


def set_duration(workflow: dict, duration_seconds: float) -> None:
    """Best-effort: Wan 2.2's video-latent node exposes frame count under a
    'length' input in the example workflows. If a future version renames
    this, generation still runs — it just falls back to the template's
    default duration rather than failing the job."""
    frame_count = max(1, round(duration_seconds * FPS))
    for node in workflow.values():
        if "length" in node.get("inputs", {}) and isinstance(node["inputs"]["length"], int):
            node["inputs"]["length"] = frame_count


def upload_source_image(image_b64: str) -> str:
    image_bytes = base64.b64decode(image_b64)
    filename = f"{uuid.uuid4()}.png"
    res = requests.post(
        f"http://{COMFY_HOST}/upload/image",
        files={"image": (filename, image_bytes, "image/png")},
        data={"overwrite": "true"},
    )
    res.raise_for_status()
    return res.json()["name"]


def set_source_image(workflow: dict, uploaded_filename: str) -> None:
    load_image_ids = find_node_by_class(workflow, "LoadImage")
    if not load_image_ids:
        raise RuntimeError("image_to_video workflow has no LoadImage node")
    workflow[load_image_ids[0]]["inputs"]["image"] = uploaded_filename


def queue_workflow(workflow: dict, client_id: str) -> str:
    res = requests.post(f"http://{COMFY_HOST}/prompt", json={"prompt": workflow, "client_id": client_id})
    res.raise_for_status()
    return res.json()["prompt_id"]


def wait_for_result(prompt_id: str) -> dict:
    deadline = time.time() + POLL_TIMEOUT_SECONDS
    while time.time() < deadline:
        res = requests.get(f"http://{COMFY_HOST}/history/{prompt_id}")
        res.raise_for_status()
        history = res.json()
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(POLL_INTERVAL_SECONDS)
    raise TimeoutError(f"ComfyUI job {prompt_id} did not finish within {POLL_TIMEOUT_SECONDS}s")


def extract_video_bytes(history_entry: dict) -> bytes:
    outputs = history_entry.get("outputs", {})
    for node_output in outputs.values():
        for key in ("gifs", "videos", "images"):
            for item in node_output.get(key, []):
                res = requests.get(
                    f"http://{COMFY_HOST}/view",
                    params={"filename": item["filename"], "subfolder": item.get("subfolder", ""), "type": item.get("type", "output")},
                )
                res.raise_for_status()
                return res.content
    raise RuntimeError("No video/image output found in ComfyUI history entry")


def handle_video(job_input: dict) -> dict:
    prompt = job_input["prompt"]
    duration_seconds = float(job_input.get("durationSeconds", 5))
    source_image_b64 = job_input.get("sourceImageBase64")

    if not check_comfy_server():
        raise RuntimeError("ComfyUI server did not become available")

    workflow = load_workflow_template(has_source_image=bool(source_image_b64))
    set_prompt_text(workflow, prompt)
    set_duration(workflow, duration_seconds)
    if source_image_b64:
        uploaded_filename = upload_source_image(source_image_b64)
        set_source_image(workflow, uploaded_filename)

    client_id = str(uuid.uuid4())
    prompt_id = queue_workflow(workflow, client_id)
    history_entry = wait_for_result(prompt_id)

    if history_entry.get("status", {}).get("status_str") == "error":
        raise RuntimeError(f"ComfyUI execution failed: {history_entry['status']}")

    video_bytes = extract_video_bytes(history_entry)
    return {"data": base64.b64encode(video_bytes).decode("utf-8"), "contentType": "video/mp4"}


def handle_voiceover(job_input: dict) -> dict:
    from kokoro_tts import synthesize

    audio_bytes = synthesize(job_input["text"], voice_id=job_input.get("voiceId"))
    return {"data": base64.b64encode(audio_bytes).decode("utf-8"), "contentType": "audio/wav"}


def handler(job):
    job_input = job["input"]
    job_type = job_input.get("jobType")
    try:
        if job_type == "video":
            output = handle_video(job_input)
        elif job_type == "voiceover":
            output = handle_voiceover(job_input)
        else:
            return {"error": f"Unknown jobType: {job_type}"}
        return {"output": output}
    except Exception as exc:  # noqa: BLE001 — RunPod expects a JSON-safe error, not a raised exception
        return {"error": str(exc)}


runpod.serverless.start({"handler": handler})
