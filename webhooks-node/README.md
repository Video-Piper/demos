# Webhooks (Node + Express)

Receives Video Piper [webhooks](https://videopiper.com/docs/#webhooks), verifies their signature, and logs `video.ready`, `video.failed` and `live.recording.ready`. Use webhooks instead of polling to learn when a video is done.

Video Piper signs every delivery following [Standard Webhooks](https://www.standardwebhooks.com). `verify.mjs` checks it by hand, with no library:

- it uses the **raw** request body (a re-serialized JSON body will not match),
- it computes HMAC-SHA256 over `webhook-id.webhook-timestamp.body` and compares with `crypto.timingSafeEqual`,
- it rejects timestamps more than 5 minutes from now.

## Run it

```sh
npm install
cp .env.example .env        # then paste your signing secret
npm start                   # http://localhost:3000/webhooks/video-piper
```

## Try it

1. Video Piper needs a public HTTPS URL, so expose your port with a tunnel, for example `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`.
2. In the app go to Account > Webhooks, set the URL to `https://<your-tunnel-host>/webhooks/video-piper`, make sure the events you want are ticked (the `live.*` events are opt-in), and copy the signing secret (it starts with `whsec_`) into `.env`.
3. Send a test event from the same page (or `POST /webhook/test`), or upload a video with a [quickstart](../quickstart).

Events from test keys arrive at the same endpoint with `livemode: false`; the demo labels them `[test]`.

## Notes

- Answer 2xx within 10 seconds. Failed deliveries are retried for about 22 hours.
- Deliveries are at-least-once and can arrive out of order. Deduplicate on the `webhook-id` header; the demo keeps them in memory, a real app should not.
- The webhook URL must be HTTPS and publicly reachable; `localhost` is rejected.
- Rotating the secret (Account > Webhooks, or `POST /webhook/rotate`) means updating `.env`.
