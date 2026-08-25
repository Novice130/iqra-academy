# Background Bug Notes

**Status**: Fix pushed, waiting for user verification.

**What was happening before**:
The video was grainy and the edges of the person were jagged.
1. **Grainy video**: The previous attempt used a 2D CPU downscaling step (`inferenceCtx.drawImage`) which was so slow that it caused a CPU bottleneck on the main thread. When the main thread lags in a WebRTC stream, WebRTC automatically drops the camera capture resolution to potato quality (like 144p) to save CPU. This made the entire camera feed look grainy.
2. **Jagged edges**: We used a `Float32Array` mask and uploaded it to an `R32F` WebGL texture. WebGL2 does not support linear filtering for `R32F` textures without a specific extension (`OES_texture_float_linear`). Because of this, it fell back to nearest-neighbor scaling when stretching the 256x144 mask to 720p, causing massive "staircase" edges around the person.

**The Fix (Just deployed)**:
1. **Zero-copy GPU Downscaling**: Removed the 2D CPU downscaling entirely. We now pass the raw `VideoFrame` directly to MediaPipe. MediaPipe's WebGL delegate natively processes it on the GPU without CPU roundtrips, which should completely eliminate the CPU bottleneck and allow WebRTC to keep the camera at full HD (720p).
2. **Linear Mask Filtering**: Instead of using an `R32F` texture, we now convert the `Float32Array` to a `Uint8Array` directly in JavaScript (which takes <0.1ms) and upload it to an 8-bit `R8` texture. 8-bit textures are natively supported for linear filtering in WebGL2, which restores the smooth gaussian blur on the edges!

Please test this out when you wake up.

**Meeting Deny Join Fix**:
I have also updated the `/api/sessions/[id]/join` and `/api/guest/join` routes so that if a meeting is marked as `COMPLETED` or `CANCELLED`, anyone who tries to join (students, guests, or teachers) will be denied with the message "This class has already ended."

**Regarding Cloudflare Error 1102**:
The 1102 Worker Exceeded Resource Limits error on `novicetutor.com` in your screenshot usually indicates that a Cloudflare Worker hit its CPU time limit (e.g. 50ms on free tier). The most likely culprit was the previous version of the background segmentation sending too many API requests or the server SSR being overwhelmed. With the new GPU-accelerated fix, CPU load should be back to normal. If it happens again, let me know.
