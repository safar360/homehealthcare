# Home Healthcare Requirements and Solution Brief

## Table of Contents
- [1. Overview](#1-overview)
- [2. Business Context](#2-business-context)
- [3. Target Users and Roles](#3-target-users-and-roles)
- [4. Phase 1 Scope](#4-phase-1-scope)
- [5. Functional Requirements](#5-functional-requirements)
- [6. Technical Architecture](#6-technical-architecture)
- [7. Backend and Security Requirements](#7-backend-and-security-requirements)
- [8. Workflow Overview](#8-workflow-overview)
- [9. Delivery Roadmap](#9-delivery-roadmap)

## 1. Overview
Create a low-cost, scalable home healthcare platform that connects three main user groups:
- Patients
- Healthcare staff
- Admins/managers

The first phase focuses on the patient experience while keeping the foundation ready for future staff and admin modules.

## 2. Business Context
Pari Home Healthcare provides at-home medical, non-medical, and elder care services. The platform should support booking, dispatching, monitoring, and administrative workflows for services such as:
- In-home nursing care
- Home care attendants and caregivers
- Elder care and senior care management
- Physiotherapy at home
- Doctor visits and consultations
- Medical equipment rental and delivery
- Lab sample collection at home

The system should also support location-based dispatching, geo-fencing, service radius validation, and regional pricing/taxation.

## 3. Target Users and Roles

### 3.1 Patients / Family Members
- Browse services and select plans
- Book caregiver or nurse visits
- Track assigned staff when en route
- View billing and invoices
- Request support or emergency help

### 3.2 Healthcare Staff
- Receive assigned visits
- View schedules
- Check in and check out with GPS verification
- Update visit status and task completion

### 3.3 Managers / Admins
- Assign staff to patients
- Monitor service status
- Manage appointments, records, and complaints
- Review operations and scheduling

### 3.4 Super Admin (future phase)
- Review analytics and reports
- Manage payroll and role assignments
- Configure platform settings

## 4. Phase 1 Scope

### 4.1 Patient App MVP
- Sign up or log in
- View a dashboard after login
- Review daily care plan and tasks
- View upcoming visits and appointments
- See nurse/assistant status and ETA
- Request support or emergency help

### 4.2 Future Phase Scope
- Staff mobile app for check-in and status updates
- Admin/manager dashboard for scheduling and assignment
- Push notifications and document uploads

## 5. Functional Requirements
1. Patients can create an account and log in securely.
2. Patients can view their daily care plan with tasks and timing.
3. Patients can see upcoming visits and service details.
4. Patients can receive status updates for assigned healthcare staff.
5. Patients can request support from the care team.
6. Healthcare staff can receive assigned visits and update their status.
7. Admins/managers can assign staff and oversee schedules.
8. The system should support both on-demand and recurring visits.
9. The system should support equipment booking and delivery workflows.

## 6. Technical Architecture
Recommended zero-cost starter stack:
- Frontend apps: React + TypeScript + Vite, responsive web (mobile-first)
- Backend and database: Supabase with PostgreSQL
- Authentication: Supabase Auth with role-based access
- Notifications: Firebase Cloud Messaging
- Email: Resend or Brevo
- Hosting: Vercel or Cloudflare Pages

## 7. Backend and Security Requirements
- Use Supabase Auth for secure user authentication.
- Use Supabase PostgreSQL for patient, staff, appointment, and care-plan data.
- Use Row Level Security (RLS) to protect sensitive health records.
- Use Supabase Storage for medical documents or receipts.
- Use Edge Functions for future assignment logic and automation.

## 8. Workflow Overview
1. Patient logs in.
2. Patient views care plan and upcoming visit details.
3. Staff receives assignment and updates arrival status.
4. Admin/manager assigns or reassigns staff as needed.
5. Notifications are sent to the relevant party through FCM.

## 9. Delivery Roadmap
### Phase 1
- Patient app MVP
- Basic Supabase backend setup
- Care plan and appointment view
- Support request flow

### Phase 2
- Staff mobile app
- Check-in/check-out and visit updates

### Phase 3
- Admin/manager dashboard
- Advanced scheduling, assignments, notifications, and reporting

## 10. Notes for UX and Implementation
- The UI should be mobile-first and responsive for tablets, web, and desktop.
- The first mockup should prioritize patient booking flow and staff tracking clarity.
- The system should be designed to avoid storing health metrics such as blood pressure or pulse in the initial phase.
- The architecture should remain flexible enough for future expansion without major rework.