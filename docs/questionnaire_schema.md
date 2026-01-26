# OSLSR ODK XLSForm Specification (Master Schema)

**Version:** 3.0 (PRD-Aligned with FR17 Marketplace Fields)
**Date:** 2026-01-26
**Status:** ONE SOURCE OF TRUTH - APPROVED

## 1. Metadata & Settings
| setting | value |
| :--- | :--- |
| form_title | OSLSR Labour & Skills Registry Survey |
| form_id | oslsr_master_v3 |
| version | 2026012601 |
| default_language | English |
| submission_url | /api/webhook/odk (Target) |

## 2. Survey Sheet (Logic & Fields)

| type | name | label | required | relevance | calculation | constraint | constraint_message |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Metadata** | | | | | | | |
| start | start_time | | | | | | |
| end | end_time | | | | | | |
| deviceid | device_id | | | | | | |
| geopoint | gps_location | | | | | | GPS collected silently |
| calculate | form_mode | | | | once(if(${device_id} != null, 'enumerator', 'public')) | | |
| | | | | | | | |
| **Section 1** | **grp_intro** | **Introduction & Consent** | | | | | |
| note | note_intro | Welcome to the Oyo State Labour & Skills Registry (OSLSR). This survey takes approximately 10 minutes. | | | | | |
| select_one yes_no | consent_basic | Do you consent to participate in this survey? | yes | | | | |
| | | | | | | | |
| **Section 2** | **grp_identity** | **Identity & Demographics** | | ${consent_basic} = 'yes' | | | |
| text | surname | Surname | yes | | | | |
| text | firstname | First Name | yes | | | | |
| select_one gender_list | gender | Gender | yes | | | | |
| date | dob | Date of Birth | yes | | | . <= today() | Cannot be future |
| calculate | age | | | | int((today() - ${dob}) div 365.25) | . >= 15 | Must be 15+ |
| select_one marital_list | marital_status | Marital Status | yes | | | | |
| select_one edu_list | education_level | Highest Education Completed | yes | | | | |
| select_one yes_no | disability_status | Do you have any disability? | yes | | | | |
| text | phone_number | Phone Number | yes | | | regex(., '^[0][7-9][0-1][0-9]{8}$') | Valid Nigerian mobile number |
| text | nin | National Identity Number (NIN) | yes | | | string-length(.) = 11 and regex(., '^[0-9]+$') | Must be exactly 11 digits |
| select_one lga_list | lga_id | Local Government Area (LGA) | yes | | | | |
| | | | | | | | |
| **Section 3** | **grp_labor** | **Labor Force Participation** | | ${age} >= 15 | | | |
| select_one yes_no | employment_status | Have you worked for pay or profit in the last 7 days? | yes | | | | |
| select_one yes_no | temp_absent | Were you temporarily absent from a job? | yes | ${employment_status} = 'no' | | | |
| select_one yes_no | looking_for_work | Have you looked for work in the last 4 weeks? | yes | ${temp_absent} = 'no' | | | |
| select_one yes_no | available_for_work | Are you available to start work within 2 weeks? | yes | ${looking_for_work} = 'no' | | | |
| text | main_occupation | Main Occupation/Job Title | yes | ${employment_status} = 'yes' or ${temp_absent} = 'yes' | | | |
| select_one emp_type | employment_type | Type of Employment | yes | ${employment_status} = 'yes' or ${temp_absent} = 'yes' | | | |
| select_one experience_list | years_experience | Years of Experience in Main Occupation | yes | ${employment_status} = 'yes' or ${temp_absent} = 'yes' | | | |
| integer | hours_worked | Hours worked last week | yes | ${employment_status} = 'yes' | | . >= 0 and . <= 168 | Must be 0-168 hours |
| integer | monthly_income | Estimated Monthly Income (Naira) | no | ${employment_status} = 'yes' | | . >= 0 | Cannot be negative |
| | | | | | | | |
| **Section 4** | **grp_household** | **Household & Welfare** | | | | | |
| select_one yes_no | is_head | Are you the Head of Household? | yes | | | | |
| integer | household_size | Total number of people in your household | yes | | | . > 0 | Must be at least 1 |
| integer | dependents_count | Number of dependents (children/elderly) | yes | | | . < ${household_size} | Cannot exceed household size |
| select_one housing_list | housing_status | Housing Ownership Status | yes | | | | |
| | | | | | | | |
| **Section 5** | **grp_skills** | **Skills & Business** | | | | | |
| select_multiple skill_list | skills_possessed | Primary Skills (Select all that apply) | yes | | | | |
| text | skills_other | Other skills not listed above | no | | | string-length(.) <= 200 | Maximum 200 characters |
| select_multiple skill_list | training_interest | Skills you would like to learn | no | | | | |
| select_one yes_no | has_business | Do you own or operate a business? | yes | | | | |
| text | business_name | Business Name | yes | ${has_business} = 'yes' | | | |
| select_one reg_status | business_reg | Is your business registered with CAC? | yes | ${has_business} = 'yes' | | | |
| text | business_address | Business Premises Address | yes | ${has_business} = 'yes' | | | |
| integer | apprentice_count | Number of apprentices/trainees/interns | no | ${has_business} = 'yes' | | . >= 0 | Cannot be negative |
| | | | | | | | |
| **Section 6** | **grp_marketplace** | **Public Skills Marketplace** | | | | | |
| note | note_marketplace | The OSLSR Skills Marketplace connects skilled workers with employers. You can choose to be listed anonymously or share your contact details. | | | | | |
| select_one yes_no | consent_marketplace | Would you like to join the Anonymous Skills Marketplace? (Your profession, LGA, and experience level will be visible) | yes | | | | |
| select_one yes_no | consent_enriched | Would you like employers to see your Name and Phone Number? | yes | ${consent_marketplace} = 'yes' | | | |
| text | bio_short | Professional Bio (brief description of your work) | no | ${consent_enriched} = 'yes' | | string-length(.) <= 150 | Maximum 150 characters |
| text | portfolio_url | Portfolio or Social Media Link | no | ${consent_enriched} = 'yes' | | | |

