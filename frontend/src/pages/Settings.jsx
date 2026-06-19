import { useEffect, useRef, useState } from 'react'
import {
  Mail, Users as UsersIcon, GraduationCap, Plus, Trash2, RefreshCw, Eye, EyeOff,
  ChevronDown, Check, Phone, Building2, MapPin, Globe, Pencil, Power,
  Send, CheckCircle2, AlertTriangle, XCircle, Download,
} from 'lucide-react'
import { api } from '../api'
import { Card, Button, Badge, Spinner, Modal, Field, inputClass, Tabs, PageHeader, EmptyState, IconButton, Avatar } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'

const ROLES = [
  { id: 'recruiter', label: 'Recruiter' },
  { id: 'manager', label: 'Manager' },
  { id: 'admin', label: 'Admin' },
  { id: 'panellist', label: 'Panellist' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label]))
const ROLE_TONE = { recruiter: 'violet', manager: 'blue', admin: 'rose', panellist: 'green' }

function genPassword(len = 14) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?'
  return Array.from({ length: len }, () => a[Math.floor(Math.random() * a.length)]).join('')
}

function RolesSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${inputClass} flex items-center justify-between gap-2 text-left`}>
        {/* Show each selected role as its own chip so it reads as a true multi-select. */}
        {value.length ? (
          <span className="flex flex-wrap items-center gap-1">
            {value.map((v) => <Badge key={v} tone={ROLE_TONE[v] || 'gray'}>{ROLE_LABEL[v] || v}</Badge>)}
          </span>
        ) : (
          <span className="text-slate-400">Select one or more roles</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full origin-top menu-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-400">Pick all that apply — a user can hold several roles at once.</div>
          {ROLES.map((r) => {
            const on = value.includes(r.id)
            return (
              <button key={r.id} type="button" onClick={() => toggle(r.id)} aria-pressed={on} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 ${on ? 'bg-brand-50/60' : ''}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span className="text-slate-700">{r.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PasswordField({ value, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input className={`${inputClass} pr-16`} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Password" />
      <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
        <button type="button" title="Generate new" onClick={() => onChange(genPassword())} className="rounded p-1 text-brand-600 transition duration-150 ease-snappy hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-95"><RefreshCw className="h-4 w-4" /></button>
        <button type="button" title={show ? 'Hide' : 'Show'} onClick={() => setShow((s) => !s)} className="rounded p-1 text-slate-500 transition duration-150 ease-snappy hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-95">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>
    </div>
  )
}

function UserModal({ open, onClose, onSaved, user }) {
  const { toast } = useToast()
  const editing = !!user
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setForm(editing
      ? { email: user.email || '', name: user.name || '', title: user.title || '', phone: user.phone || '', roles: user.roles?.length ? user.roles : ['recruiter'], password: '', send: false, active: user.active !== false }
      : { email: '', name: '', title: '', phone: '', roles: ['recruiter'], password: genPassword(), send: false, active: true })
  }, [open, user, editing])
  if (!form) return null

  async function submit() {
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email are required', 'error'); return }
    setBusy(true)
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, phone: form.phone, title: form.title, roles: form.roles, active: form.active }
        if (form.password.trim()) payload.password = form.password
        await api.updateUser(user.id, payload)
        toast('User updated')
      } else {
        const r = await api.createUser({ name: form.name, email: form.email, phone: form.phone, title: form.title, roles: form.roles, password: form.password, send_credentials: form.send })
        toast(form.send ? `User created — credentials ${r.credentials_email || 'queued'}` : 'User created')
      }
      onSaved(); onClose()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit user' : 'Add user'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? <Spinner /> : (editing ? 'Save changes' : 'Add User')}</Button></>}>
      <div className="space-y-4">
        <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" /></Field>
        <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></Field>
        <Field label="Title (optional)"><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Engineer" /></Field>
        <Field label="Roles" hint="Select every role this person needs — e.g. a manager who also sits on interview panels can be both Manager and Panellist."><RolesSelect value={form.roles} onChange={(roles) => setForm({ ...form, roles })} /></Field>
        <Field label={editing ? 'Reset password (optional)' : 'Password'}>
          <PasswordField value={form.password} onChange={(p) => setForm({ ...form, password: p })} />
          {editing && <span className="mt-1 block text-xs text-slate-400">Leave blank to keep the current password.</span>}
        </Field>
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active — can be used and assigned in the tool
          </label>
        ) : (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
            Send email to new user with credentials
          </label>
        )}
      </div>
    </Modal>
  )
}

const TPO_FIELDS = [
  ['name', 'Name', 'Officer name'],
  ['college', 'College / organisation', 'College, university, or vendor'],
  ['email', 'Email', 'tpo@college.edu'],
  ['phone', 'Phone', '+91…'],
  ['designation', 'Designation', 'e.g. Training & Placement Officer'],
  ['linkedin', 'LinkedIn', 'Profile URL'],
  ['address', 'Address', 'Campus address'],
]

function AddTpoModal({ open, onClose, onCreated }) {
  const { toast } = useToast()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setForm({ name: '', college: '', email: '', phone: '', designation: '', linkedin: '', address: '' }) }, [open])
  if (!form) return null

  async function submit() {
    if (!form.name.trim() && !form.college.trim()) { toast('Enter a name or college / organisation', 'error'); return }
    setBusy(true)
    try {
      await api.createTpo(form)
      toast('Hiring partner added')
      onCreated(); onClose()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add placement cell or hiring vendor"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? <Spinner /> : 'Add partner'}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TPO_FIELDS.map(([k, label, ph]) => (
          <div key={k} className={k === 'address' ? 'sm:col-span-2' : ''}>
            <Field label={label}><input className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph} /></Field>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function UsersTab() {
  const { toast } = useToast()
  const [users, setUsers] = useState(null)
  const [add, setAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const load = () => api.listUsers().then(setUsers).catch(() => setUsers([]))
  useEffect(() => { load() }, [])

  async function remove(u) {
    if (!window.confirm(`Remove ${u.name || u.email}?`)) return
    try { await api.deleteUser(u.id); toast('User removed'); load() } catch (e) { toast(e.message, 'error') }
  }
  async function toggleActive(u) {
    try { await api.updateUser(u.id, { active: !u.active }); toast(u.active ? 'User disabled' : 'User enabled'); load() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Team members. A user&apos;s role decides where they appear — <strong>Panellist</strong>s become selectable on interview rounds.</p>
        <Button onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add user</Button>
      </div>
      {!users ? <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
        : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users yet" description="Add your recruiters, managers, admins and interview panellists." action={<Button onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add user</Button>} />
        ) : (
          <Card className="divide-y divide-slate-100">
            {users.map((u) => (
              <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${!u.active ? 'opacity-60' : ''}`}>
                <Avatar name={u.name || u.email} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{u.name || '—'}</span>
                    {(u.roles || []).map((r) => <Badge key={r} tone={ROLE_TONE[r] || 'gray'}>{ROLE_LABEL[r] || r}</Badge>)}
                    {!u.active && <Badge tone="gray">disabled</Badge>}
                  </div>
                  <div className="truncate text-xs text-slate-400">{u.email}{u.title ? ` · ${u.title}` : ''}</div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton onClick={() => setEditing(u)} title="Edit" aria-label="Edit" className="hover:text-brand-600"><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton onClick={() => toggleActive(u)} title={u.active ? 'Disable' : 'Enable'} aria-label={u.active ? 'Disable' : 'Enable'} className={u.active ? 'hover:text-amber-600' : 'text-emerald-600 hover:text-emerald-700'}><Power className="h-4 w-4" /></IconButton>
                  <IconButton onClick={() => remove(u)} title="Remove" aria-label="Remove" className="hover:text-rose-600"><Trash2 className="h-4 w-4" /></IconButton>
                </div>
              </div>
            ))}
          </Card>
        )}
      <UserModal open={add} onClose={() => setAdd(false)} onSaved={load} />
      <UserModal open={!!editing} onClose={() => setEditing(null)} onSaved={load} user={editing} />
    </div>
  )
}

