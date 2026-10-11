import React, { useEffect, useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  onActivate: () => void;
  ms?: number;
  active?: boolean;
  className?: string;
}

/** A button that also presses itself after the pointer rests on it, the way Handsfree does. */
export const Dwell: React.FC<Props> = ({ children, onActivate, ms = 1000, active, className = 'dwell' }) => {
  const [filling, setFilling] = useState(false);
  const timer = useRef<number | null>(null);

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setFilling(false);
  };
  const begin = () => {
    cancel();
    setFilling(true);
    timer.current = window.setTimeout(() => {
      setFilling(false);
      timer.current = null;
      onActivate();
    }, ms);
  };
  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      className={`${className}${filling ? ' filling' : ''}${active ? ' on' : ''}`}
      style={{ ['--ms' as any]: `${ms}ms` }}
      onMouseEnter={begin}
      onMouseLeave={cancel}
      onClick={() => {
        cancel();
        onActivate();
      }}
    >
      <i className="fill" />
      <span>{children}</span>
    </button>
  );
};
