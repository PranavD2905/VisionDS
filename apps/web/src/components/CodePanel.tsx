import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function CodePanel({
  code,
  activeLine,
  isException,
}: {
  code: string;
  activeLine?: number;
  isException: boolean;
}) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeLine]);

  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className="code-panel">
      <pre>
        {lines.map((text, i) => {
          const line = i + 1;
          const active = line === activeLine;
          return (
            <div
              key={line}
              ref={active ? activeRef : undefined}
              className={`code-line${active ? ' active' : ''}`}
            >
              {active && (
                <motion.div
                  layoutId="line-highlight"
                  className={`line-highlight${isException ? ' exception' : ''}`}
                  transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                />
              )}
              <span className="line-no">{line}</span>
              <span className="line-text">{text || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
