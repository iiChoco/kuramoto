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
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
            const left  = (i - 1 + N) % N;
            const right = (i + 1) % N;
            if (left === right) {
                // Happens when N === 2 → the only neighbor is the other node
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
    const [K, setK] = useState(1.2); // coupling strength
    const [dt, setDt] = useState(0.02); // integration step (s)
    const [noise, setNoise] = useState(0); // white noise amplitude
    const [omegaMode, setOmegaMode] = useState("gaussian"); // gaussian | cauchy | uniform
    const [gaussStd, setGaussStd] = useState(0.6);
    const [cauchyGamma, setCauchyGamma] = useState(0.5);
    const [uniRange, setUniRange] = useState(1.0);
    const [topology, setTopology] = useState("all"); // all | ring | er
    const [erProb, setErProb] = useState(0.05);
    const [chartTick, setChartTick] = useState(0);
    const lastChartUpdateRef = useRef(0);

    // ---- Simulation state ----
    const [running, setRunning] = useState(false);
    const [showCentroid, setShowCentroid] = useState(true);
    const [showLabels, setShowLabels] = useState(false);
    const showCentroidRef = useRef(showCentroid);
    const showLabelsRef = useRef(showLabels);
    useEffect(() => { showCentroidRef.current = showCentroid; }, [showCentroid]);
    useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);
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

    // Regenerate arrays when N changes
    useEffect(() => {
        // Reallocate arrays
        thetaRef.current = new Float64Array(N);
        omegaRef.current = new Float64Array(N);
        randomizePhases();
        randomizeFrequencies();
        adjRef.current = buildAdjacency(topology, N, erProb);

        // Reset clocks
        tRef.current = 0;
        accRef.current = 0;
        lastFrameTimeRef.current = performance.now?.() ?? 0;

        // Seed chart so there’s data immediately
        rBufferRef.current = [];
        const { r } = computeOrder(thetaRef.current);
        rBufferRef.current.push({ t: 0, r });

        // Force a React update so Recharts gets a fresh data reference
        setChartTick(t => (t + 1) % 1_000_000);

        // Redraw once (handles paused state)
        draw();
        // Note: do NOT setRunning(false); leave it as-is.
    }, [N]); // (and keep your separate effects for topology/erProb)

    // Rebuild adjacency when topology / prob changes
    useEffect(() => {
        adjRef.current = buildAdjacency(topology, N, erProb);
    }, [topology, N, erProb]);

    // Helpers to initialize
    function randomizePhases() {
        const th = thetaRef.current;
        for (let i = 0; i < th.length; i++) th[i] = Math.random() * Math.PI * 2;
    }

    function randomizeFrequencies() {
        const w = omegaRef.current;
        if (omegaMode === "gaussian") {
            for (let i = 0; i < w.length; i++) w[i] = gaussianRandom(0, gaussStd);
        } else if (omegaMode === "cauchy") {
            for (let i = 0; i < w.length; i++) w[i] = cauchyRandom(0, cauchyGamma);
        } else {
            for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * uniRange;
        }
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
        if (showCentroidRef.current) {
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

        if (showLabelsRef.current && th.length <= 100) {
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

            let elapsed = (now - last) / 1000;
            if (!isFinite(elapsed) || elapsed > 0.5) elapsed = 0;

            accRef.current += elapsed * speed;

            const fixed = dt;
            let steps = 0;
            while (accRef.current >= fixed && steps < 5000) {
                stepSimulation(fixed);
                accRef.current -= fixed;
                steps++;
            }

            if (steps > 0 && (tRef.current - lastChartUpdateRef.current) > 0.05) {
                lastChartUpdateRef.current = tRef.current;
                setChartTick(t => (t + 1) % 1_000_000);
            }

            draw();
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, [running, dt, speed, K, noise, showCentroid, showLabels, N]);


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

    function handleReseedFrequencies() {
        randomizeFrequencies();

        // also reset graph
        tRef.current = 0;
        accRef.current = 0;
        rBufferRef.current = [];
        const { r } = computeOrder(thetaRef.current);
        rBufferRef.current.push({ t: 0, r });
        lastChartUpdateRef.current = 0;
        setChartTick(t => (t + 1) % 1_000_000);

        draw();
    }

    // Build chart data memoized
    const chartData = useMemo(
        () => rBufferRef.current.map(p => ({ t: p.t, r: p.r })),
        [chartTick]
    );



    return (
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
                                    <XAxis dataKey="t" tickFormatter={(v) => v.toFixed(1)} label={{ value: "time", position: "insideRight", offset: 0 }} />
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
                            <Input type="number" className="col-span-4" value={N} min={2} max={2000}
                                   onChange={(e) => setN(clamp(parseInt(e.target.value || "0"), 2, 2000))} />
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
                    <CardContent className="p-4 text-sm leading-relaxed">
                        <h4 className="text-base font-semibold mb-2">Model</h4>
                        <p>
                            The Kuramoto dynamics integrate <span className="font-mono">θ̇ᵢ = ωᵢ + K · (1/|Nᵢ|) Σ<sub>j∈Nᵢ</sub> sin(θⱼ − θᵢ)</span> with optional white noise.
                            For the all-to-all case, the interaction term is computed via the order parameter <span className="font-mono">r e<sup>iψ</sup> = (1/N) Σ e<sup>iθⱼ</sup></span>
                            so that <span className="font-mono">Σ sin(θⱼ−θᵢ) = N r sin(ψ−θᵢ)</span>.
                        </p>
                        <p className="mt-2">Use the controls to change <span className="font-mono">K</span>, noise, distribution of natural frequencies, and topology in real time.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
