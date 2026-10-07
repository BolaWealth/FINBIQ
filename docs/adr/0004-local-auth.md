# ADR-0004: Local auth posture (no SMTP) + partner-gated items

Date: 2026-10-07
Status: Accepted

## Auth without SMTP
- `requireEmailVerification: false` LOCALLY ONLY (no mail server on this device).
- Prod MUST flip to `true` + configure SMTP before launch (PRD Sec.40 launch criteria: KYC/AML, disclosures).
- TOTP 2FA (`twoFactor` plugin, `migrate_003.sql`) works fully offline via authenticator apps — enabled for all users, no SMS/email dependency.
- Demo account `demo-user-1` remains preselected in web until real login; session-aware header when signed in.

## Read-only finance previews (no partner needed)
- `GET /v1/financing/estimate`: rule-based affordability estimate from ledger inflow/outflow. Labeled ESTIMATE, no application, no disbursement. Live products require lending license/partner (PRD Sec.16/23).
- `GET /v1/investments`: static education catalog with risk labels. No execution, no holdings. Live execution requires licensed provider (PRD Sec.18).

## Still partner-gated (correctly absent)
Bank rails, live lending, live investments, payroll/cards/international (PRD Sec.26 post-MVP).
