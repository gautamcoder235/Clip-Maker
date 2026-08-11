/**
 * Canva / Figma-style multi-point snapping with alignment guides.
 * Supports: center, edges, thirds, quarter lines, element-to-element snapping,
 * equal gap spacing, and multi-line visual feedback.
 */

export interface GuideLine {
  axis: "v" | "h";       // vertical or horizontal
  position: number;      // px position on the canvas
  label?: string;        // optional label (e.g. "Center", "⅓", "Align Edge", "24px gap")
  start?: number;        // start px on perpendicular axis
  end?: number;          // end px on perpendicular axis
}

export interface SnapResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

export interface SnapTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;             // identifier so we can exclude the active element
}

export function checkSnapping(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  threshold: number = 6,
  otherElements: SnapTarget[] = []
): SnapResult {
  let snapX = x;
  let snapY = y;
  const guides: GuideLine[] = [];

  // Dragged element edges & center
  const boxLeft = x;
  const boxRight = x + width;
  const boxCenterX = x + width / 2;
  const boxTop = y;
  const boxBottom = y + height;
  const boxCenterY = y + height / 2;

  // ----- Canvas reference lines -----
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;
  const thirdW = canvasWidth / 3;
  const thirdH = canvasHeight / 3;
  const quarterW = canvasWidth / 4;
  const quarterH = canvasHeight / 4;

  const borderThreshold = 12;

  // Vertical candidate snap targets (x-axis)
  const vSnaps: { pos: number; label: string; id?: string }[] = [
    { pos: 0, label: "Left Edge" },
    { pos: canvasWidth, label: "Right Edge" },
    { pos: canvasCenterX, label: "Center" },
    { pos: thirdW, label: "⅓" },
    { pos: thirdW * 2, label: "⅔" },
    { pos: quarterW, label: "¼" },
    { pos: quarterW * 3, label: "¾" },
  ];

  // Horizontal candidate snap targets (y-axis)
  const hSnaps: { pos: number; label: string; id?: string }[] = [
    { pos: 0, label: "Top Edge" },
    { pos: canvasHeight, label: "Bottom Edge" },
    { pos: canvasCenterY, label: "Center" },
    { pos: thirdH, label: "⅓" },
    { pos: thirdH * 2, label: "⅔" },
    { pos: quarterH, label: "¼" },
    { pos: quarterH * 3, label: "¾" },
  ];

  // Add element-to-element snap points from other elements
  for (const el of otherElements) {
    const elLeft = el.x;
    const elRight = el.x + el.width;
    const elCenterX = el.x + el.width / 2;
    const elTop = el.y;
    const elBottom = el.y + el.height;
    const elCenterY = el.y + el.height / 2;

    vSnaps.push(
      { pos: elLeft, label: "Align Left", id: el.id },
      { pos: elRight, label: "Align Right", id: el.id },
      { pos: elCenterX, label: "Align Center", id: el.id }
    );
    hSnaps.push(
      { pos: elTop, label: "Align Top", id: el.id },
      { pos: elBottom, label: "Align Bottom", id: el.id },
      { pos: elCenterY, label: "Align Middle", id: el.id }
    );
  }

  // --- Equal Gap Spacing Snapping (X-axis & Y-axis) ---
  // Check for equal horizontal spacing between other elements
  if (otherElements.length >= 2) {
    for (let i = 0; i < otherElements.length; i++) {
      for (let j = i + 1; j < otherElements.length; j++) {
        const elA = otherElements[i];
        const elB = otherElements[j];

        // Ensure elA is to the left of elB
        const leftEl = elA.x < elB.x ? elA : elB;
        const rightEl = elA.x < elB.x ? elB : elA;
        const gap = rightEl.x - (leftEl.x + leftEl.width);

        if (gap > 0) {
          // Case 1: Dragged box is positioned between leftEl and rightEl
          const targetX1 = leftEl.x + leftEl.width + gap;
          vSnaps.push({ pos: targetX1, label: `${Math.round(gap)}px gap` });

          // Case 2: Dragged box is positioned to the right of rightEl
          const targetX2 = rightEl.x + rightEl.width + gap;
          vSnaps.push({ pos: targetX2, label: `${Math.round(gap)}px gap` });

          // Case 3: Dragged box is positioned to the left of leftEl
          const targetX3 = leftEl.x - gap - width;
          vSnaps.push({ pos: targetX3, label: `${Math.round(gap)}px gap` });
        }

        const topEl = elA.y < elB.y ? elA : elB;
        const bottomEl = elA.y < elB.y ? elB : elA;
        const vGap = bottomEl.y - (topEl.y + topEl.height);

        if (vGap > 0) {
          const targetY1 = topEl.y + topEl.height + vGap;
          hSnaps.push({ pos: targetY1, label: `${Math.round(vGap)}px gap` });

          const targetY2 = bottomEl.y + bottomEl.height + vGap;
          hSnaps.push({ pos: targetY2, label: `${Math.round(vGap)}px gap` });

          const targetY3 = topEl.y - vGap - height;
          hSnaps.push({ pos: targetY3, label: `${Math.round(vGap)}px gap` });
        }
      }
    }
  }

  // --- Vertical Snapping (X-axis) ---
  let bestVDist = 9999;
  let bestVSnaps: { pos: number; label: string; edge: "left" | "center" | "right" }[] = [];

  for (const vp of vSnaps) {
    const isBorder = (vp.pos === 0 || vp.pos === canvasWidth);
    const activeThreshold = isBorder ? borderThreshold : threshold;

    const testEdges: { diff: number; edge: "left" | "center" | "right" }[] = [
      { diff: Math.abs(boxLeft - vp.pos), edge: "left" },
      { diff: Math.abs(boxCenterX - vp.pos), edge: "center" },
      { diff: Math.abs(boxRight - vp.pos), edge: "right" },
    ];

    for (const te of testEdges) {
      if (te.diff < activeThreshold) {
        if (te.diff < bestVDist - 0.5) {
          // Found a strictly closer snap point
          bestVDist = te.diff;
          bestVSnaps = [{ ...vp, edge: te.edge }];
        } else if (Math.abs(te.diff - bestVDist) <= 0.5) {
          // Found a secondary snap line at the same distance
          bestVSnaps.push({ ...vp, edge: te.edge });
        }
      }
    }
  }

  if (bestVSnaps.length > 0) {
    const primary = bestVSnaps[0];
    if (primary.edge === "left") {
      snapX = primary.pos;
    } else if (primary.edge === "center") {
      snapX = primary.pos - width / 2;
    } else {
      snapX = primary.pos - width;
    }

    const addedPos = new Set<number>();
    for (const snap of bestVSnaps) {
      if (!addedPos.has(snap.pos)) {
        addedPos.add(snap.pos);
        guides.push({ axis: "v", position: snap.pos, label: snap.label });
      }
    }
  }

  // --- Horizontal Snapping (Y-axis) ---
  let bestHDist = 9999;
  let bestHSnaps: { pos: number; label: string; edge: "top" | "center" | "bottom" }[] = [];

  for (const hp of hSnaps) {
    const isBorder = (hp.pos === 0 || hp.pos === canvasHeight);
    const activeThreshold = isBorder ? borderThreshold : threshold;

    const testEdges: { diff: number; edge: "top" | "center" | "bottom" }[] = [
      { diff: Math.abs(boxTop - hp.pos), edge: "top" },
      { diff: Math.abs(boxCenterY - hp.pos), edge: "center" },
      { diff: Math.abs(boxBottom - hp.pos), edge: "bottom" },
    ];

    for (const te of testEdges) {
      if (te.diff < activeThreshold) {
        if (te.diff < bestHDist - 0.5) {
          bestHDist = te.diff;
          bestHSnaps = [{ ...hp, edge: te.edge }];
        } else if (Math.abs(te.diff - bestHDist) <= 0.5) {
          bestHSnaps.push({ ...hp, edge: te.edge });
        }
      }
    }
  }

  if (bestHSnaps.length > 0) {
    const primary = bestHSnaps[0];
    if (primary.edge === "top") {
      snapY = primary.pos;
    } else if (primary.edge === "center") {
      snapY = primary.pos - height / 2;
    } else {
      snapY = primary.pos - height;
    }

    const addedPos = new Set<number>();
    for (const snap of bestHSnaps) {
      if (!addedPos.has(snap.pos)) {
        addedPos.add(snap.pos);
        guides.push({ axis: "h", position: snap.pos, label: snap.label });
      }
    }
  }

  return { x: snapX, y: snapY, guides };
}

