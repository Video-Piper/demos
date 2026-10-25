// Create a Video Piper live stream, print how to watch and broadcast to it, wait for the
// broadcast to end, then print the recording's videoId.
// Usage: node live.mjs ["Stream title"]
// Needs Node 18+ (built-in fetch), no dependencies, and a Pro or Scale plan.
// Reads VIDEO_PIPER_API_KEY (and optionally VIDEO_PIPER_API_URL) from the environment
// or from a .env file next to this script.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
const title = process.argv[2] ?? "Live stream demo";

if (!API_KEY) {
  console.error("VIDEO_PIPER_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, body) {
  const response = await fetch(API_URL + path, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`API error ${response.status}. ${data?.error}: ${data?.message} (request ${data?.requestId})`);
    error.status = response.status;
    error.code = data?.error;
    throw error;
  }
  return data;
}

// Rate limited or temporarily unavailable: keep waiting instead of giving up.
const isTransient = (error) => error.status === undefined || error.status === 429 || error.status >= 500;

async function main() {
  // A test key (vp_test_...) makes free test streams of up to 5 minutes.
  const maxDurationMinutes = API_KEY.startsWith("vp_test_") ? 5 : 60;
  const stream = await call("POST", "/live-streams", { title, record: true, maxDurationMinutes });

  console.log(`Live stream ${stream.liveStreamId} created (stops by itself after ${maxDurationMinutes} minutes).\n`);
  console.log(`Watch link (share this): ${stream.watch.url}\n`);
  console.log("Broadcast from OBS: Settings > Stream > Service: Custom...");
  console.log(`  Server:     ${stream.ingest.rtmpsUrl}`);
  console.log(`  Stream key: ${stream.ingest.streamKey}`);
  console.log("  (1280x720 at 30 fps, 2,500-3,500 kbps, keyframes every 2 seconds)\n");
  console.log("WARNING: the stream key lets anyone who has it broadcast to this stream. Keep it private,");
  console.log("and give it only to the person broadcasting.\n");
  console.log(`Waiting for the broadcast to start and end. To stop early: POST ${API_URL}/live-streams/${stream.liveStreamId}/end\n`);

  // idle -> live -> ended. expired = never started within a day, failed = could not be processed.
  let current = stream;
  let lastStatus;
  while (current.status === "idle" || current.status === "live") {
    await sleep(10_000);
    try {
      current = await call("GET", `/live-streams/${stream.liveStreamId}`);
    } catch (error) {
      if (!isTransient(error)) throw error;
      console.warn(`Could not read the stream (${error.message}); trying again.`);
      continue;
    }
    if (current.status !== lastStatus) console.log(`Status: ${current.status}`);
    lastStatus = current.status;
  }
  if (current.status !== "ended") {
    throw new Error(`The stream finished with status "${current.status}" and was not recorded.`);
  }

  // The recording becomes a normal video a little after the stream ends.
  console.log("Stream ended. Waiting for the recording to be saved...");
  for (let attempt = 0; !current.videoId; attempt++) {
    if (attempt === 60) throw new Error(`No recording after 10 minutes. Check GET /live-streams/${stream.liveStreamId} later.`);
    await sleep(10_000);
    try {
      current = await call("GET", `/live-streams/${stream.liveStreamId}`);
    } catch (error) {
      if (!isTransient(error)) throw error;
    }
  }
  console.log(`Recording saved as video ${current.videoId}. Fetch it with GET /videos/${current.videoId}.`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.code === "PLAN_UPGRADE_REQUIRED") console.error("Live streaming needs a Pro or Scale plan: https://videopiper.com/pricing/");
  if (error.status === 401) console.error("Check VIDEO_PIPER_API_KEY.");
  process.exit(1);
});
