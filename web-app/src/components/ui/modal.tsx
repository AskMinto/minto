"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        className={`bg-[#f2f5ef] rounded-2xl shadow-xl max-h-[85vh] overflow-auto w-full max-w-lg mx-4 ${className ?? ""}`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="font-bold text-minto-text text-lg">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition-colors"
            >
              <X size={16} className="text-minto-text-muted" />
            </button>
          </div>
        )}
        <div className={title ? "px-6 pb-6" : "p-6"}>{children}</div>
      </div>
    </div>
  );
}
