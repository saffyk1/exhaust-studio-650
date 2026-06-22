import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Screen = "home" | "waveform";

// ─── DSP helpers ─────────────────────────────────────────────────────────────
function highpassHz(v: number) { return Math.round(60 + v * 120); }
function lowpassHz(v: number)  { return Math.round(9000 - v * 5000); }
function bassGainDb(v: number) { return (v * 12).toFixed(1); }

function filterChain(noise: number, depth: number) {
  return [
    `highpass=f=${highpassHz(noise)}`,
    `lowpass=f=${lowpassHz(noise)}`,
    `equalizer=f=200:width_type=h:width=50:g=${bassGainDb(depth)}`,
    `equalizer=f=2500:width_type=h:width=200:g=3`,
    `acompressor=threshold=-12dB:ratio=4:attack=5:release=50`,
    `volume=volume=2dB`,
    `alimiter=limit=-1dB`,
  ].join(", ");
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg:      "#141414",
  surface: "#1A1A1A",
  border:  "#2A2A2A",
  dim:     "#383838",
  mid:     "#555555",
  muted:   "#888888",
  text:    "#E8E8E8",
  orange:  "#FF6B00",
  amber:   "#FFAA00",
  green:   "#00E676",
  appBar:  "#0D0D0D",
};

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [noise,  setNoise]  = useState(0.5);
  const [depth,  setDepth]  = useState(0.5);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div style={{ background: C.bg, minHeight: "100dvh", fontFamily: "monospace", color: C.text, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {screen === "home"
        ? <HomeScreen
            noise={noise} depth={depth}
            hasVideo={hasVideo} videoUrl={videoUrl}
            isPlaying={isPlaying} videoRef={videoRef}
            setNoise={setNoise} setDepth={setDepth}
            setHasVideo={setHasVideo} setVideoUrl={setVideoUrl}
            setIsPlaying={setIsPlaying}
            onProcess={() => setScreen("waveform")}
          />
        : <WaveformScreen
            command={`-y -i input.mp4 -c:v copy -af "${filterChain(noise, depth)}" output.mp4`}
            onDone={() => setScreen("home")}
          />
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreen({
  noise, depth, hasVideo, videoUrl, isPlaying, videoRef,
  setNoise, setDepth, setHasVideo, setVideoUrl, setIsPlaying, onProcess,
}: {
  noise: number; depth: number; hasVideo: boolean; videoUrl: string | null;
  isPlaying: boolean; videoRef: React.RefObject<HTMLVideoElement>;
  setNoise: (v: number) => void; setDepth: (v: number) => void;
  setHasVideo: (v: boolean) => void; setVideoUrl: (v: string | null) => void;
  setIsPlaying: (v: boolean) => void; onProcess: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
    setHasVideo(true);
    setIsPlaying(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else          { v.pause(); setIsPlaying(false); }
  }

  const chain   = filterChain(noise, depth);
  const command = `-y -i input.mp4 -c:v copy -af "${chain}" output.mp4`;

  const pipeline = [
    ["HPF", `${highpassHz(noise)}Hz cut`,         "Removes wind buffet & chassis rumble"],
    ["LPF", `${lowpassHz(noise)}Hz cut`,          "Strips tyre hiss & valve tick"],
    ["EQ1", `+${bassGainDb(depth)}dB@200Hz`,      "Mid-bass harmonic body"],
    ["EQ2", "+3dB@2500Hz",                        "Engine bark & firing snap"],
    ["COMP", "-12dB thr / 4:1",                   "Broadcast-density compression"],
    ["LIM",  "-1dBFS ceiling",                    "Hard limiter — zero clip"],
  ];

  return (
    <>
      {/* AppBar */}
      <div style={{ background: C.appBar, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        <span style={{ fontSize: 18, color: C.orange }}>≡</span>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1.4, color: C.orange }}>EXHAUST STUDIO</span>
        <span style={{ fontSize: 10, border: `1px solid ${C.orange}`, color: C.orange, padding: "1px 5px", borderRadius: 2, letterSpacing: 1, marginLeft: 2 }}>650</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 18, color: "#333" }}>⊙</span>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>

        {/* Video zone */}
        <VideoZone
          hasVideo={hasVideo} videoUrl={videoUrl} isPlaying={isPlaying}
          videoRef={videoRef} onTap={hasVideo ? togglePlay : () => fileRef.current?.click()}
          onReplace={() => fileRef.current?.click()}
        />
        <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pickVideo} />

        {/* TUNING */}
        <Divider label="TUNING" />
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 24 }}>
          <SliderRow
            icon="⧖" label="Noise Cleanup"
            sub={`highpass ${highpassHz(noise)}Hz / lowpass ${lowpassHz(noise)}Hz`}
            value={noise} min={0} max={1} step={0.01}
            left="OPEN" right="TIGHT" onChange={setNoise}
          />
          <SliderRow
            icon="〜" label="Exhaust Deepness"
            sub={`200Hz bass +${bassGainDb(depth)}dB`}
            value={depth} min={0} max={1} step={0.01}
            left="FLAT" right="+12dB" onChange={setDepth}
          />
        </div>

        {/* COMMAND */}
        <Divider label="COMMAND" />
        <div style={{ background: "#0F0F0F", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px", marginTop: 12, overflowX: "auto" }}>
          <code style={{ fontSize: 9, color: "#3E3E3E", letterSpacing: 0.3, whiteSpace: "pre" }}>{command}</code>
        </div>

        {/* PIPELINE */}
        <Divider label="PIPELINE" />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
          {pipeline.map(([tag, val, desc], i) => (
            <div key={tag} style={{ display: "flex", gap: 12, marginBottom: i < pipeline.length - 1 ? 0 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 44 }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 2, padding: "2px 3px", background: C.surface, width: "100%", textAlign: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, letterSpacing: 0.5 }}>{tag}</span>
                </div>
                {i < pipeline.length - 1 && <div style={{ width: 1, height: 20, background: C.border }} />}
              </div>
              <div style={{ paddingTop: 2, paddingBottom: 18 }}>
                <div style={{ fontSize: 11, color: "#E0E0E0", letterSpacing: 0.3 }}>{val}</div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 2, lineHeight: 1.3 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Enhance button */}
        <button
          onClick={hasVideo ? onProcess : undefined}
          style={{
            width: "100%", height: 56, marginTop: 8,
            background: hasVideo ? C.orange : "#2A2A2A",
            color: hasVideo ? "#000" : C.mid,
            border: "none", borderRadius: 4, cursor: hasVideo ? "pointer" : "not-allowed",
            fontSize: 14, fontWeight: 800, letterSpacing: 1.6, fontFamily: "monospace",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "background 0.2s",
          }}
        >
          <span style={{ fontSize: 18 }}>⚡</span>
          ENHANCE &amp; SAVE TO GALLERY
        </button>
        {!hasVideo && (
          <p style={{ textAlign: "center", fontSize: 10, color: C.dim, marginTop: 8, letterSpacing: 0.5 }}>
            upload a video above to enable processing
          </p>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WAVEFORM SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function WaveformScreen({ command, onDone }: { command: string; onDone: () => void }) {
  const BAR_COUNT = 32;
  const [bars,     setBars]     = useState<number[]>(() => Array(BAR_COUNT).fill(0.02));
  const [progress, setProgress] = useState(0);
  const [logLine,  setLogLine]  = useState("Initialising session…");
  const [isDone,   setIsDone]   = useState(false);
  const phaseRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef   = useRef(0);

  // Simulate FFmpeg log stream (real Flutter app uses ffmpeg_kit session log)
  useEffect(() => {
    const STAGES = [
      "Opening 'input.mp4' for reading",
      "Stream #0:0 Video: h264, yuv420p, 1920x1080",
      "Stream #0:1 Audio: aac, 48000 Hz, stereo",
      `applying filter: ${command.split("-af ")[1]?.slice(0, 60) ?? "filter chain"}...`,
      "highpass=60, lowpass=6500 — filtering…",
      "equalizer f=200 g=6.0 — boosting exhaust tone…",
      "acompressor threshold=-12dB ratio=4:1 — compressing…",
      "alimiter limit=-1dB — applying ceiling…",
      "frame= 120 fps= 60 time=00:00:04.80 bitrate=2345.6kbits/s",
      "frame= 240 fps= 60 time=00:00:09.60 bitrate=2345.6kbits/s",
      "frame= 480 fps= 60 time=00:00:19.20 bitrate=2345.6kbits/s",
      "frame= 720 fps= 60 time=00:00:28.80 bitrate=2345.6kbits/s",
      "frame= 960 fps= 60 time=00:00:38.40 bitrate=2345.6kbits/s",
      "frame=1200 fps= 60 time=00:00:48.00 bitrate=2345.6kbits/s",
      "video:42MB audio:3MB subtitle:0MB other:0MB global:0MB",
    ];

    let stageIdx = 0;

    timerRef.current = setInterval(() => {
      if (stageIdx >= STAGES.length) {
        clearInterval(timerRef.current!);
        setProgress(1);
        setIsDone(true);
        setLogLine("Processing complete ✓");
        return;
      }

      const msg = STAGES[stageIdx++];
      setLogLine(msg);

      // Inject log energy into bars
      const bytes = Array.from(msg).map(c => c.charCodeAt(0));
      setBars(prev => {
        const next = [...prev];
        for (let i = 0; i < bytes.length && i < BAR_COUNT; i++) {
          const energy = (bytes[i] % 100) / 100;
          const idx    = Math.floor((i * BAR_COUNT) / Math.max(bytes.length, 1)) % BAR_COUNT;
          next[idx]    = Math.max(next[idx], energy * 0.9 + 0.08);
        }
        for (let i = 0; i < BAR_COUNT; i++) {
          next[i] = Math.max(0.02, Math.min(1, next[i] * 0.88));
        }
        return next;
      });

      // Update progress from time= lines
      const m = msg.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m) {
        const secs = +m[1] * 3600 + +m[2] * 60 + +m[3];
        setProgress(Math.min(0.98, secs / 50));
      }
    }, 650);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [command]);

  // Idle pulse animation
  useEffect(() => {
    let raf: number;
    function tick() {
      phaseRef.current += 0.05;
      frameRef.current++;
      if (frameRef.current % 3 === 0 && !isDone) {
        setBars(prev => prev.map((b, i) => {
          const wave = (Math.sin(phaseRef.current + i * 0.4) + 1) / 2;
          return Math.max(0.02, Math.min(1, b * 0.92 + wave * 0.08 * 0.4));
        }));
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isDone]);

  const pct = Math.round(progress * 100);

  return (
    <>
      {/* AppBar */}
      <div style={{ background: C.appBar, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        {isDone && (
          <button onClick={onDone} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>✕</button>
        )}
        <span style={{ fontSize: 16, color: C.orange }}>≡</span>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: C.orange }}>PROCESSING</span>
      </div>

      <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 0, minHeight: "calc(100dvh - 54px)" }}>

        {/* Status pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isDone ? C.green : C.orange,
            boxShadow: isDone ? `0 0 8px ${C.green}88` : `0 0 8px ${C.orange}88`,
          }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: isDone ? C.green : C.orange }}>
            {isDone ? "AUDIO MASTERED" : "MASTERING ENGINE AUDIO"}
          </span>
        </div>

        {/* Waveform bars */}
        <div style={{ height: 140, display: "flex", alignItems: "flex-end", gap: 3, marginBottom: 32 }}>
          {bars.map((amp, i) => {
            const t = amp;
            const r = Math.round(255);
            const g = Math.round(107 + (170 - 107) * Math.min(1, (t - 0.5) * 2));
            const b = Math.round(0);
            const color = t > 0.1
              ? `rgba(${r},${g},${b},${0.3 + t * 0.7})`
              : C.border;
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: `${Math.max(2, amp * 140)}px`,
                  background: color,
                  borderRadius: "2px 2px 0 0",
                  transition: "height 60ms linear, background 80ms",
                  boxShadow: amp > 0.6 ? `0 0 6px ${color}` : "none",
                }}
              />
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: C.mid }}>PIPELINE PROGRESS</span>
            <span style={{ fontSize: 9, letterSpacing: 1, color: C.orange }}>{pct}%</span>
          </div>
          <div style={{ height: 3, background: C.surface, borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: isDone ? C.green : C.orange,
              borderRadius: 2,
              transition: "width 0.5s ease, background 0.3s",
            }} />
          </div>
        </div>

        {/* Log readout */}
        <div style={{ background: "#0F0F0F", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px", marginBottom: 32 }}>
          <code style={{ fontSize: 9, color: "#3A3A3A", letterSpacing: 0.3, lineHeight: 1.5, display: "block", wordBreak: "break-all" }}>
            {logLine}
          </code>
        </div>

        {/* Pipeline stages */}
        <div style={{ marginBottom: 24 }}>
          {[
            ["HPF", "highpass filter"],
            ["LPF", "lowpass filter"],
            ["EQ1", "200Hz bass boost"],
            ["EQ2", "2500Hz bark"],
            ["COMP","compressor"],
            ["LIM", "hard limiter"],
          ].map(([tag, label], i) => {
            const done = progress > (i + 1) / 6;
            return (
              <div key={tag} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ width: 36, textAlign: "center", fontSize: 9, fontWeight: 700, color: done ? C.orange : C.dim, letterSpacing: 0.5 }}>{tag}</div>
                <div style={{ flex: 1, height: 2, background: done ? C.orange : C.border, borderRadius: 1, transition: "background 0.4s" }} />
                <div style={{ fontSize: 9, color: done ? C.muted : C.dim, width: 100, textAlign: "right" }}>{label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {isDone && (
          <button
            onClick={onDone}
            style={{
              width: "100%", height: 54, marginBottom: 16,
              background: C.green, color: "#000", border: "none",
              borderRadius: 4, cursor: "pointer",
              fontSize: 13, fontWeight: 800, letterSpacing: 1.6, fontFamily: "monospace",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ✓ DONE — RETURN TO STUDIO
          </button>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function VideoZone({ hasVideo, videoUrl, isPlaying, videoRef, onTap, onReplace }: {
  hasVideo: boolean; videoUrl: string | null; isPlaying: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTap: () => void; onReplace: () => void;
}) {
  return (
    <div
      onClick={hasVideo ? undefined : onTap}
      style={{
        aspectRatio: "16/9", background: C.surface,
        border: `1.5px solid ${hasVideo ? "#333" : C.dim}`,
        borderRadius: 6, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: hasVideo ? "default" : "pointer", position: "relative",
        marginBottom: 28,
      }}
    >
      {hasVideo && videoUrl ? (
        <>
          <video
            ref={videoRef} src={videoUrl} loop
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onEnded={() => {}}
          />
          {/* Play/pause overlay */}
          <div
            onClick={onTap}
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {!isPlaying && (
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "rgba(0,0,0,0.65)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 24, color: "#fff", marginLeft: 4 }}>▶</span>
              </div>
            )}
          </div>
          {/* Replace button */}
          <button
            onClick={e => { e.stopPropagation(); onReplace(); }}
            style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(0,0,0,0.7)", border: `1px solid ${C.border}`,
              borderRadius: 3, padding: "3px 8px",
              fontSize: 10, color: "#AAA", fontFamily: "monospace", letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            REPLACE
          </button>
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            border: `1.5px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
          }}>
            <span style={{ fontSize: 24, color: C.mid }}>+</span>
          </div>
          <div style={{ fontSize: 13, color: C.mid, letterSpacing: 1.2 }}>Upload Ride Video</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>tap to select from gallery</div>
        </div>
      )}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, marginBottom: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: C.mid }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "#222" }} />
    </div>
  );
}

function SliderRow({ icon, label, sub, value, min, max, step, left, right, onChange }: {
  icon: string; label: string; sub: string;
  value: number; min: number; max: number; step: number;
  left: string; right: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: C.orange, fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: "#CCC" }}>{label.toUpperCase()}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: C.orange, letterSpacing: 0.5 }}>{sub}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: C.orange, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", paddingInline: 12 }}>
        <span style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>{left}</span>
        <span style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>{right}</span>
      </div>
    </div>
  );
}
