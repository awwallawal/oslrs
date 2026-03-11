# APPENDIX B: SURVEY INSTRUMENT — OSLSR LABOUR & SKILLS REGISTRY SURVEY (VERSION 3.0)

---

## Form Information

| Parameter | Value |
|-----------|-------|
| **Form Title** | OSLSR Labour & Skills Registry Survey |
| **Form ID** | oslsr_master_v3 |
| **Version** | 3.0 (2026012601) |
| **Sections** | 6 |
| **Total Questions** | 36 |
| **Required Fields** | 28 |
| **Conditional Fields** | 12 |
| **Estimated Completion** | 10 minutes |

---

## Section 1: Introduction & Consent

**Section Purpose**: Obtain informed consent before any data collection

| # | Question Text | Type | Required | Logic |
|---|-------------|------|:--------:|-------|
| 1.1 | *"Welcome to the Oyo State Labour & Skills Registry. This survey is conducted by the Ministry of Trade, Industry, Investment and Cooperatives in collaboration with Chemiroy Nigeria Limited. The survey takes approximately 10 minutes and collects information about your skills, employment, and demographic profile for the State Skilled Labour Register. Your data will be handled in accordance with the Nigeria Data Protection Act 2023."* | Display | — | Informational |
| 1.2 | Do you consent to participate in this survey? Your participation is voluntary. | Yes / No | **Yes** | No → Thank you, survey ends |

---

## Section 2: Identity & Demographics

**Section Purpose**: Capture personal identification and demographic profile
**Display Condition**: Q1.2 = Yes (consent granted)

| # | Question Text | Type | Required | Validation |
|---|-------------|------|:--------:|-----------|
| 2.1 | What is your surname? | Text | **Yes** | Non-empty |
| 2.2 | What is your first name? | Text | **Yes** | Non-empty |
| 2.3 | What is your gender? | Select one | **Yes** | — |
| | | *Male* | | |
| | | *Female* | | |
| | | *Prefer not to say* | | |
| 2.4 | What is your date of birth? | Date | **Yes** | Cannot be future; age ≥ 15 |
| 2.5 | Age | Auto-calculated | — | Derived from Q2.4 |
| 2.6 | What is your marital status? | Select one | **Yes** | — |
| | | *Single* | | |
| | | *Married* | | |
| | | *Divorced* | | |
| | | *Widowed* | | |
| | | *Separated* | | |
| 2.7 | What is your highest level of education? | Select one | **Yes** | — |
| | | *No Formal Education* | | |
| | | *Primary School* | | |
| | | *Junior Secondary (JSS)* | | |
| | | *Senior Secondary (SSS/WAEC)* | | |
| | | *Vocational/Technical Training* | | |
| | | *NCE/OND* | | |
| | | *HND/Bachelor's Degree* | | |
| | | *Master's Degree* | | |
| | | *Doctorate/PhD* | | |
| 2.8 | Do you have any disability? | Yes / No | **Yes** | — |
| 2.9 | What is your phone number? | Text | **Yes** | Format: 0[7-9][0-1]XXXXXXXX |
| 2.10 | What is your National Identification Number (NIN)? | Text | **Yes** | Exactly 11 digits; Modulus 11 checksum |
| 2.11 | Which Local Government Area do you reside in? | Select one | **Yes** | 33 Oyo State LGAs |

**Automatic capture** (not displayed to respondent):
- GPS coordinates (latitude/longitude)
- Device identifier
- Timestamp (start/end)
- Enumerator ID (if applicable)

---

## Section 3: Labour Force Participation

**Section Purpose**: ILO ICLS-19 aligned employment status classification
**Display Condition**: Q2.5 (age) ≥ 15

