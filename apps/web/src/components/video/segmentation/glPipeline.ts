/**
 * The WebGL2 half of our background replacement.
 *
 * `@livekit/track-processors` ships its own pipeline and we used it for months;
 * this exists because of what it does with the mask. It asks MediaPipe for a
 * *category* mask — a hard 0-or-1 per pixel at 256x144 — box-blurs it, and
 * thresholds it at 0.5. Two things follow from that and both were visible in
 * class: edges are stair-stepped, because the only softness available is what
 * the blur invents from a binary image; and they crawl, because each frame is
 * segmented in complete ignorance of the one before it, so every pixel the
 * model is unsure about flickers at 30Hz. That flicker is what reads as
 * "grainy" — a still screenshot of it looks far better than the live picture.
 *
 * So this pipeline changes three things:
 *
 *   1. **Confidence, not category.** The mask arrives as a float per pixel, so
 *      hair and shoulders get a genuine gradient instead of a coin flip.
 *   2. **Temporal smoothing.** Each frame's mask is blended into the previous
 *      one (an exponential moving average). Uncertain pixels stop twitching;
 *      real movement still comes through, because the model agrees with itself
 *      over consecutive frames wherever it is confident.
 *   3. **A soft composite.** A narrow smoothstep over an already-soft mask,
 *      plus a light wrap that lets a little background colour bleed onto the
 *      rim — the thing that stops a cut-out looking pasted on.
 *
 * Everything runs at mask resolution until the final pass, so the cost over
 * the old pipeline is a handful of 256x144 draws.
 */

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

/**
 * Texture coordinates for a full-screen quad.
 *
 * `flipY` matters and is easy to get backwards. A texture uploaded from a
 * VideoFrame has its first row at t=0, but NDC y=+1 is the *top* of the
 * viewport, so drawing to the canvas has to flip. Rendering into a framebuffer
 * must not: source and destination share the same convention there, and an odd
 * number of flips would hand the next pass an upside-down image.
 *
 * MediaPipe's mask texture is treated exactly like the video frame, which is
 * what the upstream pipeline does too.
 */
const vertexShader = (flipY: boolean) => `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  uv = (position + 1.0) / 2.0;
  ${flipY ? 'uv.y = 1.0 - uv.y;' : ''}
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/** Blends this frame's mask into the running average with motion-adaptive responsiveness. */
const temporalShader = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform float u_blend;      // time-adjusted blend rate
uniform vec2 u_texel;
uniform bool u_reset;       // first frame, or the mask changed size
uniform bool u_invert;      // invert if channel is background
out vec4 fragColor;

float currentAt(vec2 point) {
  float value = texture(u_current, point).r;
  return u_invert ? 1.0 - value : value;
}

void main() {
  float current = currentAt(uv);
  float nearby = (
    currentAt(uv + vec2(u_texel.x, 0.0)) +
    currentAt(uv - vec2(u_texel.x, 0.0)) +
    currentAt(uv + vec2(0.0, u_texel.y)) +
    currentAt(uv - vec2(0.0, u_texel.y))
  ) * 0.25;
  float uncertainty = 1.0 - abs(current * 2.0 - 1.0);
  current = mix(current, nearby, uncertainty * 0.18);
  float previous = texture(u_previous, uv).r;

  // Multi-level motion-adaptive noise gate:
  // Sub-0.22 fluctuations are raw neural network inference noise and camera sensor jitter.
  // Genuine body movement (> 0.22) smoothly ramps up responsiveness.
  // The cubic ease-in (motion * motion) ensures micro-jitter near the threshold
  // is suppressed much more aggressively than deliberate movement.
  float diff = abs(current - previous);
  float motion = smoothstep(0.22, 0.55, diff);
  motion = motion * motion;  // cubic ease-in for extra noise suppression
  float blend = mix(u_blend, 0.65, motion);

  float blended = u_reset ? current : mix(previous, current, blend);
  fragColor = vec4(vec3(blended), 1.0);
}
`;

/** Separable gaussian. Used on the mask (to feather) and on the background. */
const blurShader = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_texture;
uniform vec2 u_step;        // direction * texel size
uniform float u_sigma;      // in texels; 0 disables
out vec4 fragColor;

const int MAX_TAPS = 12;

