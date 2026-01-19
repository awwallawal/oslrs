# OSLSR Public Website - Information Architecture

**Version:** 1.0
**Date:** 2026-01-18
**Status:** SINGLE SOURCE OF TRUTH
**Related Documents:**
- `docs/homepage_structure.md` - Navigation schema and wireframe
- `_bmad-output/planning-artifacts/ux-design-specification.md` - Design system

---

## 1. Key Design Decisions

### Corrections from Previous Sessions

| Topic | Incorrect Assumption | Correct Understanding |
|-------|---------------------|----------------------|
| ID Cards | For all registrants | Staff-only (supervisors/enumerators) for field work |
| Public Users | Get ID cards | Get "Government Verified" badge on profile |
| Photo Requirement | Required for all | NOT required for public registration |
| Staff Portal | In main navigation | In footer only |
| CTA Button | Multiple options | Smart button: [Register / Continue] (Option D chosen) |

---

## 2. Navigation Structure

### Primary Navigation (Header)

```
[Oyo State Crest + OSLSR]  About | Participate | Marketplace | Insights | Support  [Register / Sign In]
```

### Footer Structure

```
ABOUT               PARTICIPATE         INSIGHTS          SUPPORT
├── The Initiative  ├── For Workers     ├── Dashboard     ├── FAQ
├── How It Works    ├── For Employers   ├── Skills Map    ├── Guides
├── Leadership      └── (No Government) ├── Trends        ├── Contact
├── Partners                            └── Reports       └── Verify Worker
└── Privacy

[Staff Portal]

(c) 2026 Oyo State Ministry of Labour | NDPA Compliant
```

---

## 3. Page-by-Page Content Architecture

### 3.1 Homepage (/)

**Purpose:** First impression, value proposition, route visitors to relevant paths

**Sections:**
1. **Hero**
   - Headline: "Building a Clear Picture of Oyo State's Workforce"
   - Sub-headline: About OSLSR initiative
   - CTAs: [Register Your Skills] (Primary) | [Learn How It Works] (Secondary)

2. **What Is OSLSR?**
   - Brief explanation of the initiative
   - Trust-building government backing

3. **Who Can Participate?** (Audience Cards)
   - Residents - Register skills
   - Skilled Workers - Showcase and get verified
   - Businesses - Share workforce data
   - Enumerators - Field work support

4. **Live Metrics**
   - 33 LGAs Covered
   - XX,XXX Registrations
   - Ongoing Data Collection

5. **Marketplace Preview**
   - Headline: "Find Verified Local Talent"
   - Search Preview (dropdowns for Skill, LGA)
   - Trust Signal: "Government Verified" badge explanation

6. **Trust & Data Protection**
   - NDPA compliance statement
   - Privacy assurance

7. **Getting Started Steps**
   - 3-step visual process

---

### 3.2 About Section

#### /about (Landing)

**Purpose:** Institutional trust-building, navigate to sub-pages

**Content:**
- Mission statement
- Government backing (Oyo State Ministry of Labour)
- Links to sub-pages

---

#### /about/initiative

**Purpose:** Explain the "why" behind OSLSR

**Content Outline:**
1. **The Challenge**
   - Lack of accurate workforce data
   - Informal economy visibility gaps
   - Policy planning challenges

2. **The Solution**
   - State-wide skills registry
   - Mobile-first data collection
   - Offline capability

3. **The Goals**
   - Better government planning
   - Skills training targeting
   - Economic opportunity matching

---

#### /about/how-it-works

**Purpose:** Visual step-by-step registration walkthrough

**Content (4 Steps):**

```
  CREATE          VERIFY          COMPLETE        GET
  ACCOUNT   -->   EMAIL    -->    SURVEY    -->   VERIFIED
```

1. **Create Account**
   - Visit registration page
   - Enter phone, email, NIN
   - Create password
   - Note: NIN validated locally (checksum only, not stored)

2. **Verify Email**
   - Check inbox
   - Click verification link
   - Account activated

