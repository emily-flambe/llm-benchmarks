import type { Model } from '../types';

interface ModelSelectorProps {
  models: Model[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading?: boolean;
}

export default function ModelSelector({
  models,
  selectedIds,
  onSelectionChange,
  loading,
}: ModelSelectorProps) {
  function toggleModel(modelId: string) {
    if (selectedIds.includes(modelId)) {
      // Don't allow deselecting if it's the only one selected
      if (selectedIds.length > 1) {
        onSelectionChange(selectedIds.filter((id) => id !== modelId));
      }
    } else {
      onSelectionChange([...selectedIds, modelId]);
    }
  }

  if (loading) {
    return (
      <div className="model-selector">
        <div className="model-pill loading-pill">Loading models...</div>
      </div>
    );
  }

  if (models.length === 0) {
    return null;
  }

  return (
    <div className="model-selector">
      {models.map((model) => {
        const isSelected = selectedIds.includes(model.id);
        return (
          <button
            key={model.id}
            className={`model-pill ${isSelected ? 'active' : ''}`}
            onClick={() => toggleModel(model.id)}
            type="button"
          >
            {model.display_name}
            {isSelected && <span className="model-check">&#10003;</span>}
          </button>
        );
      })}
    </div>
  );
}