void main() {
  if (u_sigma <= 0.0) {
    fragColor = texture(u_texture, uv);
    return;
  }
  // Sampling out to 2 sigma captures ~95% of the kernel; past that the weights
  // are worth less than the texture fetches they cost.
  float taps = min(float(MAX_TAPS), ceil(u_sigma * 2.0));
  vec4 sum = texture(u_texture, uv);
  float weightSum = 1.0;
  for (int i = 1; i <= MAX_TAPS; i++) {
    if (float(i) > taps) break;
    float offset = float(i);
    float weight = exp(-(offset * offset) / (2.0 * u_sigma * u_sigma));
    sum += texture(u_texture, uv + u_step * offset) * weight;
    sum += texture(u_texture, uv - u_step * offset) * weight;
    weightSum += weight * 2.0;
  }
  fragColor = sum / weightSum;
}
`;

/** Straight copy, used to downsample the frame before blurring it. */
const copyShader = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() { fragColor = texture(u_texture, uv); }
`;

const compositeShader = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_frame;
uniform sampler2D u_background;
uniform sampler2D u_mask;
uniform float u_edge;        // half-width of the transition, in mask units
uniform float u_wrap;        // how much background colour bleeds onto the rim
uniform vec2 u_bgScale;      // cover-fit for a wallpaper of the wrong aspect
uniform vec2 u_bgOffset;
out vec4 fragColor;

void main() {
  vec3 person = texture(u_frame, uv).rgb;
  vec3 background = texture(u_background, uv * u_bgScale + u_bgOffset).rgb;

  // Silky subpixel anti-aliased alpha matte:
  // Operating on the Gaussian-feathered mask creates a continuous, natural transition
  // without blocky pixel steps or pulsating edges.
  float mask = texture(u_mask, uv).r;
  float alpha = smoothstep(0.5 - u_edge, 0.5 + u_edge, mask);

  // Subtle natural light wrap on the boundary rim
  float rim = 4.0 * alpha * (1.0 - alpha);
  vec3 lit = mix(person, background, rim * u_wrap * 0.35);

  fragColor = vec4(mix(background, lit, alpha), 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragmentSource: string, flipY = false): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vertexShader(flipY));
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // The shaders are owned by the program once linked; deleting our handles
  // here means cleanup only has to track programs.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number): RenderTarget {
  const texture = createTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
}

function destroyTarget(gl: WebGL2RenderingContext, target: RenderTarget | null) {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
}

export interface PipelineSettings {
  /** 0..1. Lower means steadier edges and slower response to movement. */
  temporalBlend: number;
  /** Feather applied to the mask, in mask texels. */
  maskFeather: number;
  /** Half-width of the final alpha ramp. Smaller is crisper. */
  edgeSoftness: number;
  /** How much background colour bleeds onto the subject's rim. 0 disables. */
  lightWrap: number;
}

export const DEFAULT_SETTINGS: PipelineSettings = {
  // 85% EMA history — aggressive temporal stability crushes sensor noise,
  // pulsating and flickering. Combined with the motion-adaptive gate in
  // temporalShader, genuine movement still comes through cleanly.
  temporalBlend: 0.15,
  // Wider Gaussian feather softens the low-resolution mask before compositing.
  maskFeather: 2.4,
  // Narrow final ramp keeps the person-background boundary tight but smooth.
  edgeSoftness: 0.14,
  // Subtle rim wrap prevents the "cardboard cutout" look.
  lightWrap: 0.18,
};

/** How much the background is downscaled before being blurred (2 = 360p/540p for crisp Gaussian blur). */
const BLUR_DOWNSCALE = 2;

export type BackgroundMode =
  | { kind: 'blur'; radius: number }
  | { kind: 'image'; image: ImageBitmap };

