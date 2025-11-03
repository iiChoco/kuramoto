import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type Method = "Euler" | "RK2" | "RK4";
export type Topology = "all" | "ring" | "er";
export type PhaseMode = "uniform" | "zero" | "linear" | "two-cluster" | "manual";
export type OmegaMode = "gaussian" | "cauchy" | "uniform" | "manual";

type Props = {
    N: number; K: number; dt: number; noise: number; speed: number;
    topology: Topology; erProb: number; method: Method;
    omegaMode: OmegaMode; gaussStd: number; cauchyGamma: number; uniRange: number; omegaText: string;
    phaseMode: PhaseMode; phaseText: string; clusterSpread: number; resetOnPhaseApply: boolean;

    nText: string; setNText: (s: string) => void; commitNFromText: () => void;

    setK: (x: number) => void; setDt: (x: number) => void; setNoise: (x: number) => void; setSpeed: (x: number) => void;
    setTopology: (t: Topology) => void; setErProb: (p: number) => void; setMethod: (m: Method) => void;

    setOmegaMode: (m: OmegaMode) => void;
    setGaussStd: (x: number) => void; setCauchyGamma: (x: number) => void; setUniRange: (x: number) => void;
    setOmegaText: (s: string) => void; onApplyOmega: () => void; onLoadOmega: () => void; onReseedOmega: () => void;

    setPhaseMode: (m: PhaseMode) => void; setPhaseText: (s: string) => void; setClusterSpread: (x: number) => void;
    onApplyTheta: () => void; onLoadTheta: () => void; setResetOnPhaseApply: (b: boolean) => void;

    onRunToggle: () => void; running: boolean; onResetAll: () => void; onRandomizePhases: () => void;
    showCentroid: boolean; setShowCentroid: (b: boolean) => void;
    showLabels: boolean; setShowLabels: (b: boolean) => void;
};

