import { useEffect, useRef } from "react";
// value imports (these exist at runtime)
import { buildAdjacency, computeOrder, stepEuler, stepRK2, stepRK4, gaussian } from "@/lib/kuramoto";
// type-only import (erased at runtime, prevents the crash)
import type { Integrator } from "@/lib/kuramoto";

type Integrator = typeof stepEuler;

export type Method = "euler" | "rk2" | "rk4";

const INTEGRATORS: Record<Method, Integrator> = {
    euler: stepEuler,
    rk2: stepRK2,
    rk4: stepRK4,
};

export function useKuramoto(opts: {
    N: number; K: number; dt: number; noise: number;
    topology: "all" | "ring" | "erdos-renyi"; erProb: number;
    method: Method; running: boolean; speed: number;
}) {
    const { N, K, dt, noise, topology, erProb, method, running, speed } = opts;

    const theta = useRef(new Float64Array(N));
    const omega = useRef(new Float64Array(N));
    const ctx = useRef({ K, adj: buildAdjacency(topology, N, erProb) });
    const rng = useRef(gaussian);

    // Scratch buffers sized to N
    const tmp = useRef({
        k1: new Float64Array(N),
        k2: new Float64Array(N),
        k3: new Float64Array(N),
        k4: new Float64Array(N),
        tmpTheta: new Float64Array(N),
    });

    // Rebuild on N/topology changes
    useEffect(() => {
        theta.current = new Float64Array(N);
        omega.current = new Float64Array(N);
        tmp.current = {
            k1: new Float64Array(N),
            k2: new Float64Array(N),
            k3: new Float64Array(N),
            k4: new Float64Array(N),
            tmpTheta: new Float64Array(N),
        };
        ctx.current = { K, adj: buildAdjacency(topology, N, erProb) };
    }, [N]);

    useEffect(() => { ctx.current = { K, adj: buildAdjacency(topology, N, erProb) }; }, [K, topology, N, erProb]);

    // One fixed-step tick
    const stepOnce = () => {
        INTEGRATORS[method](theta.current, omega.current, dt, noise, ctx.current, rng.current, tmp.current);
    };

    // r(t) buffer for chart
    const rBuf = useRef<{t:number; r:number}[]>([{ t: 0, r: computeOrder(theta.current).r }]);
    const tRef = useRef(0);
    const lastChart = useRef(0);

    // RAF loop
    useEffect(() => {
        if (!running) return;
        let raf = 0;
        let last = performance.now();
        let acc = 0;

        const loop = (now: number) => {
            const dtWall = Math.min(0.5, Math.max(0, (now - last) / 1000));
            last = now;
            acc += dtWall * speed;

            let steps = 0;
            while (acc >= dt && steps < 5000) { stepOnce(); acc -= dt; steps++; tRef.current += dt; }

            if (steps > 0 && tRef.current - lastChart.current > 0.05) {
                lastChart.current = tRef.current;
                const { r } = computeOrder(theta.current);
                rBuf.current.push({ t: tRef.current, r });
                if (rBuf.current.length > 600) rBuf.current.shift();
            }
            raf = requestAnimationFrame(loop);
        };

        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [running, method, dt, noise, speed]);

    return {
        theta, omega, ctx,
        rBuf,
        seedPhases: (fn: (th: Float64Array) => void) => fn(theta.current),
        seedOmegas: (fn: (w: Float64Array) => void) => fn(omega.current),
        resetChart: () => {
            rBuf.current = [{ t: 0, r: computeOrder(theta.current).r }];
            tRef.current = 0; lastChart.current = 0;
        },
    };
}
