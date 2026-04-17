import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGetAuth, apiSend } from "../lib/api";

type MemberOpt = { id: string; name: string; tvId: string };

type Task = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  memberId: string | null;
  scheduledAt: string | null;
  member: MemberOpt | null;
};

export function StaffDispatch() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [notes, setNotes] = useState("");
  const [memberId, setMemberId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([
        apiGetAuth<{ tasks: Task[] }>("/api/admin/dispatch-tasks"),
        apiGetAuth<{ members: MemberOpt[] }>("/api/admin/members-options"),
      ]);
      setTasks(t.tasks);
      setMembers(m.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await apiSend("/api/admin/dispatch-tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          status,
          notes: notes || null,
          memberId: memberId || null,
          scheduledAt: scheduledAt || null,
        }),
      });
      const full = await apiGetAuth<{ tasks: Task[] }>(
        "/api/admin/dispatch-tasks"
      );
      setTasks(full.tasks);
      setTitle("");
      setNotes("");
      setMemberId("");
      setScheduledAt("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const updateTask = async (t: Task, patch: Partial<Task>) => {
    try {
      await apiSend(`/api/admin/dispatch-tasks/${t.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: patch.title ?? t.title,
          status: patch.status ?? t.status,
          notes: patch.notes !== undefined ? patch.notes : t.notes,
          memberId: patch.memberId !== undefined ? patch.memberId : t.memberId,
          scheduledAt:
            patch.scheduledAt !== undefined
              ? patch.scheduledAt
              : t.scheduledAt,
        }),
      });
      const full = await apiGetAuth<{ tasks: Task[] }>(
        "/api/admin/dispatch-tasks"
      );
      setTasks(full.tasks);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete task?")) return;
    try {
      await apiSend(`/api/admin/dispatch-tasks/${id}`, { method: "DELETE" });
      setTasks((x) => x.filter((t) => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-white">
        Dispatch
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Jobs and follow-ups. Optionally link a verified member.
      </p>

      <form
        onSubmit={add}
        className="mt-8 grid max-w-2xl gap-3 rounded-2xl border border-white/10 bg-ink-900/40 p-5 sm:grid-cols-2"
      >
        <input
          placeholder="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-white sm:col-span-2"
          required
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-white"
        >
          {["PENDING", "IN_PROGRESS", "DONE"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-white"
        />
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-white sm:col-span-2"
        >
          <option value="">No member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.tvId})
            </option>
          ))}
        </select>
        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-white sm:col-span-2"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Add task
        </button>
      </form>

      {error ? <p className="mt-6 text-red-300">{error}</p> : null}
      {loading ? (
        <p className="mt-8 text-slate-500">Loading…</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-white/10 bg-ink-900/30 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-white">{t.title}</p>
                  {t.member ? (
                    <Link
                      to={`/staff/members/${t.member.id}`}
                      className="text-xs text-brand-300 hover:underline"
                    >
                      {t.member.name}
                    </Link>
                  ) : null}
                  {t.scheduledAt ? (
                    <p className="text-xs text-slate-500">
                      {new Date(t.scheduledAt).toLocaleString()}
                    </p>
                  ) : null}
                  {t.notes ? (
                    <p className="mt-1 text-sm text-slate-400">{t.notes}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={t.status}
                    onChange={(e) =>
                      updateTask(t, { status: e.target.value })
                    }
                    className="rounded-lg border border-white/10 bg-ink-950 px-2 py-1 text-xs text-white"
                  >
                    {["PENDING", "IN_PROGRESS", "DONE"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="text-xs text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