function TposTab() {
  const { toast } = useToast()
  const [tpos, setTpos] = useState(null)
  const [add, setAdd] = useState(false)
  const load = () => api.listTpos().then(setTpos).catch(() => setTpos([]))
  useEffect(() => { load() }, [])

  async function remove(t) {
    if (!window.confirm(`Remove ${t.name || t.college}?`)) return
    try { await api.deleteTpo(t.id); toast('Removed'); load() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="space-y-4">
      <Card className="border-sky-200 bg-sky-50/60 p-4">
        <p className="text-pretty text-sm leading-relaxed text-sky-800/90">
          <strong>Pairs with Distribution.</strong> These campus placement cells and hiring vendors are an outreach
          channel alongside the job boards on the <strong>Distribution</strong> page — pick which to notify when you
          publish a role from the <strong>Post job</strong> step.
        </p>
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">College Training &amp; Placement Officers and other hiring partners you broadcast roles to.</p>
        <Button onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add partner</Button>
      </div>
      {!tpos ? <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
        : tpos.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No placement cells or vendors yet" description="Add campus placement officers or hiring vendors so you can broadcast roles to them when posting." action={<Button onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add partner</Button>} />
        ) : (
          <Card className="divide-y divide-slate-100">
            {tpos.map((t) => (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><GraduationCap className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{t.name || '—'} {t.designation && <span className="text-xs font-normal text-slate-400">· {t.designation}</span>}</div>
                  <div className="flex items-center gap-1 text-sm text-slate-600"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {t.college || '—'}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    {t.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {t.email}</span>}
                    {t.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {t.phone}</span>}
                    {t.linkedin && <a href={t.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600"><Globe className="h-3 w-3" /> LinkedIn</a>}
                    {t.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.address}</span>}
                  </div>
                </div>
                <IconButton onClick={() => remove(t)} aria-label="Remove" className="hover:text-rose-600"><Trash2 className="h-4 w-4" /></IconButton>
              </div>
            ))}
          </Card>
        )}
      <AddTpoModal open={add} onClose={() => setAdd(false)} onCreated={load} />
    </div>
  )
}

function DataTab() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function exportData() {
    setBusy(true)
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hr-os-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast('Export downloaded')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-500">
        Back up your workspace. Export a JSON snapshot of your core hiring records — candidates, roles, jobs,
        applications, interviews and the email trail. Important on the free tier, where the database is temporary.
      </p>
      <Card className="border-amber-200 bg-amber-50/60 p-5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800"><AlertTriangle className="h-4 w-4" /> Free-tier data is temporary</h3>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-amber-800/90">
          On Render&apos;s free plan the database is removed after ~30 days and uploaded files don&apos;t survive a redeploy. For real hiring, upgrade to a paid Postgres and move files to object storage (see <code className="rounded bg-amber-100 px-1 text-xs">PROD-READINESS.md</code>). Until then, export your data regularly.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800">Export all data</h3>
        <p className="mt-1 text-sm text-slate-500">Download candidates, jobs, applications, interviews and the comms trail as a JSON backup. (Binary files like resumes and recordings are excluded.)</p>
        <Button className="mt-3" onClick={exportData} disabled={busy}>{busy ? <><Spinner /> Exporting…</> : <><Download className="h-4 w-4" /> Download JSON backup</>}</Button>
      </Card>
    </div>
  )
}