export default function Controls(p: Props) {
    const fmt = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : "—";

    return (
        <div className="grid gap-6">
            {/* Top bar */}
            <div className="flex items-center gap-2">
                <Button onClick={p.onRunToggle} className="rounded-2xl">
                    {p.running ? "Pause" : "Run"}
                </Button>
                <Button variant="secondary" onClick={p.onResetAll} className="rounded-2xl">Reset</Button>
                <Button variant="outline" onClick={p.onRandomizePhases} className="rounded-2xl">Randomize Phases</Button>
            </div>

            {/* N */}
            <div className="grid grid-cols-7 items-center gap-3">
                <Label className="col-span-3">Oscillators (N)</Label>
                <Input
                    className="col-span-4"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={p.nText}
                    onChange={(e) => p.setNText(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") p.commitNFromText(); }}
                    onBlur={() => { if (!/^\d+$/.test(p.nText)) p.setNText(String(p.N)); }}
                    placeholder="Enter number of oscillators"
                />
            </div>

            {/* Method */}
            <div className="grid grid-cols-7 items-center gap-3">
                <Label className="col-span-3">Integrator</Label>
                <Select value={p.method} onValueChange={(v) => p.setMethod(v as any)}>
                    <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Euler">Euler (Euler–Maruyama)</SelectItem>
                        <SelectItem value="RK2">RK2 (midpoint)</SelectItem>
                        <SelectItem value="RK4">RK4</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Sliders */}
            {[
                ["Coupling K", p.K, (x:number)=>p.setK(x), 0, 5, 0.01],
                ["Time step dt", p.dt, (x:number)=>p.setDt(x), 0.001, 0.1, 0.001],
                ["Sim speed ×", p.speed, (x:number)=>p.setSpeed(x), 0.1, 5, 0.1],
                ["Noise σ", p.noise, (x:number)=>p.setNoise(x), 0, 1.5, 0.01],
            ].map(([lab,val,setter,min,max,step], idx)=>(
                <div className="grid gap-2" key={idx}>
                    <div className="flex justify-between items-center">
                        <Label>{lab as string}</Label><span className="text-sm tabular-nums">{fmt(val as number, lab==="Time step dt"?3:2)}</span>
                    </div>
                    <Slider value={[val as number]} min={min as number} max={max as number} step={step as number}
                            onValueChange={(v)=> (setter as any)(v[0])}/>
                </div>
            ))}

            {/* Topology */}
            <div className="grid grid-cols-7 items-center gap-3">
                <Label className="col-span-3">Topology</Label>
                <Select value={p.topology} onValueChange={(v)=>p.setTopology(v as any)}>
                    <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All-to-all</SelectItem>
                        <SelectItem value="ring">Ring (2-neighbor)</SelectItem>
                        <SelectItem value="er">Erdős–Rényi</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {p.topology === "er" && (
                <div className="grid gap-2">
                    <div className="flex justify-between items-center">
                        <Label>ER edge prob p</Label><span className="text-sm tabular-nums">{fmt(p.erProb, 3)}</span>
                    </div>
                    <Slider value={[p.erProb]} min={0.005} max={0.3} step={0.005} onValueChange={(v)=>p.setErProb(v[0])}/>
                </div>
            )}

            {/* ω distribution */}
            <div className="grid grid-cols-7 items-center gap-3">
                <Label className="col-span-3">ω distribution</Label>
                <Select value={p.omegaMode} onValueChange={(v)=>p.setOmegaMode(v as any)}>
                    <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="gaussian">Gaussian(0, σ)</SelectItem>
                        <SelectItem value="cauchy">Lorentz/Cauchy(0, γ)</SelectItem>
                        <SelectItem value="uniform">Uniform[-a, a]</SelectItem>
                        <SelectItem value="manual">Manual (paste list)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {p.omegaMode === "gaussian" && (
                <RangeRow label="σ (std dev)" value={p.gaussStd} setValue={p.setGaussStd} min={0.05} max={2.5} step={0.05}>
                    <Button variant="outline" onClick={p.onReseedOmega} className="mt-1">Resample ω</Button>
                </RangeRow>
            )}
            {p.omegaMode === "cauchy" && (
                <RangeRow label="γ (scale)" value={p.cauchyGamma} setValue={p.setCauchyGamma} min={0.05} max={2.5} step={0.05}>
                    <Button variant="outline" onClick={p.onReseedOmega} className="mt-1">Resample ω</Button>
                </RangeRow>
            )}
            {p.omegaMode === "uniform" && (
                <RangeRow label="a (half-range)" value={p.uniRange} setValue={p.setUniRange} min={0.1} max={3} step={0.1}>
                    <Button variant="outline" onClick={p.onReseedOmega} className="mt-1">Resample ω</Button>
                </RangeRow>
            )}
            {p.omegaMode === "manual" && (
                <div className="grid gap-2">
                    <Label>ω list (N = {p.N})</Label>
                    <textarea
                        className="w-full h-32 rounded-md border px-2 py-1 font-mono text-sm"
                        value={p.omegaText}
                        onChange={(e) => p.setOmegaText(e.target.value)}
                        placeholder="Comma or space-separated numbers"
                    />
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={p.onApplyOmega}>Apply ω list</Button>
                        <Button variant="ghost" onClick={p.onLoadOmega} title="Load current ω into the editor">Load current</Button>
                    </div>
                </div>
            )}

            {/* θ init */}
            <div className="grid grid-cols-7 items-center gap-3">
                <Label className="col-span-3">θ init</Label>
                <Select value={p.phaseMode} onValueChange={(v)=>p.setPhaseMode(v as any)}>
                    <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="uniform">Uniform random [-π, π]</SelectItem>
                        <SelectItem value="zero">Zero</SelectItem>
                        <SelectItem value="linear">Uniform</SelectItem>
                        <SelectItem value="two-cluster">Two clusters (0 & π)</SelectItem>
                        <SelectItem value="manual">Manual list</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {p.phaseMode === "two-cluster" && (
                <RangeRow label="Cluster spread (°, σ)" value={p.clusterSpread} setValue={p.setClusterSpread} min={1} max={90} step={1}/>
            )}

            {p.phaseMode === "manual" && (
                <div className="grid gap-2">
                    <Label>θ list (N = {p.N})</Label>
                    <textarea
                        className="w-full h-28 rounded-md border px-2 py-1 font-mono text-sm"
                        value={p.phaseText}
                        onChange={(e) => p.setPhaseText(e.target.value)}
                        placeholder="Comma/space-separated radians"
                    />
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" onClick={p.onApplyTheta}>Apply θ list</Button>
                        <Button variant="ghost" onClick={p.onLoadTheta}>Load current θ</Button>
                        <div className="flex items-center gap-2 ml-auto">
                            <Switch checked={p.resetOnPhaseApply} onCheckedChange={p.setResetOnPhaseApply} id="reset-theta" />
                            <Label htmlFor="reset-theta">Reset r(t) on apply</Label>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Switch checked={p.showCentroid} onCheckedChange={p.setShowCentroid} id="centroid" />
                    <Label htmlFor="centroid">Show order vector</Label>
                </div>
                <div className="flex items-center gap-2">
                    <Switch checked={p.showLabels} onCheckedChange={p.setShowLabels} id="labels" />
                    <Label htmlFor="labels">Index labels</Label>
                </div>
            </div>
        </div>
    );
}

function RangeRow({
                      label, value, setValue, min, max, step, children
                  }: React.PropsWithChildren<{ label: string; value: number; setValue: (x:number)=>void; min:number; max:number; step:number }>) {
    const fmt = (x:number, d=2)=>x.toFixed(d);
    return (
        <div className="grid gap-2">
            <div className="flex justify-between items-center">
                <Label>{label}</Label><span className="text-sm tabular-nums">{fmt(value)}</span>
            </div>
            <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v)=>setValue(v[0])}/>
            {children}
        </div>
    );
}
