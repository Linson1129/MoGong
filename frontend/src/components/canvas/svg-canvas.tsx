/**
 * The drawing surface.
 *
 * Zoom and pan are applied as a single transform on a wrapper group rather than as a viewBox
 * recomputation. That keeps canvas coordinates independent of the container's measured size, so
 * no ResizeObserver is needed and the numbers the compiler reads are the numbers the user drew.
 *
 * The cost is that everything inside the group scales, including strokes. That is handled where it
 * is visible -- Rectangle divides its chrome widths by the zoom -- rather than by transforming each
 * element back, which would fight the nesting grouping.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ContextMenu } from "./context-menu";
import { NoteEditor } from "./note-editor";
import { Rectangle } from "./rectangle";
import { screenToCanvas } from "@/lib/canvas-coords";
import { MOUSE_BUTTON, STAMP_THRESHOLD } from "@/lib/constants";
import { classifyPendingGesture, drawPreview, isInsideSheet } from "@/lib/gestures";
import { applyResize, applyResizeCenter, findHandleAt } from "@/lib/handles";
import { hitTest } from "@/lib/hit-test";
import { createElementDefaults, useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";
import { useViewStore } from "@/stores/use-view-store";
import type { LayoutElement } from "@/types/document";

export function SvgCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);

  const elements = useDocumentStore((state) => state.elements);
  const canvas = useDocumentStore((state) => state.canvas);
  const addElement = useDocumentStore((state) => state.addElement);
  const updateElement = useDocumentStore((state) => state.updateElement);
  const setNote = useDocumentStore((state) => state.setNote);

  const selectedId = useInteractionStore((state) => state.selectedId);
  const gesture = useInteractionStore((state) => state.gesture);
  const setCursor = useInteractionStore((state) => state.setCursor);
  const setGesture = useInteractionStore((state) => state.setGesture);
  const select = useInteractionStore((state) => state.select);
  const inspect = useInteractionStore((state) => state.inspect);
  const inspectedId = useInteractionStore((state) => state.inspectedId);
  const noteEditingId = useInteractionStore((state) => state.noteEditingId);
  const beginNoteEditing = useInteractionStore((state) => state.beginNoteEditing);
  const endNoteEditing = useInteractionStore((state) => state.endNoteEditing);

  // Context menu state: position and which element it is for. Null when closed.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);

  const zoom = useViewStore((state) => state.zoom);
  const panX = useViewStore((state) => state.panX);
  const panY = useViewStore((state) => state.panY);
  const isPanning = useViewStore((state) => state.isPanning);
  const zoomAt = useViewStore((state) => state.zoomAt);
  const panBy = useViewStore((state) => state.panBy);
  const setPanning = useViewStore((state) => state.setPanning);
  const fitToView = useViewStore((state) => state.fitToView);

  // 画布边界矩形，用于定位备注编辑器。挂载时更新，窗口大小变化时重新计算。
  // fitToView 只在首帧跑一次：它把视角拉回「适配整张纸」，跟着 ResizeObserver 跑的话，窗口
  // 一改尺寸（或侧栏开合）用户自己的缩放和位移就丢了。
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const didFitRef = useRef(false);
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const updateRect = () => {
      const rect = svgElement.getBoundingClientRect();
      setCanvasRect(rect);
      // 首次挂载时适配视图：居中画布并选择能显示完整画布的缩放级别，之后不再干预视角
      if (didFitRef.current) return;
      didFitRef.current = true;
      fitToView(rect.width, rect.height, canvas.width, canvas.height);
    };

    // 使用 ResizeObserver 监听容器大小变化，比 window resize 更精确
    const resizeObserver = new ResizeObserver(() => {
      updateRect();
    });
    resizeObserver.observe(svgElement);

    // 初始调用
    updateRect();

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvas.width, canvas.height, fitToView]);

  /**
   * Screen coordinates to canvas coordinates, through the one shared implementation.
   *
   * Every M2 gesture will convert through this same call, so a rectangle cannot land somewhere
   * other than under the cursor on one path and not another.
   */
  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToCanvas({ clientX, clientY }, { left: rect.left, top: rect.top }, { zoom, panX, panY });
    },
    [zoom, panX, panY],
  );

  /**
   * Seed a viewport pan, from whichever pointer position the drag started at.
   *
   * Two routes reach this: the middle button always, and the left button when the press started off
   * the sheet. One entry point keeps both in the same coordinate space, which is why the anchor is
   * stored on the DOM node instead of being duplicated per button.
   */
  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
      setPanning(true);
      svgRef.current?.setAttribute("data-pan-start-x", String(clientX));
      svgRef.current?.setAttribute("data-pan-start-y", String(clientY));
    },
    [setPanning],
  );

  /**
   * Left button down: start a pending gesture that may become a click, a draw, or a pan.
   *
   * The gesture is "pending" because a press alone does not say whether the button is about to be
   * released (a click, which selects) or moved (a drag). Motion settles it against one fact captured
   * here: whether the press landed on the sheet. On the sheet a drag draws; off it a drag pans the
   * view. There is no clock in that decision any more -- moving an element is Alt+drag, so a plain
   * drag over an element no longer needs to be resolved against a hold duration.
   *
   * Alt/Option + drag: the only way to move something. It takes precedence over drawing and resizing,
   * and on empty space it does nothing, because an Alt press that finds no element has no meaning.
   */
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      // Close the context menu if it is open, regardless of which button was pressed.
      if (contextMenu !== null) {
        setContextMenu(null);
        inspect(null);
      }

      if (event.button !== MOUSE_BUTTON.left) return;
      const { x, y } = toCanvasPoint(event.clientX, event.clientY);

      // Alt/Option + left drag: move the element under the cursor, the only path that moves anything.
      if (event.altKey) {
        const hitId = hitTest(elements, x, y);
        if (hitId !== null) {
          select(hitId);
          setGesture({
            kind: "moving",
            id: hitId,
            startX: x,
            startY: y,
            offset: { dx: 0, dy: 0 },
          });
          return;
        }
        // Alt+click on empty space: do nothing (no drawing).
        return;
      }

      // Check if the press is on a resize handle of the selected element. If so, start resizing
      // immediately without going through the pending state. This is the one gesture that does
      // not need arbitration: the handle is an unambiguous target.
      if (selectedId !== null) {
        const selectedElement = elements.find((el) => el.id === selectedId);
        if (selectedElement) {
          const handle = findHandleAt(selectedElement, x, y, zoom);
          if (handle !== null) {
            setGesture({
              kind: "resizing",
              id: selectedId,
              handle,
              original: { x: selectedElement.x, y: selectedElement.y, width: selectedElement.width, height: selectedElement.height },
              current: { x: selectedElement.x, y: selectedElement.y, width: selectedElement.width, height: selectedElement.height },
            });
            return;
          }
        }
      }

      // What the press started on is recorded for the whole drag, so that pulling off the edge of the
      // paper mid-drag cannot turn a draw into a pan (or the reverse) underneath the user.
      setGesture({
        kind: "pending",
        originX: x,
        originY: y,
        overSheet: isInsideSheet(x, y, canvas.width, canvas.height),
      });
    },
    [toCanvasPoint, setGesture, selectedId, elements, zoom, canvas.width, canvas.height, contextMenu, inspect, select],
  );

  /**
   * Mouse move: settle a pending gesture, then track the drawing preview, the move offset, or the
   * resize.
   *
   * A pending gesture resolves on travel alone, measured in SCREEN pixels: the canvas-unit distance
   * times the zoom. Comparing the raw canvas distance to a 3-pixel threshold is what made drawing
   * impossible at low zoom, where 3 canvas units is two thirds of a pixel and no hand holds still that
   * long. Past the threshold, a press that started on the sheet draws and one that started off it
   * pans. Below the threshold nothing happens yet, so the release can still be a click.
   */
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const { x, y } = toCanvasPoint(event.clientX, event.clientY);
      setCursor({ x, y });

      if (gesture.kind === "pending") {
        const distancePx = Math.hypot(x - gesture.originX, y - gesture.originY) * zoom;
        // Check if the cursor is on a resize handle of the selected element.
        let handleUnderCursor: ReturnType<typeof findHandleAt> = null;
        if (selectedId !== null) {
          const selectedElement = elements.find((el) => el.id === selectedId);
          if (selectedElement) {
            handleUnderCursor = findHandleAt(selectedElement, x, y, zoom);
          }
        }
        const classification = classifyPendingGesture(distancePx, gesture.overSheet, handleUnderCursor);
        if (classification.kind === "commit-to-draw") {
          const preview = drawPreview(gesture.originX, gesture.originY, x, y);
          setGesture({ kind: "drawing", originX: gesture.originX, originY: gesture.originY, current: preview });
        } else if (classification.kind === "start-panning") {
          // The gesture itself is finished as far as the canvas is concerned: from here the view store
          // owns the drag, and the release must not be read as a click that deselects.
          beginPan(event.clientX, event.clientY);
          setGesture({ kind: "idle" });
        } else if (classification.kind === "start-resizing" && selectedId !== null) {
          const element = elements.find((el) => el.id === selectedId);
          if (element) {
            setGesture({
              kind: "resizing",
              id: selectedId,
              handle: classification.handle,
              original: { x: element.x, y: element.y, width: element.width, height: element.height },
              current: { x: element.x, y: element.y, width: element.width, height: element.height },
            });
          }
        }
      } else if (gesture.kind === "drawing") {
        const preview = drawPreview(gesture.originX, gesture.originY, x, y);
        setGesture({ kind: "drawing", originX: gesture.originX, originY: gesture.originY, current: preview });
      } else if (gesture.kind === "moving") {
        // Update the offset for the moving element. The actual position is computed from the
        // element's original position plus this offset, and committed on mouse up.
        const dx = x - gesture.startX;
        const dy = y - gesture.startY;
        setGesture({ ...gesture, offset: { dx, dy } });
      } else if (gesture.kind === "resizing") {
        // Update the resize preview. The actual dimensions are computed from the original rect
        // plus the pointer position, and committed on mouse up.
        // When Alt is held, resize symmetrically from the center anchor.
        const current = event.altKey
          ? applyResizeCenter(gesture.original, gesture.handle, x, y)
          : applyResize(gesture.original, gesture.handle, x, y);
        setGesture({ ...gesture, current });
      }
    },
    [toCanvasPoint, setCursor, gesture, setGesture, selectedId, elements, zoom, beginPan],
  );

  /**
   * Left button up: commit the gesture to a click, a new element, a moved element, or a resized one.
   *
   * If the gesture was still pending (released without travelling), this is a click: hit testing
   * decides what was under the cursor, and a miss on the desk deselects. If it was drawing, the preview
   * rectangle becomes a new element. If it was moving -- only ever reached through Alt+drag -- the
   * offset is committed. If it was resizing, the new dimensions are committed. A drag that became a pan
   * arrives here with an idle gesture, so it changes nothing in the document, selection included.
   */
  const handleMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.left) return;

      if (gesture.kind === "pending") {
        // Released under the motion threshold: a click. Hit test to find what was clicked.
        const { x, y } = toCanvasPoint(event.clientX, event.clientY);
        const hitId = hitTest(elements, x, y);
        select(hitId);
      } else if (gesture.kind === "drawing") {
        const { current } = gesture;
        // Only commit if the rectangle has non-zero area; a click without motion produces a
        // zero-size rect that would be rejected by the backend anyway.
        if (current.width > 0 && current.height > 0) {
          const id = `el-${Date.now().toString(36)}`;
          // If the drawn rectangle is smaller than the stamp threshold, treat it as an icon.
          const isStamp = current.width < STAMP_THRESHOLD.width && current.height < STAMP_THRESHOLD.height;
          // Default fill, border and flags have one owner: `createElementDefaults`. Writing them out
          // here as well is how a new default silently applies to only one of the two paths.
          addElement(
            createElementDefaults(id, {
              x: current.x,
              y: current.y,
              width: current.width,
              height: current.height,
              stamp: isStamp,
            }),
          );
          // Select the newly created element so the user can immediately edit it.
          select(id);
        }
      } else if (gesture.kind === "moving") {
        // Commit the moved position. The element's live position during the drag was computed
        // from its original position plus the gesture offset; now we write it to the store.
        const element = elements.find((el) => el.id === gesture.id);
        if (element) {
          updateElement(gesture.id, {
            x: element.x + gesture.offset.dx,
            y: element.y + gesture.offset.dy,
          });
        }
      } else if (gesture.kind === "resizing") {
        // Commit the resized dimensions. The element's live size during the drag was computed
        // from the original rect plus the cursor position; now we write it to the store.
        updateElement(gesture.id, {
          x: gesture.current.x,
          y: gesture.current.y,
          width: gesture.current.width,
          height: gesture.current.height,
        });
      }
      // For cancelled gestures (motion before threshold over empty space), do nothing: the click
      // is consumed by the gesture arbitration and the selection state is unchanged.

      setGesture({ kind: "idle" });
    },
    [gesture, toCanvasPoint, elements, select, addElement, updateElement, setGesture],
  );

  /**
   * Right-click: show context menu for the element under the cursor.
   *
   * The context menu is independent of selection: right-clicking an element inspects it (opens
   * the menu for that element) but does not change the selection state. This allows the user to
   * delete or edit an element without losing their current selection.
   */
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      event.preventDefault();
      const { x, y } = toCanvasPoint(event.clientX, event.clientY);
      const hitId = hitTest(elements, x, y);
      if (hitId !== null) {
        inspect(hitId);
        setContextMenu({ x: event.clientX, y: event.clientY, elementId: hitId });
      } else {
        inspect(null);
        setContextMenu(null);
      }
    },
    [toCanvasPoint, elements, inspect],
  );

  /**
   * Double-click: open the note editor for the region under the cursor.
   *
   * Delegated to the canvas rather than hung on every Rectangle, because a handler written inline in
   * the map is a fresh function identity on every render, which defeats Rectangle's memo. That made
   * every region re-render on every pointer move while the user was dragging a new one, and it is
   * the part of the drawing path that grows with how much is already on the paper.
   */
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const holder = (event.target as Element).closest("[data-element-id]");
      const id = holder?.getAttribute("data-element-id");
      if (!id) return;
      const element = elements.find((el) => el.id === id);
      // Locked regions refuse here, where the element has already been looked up for other reasons.
      if (!element || element.locked) return;
      beginNoteEditing(id);
    },
    [elements, beginNoteEditing],
  );

  /**
   * Wheel: zoom about the cursor position.
   *
   * The zoom is anchored at the cursor so the content under the pointer stays fixed. This is the
   * expected behaviour in drawing tools: the user is looking at a specific area and wants it to
   * grow, not drift off-screen.
   */
  const handleWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Convert client coordinates to element-local screen coordinates for zoomAt.
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      zoomAt(localX, localY, event.deltaY);
    },
    [zoomAt],
  );

  /**
   * Middle button down: start panning.
   *
   * The middle button has no other purpose on the canvas, so it never waits for arbitration. The left
   * button reaches the same pan only through the pending path, and only when the press started off the
   * sheet, because off the paper there is nothing to draw and the drag has to move the view instead.
   */
  const handlePanMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.middle) return;
      event.preventDefault();
      beginPan(event.clientX, event.clientY);
    },
    [beginPan],
  );

  /**
   * Pan move: shift the view by however far the pointer travelled since the last event.
   *
   * The delta is a screen-space translation, so it does not depend on zoom and the sheet keeps the
   * same speed as the cursor at any scale. Shared by the middle button and a left drag that started on
   * the desk.
   */
  const handlePanMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanning) return;
      const startX = Number(svgRef.current?.getAttribute("data-pan-start-x") ?? 0);
      const startY = Number(svgRef.current?.getAttribute("data-pan-start-y") ?? 0);
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      panBy(dx, dy);
      // Update the start position for the next frame.
      svgRef.current?.setAttribute("data-pan-start-x", String(event.clientX));
      svgRef.current?.setAttribute("data-pan-start-y", String(event.clientY));
    },
    [isPanning, panBy],
  );

  /**
   * Pan end: any button coming up releases the pan, not just the one that started it.
   *
   * The left button can now own a pan, and a user who middle-drags and then taps the left button should
   * not end up with the view still glued to the cursor.
   */
  const handlePanMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.middle && event.button !== MOUSE_BUTTON.left) return;
      setPanning(false);
    },
    [setPanning],
  );

  /**
   * Where the store lags the pointer, show the pointer.
   *
   * A move or resize commits only on mouse up, so `elements` holds the pre-gesture rect while the
   * user is dragging. Rendering that stale copy would leave the selected rectangle sitting still
   * while its handles follow the cursor.
   */
  const liveOf = (element: LayoutElement): LayoutElement => {
    if (gesture.kind === "moving" && gesture.id === element.id) {
      return { ...element, x: element.x + gesture.offset.dx, y: element.y + gesture.offset.dy };
    }
    if (gesture.kind === "resizing" && gesture.id === element.id) {
      return { ...element, ...gesture.current };
    }
    return element;
  };

  return (
    <>
    <svg
      ref={svgRef}
      data-testid="mogong-canvas"
      className="h-full w-full touch-none select-none"
      style={{
        background: "var(--canvas-bg)",
        cursor: isPanning ? "grabbing" : "grab",
      }}
      // Blocking the browser default stops Ctrl-wheel page zoom, which would otherwise fire during
      // a zoom gesture and take the user's place in the tab.
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onMouseDown={(event) => {
        handleMouseDown(event);
        handlePanMouseDown(event);
      }}
      onDoubleClick={handleDoubleClick}
      onMouseMove={(event) => {
        handleMouseMove(event);
        handlePanMouseMove(event);
      }}
      onMouseUp={(event) => {
        handleMouseUp(event);
        handlePanMouseUp(event);
      }}
      onMouseLeave={() => {
        setCursor(null);
        if (gesture.kind !== "idle") setGesture({ kind: "idle" });
        if (isPanning) setPanning(false);
      }}
    >
      {/* Untransformed so it always fills the viewport. Putting the backdrop inside the pan group
          would leave a dark gap at the edges once zoomed out, because its extent is written in
          canvas units while the visible area is not. */}
      <rect x={0} y={0} width="100%" height="100%" fill="var(--canvas-bg)" />

      <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
        <rect
          data-testid="canvas-frame"
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          fill={canvas.background}
        />

        <rect
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          fill="none"
          stroke="var(--canvas-frame)"
          strokeWidth={1 / zoom}
          pointerEvents="none"
        />

        {elements.map((element) => (
          <Rectangle
            key={element.id}
            element={liveOf(element)}
            selected={element.id === selectedId}
            zoom={zoom}
          />
        ))}

        {/* Drawing preview: dashed outline that tracks the cursor from the first move past the
            threshold. It lives in the pan group so it is drawn in canvas units, like the sheet. */}
        {gesture.kind === "drawing" && (
          <rect
            data-testid="drawing-preview"
            x={gesture.current.x}
            y={gesture.current.y}
            width={gesture.current.width}
            height={gesture.current.height}
            fill="none"
            stroke="var(--select)"
            strokeWidth={2 / zoom}
            strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        )}
      </g>
    </svg>

    {/* One ambient shadow for the sheet itself. It used to be an feDropShadow on the sheet rect inside
        the SVG, and that cost a frame every time anything moved: an SVG filter has to rasterize its
        whole region -- the sheet plus its margin, not the part that changed -- so the drawing preview
        paid for the paper's elevation on every pointer move. Measured on a 1512x982 canvas at retina,
        19ms with the filter against 14ms without, while the same sheet in a small test window costs
        4ms, which is why the stutter only ever appeared on a real screen. A CSS box-shadow is a
        composited paint that a preview change never invalidates.

        The offset and blur are screen pixels now, so they no longer divide by the zoom; 12px is the
        CSS blur radius standing in for stdDeviation 6. It paints after the SVG, so a region dragged
        off the edge of the paper sits under the ring of shadow rather than over it -- 22 percent of
        one dark colour across twelve pixels, and cheaper than the filter it replaced. */}
    <div
      aria-hidden
      data-testid="sheet-shadow"
      className="pointer-events-none absolute"
      style={{
        left: panX,
        top: panY,
        width: canvas.width * zoom,
        height: canvas.height * zoom,
        boxShadow: "0 2px 12px var(--sheet-shadow-color)",
        opacity: 0.22,
      }}
    />

    {/* Context menu: rendered outside the SVG so it can use HTML positioning. */}
    {contextMenu !== null && inspectedId !== null && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        elementId={contextMenu.elementId}
        onClose={() => {
          setContextMenu(null);
          inspect(null);
        }}
      />
    )}

    {/* Note editor: rendered outside the SVG so it can use HTML positioning. */}
    {noteEditingId !== null && (() => {
      const editingElement = elements.find((el) => el.id === noteEditingId);
      if (!editingElement) return null;
      return (
        <NoteEditor
          element={editingElement}
          zoom={zoom}
          panX={panX}
          panY={panY}
          canvasRect={canvasRect}
          onSave={(note) => {
            setNote(noteEditingId, note);
            endNoteEditing();
          }}
          onCancel={() => endNoteEditing()}
        />
      );
    })()}
  </>
  );
}
