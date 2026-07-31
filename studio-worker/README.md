# BARIO Studio worker

Self-hosted, open-source video (Wan 2.2) and voiceover (Kokoro) generation,
deployed as a RunPod Serverless endpoint. This is the piece of the Studio
feature that replaces a pay-per-call vendor API (fal.ai/ElevenLabs) with
models BARIO runs itself on rented GPU compute — see the approved Studio
plan for the full reasoning.

**Status: code-complete, not yet live-verified.** Everything else in this
feature (credits, DB, routes, frontend) has been built, typechecked, and is
ready to deploy. This directory is the one piece that needs a real GPU and
a RunPod account to actually prove out — something this session can't do
without your credentials. What's below is the concrete path to finishing it.

## What's here

- `Dockerfile` — extends RunPod's own official `runpod/worker-comfyui:5.8.6-base`
  image with Wan 2.2 (5B) model weights, the official example workflow
  templates, and Kokoro for voiceover.
- `handler.py` — dispatches each job to either the local ComfyUI server
  (video) or Kokoro directly (voiceover). Talks to ComfyUI over its own
  standard HTTP API (`/prompt`, `/history`, `/view`, `/upload/image`).
- `kokoro_tts.py` — thin wrapper around the `kokoro` pip package.

## To finish this

1. **Create a RunPod account** (runpod.io) if you don't have one, and add a
   payment method — Serverless is pay-per-second-of-active-GPU-time, no
   idle cost.
2. **Build & push this image**, or point RunPod at this GitHub repo/subpath
   directly (RunPod can build from a repo — see their docs) — either way,
   the first build will be slow (multi-GB model downloads).
3. **Create a Serverless endpoint** in the RunPod dashboard using this
   image, on a GPU with at least 24GB VRAM (the Wan 2.2 5B variant's stated
   requirement).
4. **Get your API key** from RunPod's dashboard and the new endpoint's ID
   (shown on the endpoint's page).
5. **Set these on Vercel** (same pattern as every other secret in this
   project — `vercel env add <NAME> production --value "<value>" --sensitive --yes`):
   - `RUNPOD_API_KEY`
   - `RUNPOD_ENDPOINT_ID`
6. **Test the raw endpoint first**, before touching BARIO, with a direct
   call:
   ```bash
   curl -X POST "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/runsync" \
     -H "Authorization: Bearer $RUNPOD_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"input": {"jobType": "voiceover", "text": "Hello from Bario Studio."}}'
   ```
   Confirm this returns `"status": "COMPLETED"` with base64 audio in
   `output.data` before trying a video job or wiring up the BARIO UI —
   voiceover is the faster, simpler path to validate the container itself
   boots correctly.
7. Then a video job the same way (expect this one to take real time —
   video generation is not fast, even on a good GPU):
   ```bash
   curl -X POST "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/run" \
     -H "Authorization: Bearer $RUNPOD_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"input": {"jobType": "video", "prompt": "A calm lake at sunrise, gentle ripples", "durationSeconds": 3}}'
   ```
   then poll `GET /v2/$RUNPOD_ENDPOINT_ID/status/<id>` with the same auth
   header until `COMPLETED`.
8. Once both work directly against RunPod, run the full BARIO verification
   steps from the approved plan (disposable test account → `/dashboard/studio`
   → real generation → credits deducted/refunded correctly).

## Known unverified spots (flagged honestly, not hidden)

- **Frame-count/duration control**: `handler.py`'s `set_duration()` searches
  the workflow template for any node with a `length` input rather than a
  hardcoded node id, but this hasn't been checked against the real
  downloaded Wan 2.2 workflow JSON on a live GPU. If duration doesn't
  actually change the output length, inspect
  `/workflows/text_to_video_wan22_5B.json` inside a running container and
  adjust `set_duration()` to match its real field name.
- **HuggingFace model URLs** in the Dockerfile use the standard
  `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` repo path — if the build fails on a
  404 for any model file, check that repo's file browser for the current
  exact path (HF repos occasionally reorganize folders).
- **GPU sizing**: 24GB VRAM is the Wan 2.2 5B variant's documented minimum;
  if generation OOMs, step up to a larger GPU tier on the RunPod endpoint.
