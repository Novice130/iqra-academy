/**
 * Teacher/Admin Messages Inbox — lists every student's support thread
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import { eq, and, isNull, like, inArray, desc } from "drizzle-orm";
import { chatRooms, chatMessages, users } from "@/db/schema";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export default async function TeacherMessagesPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) return null;

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { id: true, orgId: true, role: true },
    });
    if (!dbUser || !["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(dbUser.role)) {
      redirect("/dashboard");
    }

    const rooms = await db.query.chatRooms.findMany({
      where: and(
        eq(chatRooms.orgId, dbUser.orgId),
        isNull(chatRooms.sessionId),
        like(chatRooms.name, "Support:%")
      ),
    });

    const studentIds = rooms.map((r) => r.name.replace("Support: ", "").trim());
    const students = studentIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, studentIds),
          columns: { id: true, name: true, email: true },
        })
      : [];
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const threads = await Promise.all(
      rooms.map(async (room) => {
        const lastMessage = await db.query.chatMessages.findFirst({
          where: eq(chatMessages.roomId, room.id),
          orderBy: [desc(chatMessages.createdAt)],
        });
        const studentId = room.name.replace("Support: ", "").trim();
        const student = studentMap.get(studentId);
        return { room, lastMessage, student, studentId };
      })
    );

    threads.sort((a, b) => {
      const at = a.lastMessage?.createdAt?.getTime() ?? 0;
      const bt = b.lastMessage?.createdAt?.getTime() ?? 0;
      return bt - at;
    });

    return (
      <div className="p-6 lg:p-10 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Messages
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Student and parent support threads
          </p>
        </div>

        <div className="card">
          {threads.length > 0 ? (
            threads.map(({ room, lastMessage, student, studentId }, i) => (
              <Link
                key={room.id}
                href={`/dashboard/chat?studentId=${studentId}&studentName=${encodeURIComponent(student?.name || "Student")}`}
                className="flex items-center justify-between p-4 hover:opacity-80 transition-opacity"
                style={{ borderBottom: i < threads.length - 1 ? "1px solid var(--border)" : undefined }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: "var(--accent)" }}>
                    {(student?.name || "?")[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {student?.name || "Unknown Student"}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                      {lastMessage?.content || "No messages yet"}
                    </div>
                  </div>
                </div>
                {lastMessage && (
                  <div className="text-xs shrink-0 ml-3" style={{ color: "var(--text-tertiary)" }}>
                    {formatDistanceToNow(lastMessage.createdAt)} ago
                  </div>
                )}
              </Link>
            ))
          ) : (
            <div className="p-10 text-center">
              <p className="text-sm italic" style={{ color: "var(--text-tertiary)" }}>No student messages yet.</p>
            </div>
          )}
        </div>
      </div>
    );
  });
}
