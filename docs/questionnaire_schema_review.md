# OSLSR Labour & Skills Registry Survey
## Questionnaire Schema for Validator Review

**Version:** 2.0 (Policy Aligned)
**Date:** 2026-01-01
**Form ID:** oslsr_master_v1
**Status:** FOR REVIEW

---

## Form Settings

| Setting | Value |
|---------|-------|
| Form Title | OSLSR Labour & Skills Registry Survey |
| Default Language | English |
| Submission Endpoint | /api/webhook/odk |

---

## Section 1: Introduction & Consent

| # | Question | Response Type | Required | Validation / Notes |
|---|----------|---------------|----------|-------------------|
| 1.1 | Welcome note introducing the Oyo State Labour & Skills Registry (OSLSR) | Display Only | - | Informational text |
| 1.2 | Do you consent to participate? | Yes / No | Yes | Must consent to proceed |

---

## Section 2: Identity & Demographics

*Condition: Only shown if participant consents (Q1.2 = Yes)*

| # | Question | Response Type | Required | Validation / Notes |
|---|----------|---------------|----------|-------------------|
| 2.1 | Surname | Text | Yes | - |
| 2.2 | First Name | Text | Yes | - |
| 2.3 | Gender | Single Choice | Yes | Options: Male, Female, Other |
| 2.4 | Date of Birth | Date | Yes | Cannot be a future date |
| 2.5 | Age | Auto-calculated | - | Derived from Date of Birth; Must be 15+ years |
| 2.6 | Marital Status | Single Choice | Yes | Options: Single, Married, Divorced, Widowed |
| 2.7 | Highest Education Completed | Single Choice | Yes | Options: None, Primary, Secondary, Vocational/Technical, Tertiary |
| 2.8 | Do you have any disability? | Yes / No | Yes | - |
| 2.9 | Phone Number | Text | Yes | Must be valid Nigerian format (e.g., 08012345678) |
| 2.10 | NIN (National Identification Number) | Text | No | Must be exactly 11 digits if provided |
| 2.11 | GPS Location | Geolocation | Yes | Captured automatically |

---

## Section 3: Labour Force Participation

*Condition: Only shown if participant is 15 years or older*

| # | Question | Response Type | Required | Condition | Validation / Notes |
|---|----------|---------------|----------|-----------|-------------------|
| 3.1 | Worked for pay/profit in the last 7 days? | Yes / No | Yes | Always shown | - |
| 3.2 | Temporarily absent from a job? | Yes / No | Yes | If Q3.1 = No | - |
| 3.3 | Looked for work in the last 4 weeks? | Yes / No | Yes | If Q3.2 = No | - |
| 3.4 | Available to start work within 2 weeks? | Yes / No | Yes | If Q3.3 = No | - |
| 3.5 | Main Occupation | Text | Yes | If Q3.1 = Yes OR Q3.2 = Yes | - |
| 3.6 | Type of Employment | Single Choice | Yes | If Q3.1 = Yes OR Q3.2 = Yes | Options: Wage Earner, Self-Employed, Unpaid Family Worker |
| 3.7 | Hours worked last week | Number | Yes | If Q3.1 = Yes | Must be between 0 and 168 |
| 3.8 | Estimated Monthly Income (Naira) | Number | No | If Q3.1 = Yes | - |

---

## Section 4: Household & Welfare

| # | Question | Response Type | Required | Validation / Notes |
|---|----------|---------------|----------|-------------------|
| 4.1 | Are you the Head of Household? | Yes / No | Yes | - |
| 4.2 | Total people in household | Number | Yes | Minimum value: 1 |
| 4.3 | Number of dependents (Children/Elderly) | Number | Yes | Cannot exceed total household size |
| 4.4 | Housing Ownership | Single Choice | No | Options: Owned, Rented, Living with Family (Free) |

---

## Section 5: Skills & Interest

| # | Question | Response Type | Required | Condition | Validation / Notes |
|---|----------|---------------|----------|-----------|-------------------|
| 5.1 | Primary Skills (Select all that apply) | Multiple Choice | Yes | Always shown | See Skills List below |
| 5.2 | Skills you wish to learn | Multiple Choice | No | Always shown | See Skills List below |
| 5.3 | Do you own a business? | Yes / No | Yes | Always shown | - |
| 5.4 | Business Name | Text | Yes | If Q5.3 = Yes | - |
| 5.5 | Registered with CAC? | Single Choice | Yes | If Q5.3 = Yes | Options: Registered, Unregistered |

---

## Section 6: Public Skills Marketplace

| # | Question | Response Type | Required | Condition | Validation / Notes |
|---|----------|---------------|----------|-----------|-------------------|
| 6.1 | Join Anonymous Skills Marketplace? | Yes / No | Yes | Always shown | Allows skills to be visible anonymously |
| 6.2 | Allow employers to see your Name and Phone? | Yes / No | Yes | If Q6.1 = Yes | Enables direct contact |
| 6.3 | Professional Bio | Text | No | If Q6.2 = Yes | Maximum 150 characters |
| 6.4 | Portfolio Link | Text (URL) | No | If Q6.2 = Yes | - |

---

## Appendix A: Choice Options Reference

### Gender Options
| Value | Label |
|-------|-------|
| male | Male |
| female | Female |
| other | Other |

### Marital Status Options
| Value | Label |
|-------|-------|
| single | Single |
| married | Married |
| divorced | Divorced |
| widowed | Widowed |

### Education Level Options
| Value | Label |
|-------|-------|
| none | No Formal Education |
| primary | Primary |
| secondary | Secondary |
| vocational | Vocational/Technical |
| tertiary | Tertiary (Degree/HND) |

### Employment Type Options
| Value | Label |
|-------|-------|
| wage | Wage Earner (Public/Private) |
| self | Self-Employed (Artisan/Business) |
| family | Unpaid Family Worker |

### Housing Status Options
| Value | Label |
|-------|-------|
| owned | Owned |
| rented | Rented |
| family | Living with Family (Free) |

### Skills List (for Q5.1 and Q5.2)
| Value | Label |
|-------|-------|
| carpentry | Carpentry |
| plumbing | Plumbing |
| electrical | Electrical/Solar |
| farming | Farming/Agriculture |
| tailoring | Fashion/Tailoring |
| mechanical | Auto-Mechanical |
| software | Software/Digital |
| teaching | Teaching/Education |
| nursing | Healthcare/Nursing |

### Business Registration Status
| Value | Label |
|-------|-------|
| registered | Registered (CAC) |
| unregistered | Unregistered |

---

*Document prepared for validator review - OSLSR Project*
