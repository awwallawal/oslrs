# OSLSR Labour & Skills Registry Survey
## Questionnaire Schema for Validator Review

**Version:** 3.0 (PRD-Aligned with FR17 Marketplace Fields)
**Date:** 2026-01-26
**Form ID:** oslsr_master_v3
**Status:** FOR REVIEW

---

## What's New in Version 3.0

| Change | Impact | PRD Reference |
|--------|--------|---------------|
| NIN now **REQUIRED** | All respondents must provide NIN | FR5, FR21 |
| LGA field added | Enables marketplace filtering by location | FR17 |
| Years of Experience added | Enables marketplace filtering by experience | FR17 |
| Skills expanded to 50+ | Comprehensive coverage across 8 categories | FR17 |
| Employment types expanded | Added Contractor, Apprentice/Intern options | Labor statistics |
| Education levels refined | 9 granular options (NCE/OND, HND/BSc separated) | Demographics |
| Business fields added | Address, Apprentice Count for enterprise data | Skills/Business |
| Registration status | Added "In Progress" option | Business tracking |

---

## Survey Statistics

| Metric | Value |
|--------|-------|
| Total Sections | 6 |
| Total Questions | ~35 |
| Required Fields | 28 |
| Conditional Fields | 12 |
| Estimated Completion Time | 10 minutes |

---

## Form Settings

| Setting | Value |
|---------|-------|
| Form Title | OSLSR Labour & Skills Registry Survey |
| Form ID | oslsr_master_v3 |
| Version | 2026012601 |
| Default Language | English |
| Submission Endpoint | /api/webhook/odk |

---

## Section 1: Introduction & Consent

| # | Question | Response Type | Required | Validation / Notes |
|---|----------|---------------|----------|-------------------|
| 1.1 | Welcome note introducing the Oyo State Labour & Skills Registry (OSLSR). This survey takes approximately 10 minutes. | Display Only | - | Informational text |
| 1.2 | Do you consent to participate in this survey? | Yes / No | Yes | Must consent to proceed |

---

## Section 2: Identity & Demographics

*Condition: Only shown if participant consents (Q1.2 = Yes)*

| # | Question | Response Type | Required | Validation / Notes |
|---|----------|---------------|----------|-------------------|
| 2.1 | Surname | Text | Yes | - |
| 2.2 | First Name | Text | Yes | - |
| 2.3 | Gender | Single Choice | Yes | Options: Male, Female, Prefer not to say |
| 2.4 | Date of Birth | Date | Yes | Cannot be a future date |
| 2.5 | Age | Auto-calculated | - | Derived from DOB; Must be 15+ years |
| 2.6 | Marital Status | Single Choice | Yes | Options: Single, Married, Divorced, Widowed, Separated |
| 2.7 | Highest Education Completed | Single Choice | Yes | 9 options (see Appendix) |
| 2.8 | Do you have any disability? | Yes / No | Yes | - |
| 2.9 | Phone Number | Text | Yes | Nigerian mobile format: 0[7-9][0-1]xxxxxxxx |
| 2.10 | NIN (National Identification Number) | Text | **Yes** | Must be exactly 11 digits |
| 2.11 | Local Government Area (LGA) | Single Choice | Yes | 33 Oyo State LGAs (see Appendix) |

*Note: GPS Location captured automatically by device*

---

## Section 3: Labour Force Participation

*Condition: Only shown if participant is 15 years or older*

| # | Question | Response Type | Required | Show If | Validation / Notes |
|---|----------|---------------|----------|---------|-------------------|
| 3.1 | Worked for pay/profit in the last 7 days? | Yes / No | Yes | Always | - |
| 3.2 | Temporarily absent from a job? | Yes / No | Yes | Q3.1 = No | - |
| 3.3 | Looked for work in the last 4 weeks? | Yes / No | Yes | Q3.2 = No | - |
| 3.4 | Available to start work within 2 weeks? | Yes / No | Yes | Q3.3 = No | - |
| 3.5 | Main Occupation/Job Title | Text | Yes | Q3.1=Yes OR Q3.2=Yes | - |
| 3.6 | Type of Employment | Single Choice | Yes | Q3.1=Yes OR Q3.2=Yes | 6 options (see Appendix) |
| 3.7 | Years of Experience in Main Occupation | Single Choice | Yes | Q3.1=Yes OR Q3.2=Yes | 5 options (see Appendix) |
| 3.8 | Hours worked last week | Number | Yes | Q3.1 = Yes | Must be 0-168 |
| 3.9 | Estimated Monthly Income (Naira) | Number | No | Q3.1 = Yes | Cannot be negative |

