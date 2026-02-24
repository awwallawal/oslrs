import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
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
import { QuestionnaireUploadForm } from '../components/QuestionnaireUploadForm';
import { QuestionnaireList } from '../components/QuestionnaireList';
import { useCreateNativeForm } from '../hooks/useQuestionnaires';

export default function QuestionnaireManagementPage() {
  const navigate = useNavigate();
  const createForm = useCreateNativeForm();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFormTitle, setNewFormTitle] = useState('');

  const handleCreateForm = async () => {
    if (!newFormTitle.trim()) return;
    try {
      const result = await createForm.mutateAsync({ title: newFormTitle.trim() });
      setShowCreateDialog(false);
      setNewFormTitle('');
      navigate(`/dashboard/super-admin/questionnaires/builder/${result.data.id}`);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Questionnaire Management</h1>
          <p className="text-neutral-600 mt-1">
            Upload, validate, and manage questionnaire forms.
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Create New Form
        </button>
      </div>

      {/* Upload section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload XLSForm</CardTitle>
          <CardDescription>
            Upload an .xlsx or .xml form definition file. The system validates
            structure and OSLSR schema compliance automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionnaireUploadForm />
        </CardContent>
      </Card>

      {/* List section */}
      <Card>
        <CardHeader>
          <CardTitle>Form Versions</CardTitle>
          <CardDescription>
            All uploaded questionnaire forms and their status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionnaireList />
        </CardContent>
      </Card>

      {/* Create New Form Dialog */}
      <AlertDialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Form</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a title for the new questionnaire form. You can edit all details in the Form Builder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="new-form-title">Form Title</Label>
            <Input
              id="new-form-title"
              value={newFormTitle}
              onChange={(e) => setNewFormTitle(e.target.value)}
              placeholder="e.g. Oyo State Skills Survey"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateForm();
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNewFormTitle('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateForm}
              disabled={!newFormTitle.trim() || createForm.isPending}
              className="bg-primary-600 hover:bg-primary-700"
            >
              {createForm.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
