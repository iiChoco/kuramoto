import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Gauge } from "lucide-react";
import KuramotoCanvas from "@/components/KuramotoCanvas";
import RChart from "@/components/RChart";
import Controls from "@/components/Controls";
import type { Method, Topology, OmegaMode, PhaseMode } from "@/components/Controls";
import LiveData from "@/components/LiveData";
import { useKuramoto } from "@/hooks/useKuramoto";
import { computeOrder } from "@/lib/kuramoto";

export default function KuramotoLivePage(): JSX.Element {
    // UI state
    const [N, setN] = useState(5);
    const [K, setK] = useState(1);
    const [dt, setDt] = useState(0.02);
    const [noise, setNoise] = useState(0);
    const [speed, setSpeed] = useState(1);

    const [topology, setTopology] = useState<Topology>("all");
    const [erProb, setErProb] = useState(0.05);
    const [method, setMethod] = useState<Method>("Euler");

    const [omegaMode, setOmegaMode] = useState<OmegaMode>("gaussian");
    const [gaussStd, setGaussStd] = useState(0.6);
    const [cauchyGamma, setCauchyGamma] = useState(0.5);
    const [uniRange, setUniRange] = useState(1.0);
    const [omegaText, setOmegaText] = useState("");

    const [phaseMode, setPhaseMode] = useState<PhaseMode>("linear");
    const [phaseText, setPhaseText] = useState("");
    const [clusterSpread, setClusterSpread] = useState(20);
    const [resetOnPhaseApply, setResetOnPhaseApply] = useState(true);

    const [running, setRunning] = useState(false);
    const [showCentroid, setShowCentroid] = useState(true);
    const [showLabels, setShowLabels] = useState(false);
    const [perOscView, setPerOscView] = useState(false);

    const [nText, setNText] = useState(String(N));

    // Hook
    const sim = useKuramoto({N, K, dt, noise, topology, erProb, method, running, speed});

    // helpers: phase/omega seeding (reuse your prior logic)
    const TAU = Math.PI * 2;
    const deg2rad = (d: number) => d * Math.PI / 180;

    function setPhasesUniform() {
        const th = sim.theta.current;
        for (let i = 0; i < th.length; i++) th[i] = Math.random() * TAU - Math.PI;
    }

    function setPhasesZero() {
        const th = sim.theta.current;
        for (let i = 0; i < th.length; i++) th[i] = 0;
    }

    function setPhasesLinear() {
        const th = sim.theta.current;
        const n = th.length;
        for (let i = 0; i < n; i++) {
            const v = (i / n) * TAU;
            th[i] = Math.atan2(Math.sin(v), Math.cos(v));
        }
    }

    function setPhasesTwoCluster(spreadDeg: number) {
        const th = sim.theta.current;
        const n = th.length;
        const s = deg2rad(spreadDeg);
        for (let i = 0; i < n; i++) {
            const center = i % 2 === 0 ? 0 : Math.PI;
            const jitter = gaussian(0, s);
            th[i] = Math.atan2(Math.sin(center + jitter), Math.cos(center + jitter));
        }
    }

    function gaussian(mean = 0, std = 1) { // simple Box–Muller just for seeding
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function applyManualTheta(text: string) {
        const toks = text.split(/[\s,]+/).map(t => +t).filter(Number.isFinite);
        const th = sim.theta.current, n = th.length;
        if (toks.length === 0) {
            for (let i = 0; i < n; i++) th[i] = 0;
        } else {
            const last = toks[toks.length - 1];
            for (let i = 0; i < n; i++) th[i] = i < toks.length ? toks[i] : last;
        }
        for (let i = 0; i < n; i++) th[i] = Math.atan2(Math.sin(th[i]), Math.cos(th[i]));
    }

    function randomizePhases() {
        if (phaseMode === "uniform") setPhasesUniform();
        else if (phaseMode === "zero") setPhasesZero();
        else if (phaseMode === "linear") setPhasesLinear();
        else if (phaseMode === "two-cluster") setPhasesTwoCluster(clusterSpread);
        else applyManualTheta(phaseText);
    }

    function applyManualOmega(text: string) {
        const toks = text.split(/[\s,]+/).map(t => +t).filter(Number.isFinite);
        const w = sim.omega.current, n = w.length;
        if (toks.length === 0) for (let i = 0; i < n; i++) w[i] = 0;
        else {
            const last = toks[toks.length - 1];
            for (let i = 0; i < n; i++) w[i] = i < toks.length ? toks[i] : last;
        }
    }

    function formatOmegaList(): string {
        const w = sim.omega.current;
        const n = Math.min(w.length, 2000);
        const arr = new Array<string>(n);
        for (let i = 0; i < n; i++) arr[i] = w[i].toString();
        return arr.join(", ");
    }

    function randomizeFrequencies() {
        const w = sim.omega.current;
        if (omegaMode === "gaussian") {
            for (let i = 0; i < w.length; i++) w[i] = gaussian(0, gaussStd);
        } else if (omegaMode === "cauchy") {
            for (let i = 0; i < w.length; i++) {
                const u = Math.random() - 0.5;
                w[i] = cauchy(0, cauchyGamma, u);
            }
        } else if (omegaMode === "uniform") {
            for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * uniRange;
        } else applyManualOmega(omegaText);
    }

    function cauchy(x0 = 0, gamma = 1, u?: number) {
        const U = u ?? (Math.random() - 0.5);
        return x0 + gamma * Math.tan(Math.PI * U);
    }

    // commit N
    function commitNFromText() {
        if (nText.trim() === "") return;
        const parsed = Number.parseInt(nText, 10);
        const clamped = Number.isFinite(parsed) ? Math.max(2, Math.min(2000, parsed | 0)) : N;
        if (clamped !== N) setN(clamped);
        setNText(String(clamped));
    }

    // initial seeding when N/mode change (do by user action as you prefer)

    // r(t) chart data
    const chartData = useMemo(
        () => sim.rBuf.current.map(p => ({t: p.t, r: p.r})),
        [sim.rBuf.current.length] // re-run when buffer length changes
    );

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-background">
            <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <Card className="flex-1 overflow-hidden">
                        <CardContent className="h-full p-4">
                            <KuramotoCanvas
                                theta={sim.theta.current}
                                showCentroid={showCentroid}
                                showLabels={showLabels}
                            />
                        </CardContent>
                    </Card>
                    <Card className="h-64">
                        <CardContent className="h-full p-4">
                            <RChart data={chartData} />
                        </CardContent>
                    </Card>
                </div>

                <div className="w-96 flex flex-col gap-4 overflow-y-auto">
                    <Controls
                        running={running}
                        onToggleRun={() => setRunning(!running)}
                        onReset={() => {
                            randomizePhases();
                            randomizeFrequencies();
                            sim.resetChart();
                        }}
                        N={N}
                        nText={nText}
                        onNTextChange={setNText}
                        onNCommit={commitNFromText}
                        K={K}
                        onKChange={setK}
                        dt={dt}
                        onDtChange={setDt}
                        noise={noise}
                        onNoiseChange={setNoise}
                        speed={speed}
                        onSpeedChange={setSpeed}
                        topology={topology}
                        onTopologyChange={setTopology}
                        erProb={erProb}
                        onErProbChange={setErProb}
                        method={method}
                        onMethodChange={setMethod}
                        omegaMode={omegaMode}
                        onOmegaModeChange={setOmegaMode}
                        gaussStd={gaussStd}
                        onGaussStdChange={setGaussStd}
                        cauchyGamma={cauchyGamma}
                        onCauchyGammaChange={setCauchyGamma}
                        uniRange={uniRange}
                        onUniRangeChange={setUniRange}
                        omegaText={omegaText}
                        onOmegaTextChange={setOmegaText}
                        onRandomizeFrequencies={randomizeFrequencies}
                        onApplyManualOmega={() => applyManualOmega(omegaText)}
                        onCopyOmegas={() => setOmegaText(formatOmegaList())}
                        phaseMode={phaseMode}
                        onPhaseModeChange={setPhaseMode}
                        phaseText={phaseText}
                        onPhaseTextChange={setPhaseText}
                        clusterSpread={clusterSpread}
                        onClusterSpreadChange={setClusterSpread}
                        resetOnPhaseApply={resetOnPhaseApply}
                        onResetOnPhaseApplyChange={setResetOnPhaseApply}
                        onRandomizePhases={randomizePhases}
                        onApplyManualPhase={() => applyManualTheta(phaseText)}
                        showCentroid={showCentroid}
                        onShowCentroidChange={setShowCentroid}
                        showLabels={showLabels}
                        onShowLabelsChange={setShowLabels}
                        perOscView={perOscView}
                        onPerOscViewChange={setPerOscView}
                    />

                    <LiveData
                        theta={sim.theta.current}
                        omega={sim.omega.current}
                        perOscView={perOscView}
                    />
                </div>
            </div>
        </div>
    );
}