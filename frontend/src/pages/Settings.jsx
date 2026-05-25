import { useEffect, useRef, useState } from 'react'
import {
  Mail, Users as UsersIcon, GraduationCap, Plus, Trash2, RefreshCw, Eye, EyeOff,
  ChevronDown, Check, Phone, Building2, MapPin, Globe, Pencil, Power,
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
  const label = value.length ? value.map((v) => ROLE_LABEL[v] || v).join(', ') : 'Select roles'
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${inputClass} flex items-center justify-between text-left`}>
        <span className={value.length ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {ROLES.map((r) => {
            const on = value.includes(r.id)
            return (
              <button key={r.id} type="button" onClick={() => toggle(r.id)} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 ${on ? 'bg-violet-50/60' : ''}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
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
        <button type="button" title="Generate new" onClick={() => onChange(genPassword())} className="rounded p-1 text-violet-600 hover:bg-violet-50"><RefreshCw className="h-4 w-4" /></button>
        <button type="button" title={show ? 'Hide' : 'Show'} onClick={() => setShow((s) => !s)} className="rounded p-1 text-slate-500 hover:bg-slate-100">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
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
        <Field label="Roles"><RolesSelect value={form.roles} onChange={(roles) => setForm({ ...form, roles })} /></Field>
        <Field label={editing ? 'Reset password (optional)' : 'Password'}>
          <PasswordField value={form.password} onChange={(p) => setForm({ ...form, password: p })} />
          {editing && <span className="mt-1 block text-xs text-slate-400">Leave blank to keep the current password.</span>}
        </Field>
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active — can be used and assigned in the tool
          </label>
        ) : (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
            Send email to new user with credentials
          </label>
        )}
      </div>
    </Modal>
  )
}

const TPO_FIELDS = [
  ['name', 'Name', 'Officer name'],
  ['college', 'College', 'College / university'],
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
    if (!form.name.trim() && !form.college.trim()) { toast('Enter a name or college', 'error'); return }
    setBusy(true)
    try {
      await api.createTpo(form)
      toast('Placement officer added')
      onCreated(); onClose()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add placement officer"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? <Spinner /> : 'Add TPO'}</Button></>}>
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
                  <IconButton onClick={() => setEditing(u)} title="Edit" aria-label="Edit" className="hover:text-violet-600"><Pencil className="h-4 w-4" /></IconButton>
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">College Training &amp; Placement Officers. Send a role to selected campuses from the <strong>Post job</strong> step.</p>
        <Button onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add TPO</Button>
      </div>
      {!tpos ? <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
        : tpos.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No placement officers yet" description="Add TPOs so you can broadcast hiring requests to colleges." action={<Button onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add TPO</Button>} />
        ) : (
          <Card className="divide-y divide-slate-100">
            {tpos.map((t) => (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><GraduationCap className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{t.name || '—'} {t.designation && <span className="text-xs font-normal text-slate-400">· {t.designation}</span>}</div>
                  <div className="flex items-center gap-1 text-sm text-slate-600"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {t.college || '—'}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    {t.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {t.email}</span>}
                    {t.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {t.phone}</span>}
                    {t.linkedin && <a href={t.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-violet-600"><Globe className="h-3 w-3" /> LinkedIn</a>}
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

const TABS = [
  { id: 'users', label: 'Users & roles' },
  { id: 'tpos', label: 'Placement officers' },
]

export default function Settings() {
  usePageTitle('Settings')
  const [tab, setTab] = useState('users')
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage your team, campus placement officers, and workspace configuration." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'users' && <UsersTab />}
      {tab === 'tpos' && <TposTab />}
    </div>
  )
}
