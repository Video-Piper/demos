// A tiny backend for the <video-piper-recorder> and <video-piper> web components.
// Your API key stays here on the server; the browser only ever sees a one-video upload
// token and signed playback links.
import "dotenv/config";
import { readFileSync } from "node:fs";
import express from "express";

const API_KEY = process.env.VIDEO_PIPER_API_KEY;
const API_URL = (process.env.VIDEO_PIPER_API_URL || "https://api.videopiper.dev/v1").replace(/\/$/, "");
const SITE_URL = (process.env.VIDEO_PIPER_SITE_URL || "https://videopiper.com").replace(/\/$/, "");
const PORT = Number(process.env.PORT) || 3000;

if (!API_KEY) {
  console.error("VIDEO_PIPER_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const app = express();

// The page loads the web components from the Video Piper site; fill in its address.
const page = readFileSync(new URL("./public/index.html", import.meta.url), "utf8").replaceAll("__SITE_URL__", SITE_URL);
app.get("/", (_req, res) => res.type("html").send(page));

/*
 * SECURITY: this demo has no sign-in, so anyone who can reach this server can mint upload
 * tokens against your account. A real app must authenticate the user (session, JWT, ...)
 * before handing out a token, and should put the user's id in `metadata` so webhooks can
 * tell whose recording it is.
 */
app.post("/api/upload-token", async (_req, res) => {
  try {
    const response = await fetch(`${API_URL}/upload-tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      // The token works for exactly one video, must be used within 5 minutes, and trims the recording to 2 minutes.
      body: JSON.stringify({ expiresIn: 300, maxSeconds: 120 }),
    });
    // Pass the API's answer ({ uploadToken: "vpu_..." }) or its error straight to the recorder.
    res.status(response.status).json(await response.json());
  } catch (error) {
    console.error("upload-token failed:", error);
    res.status(502).json({ error: "UPSTREAM_ERROR", message: "Could not reach the Video Piper API." });
  }
});

// The player's links, cached per video. The API allows 5 requests per second per key, so
// don't call it once per viewer: refetch only when under a fifth of the links' lifetime is left.
// (Like the token endpoint, a real app should check the viewer may watch this video.)
const linksCache = new Map();
app.get("/api/videos/:id/links", async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{32}$/.test(id)) return res.status(400).json({ error: "INVALID_REQUEST", message: "Not a video id." });

  const now = Date.now() / 1000;
  const hit = linksCache.get(id);
  if (hit && hit.playbackExpiresAt - now > 0.2 * hit.ttl && hit.captionsStatus !== "processing") return res.json(hit);

  try {
    const response = await fetch(`${API_URL}/videos/${id}?linkTtl=86400`, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!response.ok) return res.status(response.status).end();
    const video = await response.json();
    const links = {
      playbackUrl: video.playbackUrl,
      streamUrl: video.streamUrl,
      posterUrl: video.posterPlaybackUrl,
      captionsUrl: video.captions?.vttUrl,
      captionsStatus: video.captions?.status,
      playbackExpiresAt: video.playbackExpiresAt,
      ttl: video.playbackExpiresAt - now,
    };
    linksCache.set(id, links);
    res.json(links);
  } catch (error) {
    console.error("links failed:", error);
    res.status(502).json({ error: "UPSTREAM_ERROR", message: "Could not reach the Video Piper API." });
  }
});

app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