function EmailTab() {
  const { toast } = useToast()
  const [info, setInfo] = useState(null)        // { email_configured, from, templates }
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)    // last EmailOut record

  const load = () => api.emailTemplates().then(setInfo).catch(() => setInfo({ email_configured: false, from: '' }))
  useEffect(() => { load() }, [])

  async function sendTest() {
    const email = to.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address', 'error'); return }
    setBusy(true); setResult(null)
    try {
      const rec = await api.sendEmail({
        to_email: email,
        to_name: 'Test recipient',
        template: 'custom',
        subject: 'Test email from your HR-OS workspace',
        body: 'Hi,\n\nThis is a test message confirming that email sending from your HR-OS '
          + 'workspace is configured correctly. If this landed in your inbox, you\'re all set '
          + 'to send candidate communications.\n\n— Sent automatically from Settings → Email',
      })
      setResult(rec)
      if (rec.status === 'sent') toast('Test email sent — check the inbox')
      else if (rec.status === 'logged') toast('Logged only — SMTP is not configured yet', 'error')
      else toast('Send failed', 'error')
      load()  // refresh status (in case config changed server-side)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  if (!info) return <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>

  const configured = info.email_configured

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-500">
        Shows whether outbound email is being delivered for real or only logged, and lets you send a test to confirm
        end-to-end. This panel is read-only — SMTP credentials live in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">backend/.env</code>, not here.
      </p>
      {/* Status */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${configured ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Outbound email</h3>
              <Badge tone={configured ? 'green' : 'amber'}>{configured ? 'Active — sending live' : 'Log mode — not sending'}</Badge>
            </div>
            {configured ? (
              <p className="mt-1 text-sm text-slate-500">Emails are sent for real from <span className="font-medium text-slate-700">{info.from}</span>.</p>
            ) : (
              <p className="mt-1 text-pretty text-sm text-slate-500">
                Emails are saved and logged but <strong>not delivered</strong>. To send for real, set the SMTP
                variables in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">backend/.env</code> (Brevo, SendGrid, Gmail, …) and restart the backend.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Send test */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800">Send a test email</h3>
        <p className="mt-1 text-sm text-slate-500">Verify your setup end-to-end. The result below shows exactly what the server did.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Recipient">
              <input
                className={inputClass}
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) sendTest() }}
                placeholder="you@company.com"
              />
            </Field>
          </div>
          <Button onClick={sendTest} disabled={busy} className="shrink-0">
            {busy ? <><Spinner /> Sending…</> : <><Send className="h-4 w-4" /> Send test</>}
          </Button>
        </div>

        {result && (
          <div className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3 text-sm ${
            result.status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : result.status === 'logged' ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}>
            {result.status === 'sent' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              : result.status === 'logged' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              {result.status === 'sent' && <><strong>Delivered.</strong> Sent to {result.to_email}. Check the inbox (and spam folder).</>}
              {result.status === 'logged' && <><strong>Logged only.</strong> SMTP isn&apos;t configured, so nothing was delivered. Add SMTP settings in <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">backend/.env</code> and restart.</>}
              {result.status === 'failed' && <><strong>Send failed.</strong> {result.error || 'The mail server rejected the message.'} <span className="block text-rose-600/80">Check your SMTP credentials and verified sender, then try again.</span></>}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

const TABS = [
  { id: 'users', label: 'Users & roles' },
  { id: 'tpos', label: 'Placement cells & hiring vendors' },
  { id: 'email', label: 'Email' },
  { id: 'data', label: 'Data' },
]

export default function Settings() {
  usePageTitle('Settings')
  const [tab, setTab] = useState('users')
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage your team, placement cells & hiring vendors, and workspace configuration." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'users' && <UsersTab />}
      {tab === 'tpos' && <TposTab />}
      {tab === 'email' && <EmailTab />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}
