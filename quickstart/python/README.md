# Quickstart: Python

Uploads a local file, waits for it to process, and downloads the MP4. Files larger than one part (64 MiB) are uploaded part by part. Python 3.9+ and [`requests`](https://requests.readthedocs.io/).

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then put your API key in .env
python upload.py path/to/video.mp4
```

The result is saved as `video-processed.mp4` in the current folder; pass a second argument to choose the name.

With a test key (`vp_test_...`) the result is a free, marked, 480p video of at most 60 seconds. See the [test mode docs](https://videopiper.com/docs/test-mode/).

Instead of a `.env` file you can export `VIDEO_PIPER_API_KEY` in your shell. `VIDEO_PIPER_API_URL` is optional and defaults to `https://api.videopiper.dev/v1`.

In production, use a [webhook](../../webhooks-node) rather than polling.
