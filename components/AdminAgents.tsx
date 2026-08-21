'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Task = {
  id: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'done'
  target_agent: string | null
  result_json: string | null
}

const SPECIALISTS = ['research', 'writer', 'coder', 'data_analyst', 'designer', 'marketer', 'sales', 'support', 'ops_automation', 'legal_review', 'finance', 'recruiter', 'project_manager']

function parseResult(resultJson: string | null): { finalDelivery?: string; error?: string; verdict?: string; revisions?: number } | null {
  if (!resultJson) return null
  try {
    return JSON.parse(resultJson)
  } catch {
    return null
  }
}
type AgentWithTasks = {
  id: string
  slug: string
  name: string
  role: string
  description: string
  responsibilities: string
  channels: string
  status: string
  tasks: Task[]
}

const TASK_STYLE: Record<string, string> = {
  open: 'bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
}

function AgentCard({ agent, onChanged }: { agent: AgentWithTasks; onChanged: () => void }) {
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [targetAgent, setTargetAgent] = useState('')
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: taskTitle, description: taskDesc, targetAgent: targetAgent || undefined }),
      })
      if (res.ok) {
        setTaskTitle('')
        setTaskDesc('')
        setTargetAgent('')
        onChanged()
      }
    } finally {
      setAdding(false)
    }
  }

  async function setTaskStatus(taskId: string, status: string) {
    await fetch(`/api/admin/agents/${agent.id}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onChanged()
  }

  async function runTask(taskId: string) {
    setRunningTaskId(taskId)
    try {
      await fetch(`/api/admin/agents/${agent.id}/tasks/${taskId}/run`, { method: 'POST' })
      onChanged()
    } finally {
      setRunningTaskId(null)
    }
  }

  const openTasks = agent.tasks.filter((t) => t.status !== 'done')
  const doneTasks = agent.tasks.filter((t) => t.status === 'done')

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg">{agent.name}</p>
          <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium">{agent.role}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium shrink-0">
          {agent.status}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2">{agent.description}</p>
      <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">📡 {agent.channels}</p>
      {agent.slug === 'victoria' && (
        <a href="/admin/victoria" className="inline-block text-xs text-cyan-600 dark:text-cyan-400 mt-2 hover:underline">
          📞 View call log & real cost →
        </a>
      )}

      <button onClick={() => setExpanded((e) => !e)} className="text-xs text-cyan-600 dark:text-cyan-400 mt-3 hover:underline">
        {expanded ? 'Hide details' : 'Show responsibilities & tasks'} ({openTasks.length} open task{openTasks.length === 1 ? '' : 's'})
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Responsibilities</p>
            <p className="text-xs text-slate-600 dark:text-zinc-400">{agent.responsibilities}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">Tasks</p>
            <div className="space-y-1.5">
              {agent.tasks.length === 0 && <p className="text-xs text-slate-500 dark:text-zinc-500">No tasks added yet.</p>}
              {[...openTasks, ...doneTasks].map((t) => {
                const result = parseResult(t.result_json)
                return (
                  <div key={t.id} className="bg-white/50 dark:bg-black/20 rounded-lg p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={t.status === 'done' ? 'line-through text-slate-400 dark:text-zinc-600' : 'text-slate-700 dark:text-zinc-300'}>{t.title}</p>
                        {t.description && <p className="text-slate-500 dark:text-zinc-500">{t.description}</p>}
                        {t.target_agent && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 text-[10px] font-medium">
                            → {t.target_agent}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.target_agent && (
                          <button
                            onClick={() => runTask(t.id)}
                            disabled={runningTaskId === t.id}
                            className="px-2 py-0.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-semibold disabled:opacity-50"
                          >
                            {runningTaskId === t.id ? 'Running…' : result ? 'Re-run' : 'Run now'}
                          </button>
                        )}
                        <select
                          value={t.status}
                          onChange={(e) => setTaskStatus(t.id, e.target.value)}
                          className={`px-1.5 py-0.5 rounded-full text-xs border-0 ${TASK_STYLE[t.status]}`}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    </div>
                    {result && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400">
                        {result.error ? (
                          <p className="text-red-500 dark:text-red-400">Error: {result.error}</p>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap">{result.finalDelivery}</p>
                            <p className="text-slate-400 dark:text-zinc-600 mt-1">{result.verdict} · {result.revisions} revision{result.revisions === 1 ? '' : 's'}</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <form onSubmit={addTask} className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Add a task…"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                />
                <select
                  value={targetAgent}
                  onChange={(e) => setTargetAgent(e.target.value)}
                  title="Run through the AI agency as this specialist (optional — leave blank for a plain manual to-do)"
                  className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                >
                  <option value="">Manual to-do</option>
                  {SPECIALISTS.map((s) => (
                    <option key={s} value={s}>
                      Run as: {s}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={adding || !taskTitle.trim()}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {targetAgent && (
                <input
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Objective the agency should see (falls back to the title above if left blank)"
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                />
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminAgents() {
  const [agents, setAgents] = useState<AgentWithTasks[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newAgent, setNewAgent] = useState({ name: '', role: '', description: '', responsibilities: '', channels: '' })
  const [creating, setCreating] = useState(false)

  function load() {
    fetch('/api/admin/agents')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setAgents(data.agents)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(load, [])

  async function createAgent(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newAgent),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create agent')
      setNewAgent({ name: '', role: '', description: '', responsibilities: '', channels: '' })
      setShowNewForm(false)
      load()
    } catch (err: any) {
      alert(err.message)
    }
    setCreating(false)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Agents</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Every AI agent running on the platform, what they're actually responsible for, and their task list — so nothing gets assigned twice.
            </p>
            <a href="/admin" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Admin</a>
          </div>
          <ThemeToggle />
        </div>

        <button
          onClick={() => setShowNewForm((s) => !s)}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold text-sm"
        >
          {showNewForm ? 'Cancel' : '+ Register a new agent'}
        </button>

        {showNewForm && (
          <form onSubmit={createAgent} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 space-y-3">
            <input
              required
              placeholder="Name (e.g. Layla)"
              value={newAgent.name}
              onChange={(e) => setNewAgent((a) => ({ ...a, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              required
              placeholder="Role (e.g. Social Media Assistant)"
              value={newAgent.role}
              onChange={(e) => setNewAgent((a) => ({ ...a, role: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <textarea
              placeholder="Description"
              value={newAgent.description}
              onChange={(e) => setNewAgent((a) => ({ ...a, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              rows={2}
            />
            <textarea
              placeholder="Responsibilities"
              value={newAgent.responsibilities}
              onChange={(e) => setNewAgent((a) => ({ ...a, responsibilities: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              rows={2}
            />
            <input
              placeholder="Channels (e.g. Phone: +1..., or Chat: /admin/...)"
              value={newAgent.channels}
              onChange={(e) => setNewAgent((a) => ({ ...a, channels: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create agent'}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        {!agents && !error && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}

        <div className="space-y-4">
          {agents?.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onChanged={load} />
          ))}
        </div>
      </div>
    </main>
  )
}
