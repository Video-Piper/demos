# Video Piper demos

[Video Piper](https://videopiper.com) is a video API: upload a file, optionally trim, redact, caption or combine it, then download or stream the result. These are small, runnable examples of using it.

[![Recording in the browser with the recorder demo, then playing the processed video](media/recorder-demo.gif)](media/recorder-demo.mp4)

*The [recorder demo](recorder-node): pick Camera, record, save, upload, and the processed video plays back. ([MP4](media/recorder-demo.mp4); the processing wait is trimmed.)*

## Demos

| Folder | What it shows |
|---|---|
| [`quickstart/curl`](quickstart/curl) | Upload, wait, download with bash, curl and jq |
| [`quickstart/node`](quickstart/node) | The same in Node 18+ with built-in `fetch`, no dependencies |
| [`quickstart/python`](quickstart/python) | The same in Python 3.9+ with `requests` |
| [`recorder-node`](recorder-node) | Record in the browser with `<video-piper-recorder>`, play it back with `<video-piper>`, behind a small Express server |
| [`webhooks-node`](webhooks-node) | An Express receiver that verifies webhook signatures and handles `video.ready`, `video.failed` and `live.recording.ready` |
| [`live-node`](live-node) | Create a live stream, get the OBS settings, and find the recording afterwards (Pro, Scale or Enterprise) |
| [`mcp`](mcp) | Connect Claude Desktop, Claude Code, Cursor or VS Code to your videos |

Each folder is self-contained, with its own README and run instructions.

## Web components in your own app

The recorder demo loads the components as script tags from videopiper.com. In your own app you can install them from npm instead, as [`@videopiper/elements`](https://www.npmjs.com/package/@videopiper/elements):

```sh
npm install @videopiper/elements
```

```js
import "@videopiper/elements/recorder";  // also /player, /editor and /thumbnail
```

Without a build step, the same scripts are on jsDelivr: `https://cdn.jsdelivr.net/npm/@videopiper/elements@0/dist/cdn/recorder.js`. See the [player](https://videopiper.com/docs/player/) and [recorder](https://videopiper.com/docs/recorder/) docs.

## Prerequisites

An API key: sign in at <https://videopiper.com/app/>, then Account > API keys. Test keys (`vp_test_...`) work for every example here and make free, marked, 480p videos of at most 60 seconds, so you can try things without using your plan. Keep keys on your server and out of git.

Every example reads `VIDEO_PIPER_API_KEY` from the environment (or a `.env` file; copy the folder's `.env.example`). `VIDEO_PIPER_API_URL` is optional and defaults to `https://api.videopiper.dev/v1`.

## Links

- [API docs](https://videopiper.com/docs/)
- [Pricing](https://videopiper.com/pricing/)

Licensed under the [MIT License](LICENSE).
