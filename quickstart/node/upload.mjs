// Upload a local video to Video Piper, wait for it to process, and download the MP4.
// Usage: node upload.mjs path/to/video.mp4 [output.mp4]
// Needs Node 18+ (built-in fetch), no dependencies.
// Reads VIDEO_PIPER_API_KEY (and optionally VIDEO_PIPER_API_URL) from the environment
// or from a .env file next to this script.
import { randomUUID } from "node:crypto";
import { createWriteStream, readFileSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

// Minimal .env loader (KEY=value lines); variables already set in the environment win.
try {
  const envFile = readFileSync(join(dirname(fileURLToPath(import.meta.url)), ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (match) process.env[match[1]] ??= match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {
  // No .env file: use the real environment.
}

const API_KEY = process.env.VIDEO_PIPER_API_KEY;
const API_URL = (process.env.VIDEO_PIPER_API_URL || "https://api.videopiper.dev/v1").replace(/\/$/, "");
const [filePath, outputArg] = process.argv.slice(2);

if (!filePath) fail("Usage: node upload.mjs path/to/video.mp4 [output.mp4]");
if (!API_KEY) fail("VIDEO_PIPER_API_KEY is not set. Copy .env.example to .env and add your key.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(message);
  process.exit(1);
}

class ApiError extends Error {
  constructor(status, body) {
    const detail = body?.message ? `${body.error}: ${body.message} (request ${body.requestId})` : `HTTP ${status}`;
    super(`API error ${status}. ${detail}${status === 401 ? " Check VIDEO_PIPER_API_KEY." : ""}`);
    this.status = status;
  }
  // Rate limited or temporarily unavailable: worth trying again.
  get transient() {
    return this.status === 429 || this.status >= 500;
  }
}

// Calls the API. Retries 429, 5xx and network errors with exponential backoff and jitter.
async function call(method, path, body, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(API_URL + path, {
        method,
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (response.ok) return data;
      throw new ApiError(response.status, data);
    } catch (error) {
      const retryable = !(error instanceof ApiError) || error.transient;
      if (!retryable || attempt === 5) throw error;
      await sleep(2 ** attempt * 500 * (0.5 + Math.random()));
    }
  }
}

// PUT one part to its pre-signed URL (no Authorization header). Part URLs last 15 minutes,
// so ask for a fresh one right before each attempt.
async function uploadPart(videoId, file, partNumber, partSize) {
  for (let attempt = 1; ; attempt++) {
    const { parts } = await call("POST", `/videos/${videoId}/parts`, { partNumbers: [partNumber] });
    const { url, sizeBytes } = parts[0];
    const bytes = Buffer.alloc(sizeBytes);
    await file.read(bytes, 0, sizeBytes, (partNumber - 1) * partSize);
    try {
      const response = await fetch(url, { method: "PUT", body: bytes });
      if (response.ok) return;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 3) throw new Error(`Part ${partNumber} failed: ${error.message}`);
      await sleep(1000 * attempt);
    }
  }
}

async function main() {
  const { size } = await stat(filePath);
  const fileName = basename(filePath);

  // 1. Create the video. The idempotency key makes a retried request safe.
  console.log(`Creating video (${size} bytes)...`);
  const { videoId, partSize, partCount } = await call("POST", "/videos", { fileName, sizeBytes: size }, { "Idempotency-Key": randomUUID() });
  console.log(`Video ${videoId}, ${partCount} part(s).`);

  // 2. Upload the parts. Part n is the n-th partSize slice of the file.
  const file = await open(filePath);
  try {
    for (let n = 1; n <= partCount; n++) {
      await uploadPart(videoId, file, n, partSize);
      console.log(`Uploaded part ${n}/${partCount}`);
    }
  } finally {
    await file.close();
  }

  // 3. Start processing.
  await call("POST", `/videos/${videoId}/complete`, {}, { "Idempotency-Key": `complete-${videoId}` });
  console.log("Processing...");

  // 4. Poll until it is done. Keep waiting while it runs or the API has a hiccup.
  let status;
  while (!status) {
    await sleep(10_000);
    try {
      const video = await call("GET", `/videos/${videoId}`);
      if (["SUBMITTED", "RUNNING", "PENDING_REDRIVE"].includes(video.status)) continue;
      if (video.status !== "SUCCEEDED") {
        fail(`Processing stopped with status ${video.status}. Check that the file plays elsewhere, then upload again.`);
      }
      status = video;
    } catch (error) {
      if (error instanceof ApiError && !error.transient) throw error;
      console.warn(`Could not read status (${error.message}); trying again.`);
    }
  }

  // 5. Download. The link is valid for 15 minutes; this status is fresh.
  const output = outputArg ?? `${basename(fileName, extname(fileName))}-processed.mp4`;
  if (!status.downloadUrl) throw new Error("The video succeeded but has no downloadUrl.");
  const download = await fetch(status.downloadUrl);
  if (!download.ok) throw new Error(`Download failed: HTTP ${download.status}`);
  await pipeline(Readable.fromWeb(download.body), createWriteStream(output));
  console.log(`Saved ${output}`);
}

main().catch((error) => fail(error.message));