## 3. Choices Sheet (Options)

### yes_no
| list_name | name | label |
| :--- | :--- | :--- |
| yes_no | yes | Yes |
| yes_no | no | No |

### gender_list
| list_name | name | label |
| :--- | :--- | :--- |
| gender_list | male | Male |
| gender_list | female | Female |
| gender_list | other | Prefer not to say |

### marital_list
| list_name | name | label |
| :--- | :--- | :--- |
| marital_list | single | Single |
| marital_list | married | Married |
| marital_list | divorced | Divorced |
| marital_list | widowed | Widowed |
| marital_list | separated | Separated |

### edu_list
| list_name | name | label |
| :--- | :--- | :--- |
| edu_list | none | No Formal Education |
| edu_list | primary | Primary School |
| edu_list | jss | Junior Secondary (JSS) |
| edu_list | sss | Senior Secondary (SSS/WAEC) |
| edu_list | vocational | Vocational/Technical Training |
| edu_list | nce_ond | NCE/OND |
| edu_list | hnd_bsc | HND/Bachelor's Degree |
| edu_list | masters | Master's Degree |
| edu_list | doctorate | Doctorate/PhD |

### housing_list
| list_name | name | label |
| :--- | :--- | :--- |
| housing_list | owned | Owned |
| housing_list | rented | Rented |
| housing_list | family | Living with Family (Free) |
| housing_list | employer | Employer-Provided |
| housing_list | other | Other |

### emp_type
| list_name | name | label |
| :--- | :--- | :--- |
| emp_type | wage_public | Wage Earner (Government/Public Sector) |
| emp_type | wage_private | Wage Earner (Private Sector) |
| emp_type | self_employed | Self-Employed (Artisan/Trader/Business Owner) |
| emp_type | contractor | Contractor/Consultant |
| emp_type | family_unpaid | Unpaid Family Worker |
| emp_type | apprentice | Apprentice/Intern |