---

## Section 4: Household & Welfare

| # | Question | Response Type | Required | Validation / Notes |
|---|----------|---------------|----------|-------------------|
| 4.1 | Are you the Head of Household? | Yes / No | Yes | - |
| 4.2 | Total people in household | Number | Yes | Minimum: 1 |
| 4.3 | Number of dependents (Children/Elderly) | Number | Yes | Cannot exceed household size |
| 4.4 | Housing Ownership Status | Single Choice | Yes | 5 options (see Appendix) |

---

## Section 5: Skills & Business

| # | Question | Response Type | Required | Show If | Validation / Notes |
|---|----------|---------------|----------|---------|-------------------|
| 5.1 | Primary Skills (Select all that apply) | Multiple Choice | Yes | Always | 50+ skills in 8 categories |
| 5.2 | Other skills not listed above | Text | No | Always | Maximum 200 characters |
| 5.3 | Skills you would like to learn | Multiple Choice | No | Always | Same skills list |
| 5.4 | Do you own or operate a business? | Yes / No | Yes | Always | - |
| 5.5 | Business Name | Text | Yes | Q5.4 = Yes | - |
| 5.6 | Is your business registered with CAC? | Single Choice | Yes | Q5.4 = Yes | 3 options |
| 5.7 | Business Premises Address | Text | Yes | Q5.4 = Yes | - |
| 5.8 | Number of apprentices/trainees/interns | Number | No | Q5.4 = Yes | Cannot be negative |

---

## Section 6: Public Skills Marketplace

| # | Question | Response Type | Required | Show If | Validation / Notes |
|---|----------|---------------|----------|---------|-------------------|
| 6.0 | Marketplace explanation note | Display Only | - | Always | Explains anonymous vs enriched profiles |
| 6.1 | Join Anonymous Skills Marketplace? | Yes / No | Yes | Always | Profession, LGA, experience visible |
| 6.2 | Allow employers to see Name and Phone? | Yes / No | Yes | Q6.1 = Yes | Enables direct contact |
| 6.3 | Professional Bio | Text | No | Q6.2 = Yes | Maximum 150 characters |
| 6.4 | Portfolio or Social Media Link | Text (URL) | No | Q6.2 = Yes | - |

---

## Appendix A: Choice Options Reference

### Gender Options
| Value | Label |
|-------|-------|
| male | Male |
| female | Female |
| other | Prefer not to say |

### Marital Status Options
| Value | Label |
|-------|-------|
| single | Single |
| married | Married |
| divorced | Divorced |
| widowed | Widowed |
| separated | Separated |

### Education Level Options (9 levels)
| Value | Label |
|-------|-------|
| none | No Formal Education |
| primary | Primary School |
| jss | Junior Secondary (JSS) |
| sss | Senior Secondary (SSS/WAEC) |
| vocational | Vocational/Technical Training |
| nce_ond | NCE/OND |
| hnd_bsc | HND/Bachelor's Degree |
| masters | Master's Degree |
| doctorate | Doctorate/PhD |

### Employment Type Options (6 types)
| Value | Label |
|-------|-------|
| wage_public | Wage Earner (Government/Public Sector) |
| wage_private | Wage Earner (Private Sector) |
| self_employed | Self-Employed (Artisan/Trader/Business Owner) |
| contractor | Contractor/Consultant |
| family_unpaid | Unpaid Family Worker |
| apprentice | Apprentice/Intern |

### Years of Experience Options
| Value | Label |
|-------|-------|
| less_1 | Less than 1 year |
| 1_3 | 1-3 years |
| 4_6 | 4-6 years |
| 7_10 | 7-10 years |
| over_10 | Over 10 years |

### Housing Status Options (5 options)
| Value | Label |
|-------|-------|
| owned | Owned |
| rented | Rented |
| family | Living with Family (Free) |
| employer | Employer-Provided |
| other | Other |