3. **Complete Survey** (~10 minutes)
   - Personal details
   - Work status
   - Skills possessed
   - Note: Save and continue later

4. **Get Verified**
   - Receive Government Verified badge
   - Appear in Marketplace (if opted-in)
   - Access priority programs

**What You'll Need:**
- NIN (11-digit) - validated locally, not stored
- Phone number - Nigerian mobile
- Email address - for verification
- ~10 minutes

---

#### /about/leadership

**Purpose:** Humanize the initiative with real people

**Content:**
- Commissioner photo + quote
- Project Director bio
- Ministry oversight statement
- Contact information

**Note:** Photos and names to be provided by Ministry

---

#### /about/partners

**Purpose:** Show organizational endorsement

**Content:**
- Government agencies (Ministry of Labour, Bureau of Statistics)
- Industry associations
- "Become a Partner" CTA

**Note:** Partner logos to be provided

---

#### /about/privacy

**Purpose:** Full NDPA-compliant privacy policy

**Content Sections:**

1. **TL;DR Summary Box**
   - We collect NIN, contact info, skills data
   - NIN validated but NOT stored publicly
   - You control marketplace visibility
   - You control contact sharing
   - We don't sell data
   - You can request deletion
   - NDPA compliant

2. **What Data We Collect**
   - Personal: Name, NIN, phone, email, DOB, gender, LGA
   - Work: Employment status, occupation, skills, experience
   - Optional: Bio, portfolio link (marketplace only)

3. **How We Use Data**
   - Identity verification
   - Aggregate statistics
   - Policy planning
   - Marketplace visibility (with consent)
   - Contact sharing (with enriched consent)

4. **What We DON'T Do**
   - Sell data - NEVER
   - Share with unauthorized agencies - NEVER
   - Use for surveillance - NEVER
   - Store NIN in plain text - NEVER
   - Display contact without consent - NEVER

5. **Data Protection Measures**
   - Encryption (TLS 1.2+ transit, AES-256 rest)
   - Role-based access control
   - Audit logging
   - Regular security testing

6. **Your Rights Under NDPA**
   - Access your data
   - Correct inaccuracies
   - Delete records
   - Restrict processing
   - Data portability

7. **Data Retention**
   - Survey data: 7 years (government policy)
   - Marketplace profiles: Until consent revoked
   - Account data: 90 days after closure

8. **Contact DPO**
   - Email: dpo@oyostate.gov.ng
   - Response within 30 days (NDPA requirement)

---

### 3.3 Participate Section

#### /participate (Landing)

**Purpose:** Route visitors to appropriate audience path

**Content:**
- Hero: "Join Oyo State's official workforce registry"
- Two cards: Skilled Worker | Employer
- "Not sure?" guidance section

---

#### /participate/workers

**Purpose:** Convince workers to register with clear benefits

**Content Sections:**

1. **Hero**
   - "Get Discovered by Employers Across Oyo State"
   - [Register Now] CTA

2. **Why Register?** (3 Benefit Cards)
   - Government Verified Badge - builds trust with clients
   - Appear in Marketplace - employers can find you
   - Priority Access - government skills programs

   **Note:** Verified badge = profile indicator, NOT ID card

3. **Who Should Register?**
   - Artisans & Tradespeople (electricians, plumbers, carpenters...)
   - Skilled Professionals (tailors, hairdressers, caterers...)
   - Service Workers (drivers, security, cleaners...)
   - Technical & Digital Workers (developers, designers...)
   - Agricultural Workers (farmers, handlers...)
   - Job Seekers

4. **How Registration Works** (4 Steps)
   - Same as /about/how-it-works

5. **What You'll Need**
   - NIN (with "Don't have one?" link to NIMC)
   - Phone number
   - Email address
   - ~10 minutes

6. **Privacy Protection Box**
   - You control visibility
   - You control who contacts you
   - NIN validated, not exposed
   - NDPA compliant
   - [Read Privacy Policy] link

