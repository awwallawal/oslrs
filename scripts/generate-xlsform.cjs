const XLSX = require('xlsx');
const path = require('path');

// === SURVEY SHEET ===
const survey = [
  // Header row
  ['type', 'name', 'label', 'required', 'relevant', 'calculation', 'constraint', 'constraint_message'],

  // Metadata
  ['start', 'start_time', '', '', '', '', '', ''],
  ['end', 'end_time', '', '', '', '', '', ''],
  ['deviceid', 'device_id', '', '', '', '', '', ''],
  ['geopoint', 'gps_location', '', '', '', '', '', ''],
  ['calculate', 'form_mode', '', '', '', "once(if(${device_id} != null, 'enumerator', 'public'))", '', ''],

  // Section 1: Introduction & Consent
  ['begin_group', 'grp_intro', 'Introduction & Consent', '', '', '', '', ''],
  ['note', 'note_intro', 'Welcome to the Oyo State Labour & Skills Registry (OSLSR). This survey takes approximately 10 minutes.', '', '', '', '', ''],
  ['select_one yes_no', 'consent_basic', 'Do you consent to participate in this survey?', 'yes', '', '', '', ''],
  ['end_group', '', '', '', '', '', '', ''],

  // Section 2: Identity & Demographics
  ['begin_group', 'grp_identity', 'Identity & Demographics', '', "${consent_basic} = 'yes'", '', '', ''],
  ['text', 'surname', 'Surname', 'yes', '', '', '', ''],
  ['text', 'firstname', 'First Name', 'yes', '', '', '', ''],
  ['select_one gender_list', 'gender', 'Gender', 'yes', '', '', '', ''],
  ['date', 'dob', 'Date of Birth', 'yes', '', '', '. <= today()', 'Cannot be a future date'],
  ['calculate', 'age', '', '', '', 'int((today() - ${dob}) div 365.25)', '', ''],
  ['select_one marital_list', 'marital_status', 'Marital Status', 'yes', '', '', '', ''],
  ['select_one edu_list', 'education_level', 'Highest Education Completed', 'yes', '', '', '', ''],
  ['select_one yes_no', 'disability_status', 'Do you have any disability?', 'yes', '', '', '', ''],
  ['text', 'phone_number', 'Phone Number', 'yes', '', '', "regex(., '^[0][7-9][0-1][0-9]{8}$')", 'Enter a valid Nigerian mobile number'],
  ['text', 'nin', 'National Identity Number (NIN)', 'yes', '', '', "string-length(.) = 11 and regex(., '^[0-9]+$') and modulus11(.)", 'Invalid NIN — please check for typos'],
  ['select_one lga_list', 'lga_id', 'Local Government Area (LGA)', 'yes', '', '', '', ''],
  ['end_group', '', '', '', '', '', '', ''],

  // Section 3: Labour Force Participation
  ['begin_group', 'grp_labor', 'Labour Force Participation', '', '${age} >= 15', '', '', ''],
  ['select_one yes_no', 'employment_status', 'Have you worked for pay or profit in the last 7 days?', 'yes', '', '', '', ''],
  ['select_one yes_no', 'temp_absent', 'Were you temporarily absent from a job?', 'yes', "${employment_status} = 'no'", '', '', ''],
  ['select_one yes_no', 'looking_for_work', 'Have you looked for work in the last 4 weeks?', 'yes', "${temp_absent} = 'no'", '', '', ''],
  ['select_one yes_no', 'available_for_work', 'Are you available to start work within 2 weeks?', 'yes', "${looking_for_work} = 'no'", '', '', ''],
  ['text', 'main_occupation', 'Main Occupation/Job Title', 'yes', "${employment_status} = 'yes' or ${temp_absent} = 'yes'", '', '', ''],
  ['select_one emp_type', 'employment_type', 'Type of Employment', 'yes', "${employment_status} = 'yes' or ${temp_absent} = 'yes'", '', '', ''],
  ['select_one experience_list', 'years_experience', 'Years of Experience in Main Occupation', 'yes', "${employment_status} = 'yes' or ${temp_absent} = 'yes'", '', '', ''],
  ['integer', 'hours_worked', 'Hours worked last week', 'yes', "${employment_status} = 'yes'", '', '. >= 0 and . <= 168', 'Must be between 0 and 168 hours'],
  ['integer', 'monthly_income', 'Estimated Monthly Income (Naira)', 'no', "${employment_status} = 'yes'", '', '. >= 0', 'Cannot be negative'],
  ['end_group', '', '', '', '', '', '', ''],

  // Section 4: Household & Welfare
  ['begin_group', 'grp_household', 'Household & Welfare', '', '', '', '', ''],
  ['select_one yes_no', 'is_head', 'Are you the Head of Household?', 'yes', '', '', '', ''],
  ['integer', 'household_size', 'Total number of people in your household', 'yes', '', '', '. > 0', 'Must be at least 1'],
  ['integer', 'dependents_count', 'Number of dependents (children/elderly)', 'yes', '', '', '. < ${household_size}', 'Cannot exceed household size'],
  ['select_one housing_list', 'housing_status', 'Housing Ownership Status', 'yes', '', '', '', ''],
  ['end_group', '', '', '', '', '', '', ''],

  // Section 5: Skills & Business
  ['begin_group', 'grp_skills', 'Skills & Business', '', '', '', '', ''],
  ['select_multiple skill_list', 'skills_possessed', 'Primary Skills (Select all that apply)', 'yes', '', '', '', ''],
  ['text', 'skills_other', 'Other skills not listed above', 'no', '', '', 'string-length(.) <= 200', 'Maximum 200 characters'],
  ['select_multiple skill_list', 'training_interest', 'Skills you would like to learn', 'no', '', '', '', ''],
  ['select_one yes_no', 'has_business', 'Do you own or operate a business?', 'yes', '', '', '', ''],
  ['text', 'business_name', 'Business Name', 'yes', "${has_business} = 'yes'", '', '', ''],
  ['select_one reg_status', 'business_reg', 'Is your business registered with CAC?', 'yes', "${has_business} = 'yes'", '', '', ''],
  ['text', 'business_address', 'Business Premises Address', 'yes', "${has_business} = 'yes'", '', '', ''],
  ['integer', 'apprentice_count', 'Number of apprentices/trainees/interns', 'no', "${has_business} = 'yes'", '', '. >= 0', 'Cannot be negative'],
  ['end_group', '', '', '', '', '', '', ''],

  // Section 6: Public Skills Marketplace
  ['begin_group', 'grp_marketplace', 'Public Skills Marketplace', '', '', '', '', ''],
  ['note', 'note_marketplace', 'The OSLSR Skills Marketplace connects skilled workers with employers. You can choose to be listed anonymously or share your contact details.', '', '', '', '', ''],
  ['select_one yes_no', 'consent_marketplace', 'Would you like to join the Anonymous Skills Marketplace? (Your profession, LGA, and experience level will be visible)', 'yes', '', '', '', ''],
  ['select_one yes_no', 'consent_enriched', 'Would you like employers to see your Name and Phone Number?', 'yes', "${consent_marketplace} = 'yes'", '', '', ''],
  ['text', 'bio_short', 'Professional Bio (brief description of your work)', 'no', "${consent_enriched} = 'yes'", '', 'string-length(.) <= 150', 'Maximum 150 characters'],
  ['text', 'portfolio_url', 'Portfolio or Social Media Link', 'no', "${consent_enriched} = 'yes'", '', '', ''],
  ['end_group', '', '', '', '', '', '', ''],
];