export function createPipeline(canvas: OffscreenCanvas | HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false }) as
    | WebGL2RenderingContext
    | null;
  if (!gl) return null;

  const programs = {
    temporal: link(gl, temporalShader),
    blur: link(gl, blurShader),
    copy: link(gl, copyShader),
    copyOutput: link(gl, copyShader, true),
    composite: link(gl, compositeShader, true),
  };

  // Our own vertex array, bound before every draw. MediaPipe runs its model on
  // this same context and leaves whatever state it likes behind — a stray VAO
  // or an enabled blend would otherwise land in the middle of our pipeline as
  // a rendering bug with no obvious author.
  const vao = gl.createVertexArray()!;
  const quad = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const frameTexture = createTexture(gl);
  const backgroundTexture = createTexture(gl);

  // Mask targets: two for the moving average to ping-pong between, two for the
  // separable feather. Sized on first use, because only MediaPipe knows what
  // resolution the model it loaded actually emits.
  let maskHistory: [RenderTarget, RenderTarget] | null = null;
  let maskBlur: [RenderTarget, RenderTarget] | null = null;
  let maskSize = { width: 0, height: 0 };
  let historyIndex = 0;
  let needsReset = true;
  let lastMaskUpdate = 0;

  let bgTargets: [RenderTarget, RenderTarget] | null = null;
  let bgSize = { width: 0, height: 0 };

  let cpuMaskTex: WebGLTexture | null = null;

  let settings = { ...DEFAULT_SETTINGS };
  let mode: BackgroundMode | null = null;
  let backgroundAspect = 1;

  function bindQuad(program: WebGLProgram) {
    gl!.disable(gl!.BLEND);
    gl!.disable(gl!.SCISSOR_TEST);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.bindVertexArray(vao);
    gl!.useProgram(program);
    const location = gl!.getAttribLocation(program, 'position');
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
    gl!.enableVertexAttribArray(location);
    gl!.vertexAttribPointer(location, 2, gl!.FLOAT, false, 0, 0);
  }

  function drawTo(target: RenderTarget | null) {
    if (target) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
      gl!.viewport(0, 0, target.width, target.height);
    } else {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, canvas.width, canvas.height);
    }
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  }

  function bindTextureUniform(program: WebGLProgram, name: string, unit: number, texture: WebGLTexture) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.uniform1i(gl!.getUniformLocation(program, name), unit);
  }

  function ensureMaskTargets(width: number, height: number) {
    if (maskHistory && maskSize.width === width && maskSize.height === height) return;
    destroyMaskTargets();
    maskHistory = [createTarget(gl!, width, height), createTarget(gl!, width, height)];
    maskBlur = [createTarget(gl!, width, height), createTarget(gl!, width, height)];
    maskSize = { width, height };
    historyIndex = 0;
    lastMaskUpdate = 0;
    // Nothing in the new history buffers to average against — the first frame
    // after a resize has to be taken at face value or it fades in from black.
    needsReset = true;
  }

  function destroyMaskTargets() {
    maskHistory?.forEach((t) => destroyTarget(gl!, t));
    maskBlur?.forEach((t) => destroyTarget(gl!, t));
    maskHistory = null;
    maskBlur = null;
  }

  function ensureBackgroundTargets() {
    const width = Math.max(1, Math.floor(canvas.width / BLUR_DOWNSCALE));
    const height = Math.max(1, Math.floor(canvas.height / BLUR_DOWNSCALE));
    if (bgTargets && bgSize.width === width && bgSize.height === height) return bgTargets;
    bgTargets?.forEach((t) => destroyTarget(gl!, t));
    bgTargets = [createTarget(gl!, width, height), createTarget(gl!, width, height)];
    bgSize = { width, height };
    return bgTargets;
  }

  /** One direction of a separable gaussian. Returns the target written to. */
  function blurPass(
    source: WebGLTexture,
    target: RenderTarget,
    sigma: number,
    direction: [number, number]
  ) {
    bindQuad(programs.blur);
    bindTextureUniform(programs.blur, 'u_texture', 0, source);
    gl!.uniform1f(gl!.getUniformLocation(programs.blur, 'u_sigma'), sigma);
    gl!.uniform2f(
      gl!.getUniformLocation(programs.blur, 'u_step'),
      (direction[0] / target.width) as number,
      (direction[1] / target.height) as number
    );
    drawTo(target);
    return target;
  }

  return {
    setSettings(next: Partial<PipelineSettings>) {
      settings = { ...settings, ...next };
    },

    setMode(next: BackgroundMode | null) {
      mode = next;
      if (next?.kind === 'image') {
        backgroundAspect = next.image.width / next.image.height;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, next.image);
      }
    },

    updateMask(mask: WebGLTexture | Uint8Array, width: number, height: number, invert: boolean) {
      ensureMaskTargets(width, height);
      if (!maskHistory || !maskBlur) return;

      const previous = maskHistory[historyIndex];
      const next = maskHistory[1 - historyIndex];

      let maskTex: WebGLTexture;
      if (mask instanceof Uint8Array) {
        if (!cpuMaskTex) {
          cpuMaskTex = createTexture(gl);
        }
        maskTex = cpuMaskTex;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, maskTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      } else {
        maskTex = mask;
      }

      const now = performance.now();
      const elapsedMs = lastMaskUpdate > 0 ? Math.min(250, now - lastMaskUpdate) : 66;
      const timeAdjustedBlend = 1 - Math.pow(1 - settings.temporalBlend, elapsedMs / 66);

      bindQuad(programs.temporal);
      bindTextureUniform(programs.temporal, 'u_current', 0, maskTex);
      bindTextureUniform(programs.temporal, 'u_previous', 1, previous.texture);
      gl.uniform1f(gl.getUniformLocation(programs.temporal, 'u_blend'), timeAdjustedBlend);
      gl.uniform2f(gl.getUniformLocation(programs.temporal, 'u_texel'), 1 / width, 1 / height);
      gl.uniform1i(gl.getUniformLocation(programs.temporal, 'u_reset'), needsReset ? 1 : 0);
      gl.uniform1i(gl.getUniformLocation(programs.temporal, 'u_invert'), invert ? 1 : 0);
      drawTo(next);

      historyIndex = 1 - historyIndex;
      lastMaskUpdate = now;
      needsReset = false;

      blurPass(next.texture, maskBlur[0], settings.maskFeather, [1, 0]);
      blurPass(maskBlur[0].texture, maskBlur[1], settings.maskFeather, [0, 1]);
    },

    render(frame: VideoFrame, privacyFallback = false) {
      if (!mode) return false;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frameTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

      let background = backgroundTexture;
      let scale: [number, number] = [1, 1];
      let offset: [number, number] = [0, 0];

      if (mode.kind === 'blur') {
        const [a, b] = ensureBackgroundTargets();
        bindQuad(programs.copy);
        bindTextureUniform(programs.copy, 'u_texture', 0, frameTexture);
        drawTo(a);

        const sigma = Math.max(0.5, mode.radius / BLUR_DOWNSCALE);
        blurPass(a.texture, b, sigma, [1, 0]);
        blurPass(b.texture, a, sigma, [0, 1]);
        background = a.texture;
      } else {
        const frameAspect = canvas.width / canvas.height;
        if (backgroundAspect > frameAspect) {
          const visible = frameAspect / backgroundAspect;
          scale = [visible, 1];
          offset = [(1 - visible) / 2, 0];
        } else {
          const visible = backgroundAspect / frameAspect;
          scale = [1, visible];
          offset = [0, (1 - visible) / 2];
        }
      }

      if (privacyFallback) {
        bindQuad(programs.copyOutput);
        bindTextureUniform(programs.copyOutput, 'u_texture', 0, background);
        drawTo(null);
        return true;
      }
      if (!maskBlur) return false;

      bindQuad(programs.composite);
      bindTextureUniform(programs.composite, 'u_frame', 0, frameTexture);
      bindTextureUniform(programs.composite, 'u_background', 1, background);
      bindTextureUniform(programs.composite, 'u_mask', 2, maskBlur[1].texture);
      gl.uniform1f(gl.getUniformLocation(programs.composite, 'u_edge'), settings.edgeSoftness);
      gl.uniform1f(gl.getUniformLocation(programs.composite, 'u_wrap'), settings.lightWrap);
      gl.uniform2f(gl.getUniformLocation(programs.composite, 'u_bgScale'), scale[0], scale[1]);
      gl.uniform2f(gl.getUniformLocation(programs.composite, 'u_bgOffset'), offset[0], offset[1]);
      drawTo(null);
      return true;
    },

    /** True once a mask has been folded in — before that there is nothing to composite. */
    get ready() {
      return maskBlur !== null;
    },

    /** The GL context, so the segmenter can be created against the same one. */
    get context() {
      return gl;
    },

    get canvas() {
      return canvas;
    },

    destroy() {
      destroyMaskTargets();
      bgTargets?.forEach((t) => destroyTarget(gl, t));
      bgTargets = null;
      if (cpuMaskTex) gl.deleteTexture(cpuMaskTex);
      gl.deleteTexture(frameTexture);
      gl.deleteTexture(backgroundTexture);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      Object.values(programs).forEach((p) => gl.deleteProgram(p));
    },
  };
}

export type Pipeline = NonNullable<ReturnType<typeof createPipeline>>;