### experience_list
| list_name | name | label |
| :--- | :--- | :--- |
| experience_list | less_1 | Less than 1 year |
| experience_list | 1_3 | 1-3 years |
| experience_list | 4_6 | 4-6 years |
| experience_list | 7_10 | 7-10 years |
| experience_list | over_10 | Over 10 years |

### reg_status
| list_name | name | label |
| :--- | :--- | :--- |
| reg_status | registered | Yes, registered with CAC |
| reg_status | unregistered | No, not registered |
| reg_status | in_progress | Registration in progress |

### lga_list (33 Oyo State Local Government Areas)
| list_name | name | label |
| :--- | :--- | :--- |
| lga_list | afijio | Afijio |
| lga_list | akinyele | Akinyele |
| lga_list | atiba | Atiba |
| lga_list | atisbo | Atisbo |
| lga_list | egbeda | Egbeda |
| lga_list | ibadan_north | Ibadan North |
| lga_list | ibadan_ne | Ibadan North-East |
| lga_list | ibadan_nw | Ibadan North-West |
| lga_list | ibadan_se | Ibadan South-East |
| lga_list | ibadan_sw | Ibadan South-West |
| lga_list | ibarapa_central | Ibarapa Central |
| lga_list | ibarapa_east | Ibarapa East |
| lga_list | ibarapa_north | Ibarapa North |
| lga_list | ido | Ido |
| lga_list | irepo | Irepo |
| lga_list | iseyin | Iseyin |
| lga_list | itesiwaju | Itesiwaju |
| lga_list | iwajowa | Iwajowa |
| lga_list | kajola | Kajola |
| lga_list | lagelu | Lagelu |
| lga_list | ogbomoso_north | Ogbomosho North |
| lga_list | ogbomoso_south | Ogbomosho South |
| lga_list | ogo_oluwa | Ogo Oluwa |
| lga_list | olorunsogo | Olorunsogo |
| lga_list | oluyole | Oluyole |
| lga_list | ona_ara | Ona Ara |
| lga_list | orelope | Orelope |
| lga_list | ori_ire | Ori Ire |
| lga_list | oyo_east | Oyo East |
| lga_list | oyo_west | Oyo West |
| lga_list | saki_east | Saki East |
| lga_list | saki_west | Saki West |
| lga_list | surulere | Surulere |

### skill_list (50+ Skills organized by category)

#### Construction & Building Trades
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | carpentry | Carpentry/Woodwork |
| skill_list | plumbing | Plumbing |
| skill_list | electrical | Electrical Installation |
| skill_list | welding | Welding & Fabrication |
| skill_list | masonry | Masonry/Bricklaying |
| skill_list | painting | Painting & Decoration |
| skill_list | tiling | Tiling & Flooring |
| skill_list | roofing | Roofing |
| skill_list | hvac | HVAC/Air Conditioning |
| skill_list | solar | Solar Installation |
| skill_list | aluminum | Aluminum & Glass Fitting |

#### Automotive & Mechanical
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | auto_mechanic | Auto Mechanic |
| skill_list | auto_electrician | Auto Electrician |
| skill_list | panel_beating | Panel Beating & Spray Painting |
| skill_list | vulcanizing | Vulcanizing/Tire Services |
| skill_list | motorcycle_repair | Motorcycle/Tricycle Repair |
| skill_list | heavy_equipment | Heavy Equipment Operation |
| skill_list | generator_repair | Generator Repair |

#### Fashion, Beauty & Personal Care
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | tailoring | Tailoring/Sewing |
| skill_list | fashion_design | Fashion Design |
| skill_list | hairdressing | Hairdressing/Styling |
| skill_list | barbing | Barbing |
| skill_list | makeup | Makeup Artistry |
| skill_list | shoe_making | Shoe Making/Cobbling |
| skill_list | bag_making | Bag Making/Leather Craft |
| skill_list | jewelry | Jewelry Making |

#### Food, Agriculture & Processing
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | farming | Crop Farming |
| skill_list | livestock | Livestock/Poultry Farming |
| skill_list | fishery | Fishery/Aquaculture |
| skill_list | catering | Catering/Event Cooking |
| skill_list | baking | Baking & Confectionery |
| skill_list | food_processing | Food Processing/Preservation |
| skill_list | butchery | Butchery/Meat Processing |

