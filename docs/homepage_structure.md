# OSLSR Homepage & Navigation Specification

**Version:** 2.0 (Policy Aligned)
**Date:** 2026-01-01
**Status:** ONE SOURCE OF TRUTH - APPROVED

## 1. Homepage Content Strategy (Wireframe-Ready)

### **1.1 Global Header**
*   **Left:** Oyo State Government Crest + "OSLSR"
*   **Nav:** About | Participate | Marketplace | Insights | Support
*   **Right:** [Login / Register] (CTA)

### **1.2 Hero Section**
*   **Headline:** Building a Clear Picture of Oyo State’s Workforce.
*   **Sub-headline:** The **Oyo State Labour & Skills Registry** helps government plan better jobs, skills training, and economic opportunities — using accurate data collected directly from residents.
*   **CTA:** [Register Your Skills] (Primary) | [Learn How It Works] (Secondary)

### **1.3 What Is OSLSR? (The "Why")**
*   **Copy:** The Oyo State Labour & Skills Registry (OSLSR) is a government initiative to help Oyo State better understand its workforce. It allows residents to securely register their skills, work experience, and employment status using their mobile phones, even without internet access.

### **1.4 Who Can Participate? (Audience Cards)**
1.  **Residents:** Register your skills and work status to be counted.
2.  **Skilled Workers:** Showcase your trade and get verified for opportunities.
3.  **Businesses:** Share workforce data to inform planning.
4.  **Enumerators:** Support community registration using secure offline tools.

### **1.5 Coverage & Progress (Live Metrics)**
*   **Metrics:** 33 LGAs Covered | XX,XXX Registrations | Ongoing Data Collection.

### **1.6 THE PUBLIC SKILLS MARKETPLACE**
*   **Headline:** Find Verified Local Talent.
*   **Sub-headline:** Connect with skilled artisans and professionals in your LGA.
*   **Search Preview (Interactive):**
    *   [ Dropdown: Select Skill ]
    *   [ Dropdown: Select LGA ]
    *   [ Button: Search Marketplace ]
*   **Trust Signal:** "Look for the **Government Verified** badge for certified professionals."

### **1.7 Trust & Data Protection**
*   **Copy:** Fully compliant with the Nigeria Data Protection Act (NDPA). No raw identity data is publicly exposed. Your privacy is our priority.

### **1.8 Getting Started (Steps 1-3)**
1.  Register with your phone number.
2.  Provide skills/work information.
3.  Contribute to Oyo State's future.

### **1.9 Footer**
*   **CTA:** **Your skills matter. Register today and help shape Oyo State’s future workforce.**
*   **Col 1:** About OSLSR | Governance | Legal
*   **Col 2:** Register | Check Status | Skilled Worker Registry
*   **Col 3:** Dashboards | Reports | Methodology
*   **Col 4:** Help Center | Contact Us | FAQs

---

## 2. React Router Navigation Schema (Developer-Ready)

```jsx
import { Routes, Route } from "react-router-dom";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Branding & About */}
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<AboutRDCP />} />
      <Route path="/about/governance" element={<Governance />} />
      <Route path="/about/data-protection" element={<DataProtection />} />

      {/* Participation & Input (The "Supply") */}
      <Route path="/register" element={<Register />} />
      <Route path="/register/individual" element={<IndividualRegister />} />
      <Route path="/register/skilled-workers" element={<SkilledWorkerRegistry />} />
      <Route path="/register/business" element={<BusinessRegister />} />
      <Route path="/register/status" element={<CheckStatus />} />

      {/* The Marketplace (The "Demand") */}
      <Route path="/marketplace" element={<MarketplaceHome />} />
      <Route path="/marketplace/search" element={<MarketplaceSearch />} />
      <Route path="/marketplace/profile/:id" element={<WorkerProfile />} />

      {/* Data, Insights & Resources */}
      <Route path="/insights" element={<Insights />} />
      <Route path="/resources" element={<Resources />} />
      <Route path="/support" element={<Support />} />

      {/* Authenticated Dashboards */}
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard/*" element={<ProtectedDashboard />} />
    </Routes>
  );
}
```
