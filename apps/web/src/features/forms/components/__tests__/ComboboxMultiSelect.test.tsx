import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

expect.extend(matchers);

import { ComboboxMultiSelect } from '../ComboboxMultiSelect';
import type { FlattenedQuestion } from '../../api/form.api';

afterEach(() => {
  cleanup();
});

// Build a question with 25 choices (above the COMBOBOX_THRESHOLD of 20)
const buildQuestion = (overrides?: Partial<FlattenedQuestion>): FlattenedQuestion => ({
  id: 'q-skills',
  type: 'select_multiple',
  name: 'skills_possessed',
  label: 'Primary Skills (Select all that apply)',
  required: true,
  sectionId: 's5',
  sectionTitle: 'Skills & Business',
  choices: [
    // Construction sector (5)
    { label: 'Bricklaying & Block Work', value: 'bricklaying' },
    { label: 'Carpentry & Joinery', value: 'carpentry' },
    { label: 'Plumbing & Pipe Fitting', value: 'plumbing' },
    { label: 'Electrical Installation', value: 'electrical' },
    { label: 'Welding & Metal Fabrication', value: 'welding' },
    // Automotive sector (3)
    { label: 'Motor Vehicle Mechanic', value: 'auto_mechanic' },
    { label: 'Auto Electrician', value: 'auto_electrician' },
    { label: 'Panel Beating & Spray Painting', value: 'panel_beating' },
    // Fashion sector (3)
    { label: 'Tailoring & Garment Making', value: 'tailoring' },
    { label: 'Fashion Design', value: 'fashion_design' },
    { label: 'Hairdressing & Braiding', value: 'hairdressing' },
    // Food sector (3)
    { label: 'Crop Farming (Arable)', value: 'crop_farming' },
    { label: 'Baking & Confectionery', value: 'baking' },
    { label: 'Catering & Food Preparation', value: 'catering' },
    // Digital sector (3)
    { label: 'Web Development', value: 'web_dev' },
    { label: 'Graphic Design & Branding', value: 'graphic_design' },
    { label: 'Photography & Videography', value: 'photography' },
    // Healthcare (2)
    { label: 'Nursing & Midwifery Assistance', value: 'nursing' },
    { label: 'Pharmacy Technician Services', value: 'pharmacy_tech' },
    // Education (2)
    { label: 'Primary & Secondary School Teaching', value: 'teaching' },
    { label: 'Vocational & Technical Instruction', value: 'vocational_instruction' },
    // Artisan (2)
    { label: 'Blacksmithing (Alagbede)', value: 'blacksmithing' },
    { label: 'Pottery & Ceramics (Amokoko)', value: 'pottery' },
    // Transport (1)
    { label: 'Commercial Driving (Bus/Truck)', value: 'commercial_driving' },
    // Security (1)
    { label: 'Private Security Guard Services', value: 'security_guard' },
  ],
  ...overrides,
});