// === CHOICES SHEET ===
const choices = [
  ['list_name', 'name', 'label'],
  // yes_no
  ['yes_no', 'yes', 'Yes'],
  ['yes_no', 'no', 'No'],
  // gender_list
  ['gender_list', 'male', 'Male'],
  ['gender_list', 'female', 'Female'],
  ['gender_list', 'other', 'Prefer not to say'],
  // marital_list
  ['marital_list', 'single', 'Single'],
  ['marital_list', 'married', 'Married'],
  ['marital_list', 'divorced', 'Divorced'],
  ['marital_list', 'widowed', 'Widowed'],
  ['marital_list', 'separated', 'Separated'],
  // edu_list
  ['edu_list', 'none', 'No Formal Education'],
  ['edu_list', 'primary', 'Primary School'],
  ['edu_list', 'jss', 'Junior Secondary (JSS)'],
  ['edu_list', 'sss', 'Senior Secondary (SSS/WAEC)'],
  ['edu_list', 'vocational', 'Vocational/Technical Training'],
  ['edu_list', 'nce_ond', 'NCE/OND'],
  ['edu_list', 'hnd_bsc', "HND/Bachelor's Degree"],
  ['edu_list', 'masters', "Master's Degree"],
  ['edu_list', 'doctorate', 'Doctorate/PhD'],
  // housing_list
  ['housing_list', 'owned', 'Owned'],
  ['housing_list', 'rented', 'Rented'],
  ['housing_list', 'family', 'Living with Family (Free)'],
  ['housing_list', 'employer', 'Employer-Provided'],
  ['housing_list', 'other', 'Other'],
  // emp_type
  ['emp_type', 'wage_public', 'Wage Earner (Government/Public Sector)'],
  ['emp_type', 'wage_private', 'Wage Earner (Private Sector)'],
  ['emp_type', 'self_employed', 'Self-Employed (Artisan/Trader/Business Owner)'],
  ['emp_type', 'contractor', 'Contractor/Consultant'],
  ['emp_type', 'family_unpaid', 'Unpaid Family Worker'],
  ['emp_type', 'apprentice', 'Apprentice/Intern'],
  // experience_list
  ['experience_list', 'less_1', 'Less than 1 year'],
  ['experience_list', '1_3', '1-3 years'],
  ['experience_list', '4_6', '4-6 years'],
  ['experience_list', '7_10', '7-10 years'],
  ['experience_list', 'over_10', 'Over 10 years'],
  // reg_status
  ['reg_status', 'registered', 'Yes, registered with CAC'],
  ['reg_status', 'unregistered', 'No, not registered'],
  ['reg_status', 'in_progress', 'Registration in progress'],
  // lga_list (33 Oyo State LGAs)
  ['lga_list', 'afijio', 'Afijio'],
  ['lga_list', 'akinyele', 'Akinyele'],
  ['lga_list', 'atiba', 'Atiba'],
  ['lga_list', 'atisbo', 'Atisbo'],
  ['lga_list', 'egbeda', 'Egbeda'],
  ['lga_list', 'ibadan_north', 'Ibadan North'],
  ['lga_list', 'ibadan_ne', 'Ibadan North-East'],
  ['lga_list', 'ibadan_nw', 'Ibadan North-West'],
  ['lga_list', 'ibadan_se', 'Ibadan South-East'],
  ['lga_list', 'ibadan_sw', 'Ibadan South-West'],
  ['lga_list', 'ibarapa_central', 'Ibarapa Central'],
  ['lga_list', 'ibarapa_east', 'Ibarapa East'],
  ['lga_list', 'ibarapa_north', 'Ibarapa North'],
  ['lga_list', 'ido', 'Ido'],
  ['lga_list', 'irepo', 'Irepo'],
  ['lga_list', 'iseyin', 'Iseyin'],
  ['lga_list', 'itesiwaju', 'Itesiwaju'],
  ['lga_list', 'iwajowa', 'Iwajowa'],
  ['lga_list', 'kajola', 'Kajola'],
  ['lga_list', 'lagelu', 'Lagelu'],
  ['lga_list', 'ogbomoso_north', 'Ogbomosho North'],
  ['lga_list', 'ogbomoso_south', 'Ogbomosho South'],
  ['lga_list', 'ogo_oluwa', 'Ogo Oluwa'],
  ['lga_list', 'olorunsogo', 'Olorunsogo'],
  ['lga_list', 'oluyole', 'Oluyole'],
  ['lga_list', 'ona_ara', 'Ona Ara'],
  ['lga_list', 'orelope', 'Orelope'],
  ['lga_list', 'ori_ire', 'Ori Ire'],
  ['lga_list', 'oyo_east', 'Oyo East'],
  ['lga_list', 'oyo_west', 'Oyo West'],
  ['lga_list', 'saki_east', 'Saki East'],
  ['lga_list', 'saki_west', 'Saki West'],
  ['lga_list', 'surulere', 'Surulere'],
  // skill_list (50+ skills)
  // Construction & Building Trades
  ['skill_list', 'carpentry', 'Carpentry/Woodwork'],
  ['skill_list', 'plumbing', 'Plumbing'],
  ['skill_list', 'electrical', 'Electrical Installation'],
  ['skill_list', 'welding', 'Welding & Fabrication'],
  ['skill_list', 'masonry', 'Masonry/Bricklaying'],
  ['skill_list', 'painting', 'Painting & Decoration'],
  ['skill_list', 'tiling', 'Tiling & Flooring'],
  ['skill_list', 'roofing', 'Roofing'],
  ['skill_list', 'hvac', 'HVAC/Air Conditioning'],
  ['skill_list', 'solar', 'Solar Installation'],
  ['skill_list', 'aluminum', 'Aluminum & Glass Fitting'],
  // Automotive & Mechanical
  ['skill_list', 'auto_mechanic', 'Auto Mechanic'],
  ['skill_list', 'auto_electrician', 'Auto Electrician'],
  ['skill_list', 'panel_beating', 'Panel Beating & Spray Painting'],
  ['skill_list', 'vulcanizing', 'Vulcanizing/Tire Services'],
  ['skill_list', 'motorcycle_repair', 'Motorcycle/Tricycle Repair'],
  ['skill_list', 'heavy_equipment', 'Heavy Equipment Operation'],
  ['skill_list', 'generator_repair', 'Generator Repair'],
  // Fashion, Beauty & Personal Care
  ['skill_list', 'tailoring', 'Tailoring/Sewing'],
  ['skill_list', 'fashion_design', 'Fashion Design'],
  ['skill_list', 'hairdressing', 'Hairdressing/Styling'],
  ['skill_list', 'barbing', 'Barbing'],
  ['skill_list', 'makeup', 'Makeup Artistry'],
  ['skill_list', 'shoe_making', 'Shoe Making/Cobbling'],
  ['skill_list', 'bag_making', 'Bag Making/Leather Craft'],
  ['skill_list', 'jewelry', 'Jewelry Making'],
  // Food, Agriculture & Processing
  ['skill_list', 'farming', 'Crop Farming'],
  ['skill_list', 'livestock', 'Livestock/Poultry Farming'],
  ['skill_list', 'fishery', 'Fishery/Aquaculture'],
  ['skill_list', 'catering', 'Catering/Event Cooking'],
  ['skill_list', 'baking', 'Baking & Confectionery'],
  ['skill_list', 'food_processing', 'Food Processing/Preservation'],
  ['skill_list', 'butchery', 'Butchery/Meat Processing'],
  // Digital, Technology & Office
  ['skill_list', 'software_dev', 'Software Development'],
  ['skill_list', 'web_design', 'Web Design/Development'],
  ['skill_list', 'graphic_design', 'Graphic Design'],
  ['skill_list', 'video_editing', 'Video Editing/Production'],
  ['skill_list', 'data_entry', 'Data Entry/Typing'],
  ['skill_list', 'accounting', 'Accounting/Bookkeeping'],
  ['skill_list', 'office_admin', 'Office Administration'],
  ['skill_list', 'computer_repair', 'Computer/Phone Repair'],
  ['skill_list', 'social_media', 'Social Media Management'],
  // Healthcare & Wellness
  ['skill_list', 'nursing', 'Nursing/Patient Care'],
  ['skill_list', 'pharmacy_tech', 'Pharmacy Assistant'],
  ['skill_list', 'lab_tech', 'Laboratory Technician'],
  ['skill_list', 'community_health', 'Community Health Worker'],
  ['skill_list', 'caregiving', 'Elderly/Child Caregiving'],
  ['skill_list', 'physiotherapy', 'Physiotherapy Assistant'],
  // Education & Professional Services
  ['skill_list', 'teaching', 'Teaching/Tutoring'],
  ['skill_list', 'driving', 'Professional Driving'],
  ['skill_list', 'security', 'Security Services'],
  ['skill_list', 'event_planning', 'Event Planning/Decoration'],
  ['skill_list', 'photography', 'Photography/Videography'],
  ['skill_list', 'cleaning', 'Professional Cleaning'],
  ['skill_list', 'laundry', 'Laundry/Dry Cleaning'],
  // Artisan & Traditional Crafts
  ['skill_list', 'furniture', 'Furniture Making'],
  ['skill_list', 'upholstery', 'Upholstery'],
  ['skill_list', 'pottery', 'Pottery/Ceramics'],
  ['skill_list', 'blacksmith', 'Blacksmithing'],
  ['skill_list', 'weaving', 'Weaving/Textile Crafts'],
  ['skill_list', 'sign_writing', 'Sign Writing/Branding'],
];

