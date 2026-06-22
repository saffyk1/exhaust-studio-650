import { useState, useRef, useEffect } from "react";

type Screen = "home" | "processing" | "preview";

// ── Filter chain built from individual manual params ───────────────────────
function buildFilterChain(p: FilterParams) {
  return [
    `highpass=f=${p.hpfHz}`,
    `lowpass=f=${p.lpfHz}`,
    `equalizer=f=200:width_type=h:width=50:g=${p.eq1Gain.toFixed(1)}`,
    `equalizer=f=2500:width_type=h:width=200:g=${p.eq2Gain.toFixed(1)}`,
    `acompressor=threshold=${p.compThresh.toFixed(0)}dB:ratio=${p.compRatio.toFixed(1)}:attack=5:release=50`,
    `volume=volume=${p.volDb.toFixed(1)}dB`,
    `alimiter=limit=${p.limDb.toFixed(1)}dB`,
  ].join(", ");
}

interface FilterParams {
  hpfHz: number;
  lpfHz: number;
  eq1Gain: number;
  eq2Gain: number;
  compThresh: number;
  compRatio: number;
  volDb: number;
  limDb: number;
}

const DEFAULT_PARAMS: FilterParams = {
  hpfHz: 120, lpfHz: 6500,
  eq1Gain: 6.0, eq2Gain: 3.0,
  compThresh: -12, compRatio: 4.0,
  volDb: 2.0, limDb: -1.0,
};

const C = {
  bg: "#141414", surface: "#1A1A1A", border: "#2A2A2A",
  dim: "#383838", mid: "#555555", muted: "#888888", text: "#E8E8E8",
  orange: "#FF6B00", amber: "#FFAA00", green: "#00E676", appBar: "#0D0D0D",
};