7. **FAQ Section**
   - Is registration free? Yes
   - Do I need a photo? No (NOT required for public)
   - Can I hide from marketplace? Yes
   - Can I update later? Yes (before verification)
   - How long is verification? ~7 days

8. **CTA Section**
   - [Register Now]
   - "Already started? [Continue registration]"

---

#### /participate/employers

**Purpose:** Explain how to find and verify workers

**Content Sections:**

1. **Hero**
   - "Find Verified Skilled Workers in Your Area"
   - [Browse Marketplace] CTA

2. **Why Use Marketplace?** (6 Benefit Cards)
   - Verified Identities - government-verified NINs
   - Local Talent - search by LGA
   - Reduce Hiring Risk - verification confidence
   - Search by Skill - find exact profession
   - Free to Search - no cost
   - Support Local Workforce - strengthen economy

3. **How It Works** (4 Steps)
   - Search Marketplace - skill + LGA
   - View Profiles - anonymized, verification status visible
   - Request Contact - register to see details
   - Hire Directly - no placement fees

4. **Understanding Verification** (Critical Box)

   **What it means:**
   - Worker's NIN validated
   - Identity confirmed
   - Skills registration reviewed
   - Real person in Oyo State

   **What it does NOT mean:**
   - Skills NOT tested directly
   - Work quality NOT guaranteed
   - Employment disputes NOT our responsibility
   - "Verification confirms identity, not competence"

5. **Data Visibility Table**

   | Information | Public Search | Registered User |
   |------------|---------------|-----------------|
   | Profession/Skill | Visible | Visible |
   | LGA | Visible | Visible |
   | Experience | Visible | Visible |
   | Verified Badge | Visible | Visible |
   | Worker's Name | Hidden | Visible* |
   | Phone | Hidden | Visible* |
   | Bio | Hidden | Visible* |

   *Only if worker opted in

6. **Employer Registration**
   - Email, phone, optional business info
   - Note: All contact requests logged, abuse can result in suspension

7. **FAQ Section**
   - Is there a fee? No
   - Can I post jobs? No (directory only)
   - Hidden contact info? Worker chose not to share
   - Report abuse? Use Report button or email
   - Quality guaranteed? No (identity only)

8. **Embedded Search**
   - Skill dropdown
   - LGA dropdown
   - [Search] button
   - Popular skills quicklinks
   - [Create Employer Account] CTA

---

### 3.4 Marketplace Section

#### /marketplace

**Purpose:** Search interface for finding workers

**Phase 1 (Epic 1):** Placeholder with "Coming Soon" and registration CTA
**Phase 2 (Epic 7):** Full search functionality

**Content:**
- Search interface
- Browse by skill/LGA
- Results list with verification badges

#### /marketplace/profile/:id

**Purpose:** View individual worker profile

**Content:**
- Anonymized profile (unless contact visible)
- Verification badge
- Skills, experience, LGA
- Contact details (if opted in + viewer registered)

---

### 3.5 Insights Section

#### /insights

**Purpose:** Aggregate data and statistics - transparency building

**Phase 1:** Placeholder with sample metrics
**Phase 2:** Live data from aggregate APIs

**Potential Metrics:**
- Total registered workers by LGA
- Top 10 skill categories
- Registration trends over time
- Verification completion rates

---

#### /insights/skills-map

**Purpose:** Geographic distribution visualization

#### /insights/trends

**Purpose:** Registration growth, skill demand patterns

#### /insights/reports

**Purpose:** Downloadable aggregate reports (PDF)

---

### 3.6 Support Section

#### /support (Landing)

**Purpose:** Help center entry point

**Content:**
- Search bar
- Common topics
- Quick links to FAQ, Guides, Contact

---

#### /support/faq

**Purpose:** Organized FAQ accordion

**Topics:**
1. Getting Started
   - How do I register?
   - What is NIN and where do I get it?
   - Email not received
   - How to complete profile

