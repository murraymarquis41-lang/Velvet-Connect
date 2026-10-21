# Velvet Connect Age-Assurance Vendor Requirements

Status: Trust & Safety QA closure sprint
Owner: Founder/CEO approval required before vendor selection
Release posture: adults-only (18+); real-user enrollment remains closed until QA/review gates are complete

## Purpose

Velvet Connect requires an age-assurance provider capable of supporting an adults-only dating service while minimizing collection and retention of identity and biometric data. Vendor marketing claims alone do not satisfy a release gate. Capabilities must be supported by documentation, contractual commitments, and independent or Velvet Connect-controlled testing.

## Required outcome

The integration must return only the minimum result Velvet Connect needs to enforce the 18+ policy, preferably an over/under-18 assertion plus transaction/reference metadata needed for audit and appeal. Raw identity documents, face images, biometric templates, or unrelated identity attributes should not be returned to or retained by Velvet Connect unless a separately approved legal, privacy, and security design requires them.

## Mandatory vendor requirements

### 1. Assurance methods
- Support at least one reliable 18+ verification method appropriate for a dating service.
- Clearly distinguish age estimation from document/identity-based age verification.
- Support step-up verification when an estimation result is uncertain or challenged.
- Provide documented liveness/spoof-resistance controls when face analysis is used.
- Document supported identity documents, issuing regions, and failure modes when documents are used.

### 2. Accuracy and bias evidence
- Provide measured false-accept and false-reject/error rates for the 18+ threshold.
- Provide methodology, sample size, confidence intervals where available, and test conditions.
- Provide demographic performance analysis sufficient to assess materially different error rates across age, skin tone/ethnicity proxies where lawfully measured, gender presentation, and other relevant groups.
- Provide an accessible appeal/retry path for users who are incorrectly rejected.
- Velvet Connect must be able to test the integration with synthetic/test identities or vendor sandbox fixtures before real-user enrollment.

### 3. Privacy and data minimization
- Use age-assurance data only to determine age/eligibility and prevent fraud or abuse directly related to that process.
- Do not use age-assurance data for advertising, profiling, model training, sale, or unrelated product improvement without separate explicit approval and a lawful basis.
- Minimize data collected to what is necessary for the age-assurance purpose.
- Delete raw documents, face images, video, and biometric/derived data promptly after the verification purpose is complete, subject only to narrowly defined legal/security retention needs.
- Provide written retention schedules for every data category.
- Provide deletion APIs/processes and support user deletion requests.
- Identify all subprocessors and processing locations.

### 4. Security
- Encrypt data in transit and at rest.
- Provide current independent security assurance such as SOC 2 Type II, ISO 27001, or equivalent evidence appropriate to the service.
- Provide vulnerability-management and incident-response commitments, including notification timelines.
- Support least-privilege API credentials, key rotation, environment separation, and audit logs.
- Protect verification endpoints against replay, tampering, spoofing, and automated abuse.
- Do not expose secrets or raw sensitive evidence to the client application.

### 5. Integration and decision controls
- Server-authoritative verification result; the client must not be able to self-assert a successful verification.
- Signed or otherwise integrity-protected callback/webhook responses.
- Idempotent verification transactions and replay protection.
- Stable transaction/reference IDs for audit without exposing raw sensitive evidence.
- Explicit states for passed, failed, inconclusive/manual-review, expired, and vendor/system error.
- Configurable retry/step-up policy.
- Sandbox/test mode separated from production.

### 6. Human review and user recourse
- No irreversible Velvet Connect enforcement solely from an opaque vendor score.
- Provide a retry, alternative method, or human-review route for inconclusive/incorrect results.
- Provide enough reason/error information for Velvet Connect support to explain next steps without revealing anti-fraud controls.
- Support accessibility accommodations and users who cannot successfully use face- or document-based methods.

### 7. Legal, contractual, and governance requirements
- Execute a data-processing agreement and appropriate confidentiality/security terms before production use.
- Contractually prohibit secondary use inconsistent with Velvet Connect instructions.
- Disclose data locations, cross-border transfers, subprocessors, retention, deletion, and government/law-enforcement request handling.
- Provide evidence supporting compliance claims; vendor claims are not accepted as independent proof.
- Permit Velvet Connect to suspend the integration if a material privacy, security, accuracy, or regulatory risk is identified.

### 8. Operational requirements
- Published availability/SLA and support escalation path.
- Documented rate limits, latency, geographic coverage, maintenance behavior, and outage handling.
- Versioned API and advance notice for breaking changes.
- Exportable audit evidence for verification transactions without exporting unnecessary sensitive data.
- Pricing model suitable for sandbox, private beta, and scaled production scenarios.

## Minimum acceptance tests before beta

1. Under-18 boundary cases are rejected.
2. 18th-birthday boundary is accepted according to Velvet Connect date policy.
3. Client-side tampering cannot create a verified result.
4. Replayed/stale verification results are rejected.
5. Inconclusive/error results fail closed for enrollment and present a retry/step-up path.
6. Raw sensitive evidence is not stored in Velvet Connect application tables/logs.
7. Vendor deletion/retention behavior is demonstrated with test evidence.
8. Webhook/API authenticity validation is demonstrated.
9. Accessibility/alternate verification path is documented and tested where available.
10. Privacy and security review accepts the final data flow before real-user enrollment.

## Evidence sources informing these requirements

- NIST SP 800-63-4 and SP 800-63A-4 (2025): current U.S. digital identity and identity-proofing guidance, including security/privacy and assurance concepts.
- U.S. Federal Trade Commission, February 25, 2026 age-verification enforcement policy statement: age-verification data should be used only for determining age, retained no longer than necessary, and shared only with capable confidentiality/security providers under written assurances.
- UK Information Commissioner's Office age-assurance guidance: apply data minimization so age-assurance processing is adequate, relevant, and limited to what is necessary.

These sources are guidance inputs, not a representation that Velvet Connect is a federal identity provider or that any specific vendor/integration is legally sufficient. Final production use requires legal/privacy review of the actual implementation, jurisdictions, contracts, and data flows.