### Business Registration Status
| Value | Label |
|-------|-------|
| registered | Yes, registered with CAC |
| unregistered | No, not registered |
| in_progress | Registration in progress |

### LGA List (33 Oyo State Local Government Areas)
Afijio, Akinyele, Atiba, Atisbo, Egbeda, Ibadan North, Ibadan North-East, Ibadan North-West, Ibadan South-East, Ibadan South-West, Ibarapa Central, Ibarapa East, Ibarapa North, Ido, Irepo, Iseyin, Itesiwaju, Iwajowa, Kajola, Lagelu, Ogbomosho North, Ogbomosho South, Ogo Oluwa, Olorunsogo, Oluyole, Ona Ara, Orelope, Ori Ire, Oyo East, Oyo West, Saki East, Saki West, Surulere

---

## Appendix B: Skills List (50+ Skills by Category)

### Construction & Building Trades (11)
Carpentry/Woodwork, Plumbing, Electrical Installation, Welding & Fabrication, Masonry/Bricklaying, Painting & Decoration, Tiling & Flooring, Roofing, HVAC/Air Conditioning, Solar Installation, Aluminum & Glass Fitting

### Automotive & Mechanical (7)
Auto Mechanic, Auto Electrician, Panel Beating & Spray Painting, Vulcanizing/Tire Services, Motorcycle/Tricycle Repair, Heavy Equipment Operation, Generator Repair

### Fashion, Beauty & Personal Care (8)
Tailoring/Sewing, Fashion Design, Hairdressing/Styling, Barbing, Makeup Artistry, Shoe Making/Cobbling, Bag Making/Leather Craft, Jewelry Making

### Food, Agriculture & Processing (7)
Crop Farming, Livestock/Poultry Farming, Fishery/Aquaculture, Catering/Event Cooking, Baking & Confectionery, Food Processing/Preservation, Butchery/Meat Processing

### Digital, Technology & Office (9)
Software Development, Web Design/Development, Graphic Design, Video Editing/Production, Data Entry/Typing, Accounting/Bookkeeping, Office Administration, Computer/Phone Repair, Social Media Management

### Healthcare & Wellness (6)
Nursing/Patient Care, Pharmacy Assistant, Laboratory Technician, Community Health Worker, Elderly/Child Caregiving, Physiotherapy Assistant

### Education & Professional Services (7)
Teaching/Tutoring, Professional Driving, Security Services, Event Planning/Decoration, Photography/Videography, Professional Cleaning, Laundry/Dry Cleaning

### Artisan & Traditional Crafts (6)
Furniture Making, Upholstery, Pottery/Ceramics, Blacksmithing, Weaving/Textile Crafts, Sign Writing/Branding

---

## Appendix C: Validation Rules Summary

| Field | Constraint | Error Message |
|-------|------------|---------------|
| NIN | 11 digits, numeric only | "NIN must be exactly 11 digits" |
| Phone | Nigerian mobile (0[7-9][0-1]xxxxxxxx) | "Enter valid Nigerian mobile number" |
| Age | >= 15 years from DOB | "Respondent must be 15 years or older" |
| DOB | <= today() | "Cannot be a future date" |
| Hours Worked | 0-168 range | "Hours must be between 0 and 168" |
| Monthly Income | >= 0 | "Cannot be negative" |
| Dependents | < household_size | "Dependents cannot exceed household size" |
| Household Size | >= 1 | "Must be at least 1" |
| Bio | <= 150 characters | "Bio must be 150 characters or less" |
| Skills Other | <= 200 characters | "Maximum 200 characters" |

---

## Reviewer Sign-Off

| Checklist Item | Status |
|----------------|--------|
| Content accuracy verified | [ ] |
| Skip logic approved | [ ] |
| Validation rules confirmed | [ ] |
| Options lists complete | [ ] |
| PRD alignment verified | [ ] |

**Reviewer Name:** _______________________

**Date:** _______________________

**Signature:** _______________________

**Comments:**

_______________________________________________________

_______________________________________________________

---

*Document prepared for validator review - OSLSR Project*
*Version 3.0 | January 2026*
