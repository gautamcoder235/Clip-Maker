/**
 * Canva-style multi-point snapping with alignment guides.
 * Supports: center, edges, thirds, quarter lines, and element-to-element snapping.
 */

export interface GuideLine {
  axis: "v" | "h";       // vertical or horizontal
  position: number;       // px position on the canvas
  label?: string;         // optional label (e.g. "Center", "⅓")
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

  // Stronger threshold for canvas borders to feel like a magnet pulling it to the edge
  const borderThreshold = 12;

  // Vertical snap points (x-axis): edges, center, thirds, quarters
  const vSnaps: { pos: number; label: string }[] = [
    { pos: 0, label: "Left Edge" },
    { pos: canvasWidth, label: "Right Edge" },
    { pos: canvasCenterX, label: "Center" },
    { pos: thirdW, label: "⅓" },
    { pos: thirdW * 2, label: "⅔" },
    { pos: quarterW, label: "¼" },
    { pos: quarterW * 3, label: "¾" },
  ];

  // Horizontal snap points (y-axis): edges, center, thirds, quarters
  const hSnaps: { pos: number; label: string }[] = [
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
      { pos: elLeft, label: "" },
      { pos: elRight, label: "" },
      { pos: elCenterX, label: "" }
    );
    hSnaps.push(
      { pos: elTop, label: "" },
      { pos: elBottom, label: "" },
      { pos: elCenterY, label: "" }
    );
  }

  // Test all 3 reference edges of the dragged box against each vertical snap point
  let bestVDist = 9999;
  let bestVSnap: { pos: number; label: string; edge: "left" | "center" | "right" } | null = null;

  for (const vp of vSnaps) {
    const isBorder = (vp.pos === 0 || vp.pos === canvasWidth);
    const activeThreshold = isBorder ? borderThreshold : threshold;

    // Box left edge
    const dLeft = Math.abs(boxLeft - vp.pos);
    if (dLeft < activeThreshold && dLeft < bestVDist) {
      bestVDist = dLeft;
      bestVSnap = { ...vp, edge: "left" };
    }
    // Box center
    const dCenter = Math.abs(boxCenterX - vp.pos);
    if (dCenter < activeThreshold && dCenter < bestVDist) {
      bestVDist = dCenter;
      bestVSnap = { ...vp, edge: "center" };
    }
    // Box right edge
    const dRight = Math.abs(boxRight - vp.pos);
    if (dRight < activeThreshold && dRight < bestVDist) {
      bestVDist = dRight;
      bestVSnap = { ...vp, edge: "right" };
    }
  }

  if (bestVSnap) {
    if (bestVSnap.edge === "left") {
      snapX = bestVSnap.pos;
    } else if (bestVSnap.edge === "center") {
      snapX = bestVSnap.pos - width / 2;
    } else {
      snapX = bestVSnap.pos - width;
    }
    guides.push({ axis: "v", position: bestVSnap.pos, label: bestVSnap.label });
  }

  // Test all 3 reference edges of the dragged box against each horizontal snap point
  let bestHDist = 9999;
  let bestHSnap: { pos: number; label: string; edge: "top" | "center" | "bottom" } | null = null;

  for (const hp of hSnaps) {
    const isBorder = (hp.pos === 0 || hp.pos === canvasHeight);
    const activeThreshold = isBorder ? borderThreshold : threshold;

    // Box top edge
    const dTop = Math.abs(boxTop - hp.pos);
    if (dTop < activeThreshold && dTop < bestHDist) {
      bestHDist = dTop;
      bestHSnap = { ...hp, edge: "top" };
    }
    // Box center
    const dCenter = Math.abs(boxCenterY - hp.pos);
    if (dCenter < activeThreshold && dCenter < bestHDist) {
      bestHDist = dCenter;
      bestHSnap = { ...hp, edge: "center" };
    }
    // Box bottom edge
    const dBottom = Math.abs(boxBottom - hp.pos);
    if (dBottom < activeThreshold && dBottom < bestHDist) {
      bestHDist = dBottom;
      bestHSnap = { ...hp, edge: "bottom" };
    }
  }

  if (bestHSnap) {
    if (bestHSnap.edge === "top") {
      snapY = bestHSnap.pos;
    } else if (bestHSnap.edge === "center") {
      snapY = bestHSnap.pos - height / 2;
    } else {
      snapY = bestHSnap.pos - height;
    }
    guides.push({ axis: "h", position: bestHSnap.pos, label: bestHSnap.label });
  }

  return { x: snapX, y: snapY, guides };
}
