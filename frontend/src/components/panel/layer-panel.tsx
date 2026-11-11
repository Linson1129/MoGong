/**
 * Layer panel: manages layer CRUD and element assignment.
 *
 * Layers group elements for collective visibility and locking. This panel lets the user create,
 * rename, and delete layers, as well as toggle their visible/locked states. Elements can be
 * assigned to layers via the appearance panel or by dragging in the sidebar (future enhancement).
 */

import { useCallback, useState } from "react";

import { useDocumentStore } from "@/stores/use-document-store";
import type { Layer } from "@/types/document";

export function LayerPanel() {
  const layers = useDocumentStore((state) => state.layers);
  const addLayer = useDocumentStore((state) => state.addLayer);
  const updateLayer = useDocumentStore((state) => state.updateLayer);
  const removeLayer = useDocumentStore((state) => state.removeLayer);
  const elements = useDocumentStore((state) => state.elements);

  const [newLayerName, setNewLayerName] = useState("");

  const handleAddLayer = useCallback(() => {
    const name = newLayerName.trim() || `Layer ${layers.length + 1}`;
    const id = `layer-${Date.now().toString(36)}`;
    addLayer({ id, name, visible: true, locked: false });
    setNewLayerName("");
  }, [newLayerName, layers.length, addLayer]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddLayer();
      }
    },
    [handleAddLayer],
  );

  const getElementCountForLayer = useCallback(
    (layerId: string) => elements.filter((el) => el.layerId === layerId).length,
    [elements],
  );

  const unassignedCount = elements.filter((el) => el.layerId === null).length;

  return (
    <div className="space-y-3 border-t border-slate-800 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Layers
        </h3>
        <span className="text-[10px] text-slate-500">
          {layers.length} layer{layers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Layer list */}
      <div className="space-y-1">
        {/* Unassigned elements indicator */}
        {unassignedCount > 0 && (
          <div className="flex items-center gap-2 rounded bg-slate-800/50 px-2 py-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-600" />
            <span className="flex-1">Unassigned</span>
            <span className="text-slate-500">{unassignedCount}</span>
          </div>
        )}

        {layers.map((layer) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            elementCount={getElementCountForLayer(layer.id)}
            onUpdate={(patch) => updateLayer(layer.id, patch)}
            onDelete={() => removeLayer(layer.id)}
          />
        ))}
      </div>

      {/* Add layer input */}
      <div className="flex gap-1">
        <input
          type="text"
          value={newLayerName}
          onChange={(e) => setNewLayerName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="New layer name..."
          className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={handleAddLayer}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}

interface LayerItemProps {
  layer: Layer;
  elementCount: number;
  onUpdate: (patch: Partial<Omit<Layer, "id">>) => void;
  onDelete: () => void;
}

function LayerItem({ layer, elementCount, onUpdate, onDelete }: LayerItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);

  const handleSave = useCallback(() => {
    const name = editName.trim();
    if (name && name !== layer.name) {
      onUpdate({ name });
    }
    setIsEditing(false);
  }, [editName, layer.name, onUpdate]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSave();
      } else if (event.key === "Escape") {
        setEditName(layer.name);
        setIsEditing(false);
      }
    },
    [handleSave, layer.name],
  );

  return (
    <div
      className={`group flex items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors ${
        !layer.visible ? "bg-slate-800/30 text-slate-500" : "bg-slate-800/50 text-slate-200"
      }`}
    >
      {/* Visibility toggle */}
      <button
        type="button"
        onClick={() => onUpdate({ visible: !layer.visible })}
        className={`flex h-4 w-4 items-center justify-center rounded text-[10px] ${
          layer.visible
            ? "text-slate-400 hover:text-slate-200"
            : "text-slate-600 hover:text-slate-400"
        }`}
        title={layer.visible ? "Hide layer" : "Show layer"}
      >
        {layer.visible ? "👁" : "—"}
      </button>

      {/* Lock toggle */}
      <button
        type="button"
        onClick={() => onUpdate({ locked: !layer.locked })}
        className={`flex h-4 w-4 items-center justify-center rounded text-[10px] ${
          layer.locked
            ? "text-red-400 hover:text-red-300"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title={layer.locked ? "Unlock layer" : "Lock layer"}
      >
        {layer.locked ? "🔒" : "🔓"}
      </button>

      {/* Name (editable) */}
      {isEditing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-200 outline-none focus:border-blue-500"
        />
      ) : (
        <span
          className="flex-1 cursor-pointer truncate hover:underline"
          onClick={() => setIsEditing(true)}
          title="Click to rename"
        >
          {layer.name}
        </span>
      )}

      {/* Element count */}
      <span className="text-[10px] text-slate-500">{elementCount}</span>

      {/* Delete button */}
      <button
        type="button"
        onClick={onDelete}
        className="flex h-4 w-4 items-center justify-center rounded text-[10px] text-slate-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        title="Delete layer"
      >
        ×
      </button>
    </div>
  );
}
