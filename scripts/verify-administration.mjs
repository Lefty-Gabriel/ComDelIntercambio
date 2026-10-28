// Run after npm run build --workspace api, with --env-file=.env and --allow-test-data.
// All writes are confined to uniquely created verification users/courses and cleaned up.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "../apps/api/dist/app.module.js";
import { SupabaseService } from "../apps/api/dist/common/supabase/supabase.service.js";
if (!process.argv.includes("--allow-test-data"))
  throw Error("Explicit --allow-test-data is required");
const run = randomBytes(8).toString("hex");
const password = randomBytes(24).toString("base64url") + "Aa1!";
const ownedUsers = [];
const ownedCourses = [];
const ownedFiles = [];
let adminId;
let app;
let supabase;
let passed = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  passed++;
  console.log("OK: " + label);
};
try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, "127.0.0.1");
  supabase = app.get(SupabaseService).client;
  const base = await app.getUrl();
  async function request(path, token, method = "GET", body, expected = 200) {
    const headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    if (body && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method,
      headers,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    });
    const payload = await response.json();
    assert.equal(
      response.status,
      expected,
      path + ": " + JSON.stringify(payload.message || payload.error || ""),
    );
    return payload;
  }
  const email = (role) => "verification-" + role + "-" + run + "@example.com";
  const initial = await supabase.auth.admin.createUser({
    email: email("admin"),
    password,
    email_confirm: true,
    user_metadata: { full_name: "Verification admin" },
    app_metadata: { verification_run: run },
  });
  if (initial.error) throw initial.error;
  adminId = initial.data.user.id;
  ownedUsers.push(adminId);
  const roleUpdate = await supabase
    .schema("iam")
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", adminId);
  if (roleUpdate.error) throw roleUpdate.error;
  const admin = await request(
    "/auth/login",
    null,
    "POST",
    { email: email("admin"), password },
    201,
  );
  const adminToken = admin.accessToken;
  for (const role of ["mentor", "estudiante"]) {
    const created = await request(
      "/users",
      adminToken,
      "POST",
      { email: email(role), password, fullName: "Verification " + role, role },
      201,
    );
    ownedUsers.push(created.id);
  }
  const mentor = await request(
    "/auth/login",
    null,
    "POST",
    { email: email("mentor"), password },
    201,
  );
  const student = await request(
    "/auth/login",
    null,
    "POST",
    { email: email("estudiante"), password },
    201,
  );
  const mentorId = ownedUsers[1],
    studentId = ownedUsers[2];
  check(
    (await request("/users", adminToken)).some((user) => user.id === studentId),
    "professor and student created and authenticated against Supabase",
  );
  const course = await request(
    "/courses",
    adminToken,
    "POST",
    {
      title: "Verification " + run,
      description: "Isolated administrative verification",
      docenteId: mentorId,
      category: "Verification",
      level: "Inicial",
    },
    201,
  );
  ownedCourses.push(course.id);
  const module = await request(
    "/admin/courses/" + course.id + "/modules",
    adminToken,
    "POST",
    { title: "Initial module", position: 0 },
    201,
  );
  const draft = {
    title: "Learning lesson",
    position: 0,
    durationMinutes: 5,
    summary: "Verification lesson",
    content: "Persistent course content",
    isPublished: false,
    videoId: null,
  };
  const lesson = await request(
    "/admin/modules/" + module.id + "/lessons",
    adminToken,
    "POST",
    draft,
    201,
  );
  await request(
    "/admin/courses/" + course.id + "/modules",
    student.accessToken,
    "POST",
    { title: "Denied module", position: 1 },
    403,
  );
  check(
    (await request("/admin/courses/" + course.id + "/curriculum", adminToken))
      .modules[0].lessons[0].content_text === draft.content,
    "course, module and draft lesson persisted; student cannot administer",
  );
  const access = await request(
    "/admin/access",
    adminToken,
    "POST",
    {
      courseId: course.id,
      studentId,
      accessType: "full",
      status: "active",
      expiresAt: null,
    },
    201,
  );
  let dashboard = await request("/dashboard/student", student.accessToken);
  check(
    dashboard.courses.find((c) => c.id === course.id).totalLessonsCount === 0,
    "draft lesson is hidden from enrolled student",
  );
  await request(
    "/admin/modules/" + module.id + "/lessons/" + lesson.id,
    adminToken,
    "PATCH",
    { ...draft, isPublished: true },
  );
  await request(
    "/admin/lessons/" + lesson.id + "/resources/link",
    adminToken,
    "POST",
    {
      title: "Complementary reference",
      externalUrl: "https://example.com/reference",
      kind: "complementary",
      resourceType: "link",
      isPublished: true,
    },
    201,
  );
  // Build a valid, tiny one-page PDF without external services.
  const stream = "BT /F1 12 Tf 20 100 Td (Administrative verification) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += index + 1 + " 0 obj\n" + object + "\nendobj\n";
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
    xref +
    "\n%%EOF";
  const form = new FormData();
  form.append("title", "Verification downloadable PDF");
  form.append(
    "file",
    new Blob([pdf], { type: "application/pdf" }),
    "verification.pdf",
  );
  const resource = await request(
    "/admin/lessons/" + lesson.id + "/resources/upload",
    adminToken,
    "POST",
    form,
    201,
  );
  ownedFiles.push(resource.storage_path);
  await request("/admin/resources/" + resource.id, adminToken, "PATCH", {
    isPublished: true,
  });
  dashboard = await request("/dashboard/student", student.accessToken);
  const learned = dashboard.courses.find((c) => c.id === course.id);
  check(
    learned.modules[0].lessons[0].resources.length === 2,
    "published lesson, complementary link and uploaded file reach the student",
  );
  const download = await request(
    "/dashboard/student/resources/" + resource.id + "/access",
    student.accessToken,
  );
  const bytes = await fetch(download.url);
  check(
    bytes.ok && (await bytes.text()).startsWith("%PDF-1.4"),
    "private PDF downloads through an authorized signed URL",
  );
  await request(
    "/dashboard/student/lessons/" + lesson.id,
    student.accessToken,
    "PATCH",
    { completed: true },
  );
  dashboard = await request("/dashboard/student", student.accessToken);
  check(
    dashboard.courses.find((c) => c.id === course.id).progressPercent === 100,
    "student completion produces real persisted 100 percent progress",
  );
  await request(
    "/dashboard/student/courses/" + course.id + "/resume",
    student.accessToken,
    "PUT",
    { lessonId: lesson.id, positionSeconds: 37 },
  );
  check(
    (
      await request(
        "/dashboard/student/courses/" + course.id + "/resume",
        student.accessToken,
      )
    ).positionSeconds === 37,
    "resume point is persisted",
  );
  const live = await request(
    "/live-sessions",
    mentor.accessToken,
    "POST",
    {
      courseId: course.id,
      title: "Verification Zoom class",
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      durationMinutes: 60,
      joinUrl: "https://zoom.us/j/123456789",
    },
    201,
  );
  check(
    (await request("/dashboard/mentor", mentor.accessToken)).courses.some(
      (c) => c.id === course.id && c.modules[0].lessons[0].id === lesson.id,
    ),
    "assigned mentor sees the course outline and can schedule Zoom",
  );
  await request("/admin/access/" + access.id, adminToken, "PATCH", {
    accessType: "content",
    status: "active",
    expiresAt: null,
  });
  await request(
    "/live-sessions/" + live.id,
    student.accessToken,
    "GET",
    undefined,
    403,
  );
  check(
    !(await request("/live-sessions", student.accessToken)).some(
      (s) => s.id === live.id,
    ),
    "content-only access blocks live class discovery and direct access",
  );
  await request("/admin/access/" + access.id, adminToken, "PATCH", {
    accessType: "live",
    status: "active",
    expiresAt: null,
  });
  dashboard = await request("/dashboard/student", student.accessToken);
  check(
    dashboard.courses.find((c) => c.id === course.id).modules.length === 0,
    "live-only access hides course lesson content",
  );
  await request(
    "/dashboard/student/resources/" + resource.id + "/access",
    student.accessToken,
    "GET",
    undefined,
    403,
  );
  check(
    (await request("/live-sessions/" + live.id, student.accessToken))
      .joinUrl === live.joinUrl,
    "live-only access permits Zoom while resource endpoint remains protected",
  );
  await request("/admin/access/" + access.id, adminToken, "PATCH", {
    accessType: "full",
    status: "suspended",
    expiresAt: null,
  });
  dashboard = await request("/dashboard/student", student.accessToken);
  check(
    !dashboard.courses.some((c) => c.id === course.id),
    "suspension removes the course from the student dashboard",
  );
  await request(
    "/courses/" + course.id + "/enrollments/by-email",
    mentor.accessToken,
    "POST",
    { email: email("estudiante") },
    403,
  );
  check(
    (await request("/admin/access?courseId=" + course.id, adminToken)).items[0]
      .status === "suspended",
    "mentor enrollment cannot overwrite an administrative suspension",
  );
  await request("/admin/access/" + access.id, adminToken, "PATCH", {
    accessType: "full",
    status: "active",
    expiresAt: null,
  });
  const expire = await supabase
    .schema("courses")
    .from("enrollments")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", access.id);
  if (expire.error) throw expire.error;
  await request(
    "/live-sessions/" + live.id,
    student.accessToken,
    "GET",
    undefined,
    403,
  );
  check(
    !(await request("/dashboard/student", student.accessToken)).courses.some(
      (c) => c.id === course.id,
    ),
    "expired access is rejected using the database clock",
  );
  await request(
    "/admin/courses/" + course.id + "/modules/" + module.id,
    adminToken,
    "PATCH",
    { title: "Edited module", position: 0 },
  );
  check(
    (await request("/admin/courses/" + course.id + "/curriculum", adminToken))
      .modules[0].title === "Edited module",
    "curriculum edits survive reload",
  );
  const adminPanel = await request("/dashboard/admin", adminToken);
  check(
    adminPanel.courses.some(
      (c) =>
        c.id === course.id &&
        c.totalModulesCount === 1 &&
        c.totalLessonsCount === 1,
    ),
    "administrator course summaries contain actual curriculum counts",
  );
  check(
    !(await request("/notifications", student.accessToken)).some(
      (item) => item.courseId === course.id,
    ),
    "expired access also removes course notifications",
  );
  console.log("PASS: " + passed + " real API/Supabase checks");
} finally {
  if (app) await app.close();
  let failures = [];
  if (supabase) {
    if (ownedFiles.length) {
      const result = await supabase.storage
        .from("course-resources")
        .remove(ownedFiles);
      if (result.error) failures.push("test files");
    }
    if (ownedCourses.length) {
      const result = await supabase
        .schema("courses")
        .from("courses")
        .delete()
        .in("id", ownedCourses)
        .eq("created_by", adminId);
      if (result.error) failures.push("test courses");
    }
    for (const id of [...ownedUsers].reverse()) {
      const lookup = await supabase.auth.admin.getUserById(id);
      if (lookup.data.user?.email?.includes(run)) {
        const result = await supabase.auth.admin.deleteUser(id);
        if (result.error) failures.push("test user " + id);
      } else failures.push("ownership validation " + id);
    }
  }
  if (failures.length)
    throw Error("Verification cleanup needs attention: " + failures.join(", "));
  console.log(
    "Cleanup complete: only data created by this verification was removed",
  );
}
