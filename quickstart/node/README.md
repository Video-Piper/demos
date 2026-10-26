# Quickstart: Node.js

Uploads a local file, waits for it to process, and downloads the MP4. Files larger than one part (64 MiB) are uploaded part by part. Node 18+, no dependencies.

```sh
cp .env.example .env        # then put your API key in .env
node upload.mjs path/to/video.mp4
```

The result is saved as `video-processed.mp4` in the current folder; pass a second argument to choose the name.

With a test key (`vp_test_...`) the result is a free, marked, 480p video of at most 60 seconds. See the [test mode docs](https://videopiper.com/docs/test-mode/).

Instead of a `.env` file you can export `VIDEO_PIPER_API_KEY` in your shell. `VIDEO_PIPER_API_URL` is optional and defaults to `https://api.videopiper.dev/v1`.

In production, use a [webhook](../../webhooks-node) rather than polling.
