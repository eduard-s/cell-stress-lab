import { useEffect, useState, type RefObject } from "react";

const STEP_MS = 560;

export function useCellPlayback(field: RefObject<HTMLDivElement | null>, onTick: () => void, enabled: boolean, paused: boolean, tickMs = STEP_MS) {
  const [visible, setVisible] = useState(true);
  const [motionHeld, setMotionHeld] = useState(false);

  useEffect(() => {
    const stage = field.current;
    if (!stage) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function respectMotion() {
      setMotionHeld(motion.matches);
    }
    let inView = true;
    function publishVisibility() {
      setVisible(inView && !document.hidden);
    }
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      publishVisibility();
    }, { rootMargin: "80px" });
    observer?.observe(stage);
    document.addEventListener("visibilitychange", publishVisibility);
    motion.addEventListener("change", respectMotion);
    respectMotion();
    publishVisibility();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", publishVisibility);
      motion.removeEventListener("change", respectMotion);
    };
  }, [field]);

  const running = enabled && !paused && !motionHeld && visible;
  useEffect(() => {
    if (!running) return;
    const clock = window.setInterval(() => {
      if (!document.hidden) onTick();
    }, tickMs);
    return () => window.clearInterval(clock);
  }, [running, onTick, tickMs]);

  return { running, paused: paused || motionHeld, releaseMotionHold: () => setMotionHeld(false) };
}
