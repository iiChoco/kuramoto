import React, { useEffect, useRef } from "react";
import { computeOrder } from "@/lib/kuramoto";

export type KuramotoCanvasProps = {
    theta: Float64Array;
    showCentroid?: boolean;
    showLabels?: boolean;
    className?: string;
};

export default function KuramotoCanvas({
                                           theta,
                                           showCentroid = true,
                                           showLabels = false,
                                           className
                                       }: KuramotoCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // clear
        ctx.clearRect(0, 0, w, h);

        // geometry
        const size = Math.min(w, h);
        const R = size * 0.38;
        const cx = w * 0.5;
        const cy = h * 0.5;

        // outer circle
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = "#888";
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();

        // centroid
        const { r, psi } = computeOrder(theta);
        if (showCentroid) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineWidth = 3 * dpr;
            ctx.strokeStyle = "#111";
            ctx.lineTo(R * r * Math.cos(psi), R * r * Math.sin(psi));
            ctx.stroke();
            ctx.restore();
        }

        // points
        const pointR = Math.max(2 * dpr, Math.min(6 * dpr, 4 * dpr));
        ctx.fillStyle = "#111";
        ctx.beginPath();
        for (let i = 0; i < theta.length; i++) {
            const x = cx + R * Math.cos(theta[i]);
            const y = cy + R * Math.sin(theta[i]);
            ctx.moveTo(x + pointR, y);
            ctx.arc(x, y, pointR, 0, Math.PI * 2);
        }
        ctx.fill();

        if (showLabels && theta.length <= 100) {
            ctx.font = `${12 * dpr}px ui-sans-serif`;
            ctx.fillStyle = "#111";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let i = 0; i < theta.length; i++) {
                const x = cx + R * Math.cos(theta[i]);
                const y = cy + R * Math.sin(theta[i]);
                ctx.fillText(String(i), x, y - 12 * dpr);
            }
        }
    }, [theta, showCentroid, showLabels]);

    return <canvas ref={canvasRef} className={className || "w-full h-full"} />;
}