2. Account & Security
   - Reset password
   - Update information
   - Delete account

3. Marketplace
   - How do employers find me?
   - What's publicly visible?
   - How to hide profile

4. Verification
   - What does verified badge mean?
   - How long does verification take?
   - Wrong information on profile

---

#### /support/guides

**Purpose:** How-to guides with screenshots

---

#### /support/contact

**Purpose:** Direct contact options

**Content:**
- Email: support@oslsr.oyo.gov.ng
- Phone: +234 xxx xxx xxxx
- Office address
- Contact form

---

#### /support/verify-worker (Story 1.6)

**Purpose:** Public verification tool

**Content:**
- Enter ID card number
- View verification result

---

## 4. Content Architecture (MDX)

### Folder Structure

```
apps/web/src/
├── content/                    # All static page content
│   ├── about/
│   │   ├── index.mdx          # /about
│   │   ├── initiative.mdx     # /about/initiative
│   │   ├── how-it-works.mdx   # /about/how-it-works
│   │   ├── leadership.mdx     # /about/leadership
│   │   ├── partners.mdx       # /about/partners
│   │   └── privacy.mdx        # /about/privacy
│   ├── participate/
│   │   ├── index.mdx          # /participate
│   │   ├── workers.mdx        # /participate/workers
│   │   └── employers.mdx      # /participate/employers
│   ├── support/
│   │   ├── index.mdx          # /support
│   │   ├── faq.mdx            # /support/faq
│   │   ├── guides.mdx         # /support/guides
│   │   └── contact.mdx        # /support/contact
│   └── insights/
│       └── index.mdx          # /insights (shell)
│
├── config/
│   └── navigation.ts          # Single source for nav
│
└── components/
    └── content/
        ├── MDXLayout.tsx      # Wrapper for MDX pages
        └── mdx-components.tsx # Custom components for MDX
```

### Adding New Pages

1. Create `.mdx` file in appropriate folder
2. Add frontmatter (title, description)
3. Write markdown content
4. Add entry to `navigation.ts` if needed

---

## 5. Phase Breakdown

### Phase 1 (Static - Can Build Now)

| Page | Status | API Dependency |
|------|--------|----------------|
| Homepage shell | Ready | None |
| About (all sub-pages) | Ready | None |
| Participate (all sub-pages) | Ready | None |
| Support (FAQ, Guides, Contact) | Ready | None |
| Support/Verify Worker | Ready | Story 1.6 complete |

### Phase 2 (After Epic 7)

| Page | Epic Dependency |
|------|-----------------|
| Marketplace (full functionality) | Epic 7 |
| Insights (live data) | Aggregate data APIs |

---

## 6. Auth/Functional Routes (Not in Main Nav)

| Route | Purpose | Access |
|-------|---------|--------|
| /register | Public user registration | Public |
| /login | Unified login | Public |
| /verify-email | Email verification | Public |
| /forgot-password | Password reset request | Public |
| /reset-password | Password reset form | Public |
| /resend-verification | Resend verification email | Public |
| /onboarding/* | Staff activation | Protected (staff) |
| /dashboard/* | Role-based dashboards | Protected (role-based) |

---

## 7. Component Requirements

### Reusable MDX Components

| Component | Purpose | Used On |
|-----------|---------|---------|
| CallToAction | Primary/secondary CTAs | All pages |
| Accordion | FAQ sections | FAQ, Privacy |
| Alert | Info/warning boxes | How It Works, Workers |
| StatsGrid | Metrics display | Homepage, Insights |
| StepsFlow | Visual step process | How It Works |
| BenefitCard | Feature highlights | Workers, Employers |
| DataTable | Visibility comparison | Employers |
| SearchPreview | Marketplace search | Homepage, Employers |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-18 | Epic 1 Retrospective | Initial consolidation from recovered session context |

---

**Status:** This document is the SINGLE SOURCE OF TRUTH for public website content architecture. Updates should be reflected here before implementation.
