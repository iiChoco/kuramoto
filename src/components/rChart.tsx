import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

export default function RChart({ data }: { data: { t: number; r: number }[] }) {
    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <XAxis dataKey="t" tickFormatter={(v) => Number(v).toFixed(1)}
                           label={{ value: "t", position: "insideRight", offset: -2, dy: 12 }} />
                    <YAxis domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} />
                    <Tooltip
                        formatter={(v, n) => [Number(v as number).toFixed(3), n as string]}
                        labelFormatter={(v) => `t=${Number(v).toFixed(2)}`}
                    />
                    <Line type="monotone" dataKey="r" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
