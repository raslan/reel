import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useRef } from "react";

interface VirtualRowsProps {
  count: number;
  renderRow: (index: number) => ReactNode;
  keyOf: (index: number) => string;
}

/**
 * Windowed row list (56px rows) with FLIP animation on insert/remove/reorder.
 * Rows are positioned with `top` so auto-animate's transform stays free.
 */
export function VirtualRows({ count, renderRow, keyOf }: VirtualRowsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [parentRef] = useAutoAnimate<HTMLDivElement>();
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });
  return (
    <div ref={scrollRef} className="h-full flex-1 overflow-y-auto">
      <div ref={parentRef} className="relative h-full pb-[150px] md:pb-[130px] px-1">
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={keyOf(vi.index)}
            className="absolute left-0 right-0"
            style={{ top: vi.start, height: vi.size }}
          >
            {renderRow(vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
