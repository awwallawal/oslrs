# OSLSR ODK XLSForm Specification (Master Schema)

**Version:** 4.0 (ISCO-08 Skills Taxonomy — 150 Skills, 20 Sectors)
**Date:** 2026-03-09
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

### skill_list (150 Skills — ISCO-08 Aligned, 20 Sectors)

> **Standard:** ILO ISCO-08 (International Standard Classification of Occupations, 2008)
> **Scope:** 150 skills across 20 economic sectors, optimised for Southwestern Nigeria (Oyo State)
> **Reference:** `docs/skills-taxonomy-isco08.md` — full taxonomy with ISCO-08 codes, descriptions, certification pathways

#### 1. Construction & Building Trades (16)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | bricklaying | Bricklaying & Block Work |
| skill_list | plastering | Plastering & Screeding |
| skill_list | painting | Painting & Decorating |
| skill_list | tiling | Tiling & Terrazzo Work |
| skill_list | carpentry | Carpentry & Joinery |
| skill_list | plumbing | Plumbing & Pipe Fitting |
| skill_list | electrical | Electrical Installation |
| skill_list | welding | Welding & Metal Fabrication |
| skill_list | aluminium_glass | Aluminium & Glass Work |
| skill_list | pop_ceiling | POP Ceiling & Suspended Ceiling |
| skill_list | iron_bending | Iron Bending & Steel Fixing |
| skill_list | roofing | Roofing (Aluminium & Long-span) |
| skill_list | heavy_equipment | Heavy Equipment Operation |
| skill_list | interlocking_paving | Interlocking Paving & Concrete Work |
| skill_list | surveying | Surveying & Setting Out |
| skill_list | quantity_surveying | Building Estimation & Quantity Surveying |

#### 2. Automotive & Mechanical (7)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | auto_mechanic | Motor Vehicle Mechanic |
| skill_list | auto_electrician | Auto Electrician |
| skill_list | motorcycle_repair | Motorcycle & Tricycle Mechanic |
| skill_list | vulcanizing | Vulcanising & Tyre Services |
| skill_list | panel_beating | Panel Beating & Spray Painting |
| skill_list | generator_repair | Diesel/Generator Mechanic |
| skill_list | hvac | Refrigeration & Air Conditioning |

#### 3. Fashion, Beauty & Personal Care (11)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | tailoring | Tailoring & Garment Making |
| skill_list | fashion_design | Fashion Design |
| skill_list | aso_oke_weaving | Aso-Oke Weaving |
| skill_list | adire_dyeing | Adire & Textile Dyeing |
| skill_list | hairdressing | Hairdressing & Braiding |
| skill_list | barbing | Barbering |
| skill_list | makeup | Makeup Artistry |
| skill_list | cosmetology | Cosmetology & Skincare |
| skill_list | nail_tech | Manicure, Pedicure & Nail Technology |
| skill_list | leather_work | Leather Work & Shoe Making |
| skill_list | bead_making | Bead Making & Jewellery Design |

#### 4. Food, Agriculture & Processing (15)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | crop_farming | Crop Farming (Arable) |
| skill_list | vegetable_farming | Vegetable & Horticulture Farming |
| skill_list | poultry | Poultry Farming |
| skill_list | fish_farming | Fish Farming (Aquaculture) |
| skill_list | livestock | Livestock & Cattle Rearing |
| skill_list | cassava_processing | Cassava Processing (Garri, Fufu, Lafun) |
| skill_list | palm_oil | Palm Oil & Kernel Processing |
| skill_list | baking | Baking & Confectionery |
| skill_list | catering | Catering & Food Preparation |
| skill_list | butchery | Butchery & Meat Processing |
| skill_list | snail_farming | Snail Farming (Heliculture) |
| skill_list | bee_keeping | Bee Keeping (Apiculture) |
| skill_list | grain_milling | Grain Milling & Feed Production |
| skill_list | cocoa_farming | Cocoa Farming & Post-Harvest Handling |
| skill_list | farm_mechanisation | Irrigation & Farm Mechanisation |

