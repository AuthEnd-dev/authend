import { Tooltip } from "@base-ui/react/tooltip";
import * as React from "react";
import { cn } from "../../lib/utils";

export interface TooltipProps extends Tooltip.Root.Props {
  content: React.ReactNode;
  children: React.ReactElement;
  contentClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}

export function TooltipComponent({
  children,
  content,
  contentClassName,
  side = "top",
  sideOffset = 8,
  ...props
}: TooltipProps) {
  return (
    <Tooltip.Provider delay={200}>
      <Tooltip.Root {...props}>
        <Tooltip.Trigger render={children} />
        <Tooltip.Portal>
          <Tooltip.Positioner side={side} sideOffset={sideOffset}>
            <Tooltip.Popup
              className={cn(
                "z-50 overflow-hidden rounded-md bg-neutral-900 px-2 py-1 text-xs text-neutral-50 shadow-md animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:bg-neutral-50 dark:text-neutral-900",
                contentClassName
              )}
            >
              {content}
              <Tooltip.Arrow className="fill-neutral-900 dark:fill-neutral-50" />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
