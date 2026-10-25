# Video Piper demos

[Video Piper](https://videopiper.com) is a video API: upload a file, optionally trim, redact, caption or combine it, then download or stream the result. These are small, runnable examples of using it.

## Demos

| Folder | What it shows |
|---|---|
| [`quickstart/curl`](quickstart/curl) | Upload, wait, download with bash, curl and jq |
| [`quickstart/node`](quickstart/node) | The same in Node 18+ with built-in `fetch`, no dependencies |
| [`quickstart/python`](quickstart/python) | The same in Python 3.9+ with `requests` |
| [`recorder-node`](recorder-node) | Record in the browser with `<video-piper-recorder>`, play it back with `<video-piper>`, behind a small Express server |
| [`webhooks-node`](webhooks-node) | An Express receiver that verifies webhook signatures and handles `video.ready`, `video.failed` and `live.recording.ready` |
| [`live-node`](live-node) | Create a live stream, get the OBS settings, and find the recording afterwards (Pro or Scale) |
| [`mcp`](mcp) | Connect Claude Desktop, Claude Code, Cursor or VS Code to your videos |

Each folder is self-contained, with its own README and run instructions.

## Prerequisites

An API key: sign in at <https://videopiper.com/app/>, then Account > API keys. Test keys (`vp_test_...`) work for every example here and make free, marked, 480p videos of at most 60 seconds, so you can try things without using your plan. Keep keys on your server and out of git.

Every example reads `VIDEO_PIPER_API_KEY` from the environment (or a `.env` file; copy the folder's `.env.example`). `VIDEO_PIPER_API_URL` is optional and defaults to `https://api.videopiper.dev/v1`.

## Links

- [API docs](https://videopiper.com/docs/)
- [Pricing](https://videopiper.com/pricing/)

Licensed under the [MIT License](LICENSE).
