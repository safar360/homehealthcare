# Home Healthcare Product Requirements Document (PRD)

## 1. Product Overview
Home Healthcare is a digital platform designed to connect patients, healthcare staff, and admin/managers in a simple and low-cost workflow. The first phase focuses on the patient experience while creating a foundation for future staff and admin modules.

## 2. Problem Statement
Families and patients need a simple way to track care visits, receive updates, and communicate with healthcare providers from home. Existing manual processes are often fragmented, slow, and hard to monitor.

## 3. Goals
- Make healthcare coordination simple and transparent for patients
- Reduce manual communication between patients and care teams
- Build a low-cost foundation using Supabase and a web/mobile-friendly frontend
- Prepare the system for future staff and admin workflows

## 4. Target Users
### Patients
- View care plans
- See visit schedule
- Track staff arrival
- Request support

### Healthcare Staff
- Receive assigned visits
- Update visit progress
- Check in and out

### Admins/Managers
- Assign staff
- Monitor visits
- Manage schedules and records

## 5. Core Features for Phase 1
- User sign-up and login
- Patient dashboard
- Daily care plan view
- Upcoming visit schedule
- Staff status and ETA updates
- Support request form

## 6. Functional Requirements
- Users must be able to sign in securely.
- Patients must be able to view care plans and schedules.
- Patients must be able to see the assigned staff and ETA.
- Patients must be able to request support.
- Admins/managers must be able to assign visits to staff.
- Staff must be able to update visit status.

## 7. Technical Approach
- Frontend: React web app for browser-based prototype, ready for future Flutter mobile expansion
- Backend: Supabase
- Database: PostgreSQL
- Auth: Supabase Auth
- Storage: Supabase Storage
- Notifications: Firebase Cloud Messaging
- Hosting: Vercel or Cloudflare Pages

## 8. Success Criteria
- Patients can view their care plan and upcoming visits
- The app can be tested in a browser immediately
- The system is ready for future staff and admin module expansion
