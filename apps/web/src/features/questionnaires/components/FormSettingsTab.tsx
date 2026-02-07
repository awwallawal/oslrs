import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import type { NativeFormSchema } from '@oslsr/types';

interface FormSettingsTabProps {
  schema: NativeFormSchema;
  onChange: (updates: Partial<NativeFormSchema>) => void;
  readOnly: boolean;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  published: 'default',
  closing: 'outline',
  deprecated: 'destructive',
  archived: 'outline',
};

export function FormSettingsTab({ schema, onChange, readOnly }: FormSettingsTabProps) {
  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="form-title">Form Title</Label>
        <Input
          id="form-title"
          value={schema.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Enter form title"
          disabled={readOnly}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="form-version">Version</Label>
        <Input
          id="form-version"
          value={schema.version}
          onChange={(e) => onChange({ version: e.target.value })}
          placeholder="1.0.0"
          disabled={readOnly}
        />
        <p className="text-xs text-neutral-500">Semver format (e.g. 1.0.0)</p>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <div>
          <Badge variant={STATUS_VARIANT[schema.status] ?? 'secondary'}>
            {schema.status}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Created</Label>
        <p className="text-sm text-neutral-600">
          {schema.createdAt ? new Date(schema.createdAt).toLocaleString() : 'N/A'}
        </p>
      </div>

      {schema.publishedAt && (
        <div className="space-y-2">
          <Label>Published</Label>
          <p className="text-sm text-neutral-600">
            {new Date(schema.publishedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
