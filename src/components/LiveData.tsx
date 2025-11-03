import React, { useMemo } from "react";
import { computeOrder } from "@/lib/kuramoto";

const rad2deg = (x:number)=> x * (180/Math.PI);
const fmt = (x:number, d=2)=> Number.isFinite(x) ? x.toFixed(d) : "—";

export default function LiveData({
                                     theta, dtheta, omega, perOscView=false
                                 }: { theta: Float64Array; dtheta: Float64Array; omega: Float64Array; perOscView?: boolean }) {

    const nShow = Math.min(theta.length, 5);
    const { psi } = computeOrder(theta);

    const stats = useMemo(()=>{
        let s=0,s2=0,mn=Infinity,mx=-Infinity;
        for (let i=0;i<omega.length;i++){ const v=omega[i]; s+=v; s2+=v*v; if(v<mn)mn=v; if(v>mx)mx=v; }
        const mean = s/omega.length;
        const std = Math.sqrt(Math.max(0, s2/omega.length - mean*mean));
        return { mean, std, min: mn, max: mx };
    }, [omega]);

    if (perOscView) {
        return (
            <div className="mt-1">
                <div className="text-muted-foreground mb-1">Per oscillator (i = 0…{nShow-1})</div>
                <div className="grid grid-cols-3 gap-4">
                    <Column title="ω (natural)">
                        {Array.from({length:nShow}, (_,i)=> <li key={i}>i={i}: {fmt(omega[i],2)}</li>)}
                    </Column>
                    <Column title="dθ/dt">
                        {Array.from({length:nShow}, (_,i)=> <li key={i}>i={i}: {fmt(rad2deg(dtheta[i]),2)}°/s</li>)}
                    </Column>
                    <Column title="θ">
                        {Array.from({length:nShow}, (_,i)=> <li key={i}>i={i}: {fmt(rad2deg(theta[i]),2)}°</li>)}
                    </Column>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <div className="text-[11px] leading-4 text-muted-foreground uppercase tracking-wide">ψ (Degrees)</div>
                <div className="tabular-nums font-semibold text-4xl sm:text-5xl">
                    {fmt(rad2deg(psi), 2)}<span className="text-lg align-top">&nbsp;°</span>
                </div>
            </div>
            <div className="divide-y divide-border rounded-lg">
                {[
                    ["ω mean", stats.mean],
                    ["ω std",  stats.std],
                    ["ω min",  stats.min],
                    ["ω max",  stats.max],
                ].map(([lab,val])=>(
                    <div key={lab as string} className="grid grid-cols-2 items-center py-2">
                        <div className="text-muted-foreground">{lab as string}</div>
                        <div className="tabular-nums justify-self-end">
                            {fmt(rad2deg(val as number), 2)}<span className="text-sm">&nbsp;°/s</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Column({ title, children }: React.PropsWithChildren<{ title: string }>) {
    return (
        <div>
            <div className="font-semibold mb-1">{title}</div>
            <ul className="list-disc list-inside font-mono text-sm">{children}</ul>
        </div>
    );
}
