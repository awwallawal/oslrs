# OSLSR ODK XLSForm Specification (Master Schema)

**Version:** 2.0 (Policy Aligned)
**Date:** 2026-01-01
**Status:** ONE SOURCE OF TRUTH - APPROVED

## 1. Metadata & Settings
| setting | value |
| :--- | :--- |
| form_title | OSLSR Labour & Skills Registry Survey |
| form_id | oslsr_master_v1 |
| version | 2026010101 |
| default_language | English |
| submission_url | /api/webhook/odk (Target) |

## 2. Survey Sheet (Logic & Fields)

| type | name | label | required | relevance | calculation | constraint | constraint_message |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Metadata** | | | | | | | |
| start | start_time | | | | | | |
| end | end_time | | | | | | |
| deviceid | device_id | | | | | | |
| calculate | form_mode | | | | once(if(${device_id} != null, 'enumerator', 'public')) | | |
| | | | | | | | |
| **Section 1** | **grp_intro** | **Introduction & Consent** | | | | | |
| note | note_intro | Welcome to the Oyo State Labour & Skills Registry (OSLSR). | | | | | |
| select_one yes_no | consent_basic | Do you consent to participate? | yes | | | | |
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
| text | phone_number | Phone Number | yes | | | regex(., '^[0][7-9][0-1][0-9]{8}$') | Valid Nigerian # |
| text | nin | NIN (Optional) | no | | | string-length(.) = 11 | 11 digits |
| geopoint | gps_location | GPS Location | yes | | | | |
| | | | | | | | |
| **Section 3** | **grp_labor** | **Labor Force Participation** | | ${age} >= 15 | | | |
| select_one yes_no | employment_status | Worked for pay/profit in last 7 days? | yes | | | | |
| select_one yes_no | temp_absent | Temporarily absent from a job? | yes | ${employment_status} = 'no' | | | |
| select_one yes_no | looking_for_work | Looked for work in last 4 weeks? | yes | ${temp_absent} = 'no' | | | |
| select_one yes_no | available_for_work | Available to start in 2 weeks? | yes | ${looking_for_work} = 'no' | | | |
| text | main_occupation | Main Occupation | yes | ${employment_status} = 'yes' or ${temp_absent} = 'yes' | | | |
| select_one emp_type | employment_type | Type of Employment | yes | ${employment_status} = 'yes' or ${temp_absent} = 'yes' | | | |
| integer | hours_worked | Hours worked last week | yes | ${employment_status} = 'yes' | | . >= 0 and . <= 168 | 0-168 only |
| integer | monthly_income | Estimated Monthly Income (Naira) | no | ${employment_status} = 'yes' | | | |
| | | | | | | | |
| **Section 4** | **grp_household** | **Household & Welfare** | | | | | |
| select_one yes_no | is_head | Are you the Head of Household? | yes | | | | |
| integer | household_size | Total people in household | yes | | | . > 0 | Min 1 |
| integer | dependents_count | Number of dependents (Children/Elderly) | yes | | | . < ${household_size} | Cannot exceed size |
| select_one housing_list | housing_status | Housing Ownership | no | | | | |
| | | | | | | | |
| **Section 5** | **grp_skills** | **Skills & Interest** | | | | | |
| select_multiple skill_list | skills_possessed | Primary Skills (Select all) | yes | | | | |
| select_multiple skill_list | training_interest | Skills you wish to learn | no | | | | |
| select_one yes_no | has_business | Do you own a business? | yes | | | | |
| text | business_name | Business Name | yes | ${has_business} = 'yes' | | | |
| select_one reg_status | business_reg | Registered with CAC? | yes | ${has_business} = 'yes' | | | |
| | | | | | | | |
| **Section 6** | **grp_marketplace** | **Public Skills Marketplace** | | | | | |
| select_one yes_no | consent_marketplace | Join Anonymous Marketplace? | yes | | | | |
| select_one yes_no | consent_enriched | Allow employers to see Name/Phone? | yes | ${consent_marketplace} = 'yes' | | | |
| text | bio_short | Professional Bio (150 chars) | no | ${consent_enriched} = 'yes' | | string-length(.) <= 150 | Max 150 |
| text | portfolio_url | Portfolio Link | no | ${consent_enriched} = 'yes' | | | |

## 3. Choices Sheet (Options)

| list_name | name | label |
| :--- | :--- | :--- |
| yes_no | yes | Yes |
| yes_no | no | No |
| gender_list | male | Male |
| gender_list | female | Female |
| gender_list | other | Other |
| marital_list | single | Single |
| marital_list | married | Married |
| marital_list | divorced | Divorced |
| marital_list | widowed | Widowed |
| edu_list | none | No Formal Education |
| edu_list | primary | Primary |
| edu_list | secondary | Secondary |
| edu_list | vocational | Vocational/Technical |
| edu_list | tertiary | Tertiary (Degree/HND) |
| housing_list | owned | Owned |
| housing_list | rented | Rented |
| housing_list | family | Living with Family (Free) |
| emp_type | wage | Wage Earner (Public/Private) |
| emp_type | self | Self-Employed (Artisan/Business) |
| emp_type | family | Unpaid Family Worker |
| reg_status | registered | Registered (CAC) |
| reg_status | unregistered | Unregistered |
| skill_list | carpentry | Carpentry |
| skill_list | plumbing | Plumbing |
| skill_list | electrical | Electrical/Solar |
| skill_list | farming | Farming/Agric |
| skill_list | tailoring | Fashion/Tailoring |
| skill_list | mechanical | Auto-Mechanical |
| skill_list | software | Software/Digital |
| skill_list | teaching | Teaching/Education |
| skill_list | nursing | Healthcare/Nursing |
