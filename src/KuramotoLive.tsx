import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Play, Pause, RotateCcw, Shuffle, Gauge, CircleDot } from "lucide-react";

// ----------------------- Utility -----------------------
const clamp = (v: number, lo: number, hi: number) => {
    const n = Number.isFinite(v) ? Math.trunc(v) : lo;
    return Math.max(lo, Math.min(hi, n));
};
function gaussianRandom(mean = 0, std = 1) {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + std * z;
}

function cauchyRandom(x0 = 0, gamma = 1) {
    // Inqverse transform of standard Cauchy
    const u = Math.random() - 0.5;
    return x0 + gamma * Math.tan(Math.PI * u);
}

function buildAdjacency(type, N, p = 0.05) {
    // returns adjacency list (array of arrays of neighbors)
    const adj = new Array(N);
    for (let i = 0; i < N; i++) adj[i] = [];
    if (type === "all") {
        // Use a marker, we'll treat specially
        return null; // null indicates all-to-all for fast path
    }
    if (type === "ring") {
        for (let i = 0; i < N; i++) {
            const left = (i - 1 + N) % N;
            const right = (i + 1) % N;
            if (left === right) {
                adj[i].push(left);
            } else {
                adj[i].push(left);
                adj[i].push(right);
            }
        }
        return adj;
    }
    if (type === "er") {
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                if (Math.random() < p) {
                    adj[i].push(j);
                    adj[j].push(i);
                }
            }
        }
        return adj;
    }
    return null;
}

