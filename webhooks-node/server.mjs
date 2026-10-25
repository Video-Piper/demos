// Receives Video Piper webhooks, checks their signature, and logs the events we care about.
import "dotenv/config";
import express from "express";
import { verifyWebhook } from "./verify.mjs";

const SECRET = process.env.VIDEO_PIPER_WEBHOOK_SECRET;
const PORT = Number(process.env.PORT) || 3000;

if (!SECRET) {
  console.error("VIDEO_PIPER_WEBHOOK_SECRET is not set. Copy it from Account > Webhooks into .env (see .env.example).");
  process.exit(1);
}

const app = express();

// Deliveries are at-least-once, so the same event can arrive twice. Deduplicate on webhook-id.
// (In memory here; use a database or cache with an expiry in a real app.)
const seen = new Set();

// The signature covers the exact bytes we were sent, so read the body raw. Do not put
// express.json() in front of this route.
app.post("/webhooks/video-piper", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  let event;
  try {
    event = verifyWebhook(SECRET, req.body, req.headers);
  } catch (error) {
    console.warn(`Rejected webhook: ${error.message}`);
    return res.status(401).send("Unauthorized");
  }

  // Answer quickly (within 10 seconds) with a 2xx; do slow work after responding or in a queue.
  res.sendStatus(200);

  const deliveryId = req.headers["webhook-id"];
  if (seen.has(deliveryId)) return;
  seen.add(deliveryId);

  // Test videos and streams send events to the same endpoint with livemode: false.
  const mode = event.livemode ? "live" : "test";
  const { videoId, liveStreamId, status } = event.data;

  switch (event.type) {
    case "video.ready":
      console.log(`[${mode}] video.ready: video ${videoId} is published and plays`);
      break;
    case "video.failed":
      console.log(`[${mode}] video.failed: video ${videoId} ended with ${status}`);
      break;
    case "live.recording.ready":
      console.log(`[${mode}] live.recording.ready: stream ${liveStreamId} was saved as video ${videoId}`);
      break;
    default:
      console.log(`[${mode}] ${event.type} (not handled)`);
  }
});

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}/webhooks/video-piper`));