export default function App() {
  const [screen,   setScreen]   = useState<Screen>("home");
  const [params,   setParams]   = useState<FilterParams>(DEFAULT_PARAMS);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  return (
    <div style={{ background: C.bg, minHeight: "100dvh", fontFamily: "monospace", color: C.text, maxWidth: 480, margin: "0 auto" }}>
      {screen === "home" && (
        <HomeScreen
          params={params} setParams={setParams}
          videoUrl={videoUrl} setVideoUrl={setVideoUrl}
          onProcess={() => setScreen("processing")}
        />
      )}
      {screen === "processing" && (
        <ProcessingScreen
          params={params}
          onReady={() => setScreen("preview")}
          onError={() => setScreen("home")}
        />
      )}
      {screen === "preview" && (
        <PreviewScreen
          videoUrl={videoUrl} params={params}
          onSave={() => { alert("Saved to Gallery › ExhaustStudio ✓"); setScreen("home"); }}
          onDiscard={() => setScreen("home")}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreen({ params, setParams, videoUrl, setVideoUrl, onProcess }: {
  params: FilterParams; setParams(p: FilterParams): void;
  videoUrl: string | null; setVideoUrl(v: string | null): void;
  onProcess(): void;
}) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // Quick sliders (0–1) derived from current params
  const noiseVal = ((params.hpfHz - 60) / 120);
  const depthVal = (params.eq1Gain / 12).toFixed(2);

  function setP(patch: Partial<FilterParams>) {
    setParams({ ...params, ...patch });
  }

  function onNoiseSlider(v: number) {
    setP({ hpfHz: Math.round(60 + v * 120), lpfHz: Math.round(9000 - v * 5000) });
  }

  function onDepthSlider(v: number) {
    setP({ eq1Gain: Math.round(v * 120) / 10 });
  }

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setVideoUrl(URL.createObjectURL(f));
    setPlaying(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); }
  }

  const pipeline = [
    ["HPF",  `${params.hpfHz}Hz cut`,          "Removes wind buffet & chassis rumble"],
    ["LPF",  `${params.lpfHz}Hz cut`,          "Strips tyre hiss & valve tick"],
    ["EQ1",  `${params.eq1Gain >= 0 ? "+" : ""}${params.eq1Gain.toFixed(1)}dB@200Hz`, "Mid-bass harmonic body"],
    ["EQ2",  `${params.eq2Gain >= 0 ? "+" : ""}${params.eq2Gain.toFixed(1)}dB@2500Hz`, "Engine bark & firing snap"],
    ["COMP", `${params.compThresh.toFixed(0)}dB thr / ${params.compRatio.toFixed(1)}:1`, "Broadcast-density compression"],
    ["VOL",  `${params.volDb >= 0 ? "+" : ""}${params.volDb.toFixed(1)}dB`, "Output level trim"],
    ["LIM",  `${params.limDb.toFixed(1)}dBFS ceiling`, "Hard limiter — zero clip"],
  ];

  return (
    <>
      <AppBar title="EXHAUST STUDIO" />
      <div style={{ padding: "16px 16px 100px" }}>

        {/* Video zone */}
        <div
          onClick={videoUrl ? undefined : () => fileRef.current?.click()}
          style={{ aspectRatio: "16/9", background: C.surface, border: `1.5px solid ${videoUrl ? "#333" : C.dim}`, borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: videoUrl ? "default" : "pointer", position: "relative", marginBottom: 28 }}
        >
          {videoUrl ? (
            <>
              <video ref={videoRef} src={videoUrl} loop style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div onClick={togglePlay} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {!playing && (
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 22, color: "#fff", marginLeft: 4 }}>▶</span>
                  </div>
                )}
              </div>
              <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", border: `1px solid ${C.border}`, borderRadius: 3, padding: "3px 8px", fontSize: 10, color: "#AAA", fontFamily: "monospace", letterSpacing: 1, cursor: "pointer" }}>
                REPLACE
              </button>
            </>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <span style={{ fontSize: 24, color: C.mid }}>+</span>
              </div>
              <div style={{ fontSize: 13, color: C.mid, letterSpacing: 1.2 }}>Upload Ride Video</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>tap to select from gallery</div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pickVideo} />

        {/* ── TUNING ── */}
        <SectionLabel label="TUNING" />
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 24 }}>
          <SliderRow
            icon="⧖" label="Noise Cleanup"
            sub={`HPF ${params.hpfHz}Hz / LPF ${params.lpfHz}Hz`}
            value={noiseVal} left="OPEN" right="TIGHT"
            onChange={onNoiseSlider}
          />
          <SliderRow
            icon="〜" label="Exhaust Deepness"
            sub={`200Hz bass ${params.eq1Gain >= 0 ? "+" : ""}${params.eq1Gain.toFixed(1)}dB`}
            value={+depthVal} left="FLAT" right="+12dB"
            onChange={onDepthSlider}
          />
        </div>

        {/* ── MANUAL TUNING (collapsible) ── */}
        <div style={{ marginTop: 28 }}>
          <button
            onClick={() => setManualOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: C.orange, fontFamily: "monospace" }}>MANUAL TUNING</span>
            <span style={{ color: C.orange, fontSize: 13 }}>{manualOpen ? "▲" : "▼"}</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </button>

          {manualOpen && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 0 }}>
              <ParamSlider label="HPF FREQUENCY" valueStr={`${params.hpfHz} Hz`} value={params.hpfHz} min={60} max={300} step={1}
                onChange={v => setP({ hpfHz: v })} />
              <ParamSlider label="LPF FREQUENCY" valueStr={`${params.lpfHz} Hz`} value={params.lpfHz} min={1000} max={20000} step={100}
                onChange={v => setP({ lpfHz: v })} />
              <ParamSlider label="EQ 200Hz GAIN" valueStr={`${params.eq1Gain >= 0 ? "+" : ""}${params.eq1Gain.toFixed(1)} dB`} value={params.eq1Gain} min={-12} max={12} step={0.5}
                onChange={v => setP({ eq1Gain: v })} />
              <ParamSlider label="EQ 2500Hz GAIN" valueStr={`${params.eq2Gain >= 0 ? "+" : ""}${params.eq2Gain.toFixed(1)} dB`} value={params.eq2Gain} min={-12} max={12} step={0.5}
                onChange={v => setP({ eq2Gain: v })} />
              <ParamSlider label="COMP THRESHOLD" valueStr={`${params.compThresh.toFixed(0)} dB`} value={params.compThresh} min={-40} max={0} step={1}
                onChange={v => setP({ compThresh: v })} />
              <ParamSlider label="COMP RATIO" valueStr={`${params.compRatio.toFixed(1)} : 1`} value={params.compRatio} min={1} max={20} step={0.5}
                onChange={v => setP({ compRatio: v })} />
              <ParamSlider label="VOLUME BOOST" valueStr={`${params.volDb >= 0 ? "+" : ""}${params.volDb.toFixed(1)} dB`} value={params.volDb} min={-12} max={12} step={0.5}
                onChange={v => setP({ volDb: v })} />
              <ParamSlider label="LIMITER CEILING" valueStr={`${params.limDb.toFixed(1)} dBFS`} value={params.limDb} min={-12} max={0} step={0.1}
                onChange={v => setP({ limDb: +v.toFixed(1) })} />

              {/* Reset to defaults */}
              <button
                onClick={() => { setParams(DEFAULT_PARAMS); }}
                style={{ marginTop: 12, background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.mid, fontSize: 10, fontFamily: "monospace", letterSpacing: 1.5, padding: "6px 12px", cursor: "pointer", alignSelf: "flex-start" }}
              >RESET TO DEFAULTS</button>
            </div>
          )}
        </div>

        {/* ── COMMAND ── */}
        <SectionLabel label="COMMAND" />
        <div style={{ background: "#0F0F0F", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px", marginTop: 12, overflowX: "auto" }}>
          <code style={{ fontSize: 9, color: "#3E3E3E", letterSpacing: 0.3, whiteSpace: "pre" }}>
            {`-y -i input.mp4 -c:v copy -af "${buildFilterChain(params)}" output.mp4`}
          </code>
        </div>

        {/* ── PIPELINE ── */}
        <SectionLabel label="PIPELINE" />
        <div style={{ marginTop: 12 }}>
          {pipeline.map(([tag, val, desc], i) => (
            <div key={tag} style={{ display: "flex", gap: 12 }}>
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

        {/* ── Enhance button ── */}
        <button
          onClick={videoUrl ? onProcess : undefined}
          style={{ width: "100%", height: 56, background: videoUrl ? C.orange : "#2A2A2A", color: videoUrl ? "#000" : C.mid, border: "none", borderRadius: 4, cursor: videoUrl ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 800, letterSpacing: 1.6, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <span style={{ fontSize: 18 }}>⚡</span> ENHANCE & PREVIEW
        </button>
        {!videoUrl && <p style={{ textAlign: "center", fontSize: 10, color: C.dim, marginTop: 8 }}>upload a video above to enable processing</p>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSING SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function ProcessingScreen({ params, onReady, onError }: {
  params: FilterParams; onReady(): void; onError(): void;
}) {
  const BAR_COUNT = 32;
  const [bars,     setBars]     = useState<number[]>(() => Array(BAR_COUNT).fill(0.02));
  const [progress, setProgress] = useState(0);
  const [logLine,  setLogLine]  = useState("Initialising session…");
  const phaseRef = useRef(0);
  const frameRef = useRef(0);

  const STAGES = [
    "Opening 'input.mp4' for reading",
    "Stream #0:0 Video: h264, yuv420p, 1920x1080",
    "Stream #0:1 Audio: aac, 48000 Hz, stereo",
    `applying filter chain: highpass=f=${params.hpfHz}...`,
    `highpass · lowpass — filtering at ${params.hpfHz}Hz / ${params.lpfHz}Hz…`,
    `equalizer f=200 g=${params.eq1Gain.toFixed(1)} — boosting exhaust tone…`,
    `equalizer f=2500 g=${params.eq2Gain.toFixed(1)} — bark enhancement…`,
    `acompressor threshold=${params.compThresh.toFixed(0)}dB ratio=${params.compRatio}:1 — compressing…`,
    `volume=${params.volDb.toFixed(1)}dB — output level trim…`,
    `alimiter limit=${params.limDb.toFixed(1)}dB — applying ceiling…`,
    "frame=  120 fps=60 time=00:00:04.80 bitrate=2345.6kbits/s",
    "frame=  360 fps=60 time=00:00:14.40 bitrate=2345.6kbits/s",
    "frame=  720 fps=60 time=00:00:28.80 bitrate=2345.6kbits/s",
    "frame= 1080 fps=60 time=00:00:43.20 bitrate=2345.6kbits/s",
    "video:42MB audio:3MB subtitle:0MB — muxing complete",
  ];

  useEffect(() => {
    let idx = 0;
    const timer = setInterval(() => {
      if (idx >= STAGES.length) {
        clearInterval(timer);
        setProgress(1);
        setLogLine("Processing complete — preview ready");
        setTimeout(onReady, 600);
        return;
      }
      const msg = STAGES[idx++];
      setLogLine(msg);
      const bytes = Array.from(msg).map(c => c.charCodeAt(0));
      setBars(prev => {
        const next = [...prev];
        for (let i = 0; i < bytes.length && i < BAR_COUNT; i++) {
          const energy = (bytes[i] % 100) / 100;
          const bi = Math.floor((i * BAR_COUNT) / Math.max(bytes.length, 1)) % BAR_COUNT;
          next[bi] = Math.max(next[bi], energy * 0.9 + 0.08);
        }
        for (let i = 0; i < BAR_COUNT; i++) next[i] = Math.max(0.02, Math.min(1, next[i] * 0.88));
        return next;
      });
      const m = msg.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m) setProgress(Math.min(0.98, (+m[1] * 3600 + +m[2] * 60 + +m[3]) / 60));
    }, 550);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let raf: number;
    function tick() {
      phaseRef.current += 0.05;
      frameRef.current++;
      if (frameRef.current % 3 === 0) {
        setBars(prev => prev.map((b, i) => {
          const wave = (Math.sin(phaseRef.current + i * 0.4) + 1) / 2;
          return Math.max(0.02, Math.min(1, b * 0.92 + wave * 0.04));
        }));
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pct = Math.round(progress * 100);

  return (
    <>
      <AppBar title="PROCESSING" />
      <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 54px)" }}>
        <StatusPill label="MASTERING ENGINE AUDIO" color={C.orange} pulse />
        <div style={{ height: 40 }} />
        <div style={{ height: 140, display: "flex", alignItems: "flex-end", gap: 3, marginBottom: 32 }}>
          {bars.map((amp, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.max(2, amp * 140)}px`, background: amp > 0.1 ? `rgba(255,${Math.round(107 + (170 - 107) * Math.min(1, (amp - 0.5) * 2))},0,${0.3 + amp * 0.7})` : C.border, borderRadius: "2px 2px 0 0", transition: "height 60ms linear" }} />
          ))}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: C.mid }}>PIPELINE PROGRESS</span>
            <span style={{ fontSize: 9, color: C.orange }}>{pct}%</span>
          </div>
          <div style={{ height: 3, background: C.surface, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: C.orange, transition: "width 0.5s ease" }} />
          </div>
        </div>
        <div style={{ background: "#0F0F0F", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px" }}>
          <code style={{ fontSize: 9, color: "#3A3A3A", lineHeight: 1.5, display: "block", wordBreak: "break-all" }}>{logLine}</code>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function PreviewScreen({ videoUrl, params, onSave, onDiscard }: {
  videoUrl: string | null; params: FilterParams;
  onSave(): void; onDiscard(): void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [playing,  setPlaying]  = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); }
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  return (
    <>
      <AppBar title="PREVIEW" onBack={onDiscard} />
      <div style={{ padding: "24px 20px 40px", display: "flex", flexDirection: "column" }}>
        <StatusPill label="ENHANCED — READY TO PREVIEW" color={C.green} />
        <div style={{ height: 24 }} />
        <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 6, overflow: "hidden", position: "relative", marginBottom: 12 }}>
          {videoUrl
            ? <video ref={videoRef} src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onTimeUpdate={e => setPosition((e.target as HTMLVideoElement).currentTime)}
                onLoadedMetadata={e => setDuration((e.target as HTMLVideoElement).duration)}
                onEnded={() => setPlaying(false)} />
            : <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: C.mid }}>No video source</span>
              </div>
          }
          <div onClick={togglePlay} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: `1.5px solid ${C.orange}99`, display: "flex", alignItems: "center", justifyContent: "center", opacity: playing ? 0 : 1, transition: "opacity 0.2s" }}>
              <span style={{ fontSize: 28, color: C.orange, marginLeft: 4 }}>▶</span>
            </div>
          </div>
        </div>
        <input type="range" min={0} max={duration || 100} step={0.1} value={position}
          onChange={e => { const v = videoRef.current; if (v) v.currentTime = +e.target.value; setPosition(+e.target.value); }}
          style={{ width: "100%", accentColor: C.orange, cursor: "pointer", marginBottom: 4 }} />
        <div style={{ display: "flex", justifyContent: "space-between", paddingInline: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{fmt(position)}</span>
          <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{fmt(duration)}</span>
        </div>
        <div style={{ background: "#0F0F0F", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: C.orange }}>≡</span>
          <span style={{ fontSize: 9, color: "#555", letterSpacing: 0.5 }}>
            HPF {params.hpfHz}Hz · LPF {params.lpfHz}Hz · EQ {params.eq1Gain >= 0 ? "+" : ""}{params.eq1Gain.toFixed(1)}dB@200Hz · Comp {params.compThresh.toFixed(0)}dB/{params.compRatio.toFixed(1)}:1 · Vol {params.volDb >= 0 ? "+" : ""}{params.volDb.toFixed(1)}dB · Lim {params.limDb.toFixed(1)}dBFS
          </span>
        </div>
        <div style={{ background: "#0F0F0F", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px", marginBottom: 32 }}>
          <code style={{ fontSize: 9, color: "#3A3A3A", lineHeight: 1.6, display: "block", wordBreak: "break-all" }}>
            {buildFilterChain(params)}
          </code>
        </div>
        <button onClick={onSave} style={{ width: "100%", height: 56, background: C.orange, color: "#000", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, fontWeight: 800, letterSpacing: 1.6, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          <span>⬇</span> SAVE TO GALLERY
        </button>
        <button onClick={onDiscard} style={{ width: "100%", height: 48, background: "transparent", color: "#666", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 700, letterSpacing: 1.6, fontFamily: "monospace" }}>
          DISCARD
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function AppBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div style={{ background: C.appBar, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>✕</button>
      )}
      <span style={{ fontSize: 16, color: C.orange }}>≡</span>
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.6, color: C.orange }}>{title}</span>
      {title === "EXHAUST STUDIO" && (
        <span style={{ fontSize: 10, border: `1px solid ${C.orange}`, color: C.orange, padding: "1px 5px", borderRadius: 2, letterSpacing: 1 }}>650</span>
      )}
    </div>
  );
}

function StatusPill({ label, color, pulse }: { label: string; color: string; pulse?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}${pulse ? "88" : "66"}` }} />
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color }}>{label}</span>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: C.mid }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "#222" }} />
    </div>
  );
}

function SliderRow({ icon, label, sub, value, left, right, onChange }: {
  icon: string; label: string; sub: string; value: number;
  left: string; right: string; onChange(v: number): void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: C.orange, fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: "#CCC" }}>{label.toUpperCase()}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: C.orange, letterSpacing: 0.5 }}>{sub}</span>
      </div>
      <input type="range" min={0} max={1} step={0.01} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: C.orange, cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", paddingInline: 12 }}>
        <span style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>{left}</span>
        <span style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>{right}</span>
      </div>
    </div>
  );
}

function ParamSlider({ label, valueStr, value, min, max, step, onChange }: {
  label: string; valueStr: string; value: number; min: number; max: number; step: number;
  onChange(v: number): void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.2, color: C.muted }}>{label}</span>
        <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>{valueStr}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: C.orange, cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", paddingInline: 12 }}>
        <span style={{ fontSize: 9, color: "#444" }}>{min}</span>
        <span style={{ fontSize: 9, color: "#444" }}>{max}</span>
      </div>
    </div>
  );
}