| # | Question Text | Type | Required | Show If | Validation |
|---|-------------|------|:--------:|---------|-----------|
| 3.1 | In the last 7 days, did you do any work for pay, profit, or family gain? | Yes / No | **Yes** | Always | — |
| 3.2 | Were you temporarily absent from a job or business in the last 7 days? (e.g., sick leave, maternity, seasonal break) | Yes / No | **Yes** | Q3.1 = No | — |
| 3.3 | In the last 4 weeks, did you look for a job or try to start a business? | Yes / No | **Yes** | Q3.2 = No | — |
| 3.4 | If a job or business opportunity became available, would you be able to start within 2 weeks? | Yes / No | **Yes** | Q3.3 = No | — |
| 3.5 | What is your main occupation or job title? | Text | **Yes** | Q3.1=Yes OR Q3.2=Yes | — |
| 3.6 | What type of employment best describes your main work? | Select one | **Yes** | Q3.1=Yes OR Q3.2=Yes | — |
| | | *Government/Public Sector Employee* | | | |
| | | *Private Sector Employee* | | | |
| | | *Self-Employed (Artisan/Trader/Business Owner)* | | | |
| | | *Contractor/Consultant* | | | |
| | | *Unpaid Family Worker* | | | |
| | | *Apprentice/Intern* | | | |
| 3.7 | How many years of experience do you have in your main occupation? | Select one | **Yes** | Q3.1=Yes OR Q3.2=Yes | — |
| | | *Less than 1 year* | | | |
| | | *1–3 years* | | | |
| | | *4–6 years* | | | |
| | | *7–10 years* | | | |
| | | *Over 10 years* | | | |
| 3.8 | How many hours did you work last week? | Number | **Yes** | Q3.1 = Yes | 0–168 |
| 3.9 | What is your estimated monthly income in Naira? | Number | No | Q3.1 = Yes | ≥ 0 |

---

## Section 4: Household & Welfare

**Section Purpose**: Household composition and living conditions

| # | Question Text | Type | Required | Validation |
|---|-------------|------|:--------:|-----------|
| 4.1 | Are you the head of your household? | Yes / No | **Yes** | — |
| 4.2 | How many people live in your household (including yourself)? | Number | **Yes** | ≥ 1 |
| 4.3 | How many dependents (children and elderly) are in your household? | Number | **Yes** | ≤ Q4.2 |
| 4.4 | What is your housing status? | Select one | **Yes** | — |
| | | *Owned* | | |
| | | *Rented* | | |
| | | *Living with Family (Free)* | | |
| | | *Employer-Provided* | | |
| | | *Other* | | |

---

## Section 5: Skills & Business

**Section Purpose**: Occupational skills inventory and enterprise data

| # | Question Text | Type | Required | Show If | Validation |
|---|-------------|------|:--------:|---------|-----------|
| 5.1 | What are your primary skills? (Select all that apply from the list below) | Multi-select | **Yes** | Always | 150 skills across 20 sectors |
| 5.2 | Do you have any other skills not listed above? | Text | No | Always | ≤ 200 characters |
| 5.3 | What skills would you like to learn? (Select from the list) | Multi-select | No | Always | Same 150-skill list |
| 5.4 | Do you own or operate a business? | Yes / No | **Yes** | Always | — |
| 5.5 | What is the name of your business? | Text | **Yes** | Q5.4 = Yes | — |
| 5.6 | Is your business registered with the Corporate Affairs Commission (CAC)? | Select one | **Yes** | Q5.4 = Yes | — |
| | | *Yes, registered with CAC* | | | |
| | | *No, not registered* | | | |
| | | *Registration in progress* | | | |
| 5.7 | What is the address of your business premises? | Text | **Yes** | Q5.4 = Yes | — |
| 5.8 | How many apprentices, trainees, or interns do you currently have? | Number | No | Q5.4 = Yes | ≥ 0 |

---

## Section 6: Public Skills Marketplace

**Section Purpose**: Progressive consent for marketplace participation

| # | Question Text | Type | Required | Show If | Validation |
|---|-------------|------|:--------:|---------|-----------|
| 6.0 | *"The Oyo State Skills Marketplace is a public directory where employers and clients can find skilled workers. You can choose to join anonymously (only your skills, location, and experience are visible) or make your name and phone number visible so employers can contact you directly."* | Display | — | Always | Informational |
| 6.1 | Would you like to join the Skills Marketplace? (Your profile will be anonymous — only your skills, LGA, and experience will be visible.) | Yes / No | **Yes** | Always | — |
| 6.2 | Would you like employers to see your name and phone number so they can contact you directly? | Yes / No | **Yes** | Q6.1 = Yes | — |
| 6.3 | Please provide a short professional bio (optional) | Text | No | Q6.2 = Yes | ≤ 150 characters |
| 6.4 | Do you have a portfolio website or social media link? (optional) | URL | No | Q6.2 = Yes | Valid URL format |

---

## Survey End

*"Thank you for participating in the Oyo State Labour & Skills Registry. Your information has been recorded and will be used to build a comprehensive skills database for Oyo State. If you opted into the Skills Marketplace, your profile will be available for employers to find you."*

---

## Skills List Reference (Question 5.1 / 5.3)

*The complete 150-skill taxonomy across 20 sectors is provided in Appendix C.*

---

*Document Reference: CHM/OSLR/2026/001 | Appendix B | Chemiroy Nigeria Limited*
