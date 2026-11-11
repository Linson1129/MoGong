/**
 * Hit testing: which element (if any) is under the cursor?
 *
 * The canvas is a flat list of rectangles rendered in z-order (last element is on top). Hit testing
 * walks the list in reverse so that a click on an overlapping region selects the topmost element,
 * matching what the user sees.
 */

import type { LayoutElement } from "@/types/document";

/**
 * Find the topmost element at the given canvas coordinates.
 *
 * Returns null when no element contains the point. The search walks the element list in reverse
 * because the last element in the array is drawn on top; a click on an overlap must select what
 * the user sees, not what was drawn first.
 */
export function hitTest(elements: LayoutElement[], x: number, y: number): string | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!element.visible) continue;
    // A point on the boundary counts as a hit. The same inclusive rule drives the nesting check
    // in geometry.contains, so a click on an element's edge selects it rather than missing.
    if (
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height
    ) {
      return element.id;
    }
  }
  return null;
}
