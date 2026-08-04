import { useEffect, useRef } from "react";

/** Letterfield-inspired grid of monotone Ember logos with ember-color ripples. */
export function LogoFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = "/ember-coin.svg";
    img.onload = () => { imgRef.current = img; };
    imgRef.current = img;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    canvas.addEventListener("mousemove", onMove);

    const cell = 52;
    const draw = () => {
      t += 0.012;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const img = imgRef.current;
      const cols = Math.ceil(w / cell) + 1;
      const rows = Math.ceil(h / cell) + 1;
      const mx = mouseRef.current.x * w;
      const my = mouseRef.current.y * h;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = col * cell + cell * 0.5;
          const cy = row * cell + cell * 0.5;
          const dist = Math.hypot(cx - mx, cy - my);
          const wave = Math.sin(dist * 0.025 - t * 4) * 0.5 + 0.5;
          const pulse = Math.max(0, 1 - dist / 280) * wave;

          const gray = 38 + pulse * 18;
          const r = gray + pulse * 140;
          const g = gray + pulse * 55;
          const b = gray + pulse * 8;
          const alpha = 0.35 + pulse * 0.55;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.filter = `grayscale(${1 - pulse * 0.85})`;
          ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;

          if (img?.complete && img.naturalWidth) {
            const size = cell * 0.72;
            ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
          } else {
            ctx.beginPath();
            ctx.arc(cx, cy, cell * 0.22, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-logo-field" aria-hidden />;
}
