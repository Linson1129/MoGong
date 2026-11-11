import { describe, expect, it } from "vitest";

import { hitTest } from "@/lib/hit-test";
import type { LayoutElement } from "@/types/document";

function makeElement(id: string, x: number, y: number, width: number, height: number): LayoutElement {
  return {
    id,
    name: "",
    x,
    y,
    width,
    height,
    fill: { color: "#E2E8F0", opacity: 1 },
    border: { width: 1, style: "solid", color: "#64748B", radius: 0 },
    note: null,
    locked: false,
    visible: true,
  };
}

describe("hitTest", () => {
  it("returns null when no elements exist", () => {
    expect(hitTest([], 100, 100)).toBeNull();
  });

  it("returns the id of an element containing the point", () => {
    const elements = [makeElement("a", 0, 0, 100, 100)];
    expect(hitTest(elements, 50, 50)).toBe("a");
  });

  it("returns null when the point is outside all elements", () => {
    const elements = [makeElement("a", 0, 0, 100, 100)];
    expect(hitTest(elements, 150, 150)).toBeNull();
  });

  it("hits an element when the point is on its boundary", () => {
    const elements = [makeElement("a", 0, 0, 100, 100)];
    expect(hitTest(elements, 0, 0)).toBe("a");
    expect(hitTest(elements, 100, 100)).toBe("a");
    expect(hitTest(elements, 0, 100)).toBe("a");
    expect(hitTest(elements, 100, 0)).toBe("a");
  });

  it("returns the topmost element when elements overlap", () => {
    const elements = [
      makeElement("bottom", 0, 0, 200, 200),
      makeElement("top", 50, 50, 100, 100),
    ];
    // Point in the overlap region should hit the top element.
    expect(hitTest(elements, 75, 75)).toBe("top");
    // Point outside the top but inside the bottom should hit the bottom.
    expect(hitTest(elements, 25, 25)).toBe("bottom");
  });

  it("skips invisible elements", () => {
    const elements = [
      { ...makeElement("hidden", 0, 0, 100, 100), visible: false },
      makeElement("visible", 0, 0, 100, 100),
    ];
    expect(hitTest(elements, 50, 50)).toBe("visible");
  });

  it("returns the last matching element in z-order", () => {
    const elements = [
      makeElement("first", 0, 0, 100, 100),
      makeElement("second", 0, 0, 100, 100),
      makeElement("third", 0, 0, 100, 100),
    ];
    expect(hitTest(elements, 50, 50)).toBe("third");
  });
});
