# Reused software

This demo reuses the actual upstream streaming stack. It does not implement a new codec or streaming protocol.

| Component | Version / source | License | Local usage |
|---|---|---|---|
| Sunshine | [v2026.516.143833](https://github.com/LizardByte/Sunshine/releases/tag/v2026.516.143833) | GPL-3.0 | Official Windows portable binary, unchanged |
| moonlight-web-stream | [v2.10.0](https://github.com/MrCreativ3001/moonlight-web-stream/tree/v2.10.0) | GPL-3.0 | Official server/streamer binaries; reused compiled browser modules with reproducible patches |
| Universal Touch Gamepad | [Selkies addon](https://github.com/selkies-project/selkies/tree/main/addons/universal-touch-gamepad), retrieved 2026-09-07 | MPL-2.0 | Full source in `public/vendor`, racing profile and local state/reset hooks added |
| ViGEmBus | [v1.22.0](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0) | BSD-3-Clause project | Official signed Windows driver installer |

The root LICENSE is the upstream GPL-3.0 license. The touch addon keeps its own MPL-2.0 header. Setup downloads the pinned Moonlight source into `vendor/moonlight-web-stream-2.10.0`; this generated directory and the official runtime binaries are excluded from Git. All browser code used by the demo is delivered as readable JavaScript. Binary checksums are pinned in `scripts/acquire.ps1`.

`scripts/prepare.mjs` records and reapplies the exact changes to distributed browser modules:

- Session lease token on the signalling WebSocket.
- HEVC Main or AV1 Main 8-bit only; no automatic codec or transport fallback.
- Correct gamepad register/remove IDs and empty-slot iteration.
- Correct standard A/B/X/Y button mapping.
- Determine WebRTC codec compatibility from RTCRtpReceiver, without rejecting it based on unrelated MP4 playback capability.
- Resolve upstream notification icons under `/upstream/resources/` in the demo's HTTP layout.

The server-side lease watchdog terminates the dedicated Desktop session on missing heartbeats. This releases Sunshine's virtual controller, and does not launch or kill the manually started game.

The touch addon also clears its internal active touch identifiers on reset, preventing lost touch-end events from locking a pedal or stick. Review details and regression checks are recorded in `docs/bug-review.md`.

`scripts/patch-media.mjs` adds browser-receipt timestamps to upstream host statistics so the latency display can reject stale values; it also limits AV1 requests to Main 8-bit. The calculations and measurement boundaries are documented in `docs/codecs-and-latency.md`.
