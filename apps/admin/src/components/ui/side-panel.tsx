import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";

export interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function SidePanel({ isOpen, onClose, title, children, footer }: SidePanelProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <button 
        className="absolute inset-0 bg-background/60 backdrop-blur-[2px] w-full h-full cursor-default border-none outline-none animate-in fade-in duration-200" 
        onClick={onClose}
        aria-label="Close panel"
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-[650px] h-full bg-card border-l border-border/60 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out z-10">
        
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0 bg-background/50 backdrop-blur z-10 sticky top-0">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:bg-muted/60 transition-colors">
            <X className="w-4 h-4" />
          </Button>
        </header>
        
        <div className="flex-1 overflow-auto relative">
          <div className="p-6">
            {children}
          </div>
        </div>

        {footer && (
          <footer className="px-6 py-4 border-t border-border/50 bg-background/50 backdrop-blur shrink-0 sticky bottom-0 z-10">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