#### Digital, Technology & Office
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | software_dev | Software Development |
| skill_list | web_design | Web Design/Development |
| skill_list | graphic_design | Graphic Design |
| skill_list | video_editing | Video Editing/Production |
| skill_list | data_entry | Data Entry/Typing |
| skill_list | accounting | Accounting/Bookkeeping |
| skill_list | office_admin | Office Administration |
| skill_list | computer_repair | Computer/Phone Repair |
| skill_list | social_media | Social Media Management |

#### Healthcare & Wellness
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | nursing | Nursing/Patient Care |
| skill_list | pharmacy_tech | Pharmacy Assistant |
| skill_list | lab_tech | Laboratory Technician |
| skill_list | community_health | Community Health Worker |
| skill_list | caregiving | Elderly/Child Caregiving |
| skill_list | physiotherapy | Physiotherapy Assistant |

#### Education & Professional Services
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | teaching | Teaching/Tutoring |
| skill_list | driving | Professional Driving |
| skill_list | security | Security Services |
| skill_list | event_planning | Event Planning/Decoration |
| skill_list | photography | Photography/Videography |
| skill_list | cleaning | Professional Cleaning |
| skill_list | laundry | Laundry/Dry Cleaning |

#### Artisan & Traditional Crafts
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | furniture | Furniture Making |
| skill_list | upholstery | Upholstery |
| skill_list | pottery | Pottery/Ceramics |
| skill_list | blacksmith | Blacksmithing |
| skill_list | weaving | Weaving/Textile Crafts |
| skill_list | sign_writing | Sign Writing/Branding |

## 4. Field Mapping for Story 2.1 Validation

The XLSForm parser in Story 2.1 must validate these OSLSR-specific required fields:

| Field Name | XLSForm Type | Required | PRD Reference |
| :--- | :--- | :--- | :--- |
| `consent_marketplace` | select_one yes_no | Yes | FR2, FR17, Story 7.1 |
| `consent_enriched` | select_one yes_no | Yes (if marketplace=yes) | FR2, Story 7.2 |
| `nin` | text | Yes | FR5, FR21, NFR4.5 |
| `phone_number` | text | Yes | FR17 (contact reveal) |
| `lga_id` | select_one lga_list | Yes | FR17 (marketplace filtering) |
| `years_experience` | select_one experience_list | Yes (if employed) | FR17 (marketplace filtering) |
| `skills_possessed` | select_multiple skill_list | Yes | FR17 (marketplace filtering) |

## 5. Validation Rules Summary

| Rule | Constraint | Error Message |
| :--- | :--- | :--- |
| NIN Format | 11 digits, numeric only | "NIN must be exactly 11 digits" |
| NIN Checksum | Modulus 11 (frontend) | "Invalid NIN - please verify and re-enter" |
| Phone Format | Nigerian mobile (0[7-9][0-1]xxxxxxxx) | "Enter valid Nigerian mobile number" |
| Age Minimum | >= 15 years from DOB | "Respondent must be 15 years or older" |
| Hours Worked | 0-168 range | "Hours must be between 0 and 168" |
| Dependents | < household_size | "Dependents cannot exceed household size" |
| Bio Length | <= 150 characters | "Bio must be 150 characters or less" |
| Skills Other | <= 200 characters | "Maximum 200 characters for other skills" |

## 6. Change Log

| Version | Date | Changes | Author |
| :--- | :--- | :--- | :--- |
| 1.0 | 2025-12-27 | Initial draft | John (PM) |
| 2.0 | 2026-01-01 | Policy aligned, consent workflow added | Sarah (PO) |
| 3.0 | 2026-01-26 | **Major Update:** Added FR17 fields (lga_id, years_experience), NIN required, skills expanded to 50+, added contractor employment type, business_address, apprentice_count, skills_other free-text. PRD gap analysis complete. | Awwal (PO) |
