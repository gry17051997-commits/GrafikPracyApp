import {useEffect, useRef, useState} from 'react';

export default function useSecondTicker(intervalMs=1000) {
  const [tick, forceRender] = useState(0);
  const frameRef = useRef(null);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    let active = true;

    const frame = () => {
      if (!active) return;
      const now = Date.now();
      if (now - lastTickRef.current >= intervalMs) {
        lastTickRef.current = now - ((now - lastTickRef.current) % intervalMs);
        forceRender(value => value + 1);
      }
      frameRef.current = requestAnimationFrame(frame);
    };

    frameRef.current = requestAnimationFrame(frame);
    return () => {
      active = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [intervalMs]);

  return tick;
}
