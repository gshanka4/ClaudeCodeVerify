import type { LayerType } from "@architectai/shared";

const LAYER_ROW: Record<string, number> = {
  gateway: 0,
  security: 1,
  services: 2,
  cache: 2,
  messaging: 3,
  database: 4,
};

export interface LayoutInput {
  name: string;
  layer: LayerType;
}

export interface LayoutPosition {
  canvasX: number;
  canvasY: number;
}

/** Column layout by layer with horizontal spread within the same row. */
export function layoutServices(services: LayoutInput[]): Map<string, LayoutPosition> {
  const byRow = new Map<number, LayoutInput[]>();
  for (const svc of services) {
    const row = LAYER_ROW[svc.layer] ?? 2;
    const list = byRow.get(row) ?? [];
    list.push(svc);
    byRow.set(row, list);
  }

  const positions = new Map<string, LayoutPosition>();
  const colWidth = 180;
  const rowHeight = 120;
  const baseX = 80;
  const baseY = 60;

  for (const [row, list] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const count = list.length;
    const startX = baseX + Math.max(0, (4 - count) * (colWidth / 2));
    list.forEach((svc, i) => {
      positions.set(svc.name, {
        canvasX: startX + i * colWidth,
        canvasY: baseY + row * rowHeight,
      });
    });
  }

  return positions;
}
