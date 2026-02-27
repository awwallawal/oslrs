/**
 * BulkRecordingForm — Step-based form for recording bulk payments.
 * Story 6.4 AC5: Filter staff, enter batch details, review and confirm.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { Upload } from 'lucide-react';
import StaffSelectionTable from './StaffSelectionTable';
import { formatNaira } from './PaymentBatchTable';
import { useEligibleStaff, useCreatePaymentBatch } from '../hooks/useRemuneration';

interface Lga {
  id: string;
  name: string;
}

interface BulkRecordingFormProps {
  lgas: Lga[];
}

const ROLE_OPTIONS = [
  { value: 'enumerator', label: 'Enumerator' },
  { value: 'supervisor', label: 'Supervisor' },
];

export default function BulkRecordingForm({ lgas }: BulkRecordingFormProps) {
  // Step 1: Staff selection filters
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [lgaFilter, setLgaFilter] = useState<string>('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  // Step 2: Batch details
  const [trancheName, setTrancheName] = useState('');
  const [trancheNumber, setTrancheNumber] = useState('1');
  const [amountNaira, setAmountNaira] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [description, setDescription] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { data: staffData, isLoading: staffLoading } = useEligibleStaff({
    roleFilter: roleFilter && roleFilter !== 'all' ? roleFilter : undefined,
    lgaId: lgaFilter && lgaFilter !== 'all' ? lgaFilter : undefined,
  });

  const createBatch = useCreatePaymentBatch();

  const amountKobo = Math.round(parseFloat(amountNaira || '0') * 100);
  const totalKobo = amountKobo * selectedStaffIds.length;

  const canProceedToStep2 = selectedStaffIds.length > 0;
  const canProceedToStep3 = trancheName.trim() && amountKobo > 0 && trancheNumber;

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReceiptFile(file);
  }, []);

  async function handleSubmit() {
    await createBatch.mutateAsync({
      trancheName,
      trancheNumber: parseInt(trancheNumber, 10),
      amount: amountKobo,
      staffIds: selectedStaffIds,
      bankReference: bankReference || undefined,
      description: description || undefined,
      lgaId: lgaFilter && lgaFilter !== 'all' ? lgaFilter : undefined,
      roleFilter: roleFilter && roleFilter !== 'all' ? roleFilter : undefined,
      receipt: receiptFile || undefined,
    });

    // Reset form
    setSelectedStaffIds([]);
    setTrancheName('');
    setTrancheNumber('1');
    setAmountNaira('');
    setBankReference('');
    setDescription('');
    setReceiptFile(null);
    setStep(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record New Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Staff Selection */}
        {step === 1 && (
          <div data-testid="step-1" className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="role-filter">Role</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger id="role-filter" data-testid="role-filter">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="lga-filter">LGA</Label>
                <Select value={lgaFilter} onValueChange={setLgaFilter}>
                  <SelectTrigger id="lga-filter" data-testid="lga-filter">
                    <SelectValue placeholder="All LGAs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All LGAs</SelectItem>
                    {lgas.map((lga) => (
                      <SelectItem key={lga.id} value={lga.id}>{lga.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <StaffSelectionTable
              staff={staffData?.data || []}
              selectedIds={selectedStaffIds}
              onSelectionChange={setSelectedStaffIds}
              isLoading={staffLoading}
            />

            <div className="flex justify-end">
              <Button
                data-testid="proceed-to-step-2"
                onClick={() => setStep(2)}
                disabled={!canProceedToStep2}
              >
                Next: Enter Payment Details
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Batch Details */}
        {step === 2 && (
          <div data-testid="step-2" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tranche-name">Tranche Name</Label>
                <Input
                  id="tranche-name"
                  data-testid="tranche-name"
                  value={trancheName}
                  onChange={(e) => setTrancheName(e.target.value)}
                  placeholder="e.g. Tranche 1 - February 2026"
                />
              </div>
              <div>
                <Label htmlFor="tranche-number">Tranche Number</Label>
                <Input
                  id="tranche-number"
                  data-testid="tranche-number"
                  type="number"
                  min={1}
                  value={trancheNumber}
                  onChange={(e) => setTrancheNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Amount per Staff (₦)</Label>
                <Input
                  id="amount"
                  data-testid="amount-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amountNaira}
                  onChange={(e) => setAmountNaira(e.target.value)}
                  placeholder="5000.00"
                />
              </div>
              <div>
                <Label htmlFor="bank-reference">Bank Reference</Label>
                <Input
                  id="bank-reference"
                  data-testid="bank-reference"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                data-testid="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="receipt-upload">Receipt Upload (optional)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="receipt-upload"
                  data-testid="receipt-upload"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                {receiptFile && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    {receiptFile.name}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                data-testid="proceed-to-step-3"
                onClick={() => setStep(3)}
                disabled={!canProceedToStep3}
              >
                Next: Review
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && (
          <div data-testid="step-3" className="space-y-4">
            <div className="rounded-md border p-4 bg-muted/30 space-y-2">
              <h3 className="font-semibold">Payment Summary</h3>
              <p><strong>Tranche:</strong> {trancheName} (#{trancheNumber})</p>
              <p><strong>Amount per Staff:</strong> {formatNaira(amountKobo)}</p>
              <p data-testid="staff-count"><strong>Staff Members:</strong> {selectedStaffIds.length}</p>
              <p data-testid="total-amount" className="text-lg font-bold">
                <strong>Total:</strong> {formatNaira(totalKobo)}
              </p>
              {bankReference && <p><strong>Bank Reference:</strong> {bankReference}</p>}
              {description && <p><strong>Description:</strong> {description}</p>}
              {receiptFile && <p><strong>Receipt:</strong> {receiptFile.name}</p>}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                data-testid="confirm-submit"
                onClick={handleSubmit}
                disabled={createBatch.isPending}
              >
                {createBatch.isPending
                  ? 'Recording...'
                  : `Record ${formatNaira(amountKobo)} to ${selectedStaffIds.length} staff`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
