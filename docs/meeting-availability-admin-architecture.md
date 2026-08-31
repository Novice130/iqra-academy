# Meeting End, Teacher Availability, Admin Control & Schedule Architecture

## 1. End Meeting for All Participants

### Problem
When a teacher ends a live session, student clients could remain in an orphaned LiveKit room or miss the teardown signal if the leave handler only marked local state or if the asynchronous `/api/sessions/[id]/end` request was delayed or unhandled.

### Solution
1. **Data Channel Broadcast**: When the host/teacher initiates meeting teardown in `CallControlBar`, publish a reliable JSON data packet `{ type: 'CLASS_ENDED', sessionId }` across the LiveKit room.
2. **Synchronous Server Teardown**: Call `/api/sessions/[id]/end` using `keepalive: true` and beacon fallback:
   - Updates `sessions.status = 'COMPLETED'` and `actualEnd = new Date()`.
   - Closes all open attendance rows via `closeAttendanceRows()`.
   - Force-deletes the LiveKit room via `getRoomServiceClient().deleteRoom(roomName)`.
3. **Student Reaction**: In `LiveKitRoom` / `CustomVideoConference`, listen to both the data channel `'CLASS_ENDED'` event and LiveKit room disconnect/deletion events. When received, immediately show an ending banner and redirect to `/dashboard`.

---

## 2. Teacher Availability & Student Booking Slots

### Problem
- In `POST /api/teachers/availability`, verifying teacher ownership required `and(eq(users.id, teacherId), eq(users.orgId, ctx.orgId))`. If `ctx.orgId` or `users.orgId` was `NULL`, SQL `NULL = NULL` failed, causing a `NotFoundError("Teacher")` and preventing teachers from saving availability.
- In `lib/slots.ts` `generateSlots()`, querying `teacherAvailability` filtered by `eq(teacherAvailability.orgId, opts.orgId)`. If `orgId` was not set on the student or differed, slots were not generated for students.

### Solution
1. **Availability Persistence API**:
   - In `POST /api/teachers/availability`, if `teacherId === ctx.userId`, match `eq(users.id, teacherId)` directly.
   - Fallback `orgId` to `teacher.orgId || ctx.orgId || "org_default"`.
2. **Slot Generation Logic**:
   - In `lib/slots.ts` `generateSlots()`, match `teacherAvailability.teacherId = opts.teacherId` when specified, or match the org while allowing default/null org matches.
   - Return clean ISO strings for slot generation.
3. **Client Sync**:
   - Dispatch `teacher-availability-updated` and broadcast across tabs so open booking pages refresh immediately.

---

## 3. Admin Panel & Role Separation

### Problem
The navigation bar previously mixed student items ("Book a Class") into admin and teacher sidebars. The root admin (`syedamer130@gmail.com`) needed full administrator controls (assigning students to teachers, checking attendance, managing users and invoices) without clutter from student/teacher self-service controls.

### Solution
1. **Role-Based Navigation in `DashboardChrome`**:
   - **Admin (`ORG_ADMIN`, `SUPER_ADMIN`, or `syedamer130@gmail.com`)**:
     - Admin Panel (`/admin`)
     - Assign Students (`/admin/assign-student`)
     - Attendance & Class History (`/dashboard/attendance`)
     - Users & Teacher Roles (`/admin/users`)
     - Invoices & Billing (`/admin/invoices`)
     - Settings (`/dashboard/settings`)
   - **Teacher (`TEACHER`)**:
     - Teacher Home (`/dashboard/teacher`)
     - Messages (`/dashboard/teacher/messages`)
     - My Students (`/dashboard/teacher/students`)
     - Availability (`/dashboard/teacher/availability`)
     - Attendance (`/dashboard/attendance`)
     - Schedule (`/dashboard/schedule`)
     - Settings (`/dashboard/settings`)
   - **Student (`STUDENT`)**:
     - Home (`/dashboard`)
     - Book a Class (`/dashboard/booking`)
     - Progress (`/dashboard/progress`)
     - Messages (`/dashboard/chat`)
     - Schedule (`/dashboard/schedule`)
     - Billing (`/dashboard/billing`)
     - Settings (`/dashboard/settings`)
2. **Student Assignment UI (`/admin/assign-student`)**:
   - Provides an interactive dashboard for admins to select any student profile, select an active teacher, specify subject/track, pick schedule dates/times, and assign them with one click.

---

## 4. Live Classes vs Scheduled Classes Matrix

### Problem
Live classes and scheduled classes were intertwined. The user requested:
- **Live Classes**: Strictly show active, ongoing classes on LiveKit with participant counts and join/inspect capability.
- **Scheduled Classes**: A clean, tabular matrix organized by Date & Teacher (columns/rows) showing all scheduled sessions per teacher.

### Solution
1. **Admin Panel Matrix**:
   - **Tab 1: Live Classes Now**: Real-time monitor of active LiveKit rooms.
   - **Tab 2: Scheduled Classes Matrix**: Tabular column view with Dates x Teachers, displaying student names, course tracks, scheduled start/end times, and status.
