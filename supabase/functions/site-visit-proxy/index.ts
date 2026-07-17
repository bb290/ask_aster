// Site Visit proxy for the Sagareus weekly site visit widget (saga-site-visit.module).
//
// The widget is a tap-through checklist on an internal page (/site-visit). This
// function holds the Asana PAT server-side (the "Asana Bot" account) and does the
// writes the agents used to do by hand:
//   - action "vacancies": list the agent's assigned vacancies (Leasing | LU project)
//   - action "submit": post the marked-up checklist as a comment on the property's
//     "Weekly Site Visit / Inspection" subtask (created if missing), and create a
//     maintenance subtask on the LU task for every item flagged "create ticket",
//     assigned to the property's Turn Over Coordinator (TO task assignee), due date
//     respecting the Accountability Rule's 72-hour line when a move-in date is set.
//   - action "photo": attach one photo (base64 jpeg) to the inspection subtask.
//
// Secrets: ASANA_PAT (required), SITE_VISIT_KEY (shared team key the widget sends).
// Per the Weekly Site Visit SOP (Outline doc yjZFdeB9EC).

import { Hono } from "hono";

const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";
const TEAM_KEY = Deno.env.get("SITE_VISIT_KEY") ?? "";
const WORKSPACE = "706990140225747";
const LEASING_LU_PROJECT = "1213171756304238";
const ASANA = "https://app.asana.com/api/1.0";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://www.sagareus.com,https://sagareus.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = new Hono();

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith(".sagareus.com") ||
    origin.endsWith(".hs-sites.com") ||
    origin.endsWith(".hubspotpagebuilder.com")
  );
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-sv-key",
    "Vary": "Origin",
  };
}

