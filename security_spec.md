# Security Specification — Planificador de reuniones

## 1. Data Invariants
1. **Meeting Identity & Visibility**: Every `/meetings/{meetingId}` document must have `organizerUid == request.auth.uid` on creation, `visibility == 'shared'`, `createdAt == request.time`, and `updatedAt == request.time`.
2. **Participant Relational Ownership & Self-Registration**: Every `/meetings/{meetingId}/participants/{participantId}` document must reference an existing parent `/meetings/{meetingId}` with `visibility == 'shared'`, have `meetingId == meetingId`, `participantId == request.auth.uid` on creation, `ownerUid == request.auth.uid`, and `isShared == true`.
3. **Strict Bounds**:
   - `title`: 1..140 chars
   - `description`: 0..500 chars
   - `dates`: list of 1..14 date strings
   - `slots`: map of at most 350 entries
4. **Immutable Ownership & Timestamps**: `organizerUid`, `ownerUid`, `meetingId`, `id`, and `createdAt` cannot be modified after creation.
5. **Verified UGR Auth for Writes**: All create/update/delete operations require `request.auth != null && request.auth.token.email_verified == true` and an institutional UGR email (`@ugr.es`, `@go.ugr.es`, or `@correo.ugr.es`).
6. **Public Shared Readability (No PII)**: Meetings and participant availability choices contain no emails, phones, or addresses and are readable via `visibility == 'shared'` / `isShared == true` so everyone with access can view group consensus.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Meeting Creation**: `create /meetings/m1` with `request.auth == null`.
2. **Unverified Email Write**: `create /meetings/m1` with `email_verified == false`.
3. **Organizer UID Spoofing**: `create /meetings/m1` with `organizerUid: "other-uid"`.
4. **Shadow Field Injection on Meeting**: `create /meetings/m1` including extra key `isAdmin: true`.
5. **Client Timestamp Forgery**: `create /meetings/m1` with client-supplied `createdAt` != `request.time`.
6. **Oversized ID Poisoning**: `create /meetings/<200-char-invalid-id>` or special chars `../bad`.
7. **Unbounded Dates Array Attack**: `create /meetings/m1` with 50 dates (`size() > 14`).
8. **Non-Organizer Confirming Slot**: `update /meetings/m1` changing `confirmedSlotId` as a different user.
9. **Orphaned Participant Creation**: `create /meetings/nonexistent/participants/p1`.
10. **Participant Owner Spoofing**: `create /meetings/m1/participants/p1` with `ownerUid: "victim-uid"`.
11. **Unauthorized Availability Overwrite**: `update /meetings/m1/participants/p1` by a user who is neither `ownerUid` nor `organizerUid`.
12. **Blanket List Without Visibility Filter**: `list /meetings` on documents where `visibility != 'shared'`.
