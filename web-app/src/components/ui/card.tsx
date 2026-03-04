"use client";

import { HTMLAttributes } from "react";
import { clsx } from "clsx";
import { GlassPanel } from "./glass-panel";

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <GlassPanel
      cornerRadius={20}
      padding="20px"
      blurAmount={0.05}
      displacementScale={40}
      elasticity={0.1}
    >
      <div className={clsx(className)} {...props}>
        {children}
      </div>
    </GlassPanel>
  );
}