#### 5. Digital, Technology & Office (13)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | computer_repair | Computer Hardware Repair & Maintenance |
| skill_list | phone_repair | Mobile Phone & Tablet Repair |
| skill_list | web_dev | Web Development |
| skill_list | mobile_app_dev | Mobile App Development |
| skill_list | graphic_design | Graphic Design & Branding |
| skill_list | digital_marketing | Digital Marketing & Social Media |
| skill_list | data_entry | Data Entry & Office Administration |
| skill_list | networking | Networking & IT Support |
| skill_list | cctv_security | CCTV & Security System Installation |
| skill_list | photography | Photography & Videography |
| skill_list | video_editing | Video Editing & Post-Production |
| skill_list | solar_pv | Solar PV Installation & Maintenance |
| skill_list | accounting | Accounting & Bookkeeping Software |

#### 6. Healthcare & Wellness (9)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | community_health | Community Health Extension Work |
| skill_list | nursing | Nursing & Midwifery Assistance |
| skill_list | pharmacy_tech | Pharmacy Technician Services |
| skill_list | lab_tech | Medical Laboratory Assistance |
| skill_list | dental_tech | Dental Technology |
| skill_list | optometry | Optometry & Optical Dispensing |
| skill_list | physiotherapy | Physiotherapy Assistance |
| skill_list | traditional_medicine | Traditional/Herbal Medicine Practice |
| skill_list | health_records | Health Records & Information Management |

#### 7. Education & Professional Services (7)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | teaching | Primary & Secondary School Teaching |
| skill_list | vocational_instruction | Vocational & Technical Instruction |
| skill_list | adult_literacy | Adult Literacy & Non-Formal Education |
| skill_list | tutoring | Tutorial & Lesson Coordination |
| skill_list | sign_language | Sign Language Interpretation |
| skill_list | legal_clerking | Legal Clerking & Court Process Services |
| skill_list | tax_preparation | Accounting & Tax Preparation |

#### 8. Artisan & Traditional Crafts (8)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | blacksmithing | Blacksmithing (Alagbede) |
| skill_list | woodcarving | Woodcarving & Sculpture |
| skill_list | pottery | Pottery & Ceramics (Amokoko) |
| skill_list | mat_weaving | Mat & Basket Weaving |
| skill_list | calabash_carving | Calabash Carving & Decoration |
| skill_list | bronze_casting | Bronze & Brass Casting |
| skill_list | upholstery | Upholstery & Furniture Making |
| skill_list | sign_writing | Sign Writing & Vehicle Branding |

#### 9. Transport & Logistics (7)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | commercial_driving | Commercial Driving (Bus/Truck) |
| skill_list | motorcycle_dispatch | Motorcycle Dispatch & Courier |
| skill_list | tricycle_operation | Tricycle (Keke) Operation |
| skill_list | forklift_operation | Forklift & Warehouse Equipment |
| skill_list | freight_logistics | Freight & Logistics Coordination |
| skill_list | driving_instruction | Driving Instruction |
| skill_list | fleet_management | Fleet Management & Vehicle Tracking |

#### 10. Sales, Marketing & Distribution (9)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | agrochem_sales | Agrochemical Sales |
| skill_list | pharma_sales | Pharmaceutical/Medical Sales |
| skill_list | fmcg_sales | FMCG Sales & Distribution |
| skill_list | real_estate | Real Estate Marketing & Brokerage |
| skill_list | building_materials | Building Materials Sales |
| skill_list | auto_parts | Automobile Parts Dealing |
| skill_list | market_trading | Market Trading & Open-Market Selling |
| skill_list | ecommerce | E-Commerce & Online Selling |
| skill_list | insurance_sales | Insurance & Financial Product Sales |

#### 11. Retail & Commerce (6)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | retail_management | Supermarket & Retail Store Operation |
| skill_list | pos_agent | POS Agent & Mobile Money Services |
| skill_list | fuel_station | Fuel Station Attendant & Management |
| skill_list | patent_medicine | Pharmaceutical Retail (Patent Medicine) |
| skill_list | telecom_retail | Mobile Recharge & Telecom Retail |
| skill_list | provisions_retail | Provisions & Household Goods Retail |