// === SETTINGS SHEET ===
const settings = [
  ['form_title', 'form_id', 'version', 'default_language'],
  ['OSLSR Labour & Skills Registry Survey', 'oslsr_master_v3', '2026012601', 'English'],
];

// Build workbook
const wb = XLSX.utils.book_new();

const wsSurvey = XLSX.utils.aoa_to_sheet(survey);
XLSX.utils.book_append_sheet(wb, wsSurvey, 'survey');

const wsChoices = XLSX.utils.aoa_to_sheet(choices);
XLSX.utils.book_append_sheet(wb, wsChoices, 'choices');

const wsSettings = XLSX.utils.aoa_to_sheet(settings);
XLSX.utils.book_append_sheet(wb, wsSettings, 'settings');

// Set column widths for readability
wsSurvey['!cols'] = [
  { wch: 25 }, // type
  { wch: 20 }, // name
  { wch: 80 }, // label
  { wch: 8 },  // required
  { wch: 50 }, // relevant
  { wch: 55 }, // calculation
  { wch: 45 }, // constraint
  { wch: 35 }, // constraint_message
];

wsChoices['!cols'] = [
  { wch: 18 }, // list_name
  { wch: 20 }, // name
  { wch: 50 }, // label
];

wsSettings['!cols'] = [
  { wch: 45 }, // form_title
  { wch: 20 }, // form_id
  { wch: 15 }, // version
  { wch: 18 }, // default_language
];

const outPath = path.join(__dirname, '..', 'test-fixtures', 'oslsr_master_v3.xlsx');
const fs = require('fs');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);

console.log(`XLSForm written to: ${outPath}`);
console.log(`Survey rows: ${survey.length - 1}`);
console.log(`Choice rows: ${choices.length - 1}`);
