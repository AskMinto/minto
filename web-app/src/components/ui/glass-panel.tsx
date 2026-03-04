"use client";

import dynamic from "next/dynamic";
import type { ReactNode, CSSProperties, RefObject } from "react";

const LiquidGlass = dynamic(() => import("liquid-glass-react"), { ssr: false });

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  cornerRadius?: number;
  padding?: string;
  blurAmount?: number;
  displacementScale?: number;
  elasticity?: number;
  overLight?: boolean;
  onClick?: () => void;
  mouseContainer?: RefObject<HTMLElement | null> | null;
}

export function GlassPanel({
  children,
  className = "",
  style,
  cornerRadius = 20,
  padding = "0px",
  blurAmount = 0.05,
  displacementScale = 50,
  elasticity = 0.12,
  overLight = true,
  onClick,
  mouseContainer,
}: GlassPanelProps) {
  return (
    <LiquidGlass
      cornerRadius={cornerRadius}
      padding={padding}
      blurAmount={blurAmount}
      displacementScale={displacementScale}
      saturation={130}
      aberrationIntensity={1.5}
      elasticity={elasticity}
      overLight={overLight}
      className={className}
      style={style}
      onClick={onClick}
      mouseContainer={mouseContainer}
    >
      {children}
    </LiquidGlass>
  );
}
