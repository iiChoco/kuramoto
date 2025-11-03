export type Topology = "all" | "ring" | "erdos-renyi";

export interface CouplingContext {
    K: number; // Coupling strength
    adj: number[][] | null; // null => all to all
    scratch?: Float64Array; // optional scratch space for optimizations
}

export function buildAdjacency(type: Topology, N: number, p = 0.05): number[][] | null {
    if (type === "all") return null;
    const adj: number[][] = Array.from({length:N}, () => []);
    if (type === "ring") {
        for (let i = 0; i < N; i++) {
            const L = (i - 1 + N) % N, R = (i + 1) % N;
            if (L === R) {
                adj[i].push(L);
            } else {
                adj[i].push(L);
                adj[i].push(R);
            }
        }
        return adj;
    }
    if (type === "erdos-renyi") {
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
}

export function wrapAngle(theta: number): number {
    return Math.atan2(Math.sin(theta), Math.cos(theta));
}

export function computeOrder(thetas: Float64Array): { r: number; psi: number } {
    let cx = 0, sx = 0; //sum of cosines and sines
    const nInv = 1/thetas.length;
    for (let i = 0; i < thetas.length; i++) {
        cx += Math.cos(thetas[i]);
        sx += Math.sin(thetas[i]);
    }
    cx *= nInv;
    sx *= nInv;
    const r = Math.hypot(cx, sx);
    const psi = Math.atan2(sx, cx);
    return { r, psi };
}

export function field(out: Float64Array, theta: Float64Array, omega: Float64Array, ctx: CouplingContext) {
    const { K, adj } = ctx;
    const N = theta.length;
    if (adj === null) { // all to all
        const {r, psi} = computeOrder(theta);
        for (let i = 0; i < N; i++) {
            out[i] = omega[i] + K * r * Math.sin(psi - theta[i]);
        }
    } else {
            for (let i = 0; i < N; i++) {
                const connectivity = adj[i];
                let s = 0;
                for (let j = 0; j < connectivity.length; j++) {
                    const neighbor = connectivity[j];
                    s += Math.sin(theta[neighbor] - theta[i]);
                    const coupling = connectivity.length ? (K / connectivity.length ) : 0;
                }
            }
        }
    }


export type Integrator = (
    theta: Float64Array,
    omega: Float64Array,
    dt: number,
    noise: number,
    ctx: CouplingContext,
    rng: () => number,
    tmp: Scratch
) => void;

export interface Scratch {
    k1: Float64Array;
    k2: Float64Array;
    k3: Float64Array;
    k4: Float64Array;
    tempTheta?: Float64Array;
}

// simple gaussian (0,1)
export const gaussian = (() => {
    let spare: number | null = null;
    return () => {
        if (spare != null) { const z = spare; spare = null; return z; }
        let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
        const r = Math.sqrt(-2 * Math.log(u)), t = 2 * Math.PI * v;
        spare = r * Math.sin(t); return r * Math.cos(t);
    };
})();

// Integrators

// Euler
export const stepEuler: Integrator = (theta, omega, dt, noise, ctx, rng, tmp) => {
    const { k1 } = tmp;
    field(k1, theta, omega, ctx);
    const sig = noise > 0 ? Math.sqrt(dt) * noise : 0;
    for (let i = 0; i < theta.length; i++) {
        const dW = sig ? sig * rng() : 0;
        theta[i] = wrapAngle(theta[i] + dt * k1[i] + dW);
    }
};


//RK2
export const stepRK2: Integrator = (theta, omega, dt, noise, ctx, rng, tmp) => {
    const { k1, k2, tempTheta } = tmp as Required<Scratch>;
    field(k1, theta, omega, ctx);                   // k1 = f(t
    // , θ)
    for (let i = 0; i < theta.length; i++) tempTheta[i] = wrapAngle(theta[i] + 0.5 * dt * k1[i]);
    field(k2, tempTheta, omega, ctx);                // k2 = f(t+dt/2, θ + dt/2 k1)

    const sig = noise > 0 ? Math.sqrt(dt) * noise : 0;
    for (let i = 0; i < theta.length; i++) {
        const dW = sig ? sig * rng() : 0;
        theta[i] = wrapAngle(theta[i] + dt * k2[i] + dW);
    }
};

//RK4
export const stepRK4: Integrator = (theta, omega, dt, noise, ctx, rng, tmp) => {
    const { k1, k2, k3, k4, tempTheta } = tmp as Required<Scratch>;
    field(k1, theta, omega, ctx);

    for (let i = 0; i < theta.length; i++) tempTheta[i] = wrapAngle(theta[i] + 0.5 * dt * k1[i]);
    field(k2, tempTheta, omega, ctx);

    for (let i = 0; i < theta.length; i++) tempTheta[i] = wrapAngle(theta[i] + 0.5 * dt * k2[i]);
    field(k3, tempTheta, omega, ctx);

    for (let i = 0; i < theta.length; i++) tempTheta[i] = wrapAngle(theta[i] + dt * k3[i]);
    field(k4, tempTheta, omega, ctx);

    const sig = noise > 0 ? Math.sqrt(dt) * noise : 0;
    for (let i = 0; i < theta.length; i++) {
        const incr = (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
        const dW = sig ? sig * rng() : 0;
        theta[i] = wrapAngle(theta[i] + incr + dW);
    }
};