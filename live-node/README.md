# Live streaming (Node)

Creates a [live stream](https://videopiper.com/docs/#live-streaming), prints the watch link and the OBS server and stream key, waits for the broadcast to end, then prints the recording's `videoId`. Node 18+, no dependencies.

**Needs a Pro or Scale plan.** Free and Starter accounts get `403 PLAN_UPGRADE_REQUIRED`. A test key (`vp_test_...`) makes free test streams of up to 5 minutes.

```sh
cp .env.example .env        # then put your API key in .env
node live.mjs "My first stream"
```

Then, in OBS: Settings > Stream > Service: Custom..., paste the server and stream key the script prints (1280x720 at 30 fps, 2,500-3,500 kbps, keyframes every 2 seconds). Open the watch link on any device to see the stream.

**Keep the stream key private.** Anyone who has it can broadcast to the stream until it ends.

The stream ends when you stop broadcasting, when `POST /live-streams/{id}/end` is called, or after `maxDurationMinutes` (the script sets 60, or 5 for test keys). The recording becomes a normal video in your account a little later; for a push notification instead of polling, tick `live.recording.ready` in your [webhook](../webhooks-node) settings.
