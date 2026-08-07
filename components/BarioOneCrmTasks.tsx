'use client'

import { useEffect, useState } from 'react'

type Task = { id: string; title: string; status: 'open' | 'done'; due_at: string | null; contact_name: string | null }

function AddTaskForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await fetch('/api/bario-one/crm/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, dueAt: dueAt || undefined }),
      })
      setTitle('')
      setDueAt('')
      onAdded()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 flex flex-wrap gap-2 mb-4">
      <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task…" className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={dueAt} onChange={(e) => setDueAt(e.target.value)} type="date" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
        Add
      </button>
    </form>
  )
}

export default function BarioOneCrmTasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/crm/tasks')
    const data = await res.json()
    setTasks(data.tasks ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function toggle(task: Task) {
    const nextStatus = task.status === 'open' ? 'done' : 'open'
    setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)) ?? null)
    await fetch(`/api/bario-one/crm/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
  }

  if (tasks === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div>
      <AddTaskForm onAdded={load} />
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No tasks yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {tasks.map((t) => (
            <label key={t.id} className="flex items-center gap-3 p-3 cursor-pointer">
              <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} className="w-4 h-4" />
              <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>{t.title}</span>
              {t.contact_name && <span className="text-xs text-slate-500 dark:text-zinc-400">{t.contact_name}</span>}
              {t.due_at && <span className="text-xs text-slate-500 dark:text-zinc-400">{new Date(t.due_at).toLocaleDateString()}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
