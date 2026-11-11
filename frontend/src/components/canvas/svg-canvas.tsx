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
import { classifyPendingGesture, drawPreview } from "@/lib/gestures";
import { applyResize, applyResizeCenter, findHandleAt } from "@/lib/handles";
import { hitTest } from "@/lib/hit-test";
import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";
import { useViewStore } from "@/stores/use-view-store";

export function SvgCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);

  const elements = useDocumentStore((state) => state.elements);
  const canvas = useDocumentStore((state) => state.canvas);
  const addElement = useDocumentStore((state) => state.addElement);
  const updateElement = useDocumentStore((state) => state.updateElement);
  const setNote = useDocumentStore((state) => state.setNote);

  const selectedId = useInteractionStore((state) => state.selectedId);
  const hoveredId = useInteractionStore((state) => state.hoveredId);
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
  // 同时调用 fitToView 使画布居中并缩放以适配容器。
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const updateRect = () => {
      const rect = svgElement.getBoundingClientRect();
      setCanvasRect(rect);
      // 首次挂载时适配视图：居中画布并选择能显示完整画布的缩放级别
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
   * Left button down: start a pending gesture that may become a click, draw, move, or resize.
   *
   * The gesture is "pending" because we do not yet know whether the user means to select an
   * existing element, draw a new one, move, or resize. The decision is deferred until either the
   * long-press threshold elapses (commit to draw), motion is detected (move or resize), or the
   * button is released (click). Resize is detected immediately if the cursor is on a handle.
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

      setGesture({ kind: "pending", originX: x, originY: y, startedAt: Date.now() });
    },
    [toCanvasPoint, setGesture, selectedId, elements, zoom, contextMenu, inspect],
  );

  /**
   * Mouse move: classify pending gesture and update drawing preview, moving offset, or resize.
   *
   * While the gesture is pending, every move checks whether the long-press threshold has been
   * crossed. Once it has, the gesture commits to drawing and the preview rect tracks the cursor.
   * If the pointer moves over a selected element before the threshold, the gesture becomes a move.
   * If the pointer moves over empty space before the threshold, the pending state is cancelled.
   * During a resize gesture, the element's dimensions are updated live based on cursor position.
   */
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const { x, y } = toCanvasPoint(event.clientX, event.clientY);
      setCursor({ x, y });

      if (gesture.kind === "pending") {
        const distance = Math.hypot(x - gesture.originX, y - gesture.originY);
        // Check if the cursor is over the currently selected element to decide between move and cancel.
        const isOverSelection = selectedId !== null && hitTest(elements, x, y) === selectedId;
        // Check if the cursor is on a resize handle of the selected element.
        let handleUnderCursor: ReturnType<typeof findHandleAt> = null;
        if (selectedId !== null) {
          const selectedElement = elements.find((el) => el.id === selectedId);
          if (selectedElement) {
            handleUnderCursor = findHandleAt(selectedElement, x, y, zoom);
          }
        }
        const classification = classifyPendingGesture(gesture.startedAt, Date.now(), distance, isOverSelection, handleUnderCursor);
        if (classification.kind === "commit-to-draw") {
          const preview = drawPreview(gesture.originX, gesture.originY, x, y);
          setGesture({ kind: "drawing", originX: gesture.originX, originY: gesture.originY, current: preview });
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
        } else if (classification.kind === "start-moving" && selectedId !== null) {
          // Find the element being moved to capture its starting position.
          const element = elements.find((el) => el.id === selectedId);
          if (element) {
            setGesture({
              kind: "moving",
              id: selectedId,
              startX: gesture.originX,
              startY: gesture.originY,
              offset: { dx: 0, dy: 0 },
            });
          }
        } else if (classification.kind === "cancel-to-click") {
          setGesture({ kind: "idle" });
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
    [toCanvasPoint, setCursor, gesture, setGesture, selectedId, elements, zoom],
  );

  /**
   * Left button up: commit the gesture to either a click, a new element, a moved element, or a
   * resized element.
   *
   * If the gesture was still pending (quick release without motion), this is a click. Hit testing
   * determines which element (if any) was under the cursor and selects it. If the gesture was
   * drawing, the preview rectangle becomes a new element. If the gesture was moving, the offset
   * is committed to the element's position. If the gesture was resizing, the new dimensions are
   * committed. If the gesture was cancelled (too much motion before threshold over empty space),
   * it is treated as a click with no selection change.
   */
  const handleMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.left) return;

      if (gesture.kind === "pending") {
        // Quick release without motion or long-press: a click. Hit test to find what was clicked.
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
          addElement({
            id,
            name: "",
            x: current.x,
            y: current.y,
            width: current.width,
            height: current.height,
            fill: { color: "#E2E8F0", opacity: 1 },
            border: { width: 1, style: "solid", color: "#64748B", radius: 0 },
            note: null,
            locked: false,
            visible: true,
            stamp: isStamp,
          });
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
   * Middle-button down: start panning.
   *
   * Panning is a separate gesture from drawing/moving/resizing. It does not go through the pending
   * arbitration because the middle button has no other purpose on the canvas.
   */
  const handleMiddleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.middle) return;
      event.preventDefault();
      setPanning(true);
      // Store the starting position for pan delta calculation. We use a data attribute on the SVG
      // to avoid adding more state to the interaction store for a transient gesture.
      svgRef.current?.setAttribute("data-pan-start-x", String(event.clientX));
      svgRef.current?.setAttribute("data-pan-start-y", String(event.clientY));
    },
    [setPanning],
  );

  /**
   * Middle-button move: update pan position.
   *
   * The pan delta is computed from the cursor movement since the last frame. This is a screen-space
   * translation, so it does not depend on zoom.
   */
  const handleMiddleMouseMove = useCallback(
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
   * Middle-button up: stop panning.
   */
  const handleMiddleMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.middle) return;
      setPanning(false);
    },
    [setPanning],
  );

  return (
    <>
    <svg
      ref={svgRef}
      data-testid="mogong-canvas"
      className="h-full w-full touch-none select-none"
      style={{
        background: "#E8EDF4",
        cursor: isPanning ? "grabbing" : "grab",
      }}
      // Blocking the browser default stops Ctrl-wheel page zoom, which would otherwise fire during
      // a zoom gesture and take the user's place in the tab.
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onMouseDown={(event) => {
        handleMouseDown(event);
        handleMiddleMouseDown(event);
      }}
      onMouseMove={(event) => {
        handleMouseMove(event);
        handleMiddleMouseMove(event);
      }}
      onMouseUp={(event) => {
        handleMouseUp(event);
        handleMiddleMouseUp(event);
      }}
      onMouseLeave={() => {
        setCursor(null);
        if (gesture.kind !== "idle") setGesture({ kind: "idle" });
        if (isPanning) setPanning(false);
      }}
    >
      <defs>
        {/* Grid pattern removed per Captain feedback. Axis markers rendered at edges instead. */}
      </defs>

      {/* Untransformed so it always fills the viewport. Putting the backdrop inside the pan group
          would leave a dark gap at the edges once zoomed out, because its extent is written in
          canvas units while the visible area is not. */}
      <rect x={0} y={0} width="100%" height="100%" fill="#E8EDF4" />

      {/* X/Y axis markers at 100px intervals, rendered outside the transform group so they stay
          fixed relative to the canvas edges. */}
      <g transform={`translate(${panX} ${panY}) scale(${zoom})`} pointerEvents="none">
        {/* X axis ticks along the top edge */}
        {Array.from({ length: Math.floor(canvas.width / 100) + 1 }, (_, i) => i * 100).map((x) => (
          <g key={`x-${x}`}>
            <line x1={x} y1={0} x2={x} y2={-8 / zoom} stroke="#94A3B8" strokeWidth={1 / zoom} />
            <text x={x} y={-12 / zoom} textAnchor="middle" fill="#64748B" fontSize={10 / zoom}>
              {x}
            </text>
          </g>
        ))}
        {/* Y axis ticks along the left edge */}
        {Array.from({ length: Math.floor(canvas.height / 100) + 1 }, (_, i) => i * 100).map((y) => (
          <g key={`y-${y}`}>
            <line x1={0} y1={y} x2={-8 / zoom} y2={y} stroke="#94A3B8" strokeWidth={1 / zoom} />
            <text x={-12 / zoom} y={y} textAnchor="end" dominantBaseline="middle" fill="#64748B" fontSize={10 / zoom}>
              {y}
            </text>
          </g>
        ))}
      </g>

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
          stroke="#94A3B8"
          strokeWidth={1 / zoom}
          pointerEvents="none"
        />

        {elements.map((element) => {
          // During a move gesture, render the moving element at its live position (original + offset).
          // During a resize gesture, render the resizing element at its live dimensions.
          // The offset/dimensions are not committed to the store until mouse up, so the store
          // position is stale during the gesture.
          let liveElement = element;
          if (gesture.kind === "moving" && gesture.id === element.id) {
            liveElement = { ...element, x: element.x + gesture.offset.dx, y: element.y + gesture.offset.dy };
          } else if (gesture.kind === "resizing" && gesture.id === element.id) {
            liveElement = {
              ...element,
              x: gesture.current.x,
              y: gesture.current.y,
              width: gesture.current.width,
              height: gesture.current.height,
            };
          }
          return (
            <Rectangle
              key={element.id}
              element={liveElement}
              selected={element.id === selectedId}
              hovered={element.id === hoveredId}
              zoom={zoom}
              onDoubleClick={() => {
                if (!element.locked) {
                  beginNoteEditing(element.id);
                }
              }}
            />
          );
        })}

        {/* Drawing preview: dashed outline that tracks the cursor during a long-press draw. */}
        {gesture.kind === "drawing" && (
          <rect
            data-testid="drawing-preview"
            x={gesture.current.x}
            y={gesture.current.y}
            width={gesture.current.width}
            height={gesture.current.height}
            fill="none"
            stroke="#3B82F6"
            strokeWidth={2 / zoom}
            strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        )}
      </g>
    </svg>

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