describe('ComboboxMultiSelect', () => {
  it('renders search input with choice count placeholder', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
      />
    );
    const search = screen.getByTestId('combobox-search-skills_possessed');
    expect(search).toBeInTheDocument();
    expect(search).toHaveAttribute('placeholder', 'Search 25 skills...');
  });

  it('renders the question label and required indicator', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Primary Skills (Select all that apply)')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows dropdown with grouped sectors on focus', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    const dropdown = screen.getByTestId('combobox-dropdown-skills_possessed');
    expect(dropdown).toBeInTheDocument();
    // Check sector headers appear
    expect(within(dropdown).getByText('Construction & Building')).toBeInTheDocument();
    expect(within(dropdown).getByText('Automotive & Mechanical')).toBeInTheDocument();
    expect(within(dropdown).getByText('Fashion, Beauty & Personal Care')).toBeInTheDocument();
  });

  it('filters choices when typing in search', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
      />
    );
    const search = screen.getByTestId('combobox-search-skills_possessed');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'weld' } });

    const dropdown = screen.getByTestId('combobox-dropdown-skills_possessed');
    expect(within(dropdown).getByText('Welding & Metal Fabrication')).toBeInTheDocument();
    // Other skills should not be visible
    expect(within(dropdown).queryByText('Bricklaying & Block Work')).not.toBeInTheDocument();
    expect(within(dropdown).queryByText('Tailoring & Garment Making')).not.toBeInTheDocument();
  });

  it('shows "no match" message when search yields no results', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
      />
    );
    const search = screen.getByTestId('combobox-search-skills_possessed');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'zzzzzzzzz' } });

    const dropdown = screen.getByTestId('combobox-dropdown-skills_possessed');
    expect(within(dropdown).getByText(/No skills match/)).toBeInTheDocument();
  });

  it('selects a skill and shows chip', () => {
    const handleChange = vi.fn();
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={handleChange}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    fireEvent.click(screen.getByTestId('option-skills_possessed-carpentry'));
    expect(handleChange).toHaveBeenCalledWith(['carpentry']);
  });

  it('displays selected values as chips', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['carpentry', 'welding']}
        onChange={vi.fn()}
      />
    );
    const chips = screen.getByTestId('selected-chips');
    expect(within(chips).getByText('Carpentry & Joinery')).toBeInTheDocument();
    expect(within(chips).getByText('Welding & Metal Fabrication')).toBeInTheDocument();
  });

  it('removes a chip when clicking the remove button', () => {
    const handleChange = vi.fn();
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['carpentry', 'welding']}
        onChange={handleChange}
      />
    );
    fireEvent.click(screen.getByTestId('remove-chip-carpentry'));
    expect(handleChange).toHaveBeenCalledWith(['welding']);
  });

  it('deselects from dropdown when clicking a selected option', () => {
    const handleChange = vi.fn();
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['carpentry']}
        onChange={handleChange}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    fireEvent.click(screen.getByTestId('option-skills_possessed-carpentry'));
    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('shows "Add skill not listed" button in dropdown', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    expect(screen.getByTestId('add-custom-skills_possessed')).toBeInTheDocument();
    expect(screen.getByText('Add skill not listed')).toBeInTheDocument();
  });

  it('adds a custom skill via the custom input', () => {
    const handleChange = vi.fn();
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['carpentry']}
        onChange={handleChange}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    // Click "Add skill not listed"
    fireEvent.click(screen.getByTestId('add-custom-skills_possessed'));
    // Type custom skill
    const customInput = screen.getByTestId('custom-input-skills_possessed');
    fireEvent.change(customInput, { target: { value: 'Boat Building' } });
    fireEvent.click(screen.getByTestId('custom-add-btn-skills_possessed'));
    expect(handleChange).toHaveBeenCalledWith(['carpentry', 'custom_boat_building']);
  });

  it('adds a custom skill via Enter key', () => {
    const handleChange = vi.fn();
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={handleChange}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    fireEvent.click(screen.getByTestId('add-custom-skills_possessed'));
    const customInput = screen.getByTestId('custom-input-skills_possessed');
    fireEvent.change(customInput, { target: { value: 'Rope Making' } });
    fireEvent.keyDown(customInput, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith(['custom_rope_making']);
  });

  it('displays custom skill chip with readable label', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['custom_boat_building']}
        onChange={vi.fn()}
      />
    );
    const chips = screen.getByTestId('selected-chips');
    // custom_ prefix stripped and underscores become spaces
    expect(within(chips).getByText('boat building')).toBeInTheDocument();
  });

  it('disables search input when disabled prop is true', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['carpentry']}
        onChange={vi.fn()}
        disabled
      />
    );
    expect(screen.getByTestId('combobox-search-skills_possessed')).toBeDisabled();
    // Chips should not have remove buttons
    expect(screen.queryByTestId('remove-chip-carpentry')).not.toBeInTheDocument();
  });

  it('displays error message', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={[]}
        onChange={vi.fn()}
        error="Please select at least one skill"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Please select at least one skill');
  });

  it('renders Yoruba label when provided', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion({ labelYoruba: 'Kini ogbon re?' })}
        value={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Kini ogbon re?')).toBeInTheDocument();
  });

  it('highlights selected options in dropdown', () => {
    render(
      <ComboboxMultiSelect
        question={buildQuestion()}
        value={['welding']}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('combobox-search-skills_possessed'));
    const option = screen.getByTestId('option-skills_possessed-welding');
    // Selected option should have the checkmark and maroon styling
    expect(option).toHaveClass('bg-[#9C1E23]/5');
    expect(option).toHaveClass('font-medium');
  });
});