#### 12. Mining, Quarrying & Extraction (4)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | quarrying | Quarrying & Stone Crushing |
| skill_list | sand_dredging | Sand Dredging & Gravel Mining |
| skill_list | artisanal_mining | Artisanal Gold & Mineral Mining |
| skill_list | gemstone_cutting | Gemstone Cutting & Polishing |

#### 13. Oil, Gas & Energy (6)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | petroleum_distribution | Petroleum Product Distribution |
| skill_list | gas_plant | Gas Plant Operation & LPG Dispensing |
| skill_list | pipeline_welding | Pipeline Welding & Maintenance |
| skill_list | drilling | Drilling Operations Assistance |
| skill_list | power_line | Electrical Power Line Installation |
| skill_list | renewable_energy | Renewable Energy Technology (Biogas) |

#### 14. Manufacturing & Processing (5)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | soap_manufacturing | Soap & Detergent Manufacturing |
| skill_list | water_production | Sachet/Bottled Water Production |
| skill_list | block_making | Block & Precast Concrete Manufacturing |
| skill_list | plastic_manufacturing | Plastic & Rubber Products Manufacturing |
| skill_list | printing | Printing & Publishing |

#### 15. Hospitality & Tourism (5)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | hotel_management | Hotel & Guest House Management |
| skill_list | event_planning | Event Planning & Decoration |
| skill_list | bartending | Bartending & Mixology |
| skill_list | tour_guiding | Tour Guiding & Cultural Tourism |
| skill_list | laundry | Laundry & Dry Cleaning Services |

#### 16. Entertainment & Creative Arts (6)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | music_production | Music Production & Sound Engineering |
| skill_list | dj_services | Disc Jockey (DJ) Services |
| skill_list | mc_services | Master of Ceremonies (MC) & Hype |
| skill_list | acting | Acting & Nollywood Film Production |
| skill_list | drumming | Drumming & Traditional Music |
| skill_list | animation | Animation & Motion Graphics |

#### 17. Security & Safety (4)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | security_guard | Private Security Guard Services |
| skill_list | fire_safety | Fire Safety & Prevention |
| skill_list | ohs | Occupational Health & Safety |
| skill_list | traffic_management | Traffic & Crowd Management |

#### 18. Domestic & Personal Services (4)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | housekeeping | Housekeeping & Domestic Cleaning |
| skill_list | childcare | Childcare & Nanny Services |
| skill_list | elderly_care | Elderly & Home Care Assistance |
| skill_list | gardening | Gardening & Landscaping |

#### 19. Waste, Recycling & Environment (4)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | waste_collection | Waste Collection & Disposal |
| skill_list | scrap_recycling | Scrap Metal & E-Waste Recycling |
| skill_list | plastic_recycling | Plastic Recycling & PET Collection |
| skill_list | fumigation | Fumigation & Pest Control |

#### 20. Legal, Religious & Community Services (5)
| list_name | name | label |
| :--- | :--- | :--- |
| skill_list | religious_ministry | Religious Ministry & Pastoral Work |
| skill_list | quranic_teaching | Islamic Education (Quranic Teaching) |
| skill_list | community_development | Community Development & Social Work |
| skill_list | mediation | Mediation & Alternative Dispute Resolution |
| skill_list | cooperative_management | Cooperative & Thrift Society Management |

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
| 4.0 | 2026-03-09 | **Skills Taxonomy Upgrade:** Expanded skill_list from 50 to 150 skills across 20 ISCO-08 aligned sectors (was 8 categories). Added 12 new sectors: Transport, Sales, Retail, Mining, Oil/Gas, Manufacturing, Hospitality, Entertainment, Security, Domestic, Waste/Recycling, Legal/Religious. Frontend upgraded to searchable dropdown with sector grouping + custom skill entry. Reference: `docs/skills-taxonomy-isco08.md`. | Awwal (PO) |