// ----------------------- Main Component -----------------------
export default function KuramotoLive() {
    // ---- Parameters ----
    const [N, setN] = useState(5); // number of oscillators
    const [K, setK] = useState(1); // coupling strength
    const [dt, setDt] = useState(0.02); // integration step (s)
    const [noise, setNoise] = useState(0); // white noise amplitude
    const [omegaMode, setOmegaMode] = useState("gaussian"); // gaussian | cauchy | uniform
    const [omegaText, setOmegaText] = useState<string>("");
    const [gaussStd, setGaussStd] = useState(0.6);
    const [cauchyGamma, setCauchyGamma] = useState(0.5);
    const [uniRange, setUniRange] = useState(1.0);
    const [topology, setTopology] = useState("all"); // all | ring | er
    const [erProb, setErProb] = useState(0.05);
    const [chartTick, setChartTick] = useState(0);
    const lastChartUpdateRef = useRef(0);
    const [nText, setNText] = useState(String(N));

    // Phases (θ) init controls
    const [phaseMode, setPhaseMode] = useState<"uniform"|"zero"|"linear"|"two-cluster"|"manual">("uniform");
    const [phaseText, setPhaseText] = useState<string>("");
    const [clusterSpread, setClusterSpread] = useState<number>(20); // degrees, for two-cluster spread
    const [resetOnPhaseApply, setResetOnPhaseApply] = useState<boolean>(true);


    // ---- Simulation state ----
    const [running, setRunning] = useState(false);
    const [showCentroid, setShowCentroid] = useState(true);
    const [showLabels, setShowLabels] = useState(false);
    const [speed, setSpeed] = useState(1); // sim speed multiplier

    const canvasRef = useRef(null);
    const rafRef = useRef(0);
    const accRef = useRef(0);

    const thetaRef = useRef(new Float64Array(N));
    const omegaRef = useRef(new Float64Array(N));
    const adjRef = useRef(null);

    const rBufferRef = useRef([]); // {t, r}
    const tRef = useRef(0);
    const lastFrameTimeRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
    const [perOscView, setPerOscView] = useState(false);

    const omegaList = useMemo(() => {
        const w = omegaRef.current ?? new Float64Array(0);
        const n = Math.min(w.length, 5);
        const out = new Array<number>(n);
        for (let i = 0; i < n; i++) out[i] = w[i];
        return out;
    }, [chartTick, N]);

    const thetaList = useMemo(() => {
        const th = thetaRef.current ?? new Float64Array(0);
        const n = Math.min(th.length, 5);
        const out = new Array<number>(n);
        for (let i = 0; i < n; i++) {
            out[i] = Math.atan2(Math.sin(th[i]), Math.cos(th[i])); // wrap to [-π, π]
        }
        return out;
    }, [chartTick, N]);

    const dthetaList = useMemo(() => {
        const th = thetaRef.current ?? new Float64Array(0);
        const drift = instantaneousDrift(th);
        const n = Math.min(drift.length, 5);
        const out = new Array<number>(n);
        for (let i = 0; i < n; i++) out[i] = drift[i];
        return out;
    }, [chartTick, N, K, topology, erProb]);

    const TAU = Math.PI * 2;
    const deg2rad = (d: number) => (d * Math.PI) / 180;

// Format current θ list (like omega’s formatter)
    function formatThetaList(): string {
        const th = thetaRef.current;
        const max = Math.min(th.length, 2000);
        const arr: string[] = new Array(max);
        for (let i = 0; i < max; i++) arr[i] = th[i].toString();
        return arr.join(", ");
    }

// Manual θ apply
    function applyManualTheta(text: string) {
        const tokens = text
            .split(/[\s,]+/)
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .map(Number)
            .filter(Number.isFinite);

        const th = thetaRef.current;
        const n = th.length;

        if (tokens.length === 0) {
            // default to zeros if nothing valid
            for (let i = 0; i < n; i++) th[i] = 0;
        } else {
            const last = tokens[tokens.length - 1];
            for (let i = 0; i < n; i++) th[i] = i < tokens.length ? tokens[i] : last;
        }
        // normalize to [-pi, pi]
        for (let i = 0; i < n; i++) th[i] = Math.atan2(Math.sin(th[i]), Math.cos(th[i]));
    }

// Presets
    function setPhasesUniform() {
        const th = thetaRef.current;
        for (let i = 0; i < th.length; i++) th[i] = Math.random() * TAU - Math.PI; // [-π, π)
    }
    function setPhasesZero() {
        const th = thetaRef.current;
        for (let i = 0; i < th.length; i++) th[i] = 0;
    }
    function setPhasesLinear() {
        const th = thetaRef.current;
        const n = th.length;
        for (let i = 0; i < n; i++) {
            // 0 .. 2π evenly spaced, then wrap to [-π, π]
            const v = (i / n) * TAU;
            th[i] = Math.atan2(Math.sin(v), Math.cos(v));
        }
    }
    function setPhasesTwoCluster(spreadDeg: number) {
        const th = thetaRef.current;
        const n = th.length;
        const s = deg2rad(spreadDeg);
        for (let i = 0; i < n; i++) {
            const center = i % 2 === 0 ? 0 : Math.PI; // clusters around 0 and π
            const jitter = gaussianRandom(0, s);
            th[i] = Math.atan2(Math.sin(center + jitter), Math.cos(center + jitter));
        }
    }



    const bumpUI = () => {
        lastFrameTimeRef.current = 0;
        setChartTick(t => (t + 1) % 1_000_000);
    }

    // Regenerate arrays when N changes
    useEffect(() => {
        thetaRef.current = new Float64Array(N);
        omegaRef.current = new Float64Array(N);
        randomizePhases();
        randomizeFrequencies();
        adjRef.current = buildAdjacency(topology, N, erProb);
        // reset time + chart buffer
        accRef.current = 0;
        rBufferRef.current = [];
        tRef.current = 0;
        const { r } = computeOrder(thetaRef.current);
        rBufferRef.current.push({ t: 0, r });
        bumpUI();
        draw();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [N]);

    // Rebuild adjacency when topology / prob changes
    useEffect(() => {
        adjRef.current = buildAdjacency(topology, N, erProb);
    }, [topology, N, erProb]);

    useEffect(() => {
        if (omegaMode === "manual") {
            setOmegaText(formatiOmegaList());
        }
    }, [omegaMode, N])

    useEffect(()=> {
        setNText(String(N));
    }, [N]);

    function commitNFromText() {
        // allow empty to stay empty until user confirms or blurs
        if (nText.trim() === "") return;
        const parsed = Number.parseInt(nText, 10);
        const clamped = clamp(Number.isFinite(parsed) ? parsed : N, 2, 2000);
        if (clamped !== N) setN(clamped);
        setNText(String(clamped));  // normalize display

    }

    const fmt = (x: number, d = 3) => Number.isFinite(x) ? x.toFixed(d) : "—";
    const rad2deg = (x: number) => x * (180 / Math.PI);

    function omegaSummary(w: Float64Array, N: number) {
        if (N === 0) return { mean: 0, std: 0, min: 0, max: 0 };
        let s = 0, s2 = 0, mn = Infinity, mx = -Infinity;
        for (let i = 0; i < N; i++) {
            const v = w[i];
            s += v; s2 += v * v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        const mean = s / N;
        const var_ = Math.max(0, s2 / N - mean * mean);
        const std = Math.sqrt(var_);
        return { mean, std, min: mn, max: mx };
    }


    // Helpers to initialize
    function randomizePhases() {
        switch (phaseMode) {
            case "uniform":
                setPhasesUniform();
                break;
            case "zero":
                setPhasesZero();
                break;
            case "linear":
                setPhasesLinear();
                break;
            case "two-cluster":
                setPhasesTwoCluster(clusterSpread);
                break;
            case "manual":
                applyManualTheta(phaseText);
                break;
        }
    }


    function randomizeFrequencies() {
        const w = omegaRef.current;
        if (omegaMode === "gaussian") {
            for (let i = 0; i < w.length; i++) w[i] = gaussianRandom(0, gaussStd);
        } else if (omegaMode === "cauchy") {
            for (let i = 0; i < w.length; i++) w[i] = cauchyRandom(0, cauchyGamma);
        } else if (omegaMode === "uniform") {
            for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * uniRange;
        } else {
            applyManualOmega(omegaText);
        }
        bumpUI();
    }

    // ---- Core math: order parameter ----
    function computeOrder(th) {
        let cx = 0, sx = 0;
        for (let i = 0; i < th.length; i++) {
            cx += Math.cos(th[i]);
            sx += Math.sin(th[i]);
        }
        cx /= th.length; sx /= th.length;
        const r = Math.hypot(cx, sx);
        const psi = Math.atan2(sx, cx);
        return { r, psi };
    }

    function formatiOmegaList(): string {
        const w = omegaRef.current;
        const max = Math.min(w.length, 2000);
        const arr: string[] = new Array(max);
        for (let i = 0; i < max; i++) arr[i] = w[i].toString();
        return arr.join(", ");
    }

    function applyManualOmega(text: string) {
        const tokens = text
            .split(/[\s,]+/)
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .map(Number)
            .filter(Number.isFinite);
        const w = omegaRef.current;
        const n = w.length;
        if (tokens.length === 0) {
            // If no valid numbers, zero out
            for (let i = 0; i < n; i++) w[i] = 0;
        } else {
            const last = tokens[tokens.length - 1];
            for (let i = 0; i < n; i++) {
                w[i] = (i < tokens.length ? tokens[i] : last);
            }
        }
    }

    function instantaneousDrift(th: Float64Array): Float64Array {
        const w = omegaRef.current;
        const adj = adjRef.current; // null => all-to-all
        const out = new Float64Array(th.length);

        const { r, psi } = computeOrder(th);

        if (adj === null) {
            // all-to-all: K * r * sin(psi - theta_i)
            for (let i = 0; i < th.length; i++) {
                out[i] = (w?.[i] ?? 0) + K * r * Math.sin(psi - th[i]);
            }
        } else {
            // graph: (K/deg(i)) * Σ_j sin(θ_j - θ_i)
            for (let i = 0; i < th.length; i++) {
                const nbrs = adj[i] ?? [];
                let s = 0;
                for (let k = 0; k < nbrs.length; k++) {
                    const j = nbrs[k];
                    s += Math.sin(th[j] - th[i]);
                }
                const coupling = nbrs.length > 0 ? (K / nbrs.length) * s : 0;
                out[i] = (w?.[i] ?? 0) + coupling;
            }
        }
        return out;
    }



    // ---- Integrator ----
    function stepSimulation(h) {
        const th = thetaRef.current;
        const w = omegaRef.current;
        const adj = adjRef.current; // null => all-to-all fast path

        const { r, psi } = computeOrder(th);

        // precompute noise
        const eta = noise > 0 ? () => gaussianRandom(0, noise) : () => 0;

        if (adj === null) {
            // All-to-all using order-parameter trick: sum_j sin(th_j - th_i) = N * r * sin(psi - th_i)
            const Nloc = th.length;
            for (let i = 0; i < Nloc; i++) {
                const coupling = K * r * Math.sin(psi - th[i]);
                th[i] = th[i] + h * (w[i] + coupling) + Math.sqrt(h) * eta();
            }
        } else {
            // General graph
            const Nloc = th.length;
            for (let i = 0; i < Nloc; i++) {
                let s = 0;
                const nbrs = adj[i];
                for (let k = 0; k < nbrs.length; k++) {
                    const j = nbrs[k];
                    s += Math.sin(th[j] - th[i]);
                }
                const coupling = nbrs.length > 0 ? (K / nbrs.length) * s : 0;
                th[i] = th[i] + h * (w[i] + coupling) + Math.sqrt(h) * eta();
            }
        }

        // keep phases in [-pi, pi] for numeric stability
        for (let i = 0; i < th.length; i++) {
            if (th[i] > Math.PI || th[i] < -Math.PI) th[i] = Math.atan2(Math.sin(th[i]), Math.cos(th[i]));
        }

        // record order parameter
        tRef.current += h;
        const pt = { t: tRef.current, r };
        const buf = rBufferRef.current;
        buf.push(pt);
        if (buf.length > 600) buf.shift();
    }

    // ---- Render: Canvas ----
    function draw() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth * dpr;
        const h = canvas.clientHeight * dpr;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, w, h);

        // circle geometry
        const size = Math.min(w, h);
        const R = size * 0.38;
        const cx = w * 0.5;
        const cy = h * 0.5;

        // outer circle
        ctx.lineWidth = 2 * dpr;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();

        const th = thetaRef.current;

        // centroid / order parameter
        const { r, psi } = computeOrder(th);

        // draw centroid vector
        if (showCentroid) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(R * r * Math.cos(psi), R * r * Math.sin(psi));
            ctx.lineWidth = 3 * dpr;
            ctx.stroke();
            ctx.restore();
        }

        // draw points
        const pointR = clamp(4 * dpr, 2 * dpr, 6 * dpr);
        ctx.beginPath();
        for (let i = 0; i < th.length; i++) {
            const x = cx + R * Math.cos(th[i]);
            const y = cy + R * Math.sin(th[i]);
            ctx.moveTo(x + pointR, y);
            ctx.arc(x, y, pointR, 0, Math.PI * 2);
        }
        ctx.fill();

        if (showLabels && th.length <= 100) {
            ctx.font = `${12 * dpr}px ui-sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let i = 0; i < th.length; i++) {
                const x = cx + R * Math.cos(th[i]);
                const y = cy + R * Math.sin(th[i]);
                ctx.fillText(String(i), x, y - 12 * dpr);
            }
        }
    }

    // ---- RAF Loop ----
    useEffect(() => {
        if (!running) return;
        const loop = (now: number) => {
            const last = lastFrameTimeRef.current;
            lastFrameTimeRef.current = now;

            let elapsed = (now - last) / 1000; // seconds
            if (!isFinite(elapsed) || elapsed > 0.5) elapsed = 0; // guard large jumps

            accRef.current += elapsed * speed;

            const fixed = dt;
            let steps = 0;
            while (accRef.current >= fixed && steps < 5000) {
                stepSimulation(fixed);
                accRef.current -= fixed;
                steps++;
            }

            // ↓ trigger React re-render for the chart at ~20 Hz of sim time
            if (steps > 0 && (tRef.current - lastChartUpdateRef.current) > 0.05) {
                lastChartUpdateRef.current = tRef.current;
                setChartTick(t => (t + 1) % 1_000_000);
            }

            draw();
            rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, dt, speed, K, noise]);

    // Ensure a draw on param tweaks even when paused
    useEffect(() => { draw(); });

    // ---- Controls actions ----
    function handleReset() {
        setRunning(false);
        randomizePhases();
        randomizeFrequencies();

        // reset sim + chart
        tRef.current = 0;
        accRef.current = 0;
        rBufferRef.current = [];

        // seed first point so Recharts has data
        const { r } = computeOrder(thetaRef.current);
        rBufferRef.current.push({ t: 0, r });
        lastChartUpdateRef.current = 0;
        setChartTick(t => (t + 1) % 1_000_000);

        draw();
    }

    function handleSeedOnly() {
        randomizePhases();

        // reset graph too
        tRef.current = 0;
        accRef.current = 0;
        rBufferRef.current = [];
        const { r } = computeOrder(thetaRef.current);
        rBufferRef.current.push({ t: 0, r });
        lastChartUpdateRef.current = 0;
        setChartTick(t => (t + 1) % 1_000_000);

        draw();
    }

    function resetChartSeed() {
        // reset sim clock & chart buffer and seed a point at t=0
        tRef.current = 0;
        accRef.current = 0;
        rBufferRef.current = [];
        const { r } = computeOrder(thetaRef.current);
        rBufferRef.current.push({ t: 0, r });
        lastChartUpdateRef.current = 0; // so the next loop can bump the chart
        setChartTick(t => (t + 1) % 1_000_000); // force a render now
    }

    function handleReseedFrequencies() {
        randomizeFrequencies();
        resetChartSeed()
        draw();
    }

    // Build chart data memoized
    const chartData = useMemo(
        () => rBufferRef.current.map(p => ({ t: p.t, r: p.r })),
        [chartTick] // re-render chart when we bump the tick
    );





    return (
        <div className="w-full max-w-[1600px] mx-auto px-4 xl:px-6">
            <div className="w-full p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Left: Canvas & Chart */}
                <div className="xl:col-span-8 grid gap-6">
                    <Card className="shadow-xl">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <CircleDot className="w-5 h-5" />
                                    <h2 className="text-xl font-semibold">Kuramoto Phase Field</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => setRunning((v) => !v)} className="rounded-2xl">
                                        {running ? <><Pause className="w-4 h-4 mr-2"/>Pause</> : <><Play className="w-4 h-4 mr-2"/>Run</>}
                                    </Button>
                                    <Button variant="secondary" onClick={handleReset} className="rounded-2xl">
                                        <RotateCcw className="w-4 h-4 mr-2"/>Reset
                                    </Button>
                                    <Button variant="outline" onClick={handleSeedOnly} className="rounded-2xl">
                                        <Shuffle className="w-4 h-4 mr-2"/>Randomize Phases
                                    </Button>
                                </div>
                            </div>
                            <div className="w-full h-[420px] rounded-2xl border">
                                <canvas ref={canvasRef} className="w-full h-full"/>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-xl">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Gauge className="w-5 h-5"/>
                                <h3 className="text-lg font-semibold">Order Parameter r(t)</h3>
                            </div>
                            <div className="w-full h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                                        <XAxis dataKey="t" tickFormatter={(v) => v.toFixed(1)} label={{ value: "t", position: "insideRight", offset: -2, dy: 12}} />
                                        <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
                                        <Tooltip formatter={(v, n) => [Number(v).toFixed(3), n]} labelFormatter={(v) => `t=${v.toFixed(2)}`} />
                                        <Line type="monotone" dataKey="r" dot={false} strokeWidth={2} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Controls */}
                <div className="xl:col-span-4 grid gap-6">
                    <Card className="shadow-xl">
                        <CardContent className="p-4 grid gap-4">
                            <h3 className="text-lg font-semibold">Parameters</h3>

                            <div className="grid grid-cols-7 items-center gap-3">
                                <Label className="col-span-3">Oscillators (N)</Label>
                                <Input
                                    className="col-span-4"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={nText}
                                    onChange={(e) => {
                                        // allow empty while typing; no commit yet
                                        setNText(e.currentTarget.value);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            commitNFromText();  // only commit on Enter
                                        }
                                    }}
                                    onBlur={() => {
                                        // don't commit on blur; just restore if left empty/invalid
                                        if (!/^\d+$/.test(nText)) setNText(String(N));
                                    }}
                                    placeholder="Enter number of oscillators"
                                />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex justify-between items-center">
                                    <Label>Coupling K</Label>
                                    <span className="text-sm tabular-nums">{K.toFixed(2)}</span>
                                </div>
                                <Slider value={[K]} min={0} max={5} step={0.01} onValueChange={(v) => setK(v[0])} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex justify-between items-center">
                                    <Label>Time step dt</Label>
                                    <span className="text-sm tabular-nums">{dt.toFixed(3)}</span>
                                </div>
                                <Slider value={[dt]} min={0.001} max={0.1} step={0.001} onValueChange={(v) => setDt(v[0])} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex justify-between items-center">
                                    <Label>Sim speed ×</Label>
                                    <span className="text-sm tabular-nums">{speed.toFixed(2)}</span>
                                </div>
                                <Slider value={[speed]} min={0.1} max={5} step={0.1} onValueChange={(v) => setSpeed(v[0])} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex justify-between items-center">
                                    <Label>Noise σ</Label>
                                    <span className="text-sm tabular-nums">{noise.toFixed(2)}</span>
                                </div>
                                <Slider value={[noise]} min={0} max={1.5} step={0.01} onValueChange={(v) => setNoise(v[0])} />
                            </div>

                            <div className="grid grid-cols-7 items-center gap-3">
                                <Label className="col-span-3">Topology</Label>
                                <Select value={topology} onValueChange={setTopology}>
                                    <SelectTrigger className="col-span-4">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All-to-all</SelectItem>
                                        <SelectItem value="ring">Ring (2-neighbor)</SelectItem>
                                        <SelectItem value="er">Erdős–Rényi</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {topology === "er" && (
                                <div className="grid gap-2">
                                    <div className="flex justify-between items-center">
                                        <Label>ER edge prob p</Label>
                                        <span className="text-sm tabular-nums">{erProb.toFixed(3)}</span>
                                    </div>
                                    <Slider value={[erProb]} min={0.005} max={0.3} step={0.005} onValueChange={(v) => setErProb(v[0])} />
                                </div>
                            )}

                            <div className="grid grid-cols-7 items-center gap-3">
                                <Label className="col-span-3">ω distribution</Label>
                                <Select value={omegaMode} onValueChange={setOmegaMode}>
                                    <SelectTrigger className="col-span-4">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gaussian">Gaussian(0, σ)</SelectItem>
                                        <SelectItem value="cauchy">Lorentz/Cauchy(0, γ)</SelectItem>
                                        <SelectItem value="uniform">Uniform[-a, a]</SelectItem>
                                        <SelectItem value="manual">Manual (paste list)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {omegaMode === "gaussian" && (
                                <div className="grid gap-2">
                                    <div className="flex justify-between items-center">
                                        <Label>σ (std dev)</Label>
                                        <span className="text-sm tabular-nums">{gaussStd.toFixed(2)}</span>
                                    </div>
                                    <Slider value={[gaussStd]} min={0.05} max={2.5} step={0.05} onValueChange={(v) => setGaussStd(v[0])} />
                                    <Button variant="outline" onClick={handleReseedFrequencies} className="mt-1">Resample ω</Button>
                                </div>
                            )}

                            {omegaMode === "cauchy" && (
                                <div className="grid gap-2">
                                    <div className="flex justify-between items-center">
                                        <Label>γ (scale)</Label>
                                        <span className="text-sm tabular-nums">{cauchyGamma.toFixed(2)}</span>
                                    </div>
                                    <Slider value={[cauchyGamma]} min={0.05} max={2.5} step={0.05} onValueChange={(v) => setCauchyGamma(v[0])} />
                                    <Button variant="outline" onClick={handleReseedFrequencies} className="mt-1">Resample ω</Button>
                                </div>
                            )}

                            {omegaMode === "uniform" && (
                                <div className="grid gap-2">
                                    <div className="flex justify-between items-center">
                                        <Label>a (half-range)</Label>
                                        <span className="text-sm tabular-nums">{uniRange.toFixed(2)}</span>
                                    </div>
                                    <Slider value={[uniRange]} min={0.1} max={3} step={0.1} onValueChange={(v) => setUniRange(v[0])} />
                                    <Button variant="outline" onClick={handleReseedFrequencies} className="mt-1">Resample ω</Button>
                                </div>
                            )}

                            {omegaMode === "manual" && (
                                <div className="grid gap-2">
                                    <Label>ω list (N = {N})</Label>
                                    <textarea
                                        className="w-full h-32 rounded-md border px-2 py-1 font-mono text-sm"
                                        value={omegaText}
                                        onChange={(e) => setOmegaText(e.target.value)}
                                        placeholder="Comma or space-separated numbers, e.g. 0.1, 0.0, -0.2, ..."
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                applyManualOmega(omegaText);
                                                // reset chart time so the change is reflected from t=0 (match your other flows)
                                                tRef.current = 0;
                                                accRef.current = 0;
                                                rBufferRef.current = [];
                                                const { r } = computeOrder(thetaRef.current);
                                                rBufferRef.current.push({ t: 0, r });
                                                lastChartUpdateRef.current = 0;
                                                setChartTick(t => (t + 1) % 1_000_000);
                                                draw();
                                            }}
                                        >
                                            Apply ω list
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            onClick={() => setOmegaText(formatOmegaList())}
                                            title="Load current ω into the editor"
                                        >
                                            Load current
                                        </Button>
                                    </div>
                                    <small className="text-muted-foreground">
                                        Tip: Provide {N} numbers. Extra values are ignored; fewer values are padded with the last one.
                                    </small>
                                </div>
                            )}

                            {/* --- Initial phases (θ) --- */}
                            <div className="grid grid-cols-7 items-center gap-3">
                                <Label className="col-span-3">θ init</Label>
                                <Select value={phaseMode} onValueChange={(v) => setPhaseMode(v as any)}>
                                    <SelectTrigger className="col-span-4">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="uniform">Uniform random [-π, π]</SelectItem>
                                        <SelectItem value="zero">Zero</SelectItem>
                                        <SelectItem value="linear">Uniform</SelectItem>
                                        <SelectItem value="two-cluster">Two clusters (0 &amp; π)</SelectItem>
                                        <SelectItem value="manual">Manual list</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {phaseMode === "two-cluster" && (
                                <div className="grid gap-2">
                                    <div className="flex justify-between items-center">
                                        <Label>Cluster spread (°, σ)</Label>
                                        <span className="text-sm tabular-nums">{clusterSpread.toFixed(0)}</span>
                                    </div>
                                    <Slider value={[clusterSpread]} min={1} max={90} step={1} onValueChange={(v) => setClusterSpread(v[0])} />
                                </div>
                            )}

                            {phaseMode === "manual" && (
                                <div className="grid gap-2">
                                    <Label>θ list (N = {N})</Label>
                                    <textarea
                                        className="w-full h-28 rounded-md border px-2 py-1 font-mono text-sm"
                                        value={phaseText}
                                        onChange={(e) => setPhaseText(e.target.value)}
                                        placeholder="Comma/space-separated radians, e.g. 0, 1.57, -3.14, …"
                                    />
                                    <div className="flex gap-2 flex-wrap">
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                applyManualTheta(phaseText);
                                                if (resetOnPhaseApply) {
                                                    // match your chart reset semantics
                                                    tRef.current = 0;
                                                    accRef.current = 0;
                                                    rBufferRef.current = [];
                                                    const { r } = computeOrder(thetaRef.current);
                                                    rBufferRef.current.push({ t: 0, r });
                                                    lastChartUpdateRef.current = 0;
                                                    setChartTick(t => (t + 1) % 1_000_000);
                                                } else {
                                                    // at least nudge UI
                                                    lastFrameTimeRef.current = 0;
                                                    setChartTick(t => (t + 1) % 1_000_000);
                                                }
                                                draw();
                                            }}
                                        >
                                            Apply θ list
                                        </Button>
                                        <Button variant="ghost" onClick={() => setPhaseText(formatThetaList())}>
                                            Load current θ
                                        </Button>
                                        <div className="flex items-center gap-2 ml-auto">
                                            <Switch checked={resetOnPhaseApply} onCheckedChange={setResetOnPhaseApply} id="reset-theta" />
                                            <Label htmlFor="reset-theta">Reset r(t) on apply</Label>
                                        </div>
                                    </div>
                                    <small className="text-muted-foreground">
                                        Tip: Provide {N} numbers. Extra values ignored; fewer are padded with the last value. Angles normalized to [-π, π].
                                    </small>
                                </div>
                            )}

                            {/* One-click “Set phases now” button (uses current phaseMode) */}
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        randomizePhases();
                                        if (resetOnPhaseApply) {
                                            tRef.current = 0;
                                            accRef.current = 0;
                                            rBufferRef.current = [];
                                            const { r } = computeOrder(thetaRef.current);
                                            rBufferRef.current.push({ t: 0, r });
                                            lastChartUpdateRef.current = 0;
                                            setChartTick(t => (t + 1) % 1_000_000);
                                        } else {
                                            lastFrameTimeRef.current = 0;
                                            setChartTick(t => (t + 1) % 1_000_000);
                                        }
                                        draw();
                                    }}
                                >
                                    Set phases now
                                </Button>
                            </div>


                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Switch checked={showCentroid} onCheckedChange={setShowCentroid} id="centroid" />
                                    <Label htmlFor="centroid">Show order vector</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch checked={showLabels} onCheckedChange={setShowLabels} id="labels" />
                                    <Label htmlFor="labels">Index labels</Label>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-xl">
                        <CardContent className="p-4 text-sm leading-relaxed space-y-3">
                            {/* Header with toggle */}
                            <div className="flex items-center justify-between">
                                <h4 className="text-base font-semibold">Live Data</h4>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Per-oscillator view</span>
                                    <Switch id="perosc" checked={perOscView} onCheckedChange={setPerOscView} />
                                </div>
                            </div>

                            {/* CONTENT: only one of these renders, but both live inside the same CardContent */}
                            {perOscView ? (
                                /* ------- Per-oscillator view ------- */
                                (() => {
                                    const nShow = Math.min(N, 5);
                                    return (
                                        <div className="mt-1">
                                            <div className="text-muted-foreground mb-1">
                                                Per oscillator (i = 0…{nShow - 1})
                                            </div>

                                            <div className="grid grid-cols-3 gap-4">
                                                {/* ω column */}
                                                <div>
                                                    <div className="font-semibold mb-1">ω (natural)</div>
                                                    <ul className="list-disc list-inside font-mono">
                                                        {omegaList.map((v, i) => (
                                                            <li key={`w-${i}`}>i={i}: <br /> {fmt(v, 2)}</li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                {/* dθ/dt column */}
                                                <div>
                                                    <div className="font-semibold mb-1">dθ/dt</div>
                                                    <ul className="list-disc list-inside font-mono">
                                                        {dthetaList.map((v, i) => (
                                                            <li key={`dth-${i}`}>i={i}: {fmt(rad2deg(v), 2)}°/s</li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                {/* θ column */}
                                                <div>
                                                    <div className="font-semibold mb-1">θ</div>
                                                    <ul className="list-disc list-inside font-mono">
                                                        {thetaList.map((v, i) => (
                                                            <li key={`th-${i}`}>
                                                                i={i}: {fmt(rad2deg(v), 2)}°
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                /* ------- Aggregate view: degrees-only, vertical list ------- */
                                (() => {
                                    const { psi } = computeOrder(thetaRef.current);
                                    const w = omegaRef.current;
                                    const { mean, std, min, max } = omegaSummary(w, w.length);

                                    return (
                                        <div className="space-y-4">
                                            {/* Big ψ */}
                                            <div>
                                                <div className="text-[11px] leading-4 text-muted-foreground uppercase tracking-wide">
                                                    ψ (Degrees)
                                                </div>
                                                <div className="tabular-nums font-semibold text-4xl sm:text-5xl">
                                                    {fmt(rad2deg(psi), 2)}
                                                    <span className="text-lg align-top">&nbsp;°</span>
                                                </div>
                                            </div>

                                            {/* Vertical list of ω stats */}
                                            <div className="divide-y divide-border rounded-lg">
                                                {[
                                                    ["ω mean", mean],
                                                    ["ω std",  std],
                                                    ["ω min",  min],
                                                    ["ω max",  max],
                                                ].map(([label, val]) => (
                                                    <div key={label as string} className="grid grid-cols-2 items-center py-2">
                                                        <div className="text-muted-foreground">{label as string}</div>
                                                        <div className="tabular-nums justify-self-end">
                                                            {fmt(rad2deg(val as number), 2)}
                                                            <span className="text-sm">&nbsp;°/s</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
