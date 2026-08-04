import { useEffect, useRef } from "react";

/** Scroll-synced ambient WebGL-style canvas (2D particles + grid). */
export function ScrollSyncCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let scrollY = 0;
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      speed: 0.0003 + Math.random() * 0.0008,
    }));

    const onScroll = () => { scrollY = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const parallax = scrollY * 0.0004;

      ctx.fillStyle = "rgba(8, 8, 12, 0.35)";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(255, 90, 0, 0.06)";
      ctx.lineWidth = 1;
      const gridOff = (scrollY * 0.15) % 48;
      for (let x = -gridOff; x < w; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = -gridOff; y < h; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      for (const p of particles) {
        p.y -= p.speed + parallax * 0.02;
        if (p.y < -0.05) p.y = 1.05;
        const px = p.x * w + Math.sin(tick + p.z * 10) * 20;
        const py = p.y * h;
        const size = 1 + p.z * 2.5;
        ctx.fillStyle = `rgba(255, ${120 + p.z * 80 | 0}, 0, ${0.15 + p.z * 0.35})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      tick += 1;
      raf = requestAnimationFrame(draw);
    };

    let tick = 0;
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-scroll-canvas" aria-hidden />;
}