function j(headers: Record<string, string>, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function asana(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASANA}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${ASANA_PAT}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`asana ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data;
}

function addressFromTaskName(name: string): string {
  // "LU | 653 Myrtine St #A, Enumclaw - NOTES" -> "653 Myrtine St #A, Enumclaw"
  const afterBar = name.includes("|") ? name.split("|").slice(1).join("|").trim() : name.trim();
  return afterBar.split(" - ")[0].trim();
}

app.options("*", (c) => new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) }));

app.post("*", async (c) => {
  const origin = c.req.header("origin");
  const headers = corsHeaders(origin);

  if (origin) {
    const ok = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".sagareus.com") || origin.endsWith(".hs-sites.com") || origin.endsWith(".hubspotpagebuilder.com");
    if (!ok) return j(headers, 403, { error: "origin_not_allowed" });
  }
  if (!ASANA_PAT) return j(headers, 500, { error: "server_not_configured", message: "ASANA_PAT is not set." });
  if (TEAM_KEY && c.req.header("x-sv-key") !== TEAM_KEY) {
    return j(headers, 401, { error: "bad_key", message: "This tool is for the Sagareus team. Check the page link with your lead." });
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return j(headers, 400, { error: "bad_json" }); }
  const action = String(body.action ?? "");

  try {
    // ---------- vacancies: the agent's open leasing tasks ----------
    if (action === "vacancies") {
      const agentName = String(body.agentName ?? "").trim();
      if (!agentName) return j(headers, 400, { error: "missing_agent" });
      const users = await asana("GET", `/workspaces/${WORKSPACE}/typeahead?resource_type=user&query=${encodeURIComponent(agentName)}&count=3`);
      const user = (users ?? [])[0];
      if (!user) return j(headers, 404, { error: "agent_not_found", message: `Couldn't find "${agentName}" in Asana.` });
      const tasks = await asana("GET",
        `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASING_LU_PROJECT}&assignee.any=${user.gid}&completed=false&limit=50&opt_fields=name`);
      const vacancies = (tasks ?? [])
        .filter((t: { name: string }) => /^(LU|TP|PreLease)\s*\|/i.test(t.name))
        .map((t: { gid: string; name: string }) => ({ gid: t.gid, name: t.name, address: addressFromTaskName(t.name) }));
      return j(headers, 200, { agentGid: user.gid, agentName: user.name, vacancies });
    }

    // ---------- submit: comment + tickets ----------
    if (action === "submit") {
      const agentName = String(body.agentName ?? "Agent").trim();
      const taskGid = String(body.taskGid ?? "");
      const address = String(body.address ?? "");
      const generalNote = String(body.generalNote ?? "").trim();
      const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
      if (!taskGid || !items.length) return j(headers, 400, { error: "missing_fields" });

      // 1) find or create the Weekly Site Visit / Inspection subtask
      const subtasks = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name`);
      let inspection = (subtasks ?? []).find((s: { name: string }) => /site\s*visit/i.test(s.name) && /inspect/i.test(s.name)) ??
                       (subtasks ?? []).find((s: { name: string }) => /weekly\s*site\s*visit/i.test(s.name));
      if (!inspection) {
        inspection = await asana("POST", `/tasks/${taskGid}/subtasks`, {
          name: "Weekly Site Visit / Inspection",
          notes: "Site visit documentation lives here. Every visit: one comment with the marked-up checklist and at least 2 photos. SOP: https://sagareus.getoutline.com/doc/weekly-site-visit-yjZFdeB9EC",
        });
      }

      // 2) move-in date (for the 72-hour rule) from the leasing task custom fields
      let moveIn: Date | null = null;
      try {
        const lu = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        const mi = (lu.custom_fields ?? []).find((f: { name: string }) => /move in date/i.test(f.name));
        if (mi?.display_value) moveIn = new Date(mi.display_value);
      } catch { /* non-fatal */ }

      // 3) Turn Over Coordinator = assignee of the "Turn Over | <address>" task
      let toCoordinator: { gid: string; name: string } | null = null;
      try {
        const hits = await asana("GET",
          `/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent("Turn Over | " + address.slice(0, 40))}&count=5&opt_fields=name,assignee.name`);
        const to = (hits ?? []).find((t: { name: string }) => /^turn\s*over\s*\|/i.test(t.name));
        if (to?.assignee) toCoordinator = { gid: to.assignee.gid, name: to.assignee.name };
      } catch { /* non-fatal */ }

      // 4) due date: default +3 days; if move-in is near, land 3+ days before it (never before tomorrow)
      const today = new Date();
      let due = new Date(today.getTime() + 3 * 86400000);
      if (moveIn && !isNaN(moveIn.getTime())) {
        const cutoff = new Date(moveIn.getTime() - 3 * 86400000);
        if (cutoff < due) due = cutoff;
        const tomorrow = new Date(today.getTime() + 86400000);
        if (due < tomorrow) due = tomorrow;
      }
      const dueOn = due.toISOString().slice(0, 10);

      // 5) create a maintenance subtask per flagged item, on the LU task
      const created: Array<{ gid: string; name: string; url: string }> = [];
      for (const it of items) {
        if (!it.ticket) continue;
        const label = String(it.item ?? "Issue");
        const note = String(it.note ?? "").trim();
        const name = `${note ? note : label} // ${address}`.slice(0, 250);
        const sub = await asana("POST", `/tasks/${taskGid}/subtasks`, {
          name,
          ...(toCoordinator ? { assignee: toCoordinator.gid } : {}),
          due_on: dueOn,
          notes: `Found on weekly site visit by ${agentName} (${today.toISOString().slice(0, 10)}).\nChecklist item: ${label}${note ? `\nNote: ${note}` : ""}\nPhotos on the Weekly Site Visit / Inspection subtask.${toCoordinator ? "" : "\nNo Turn Over task found for this property. Assign to your Turn Over Coordinator."}`,
        });
        created.push({ gid: sub.gid, name: sub.name, url: `https://app.asana.com/0/0/${sub.gid}` });
      }

      // 6) post the checklist comment on the inspection subtask
      const bySection: Record<string, string[]> = {};
      for (const it of items) {
        const sec = String(it.section ?? "CHECKLIST");
        const mark = it.answer === "yes" ? "(Y)" : it.answer === "no" ? "(N)" : "(na)";
        const note = String(it.note ?? "").trim();
        (bySection[sec] = bySection[sec] || []).push(
          `${mark} ${it.item}${note ? ` -- ${note}` : ""}${it.ticket ? " [ticket created]" : ""}`);
      }
      const lines: string[] = [`SITE VISIT -- ${today.toISOString().slice(0, 10)} -- by ${agentName} (via site visit tool)`, ""];
      for (const sec of Object.keys(bySection)) { lines.push(sec); lines.push(...bySection[sec]); lines.push(""); }
      if (generalNote) { lines.push("Notes:"); lines.push(generalNote); lines.push(""); }
      lines.push(`RESULT: ${created.length ? `${created.length} issue subtask(s) created${toCoordinator ? `, assigned to ${toCoordinator.name}` : ""}` : "All good, no issues found"}`);
      await asana("POST", `/tasks/${inspection.gid}/stories`, { text: lines.join("\n") });

      return j(headers, 200, {
        ok: true,
        inspectionGid: inspection.gid,
        inspectionUrl: `https://app.asana.com/0/0/${inspection.gid}`,
        subtasks: created,
        assignee: toCoordinator ? toCoordinator.name : null,
        dueOn,
      });
    }

    // ---------- photo: attach one jpeg to the inspection subtask ----------
    if (action === "photo") {
      const parent = String(body.parent ?? "");
      const filename = String(body.filename ?? "site-visit.jpg").replace(/[^\w.\-]/g, "_");
      const dataB64 = String(body.dataB64 ?? "");
      if (!parent || !dataB64 || dataB64.length > 8_000_000) return j(headers, 400, { error: "bad_photo" });
      const bytes = Uint8Array.from(atob(dataB64), (ch) => ch.charCodeAt(0));
      const form = new FormData();
      form.append("parent", parent);
      form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);
      const res = await fetch(`${ASANA}/attachments`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${ASANA_PAT}` },
        body: form,
      });
      if (!res.ok) return j(headers, 502, { error: "attach_failed" });
      return j(headers, 200, { ok: true });
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return j(headers, 502, { error: "asana_failed", message: "Asana didn't accept that. Try again; if it keeps failing, do this one manually and tell your lead." });
  }
});

Deno.serve(app.fetch);
