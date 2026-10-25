"""Upload a local video to Video Piper, wait for it to process, and download the MP4.

Usage: python upload.py path/to/video.mp4 [output.mp4]
Needs Python 3.9+ and `pip install -r requirements.txt` (requests only).
Reads VIDEO_PIPER_API_KEY (and optionally VIDEO_PIPER_API_URL) from the environment
or from a .env file next to this script.
"""
import os
import random
import re
import sys
import time
import uuid

import requests

POLL_SECONDS = 10


def load_env_file() -> None:
    """Minimal .env loader (KEY=value lines); variables already set in the environment win."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as env_file:
        for line in env_file:
            match = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if match:
                os.environ.setdefault(match[1], re.sub(r"^(['\"])(.*)\1$", r"\2", match[2]))


class ApiError(Exception):
    def __init__(self, status: int, body: dict):
        detail = f"{body['error']}: {body['message']} (request {body.get('requestId')})" if "message" in body else f"HTTP {status}"
        hint = " Check VIDEO_PIPER_API_KEY." if status == 401 else ""
        super().__init__(f"API error {status}. {detail}{hint}")
        self.status = status

    @property
    def transient(self) -> bool:
        """Rate limited or temporarily unavailable: worth trying again."""
        return self.status == 429 or self.status >= 500


def call(session: requests.Session, api_url: str, method: str, path: str, *, json=None, headers=None):
    """Call the API. Retries 429, 5xx and network errors with exponential backoff and jitter."""
    for attempt in range(1, 6):
        try:
            response = session.request(method, api_url + path, json=json, headers=headers, timeout=60)
            if response.ok:
                return response.json()
            try:
                body = response.json()
            except ValueError:
                body = {}
            error: Exception = ApiError(response.status_code, body)
        except requests.RequestException as network_error:
            error = network_error
        if (isinstance(error, ApiError) and not error.transient) or attempt == 5:
            raise error
        time.sleep(2**attempt * 0.5 * (0.5 + random.random()))


def upload_part(session, api_url, video_id, source, part_number, part_size) -> None:
    """PUT one part to its pre-signed URL (no Authorization header). Part URLs last
    15 minutes, so ask for a fresh one right before each attempt."""
    for attempt in range(1, 4):
        part = call(session, api_url, "POST", f"/videos/{video_id}/parts", json={"partNumbers": [part_number]})["parts"][0]
        source.seek((part_number - 1) * part_size)
        try:
            requests.put(part["url"], data=source.read(part["sizeBytes"]), timeout=600).raise_for_status()
            return
        except requests.RequestException as error:
            if attempt == 3:
                raise RuntimeError(f"Part {part_number} failed: {error}") from error
            time.sleep(attempt)


def main() -> None:
    load_env_file()
    api_key = os.environ.get("VIDEO_PIPER_API_KEY")
    api_url = os.environ.get("VIDEO_PIPER_API_URL", "https://api.videopiper.dev/v1").rstrip("/")
    if len(sys.argv) < 2:
        sys.exit("Usage: python upload.py path/to/video.mp4 [output.mp4]")
    if not api_key:
        sys.exit("VIDEO_PIPER_API_KEY is not set. Copy .env.example to .env and add your key.")

    path = sys.argv[1]
    file_name = os.path.basename(path)
    output = sys.argv[2] if len(sys.argv) > 2 else f"{os.path.splitext(file_name)[0]}-processed.mp4"
    size = os.path.getsize(path)

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {api_key}"

    # 1. Create the video. The idempotency key makes a retried request safe.
    print(f"Creating video ({size} bytes)...")
    video = call(session, api_url, "POST", "/videos", json={"fileName": file_name, "sizeBytes": size},
                 headers={"Idempotency-Key": str(uuid.uuid4())})
    video_id, part_size, part_count = video["videoId"], video["partSize"], video["partCount"]
    print(f"Video {video_id}, {part_count} part(s).")

    # 2. Upload the parts. Part n is the n-th part_size slice of the file.
    with open(path, "rb") as source:
        for part_number in range(1, part_count + 1):
            upload_part(session, api_url, video_id, source, part_number, part_size)
            print(f"Uploaded part {part_number}/{part_count}")

    # 3. Start processing.
    call(session, api_url, "POST", f"/videos/{video_id}/complete", json={},
         headers={"Idempotency-Key": f"complete-{video_id}"})
    print("Processing...")

    # 4. Poll until it is done. Keep waiting while it runs or the API has a hiccup.
    while True:
        time.sleep(POLL_SECONDS)
        try:
            status = call(session, api_url, "GET", f"/videos/{video_id}")
        except (ApiError, requests.RequestException) as error:
            if isinstance(error, ApiError) and not error.transient:
                raise
            print(f"Could not read status ({error}); trying again.")
            continue
        if status["status"] in ("SUBMITTED", "RUNNING", "PENDING_REDRIVE"):
            continue
        if status["status"] != "SUCCEEDED":
            sys.exit(f"Processing stopped with status {status['status']}. "
                     "Check that the file plays elsewhere, then upload again.")
        break

    # 5. Download. The link is valid for 15 minutes; this status is fresh.
    with requests.get(status["downloadUrl"], stream=True, timeout=600) as download:
        download.raise_for_status()
        with open(output, "wb") as out:
            for chunk in download.iter_content(1 << 20):
                out.write(chunk)
    print(f"Saved {output}")


if __name__ == "__main__":
    try:
        main()
    except (ApiError, RuntimeError, requests.RequestException) as error:
        sys.exit(str(error))
