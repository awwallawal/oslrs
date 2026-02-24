import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, Loader2 } from 'lucide-react';
import { nativeFormSchema } from '@oslsr/types';
import type { NativeFormSchema } from '@oslsr/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { SkeletonForm } from '../../../components/skeletons';
import { useNativeFormSchema, useUpdateNativeFormSchema, usePublishNativeForm } from '../hooks/useQuestionnaires';
import { useToast } from '../../../hooks/useToast';
import { FormSettingsTab } from '../components/FormSettingsTab';
import { SectionsTab } from '../components/SectionsTab';
import { ChoiceListsTab } from '../components/ChoiceListsTab';
import { PreviewTab } from '../components/PreviewTab';

export default function FormBuilderPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();

  const { data, isLoading, isError } = useNativeFormSchema(formId!);
  const updateSchema = useUpdateNativeFormSchema();
  const publishForm = usePublishNativeForm();

  const [localSchema, setLocalSchema] = useState<NativeFormSchema | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  // Initialize local state from fetched data
  useEffect(() => {
    if (data?.data && !localSchema) {
      setLocalSchema(data.data);
    }
  }, [data, localSchema]);

  // Warn before leaving with unsaved changes (browser navigation)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Guard in-app navigation (back button, links)
  const handleBack = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave without saving?')) {
      return;
    }
    navigate('/dashboard/super-admin/questionnaires');
  }, [hasUnsavedChanges, navigate]);

  const handleSchemaChange = useCallback((updates: Partial<NativeFormSchema>) => {
    setLocalSchema((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!localSchema || !formId) return;

    // Check for duplicate question names
    const allNames = localSchema.sections.flatMap(s => s.questions.map(q => q.name)).filter(Boolean);
    const duplicates = [...new Set(allNames.filter((name, i) => allNames.indexOf(name) !== i))];
    if (duplicates.length > 0) {
      showError({ message: `Duplicate question names: ${duplicates.join(', ')}` });
      return;
    }

    // Client-side validation
    const result = nativeFormSchema.safeParse(localSchema);
    if (!result.success) {
      const firstError = result.error.issues[0];
      showError({ message: `Validation: ${firstError.path.join('.')} - ${firstError.message}` });
      return;
    }

    updateSchema.mutate(
      { formId, schema: localSchema },
      { onSuccess: () => setHasUnsavedChanges(false) }
    );
  }, [localSchema, formId, updateSchema, showError]);

  const handlePublish = useCallback(() => {
    if (!formId) return;

    // Save first if there are unsaved changes
    if (hasUnsavedChanges && localSchema) {
      const result = nativeFormSchema.safeParse(localSchema);
      if (!result.success) {
        const firstError = result.error.issues[0];
        showError({ message: `Validation: ${firstError.path.join('.')} - ${firstError.message}` });
        return;
      }
      updateSchema.mutate(
        { formId, schema: localSchema },
        {
          onSuccess: () => {
            setHasUnsavedChanges(false);
            publishForm.mutate(formId, {
              onSuccess: () => {
                setLocalSchema((prev) => prev ? { ...prev, status: 'published' } : prev);
              },
            });
          },
        }
      );
    } else {
      publishForm.mutate(formId, {
        onSuccess: () => {
          setLocalSchema((prev) => prev ? { ...prev, status: 'published' } : prev);
        },
      });
    }

    setShowPublishDialog(false);
  }, [formId, hasUnsavedChanges, localSchema, updateSchema, publishForm, showError]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <SkeletonForm fields={3} />
      </div>
    );
  }

  if (isError || !localSchema) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-neutral-600">Failed to load form schema.</p>
        <button
          onClick={() => navigate('/dashboard/super-admin/questionnaires')}
          className="mt-4 text-primary-600 hover:text-primary-700 text-sm"
        >
          Back to Questionnaires
        </button>
      </div>
    );
  }

  const readOnly = localSchema.status !== 'draft';
  const isSaving = updateSchema.isPending;
  const isPublishing = publishForm.isPending;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded"
            title="Back to Questionnaires"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              {localSchema.title || 'Untitled Form'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={readOnly ? 'default' : 'secondary'}>
                {localSchema.status}
              </Badge>
              {hasUnsavedChanges && (
                <span className="text-xs text-amber-600">Unsaved changes</span>
              )}
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowPublishDialog(true)}
              disabled={isPublishing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        )}
      </div>

      {readOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This form is published. Create a new version to make changes.
        </div>
      )}

      {/* Tab Content */}
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="choices">Choices</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4">
          <FormSettingsTab
            schema={localSchema}
            onChange={handleSchemaChange}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="sections" className="mt-4">
          <SectionsTab
            schema={localSchema}
            onChange={handleSchemaChange}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="choices" className="mt-4">
          <ChoiceListsTab
            schema={localSchema}
            onChange={handleSchemaChange}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <PreviewTab schema={localSchema} formId={formId} />
        </TabsContent>
      </Tabs>

      {/* Publish Confirmation Dialog */}
      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish form?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing makes this form available for data collection. Published forms cannot be edited.
              {hasUnsavedChanges && ' Unsaved changes will be saved before publishing.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} className="bg-primary-600 hover:bg-primary-700">
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
