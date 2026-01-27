import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { QuestionnaireUploadForm } from '../components/QuestionnaireUploadForm';
import { QuestionnaireList } from '../components/QuestionnaireList';

export default function QuestionnaireManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Questionnaire Management</h1>
        <p className="text-neutral-600 mt-1">
          Upload, validate, and manage XLSForm definitions.
        </p>
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
    </div>
  );
}
