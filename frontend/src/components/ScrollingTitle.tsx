import { useEffect, useRef, useState } from 'react';
import '../styles/scrolling-title.css';

type ScrollingTitleProps = {
  text: string;
  className?: string;
};

export default function ScrollingTitle({ text, className = '' }: ScrollingTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const check = () => {
      setScroll(measure.scrollWidth > container.clientWidth + 2);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`scrolling-title${scroll ? ' is-scrolling' : ''}${className ? ` ${className}` : ''}`}
      title={text}
    >
      <span ref={measureRef} className="scrolling-title-measure" aria-hidden>
        {text}
      </span>
      <span className="scrolling-title-track">
        <span className="scrolling-title-text">{text}</span>
        {scroll && (
          <span className="scrolling-title-text" aria-hidden>
            {text}
          </span>
        )}
      </span>
    </div>
  );
}
