import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import type { Condition, ConditionGroup, ConditionOperator } from '@oslsr/types';
import { conditionOperators } from '@oslsr/types';

interface ConditionBuilderProps {
  value?: Condition | ConditionGroup;
  onChange: (value: Condition | ConditionGroup | undefined) => void;
  availableFields: Array<{ name: string; label: string }>;
  readOnly?: boolean;
}

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not equals',
  greater_than: 'Greater than',
  greater_or_equal: 'Greater or equal',
  less_than: 'Less than',
  less_or_equal: 'Less or equal',
  is_empty: 'Is empty',
  is_not_empty: 'Is not empty',
};

const NO_VALUE_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty'];

function isConditionGroup(val: Condition | ConditionGroup): val is ConditionGroup {
  return 'any' in val || 'all' in val;
}

function getGroupConditions(group: ConditionGroup): Condition[] {
  return group.any ?? group.all ?? [];
}

function getGroupLogic(group: ConditionGroup): 'any' | 'all' {
  return 'any' in group && group.any ? 'any' : 'all';
}

function SingleConditionRow({
  condition,
  onChange,
  onRemove,
  availableFields,
  readOnly,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  availableFields: Array<{ name: string; label: string }>;
  readOnly?: boolean;
}) {
  const hideValue = NO_VALUE_OPERATORS.includes(condition.operator);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={condition.field}
        onValueChange={(field) => onChange({ ...condition, field })}
        disabled={readOnly}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent>
          {availableFields.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              {f.label || f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={(op) => {
          const newOp = op as ConditionOperator;
          const updated = { ...condition, operator: newOp };
          if (NO_VALUE_OPERATORS.includes(newOp)) {
            delete updated.value;
          }
          onChange(updated);
        }}
        disabled={readOnly}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Operator" />
        </SelectTrigger>
        <SelectContent>
          {conditionOperators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hideValue && (
        <Input
          value={condition.value?.toString() ?? ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Value"
          className="w-32"
          disabled={readOnly}
        />
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-neutral-400 hover:text-red-600 rounded"
          title="Remove condition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function ConditionBuilder({ value, onChange, availableFields, readOnly }: ConditionBuilderProps) {
  if (!value) {
    if (readOnly) return null;
    return (
      <button
        type="button"
        onClick={() =>
          onChange({ field: availableFields[0]?.name ?? '', operator: 'equals' as ConditionOperator, value: '' })
        }
        className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Condition
      </button>
    );
  }

  // Single condition
  if (!isConditionGroup(value)) {
    return (
      <div className="space-y-2 rounded-lg border border-neutral-200 p-3 bg-neutral-50">
        <SingleConditionRow
          condition={value}
          onChange={(c) => onChange(c)}
          onRemove={() => onChange(undefined)}
          availableFields={availableFields}
          readOnly={readOnly}
        />
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              const newCondition: Condition = {
                field: availableFields[0]?.name ?? '',
                operator: 'equals',
                value: '',
              };
              onChange({ all: [value, newCondition] });
            }}
            className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-3 h-3" />
            Add another condition
          </button>
        )}
      </div>
    );
  }

  // Condition group
  const logic = getGroupLogic(value);
  const conditions = getGroupConditions(value);

  const updateCondition = (index: number, c: Condition) => {
    const updated = [...conditions];
    updated[index] = c;
    onChange(logic === 'any' ? { any: updated } : { all: updated });
  };

  const removeCondition = (index: number) => {
    const updated = conditions.filter((_, i) => i !== index);
    if (updated.length === 0) {
      onChange(undefined);
    } else if (updated.length === 1) {
      onChange(updated[0]);
    } else {
      onChange(logic === 'any' ? { any: updated } : { all: updated });
    }
  };

  const addCondition = () => {
    const newCondition: Condition = {
      field: availableFields[0]?.name ?? '',
      operator: 'equals',
      value: '',
    };
    const updated = [...conditions, newCondition];
    onChange(logic === 'any' ? { any: updated } : { all: updated });
  };

  const toggleLogic = () => {
    onChange(logic === 'any' ? { all: conditions } : { any: conditions });
  };

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 p-3 bg-neutral-50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-neutral-500">Logic:</span>
        <button
          type="button"
          onClick={toggleLogic}
          disabled={readOnly}
          className="px-2 py-0.5 text-xs font-medium rounded bg-primary-100 text-primary-700 hover:bg-primary-200 disabled:opacity-50"
        >
          {logic === 'any' ? 'ANY (OR)' : 'ALL (AND)'}
        </button>
      </div>
      {conditions.map((condition, index) => (
        <SingleConditionRow
          key={index}
          condition={condition}
          onChange={(c) => updateCondition(index, c)}
          onRemove={() => removeCondition(index)}
          availableFields={availableFields}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={addCondition}
          className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700"
        >
          <Plus className="w-3 h-3" />
          Add Condition
        </button>
      )}
    </div>
  );
}
