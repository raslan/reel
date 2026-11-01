import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useRef } from "react";

interface VirtualRowsProps {
  count: number;
  renderRow: (index: number) => ReactNode;
  keyOf: (index: number) => string;
}

/**
 * Windowed row list (56px rows). The inner box is the full list height, so the
 * scrollbar reflects every row and not just the rendered window. Rows are not
 * animated: in a virtualized list, rows entering and leaving the window while
 * you scroll would each start an enter/exit animation (measured: >100 in half a
 * second of scrolling).
 */
export function VirtualRows({ count, renderRow, keyOf }: VirtualRowsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });
  return (
    <div ref={scrollRef} className="h-full flex-1 overflow-y-auto">
      <div className="relative px-1" style={{ height: virtualizer.getTotalSize() }}>
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
