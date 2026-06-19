import { useEffect, useRef, useState } from 'react'
import { ClipboardList, Upload, Eye, Trash2, FileText, Pencil, Users, Building2, Briefcase } from 'lucide-react'
import { api } from '../api'
import { Card, Button, Spinner, EmptyState, PageHeader, Field, Badge, Modal, inputClass, cx } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'

function fmtSize(n) {
  if (!n) return ''
  const u = ['B', 'KB', 'MB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

// Colored badge per file type — makes a multi-file list scannable at a glance.
const EXT_TONE = {
  pdf: 'bg-rose-50 text-rose-600',
  doc: 'bg-sky-50 text-sky-600', docx: 'bg-sky-50 text-sky-600',
  xls: 'bg-emerald-50 text-emerald-600', xlsx: 'bg-emerald-50 text-emerald-600', csv: 'bg-emerald-50 text-emerald-600',
  ppt: 'bg-amber-50 text-amber-600', pptx: 'bg-amber-50 text-amber-600',
  zip: 'bg-violet-50 text-violet-600', rar: 'bg-violet-50 text-violet-600',
  txt: 'bg-slate-100 text-slate-500', md: 'bg-slate-100 text-slate-500',
}

function FileTypeBadge({ name }) {
  const ext = (name || '').includes('.') ? name.split('.').pop().toLowerCase() : ''
  const tone = EXT_TONE[ext] || 'bg-slate-100 text-slate-500'
  return (
    <span className={cx('flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[9px] font-bold tracking-wide', tone)}>
      {(ext || 'file').slice(0, 4).toUpperCase()}
    </span>
  )
}

// The file endpoints sit behind the Bearer-token auth gate, so a plain <a href> navigation
// (which carries no Authorization header) gets a 401. Fetch the file as an authenticated Blob
// — mirroring api.fetchResumeFile — and open the object URL instead.
async function openAssessmentFile(f) {
  const blob = f.fileId != null
    ? await api.fetchAssessmentFileById(f.assessmentId, f.fileId)
    : await api.fetchAssessmentFile(f.assessmentId)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  // Give the new tab time to load the blob before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// Edit an assessment: update its name / description / team / department / role and append more
// files. Existing files are listed (and openable); file removal is not supported here.
function EditAssessmentModal({ assessment, onClose, onSaved }) {
  const { toast } = useToast()
  const a = assessment
  const [name, setName] = useState(a.name || '')
  const [desc, setDesc] = useState(a.description || '')
  const [team, setTeam] = useState(a.team || '')
  const [department, setDepartment] = useState(a.department || '')
  const [role, setRole] = useState(a.role || '')
  const [newFiles, setNewFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const existing = (a.files && a.files.length)
    ? a.files.map((f) => ({ key: `f${f.id}`, name: f.filename, size: f.size, assessmentId: a.id, fileId: f.id }))
    : (a.filename ? [{ key: 'legacy', name: a.filename, size: a.size, assessmentId: a.id, fileId: null }] : [])

  async function save() {
    if (!name.trim()) { toast('Name is required', 'error'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('description', desc.trim())
      fd.append('team', team.trim())
      fd.append('department', department.trim())
      fd.append('role', role.trim())
      newFiles.forEach((f) => fd.append('files', f))
      await api.updateAssessment(a.id, fd)
      toast(newFiles.length ? `Saved — ${newFiles.length} file${newFiles.length > 1 ? 's' : ''} added` : 'Assessment updated')
      onSaved?.()
      onClose?.()
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  async function openExisting(f) {
    try { await openAssessmentFile(f) } catch { toast('Could not open the file', 'error') }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit assessment"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Save changes'}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="Name *"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Team"><input className={inputClass} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Platform" /></Field>
          <Field label="Department" hint="Used to auto-suggest this assessment for matching jobs"><input className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" /></Field>
        </div>
        <Field label="Role"><input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Frontend Engineer" /></Field>
        <Field label="Description"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>

        {existing.length > 0 && (
          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Current files</span>
            <div className="space-y-0.5">
              {existing.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => openExisting(f)}
                  title={`Preview ${f.name}`}
                  className="group/file flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                >
                  <FileTypeBadge name={f.name} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 group-hover/file:text-brand-700">{f.name}</span>
                  {f.size ? <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{fmtSize(f.size)}</span> : null}
                  <Eye className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity duration-150 group-hover/file:text-brand-500 group-hover/file:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Add more files" hint={newFiles.length ? `${newFiles.length} file${newFiles.length > 1 ? 's' : ''} to add — max 25 MB each` : 'Optional — append more files to this assessment'}>
          <input ref={fileRef} type="file" multiple className={inputClass} onChange={(e) => setNewFiles(Array.from(e.target.files || []))} />
        </Field>
      </div>
    </Modal>
  )
}

export default function Assessments() {
  usePageTitle('Assessments')
  const { toast } = useToast()
  const [items, setItems] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [team, setTeam] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)  // assessment being edited (metadata + add files)
  const fileRef = useRef(null)

  const load = () => api.listAssessments().then(setItems).catch(() => setItems([]))
  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    if (!name.trim() || !files.length) { toast('Add a name and choose at least one file', 'error'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('description', desc.trim())
      fd.append('team', team.trim())
      fd.append('department', department.trim())
      fd.append('role', role.trim())
      files.forEach((f) => fd.append('files', f))
      await api.createAssessment(fd)
      setName(''); setDesc(''); setTeam(''); setDepartment(''); setRole(''); setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      await load()
      toast(files.length > 1 ? `Assessment added with ${files.length} files` : 'Assessment added')
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  async function remove(a) {
    if (!window.confirm(`Delete assessment "${a.name}"?`)) return
    try { await api.deleteAssessment(a.id); await load(); toast('Assessment deleted') } catch (err) { toast(err.message, 'error') }
  }

  async function openFile(f) {
    try { await openAssessmentFile(f) }
    catch { toast('Could not open the file', 'error') }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Assessments" subtitle="Upload a test or take-home task once, then attach it to an “Assessment” interview round or send it to candidates (single or in bulk)." />

      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Upload className="h-4 w-4 text-brand-600" /> Add assessment
        </h3>
        <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name *"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Frontend Take-Home" /></Field>
          <Field label="Files *" hint={files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected — max 25 MB each` : 'PDF, DOCX, etc. — add one or more, max 25 MB each'}>
            <input ref={fileRef} type="file" multiple className={inputClass} onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </Field>
          <Field label="Team"><input className={inputClass} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Platform" /></Field>
          <Field label="Department" hint="A job in this department can auto-suggest this assessment"><input className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" /></Field>
          <div className="sm:col-span-2">
            <Field label="Role"><input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Frontend Engineer" /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="2-hour React build task — instructions inside" /></Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? <><Spinner /> Uploading…</> : 'Add assessment'}</Button>
          </div>
        </form>
      </Card>

      {items === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assessments yet" description="Upload your first assessment above — it then becomes selectable when you add an Assessment interview round, or as a bulk send from the candidates table." />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => {
            // Normalize legacy single-file (stored only in legacy columns) and multi-file
            // assessments into one list, so every card renders identically. Each entry carries
            // the ids needed to fetch the file WITH the auth header (the endpoints are gated).
            const fileList = (a.files && a.files.length)
              ? a.files.map((f) => ({ key: `f${f.id}`, name: f.filename, size: f.size, assessmentId: a.id, fileId: f.id }))
              : (a.filename ? [{ key: 'legacy', name: a.filename, size: a.size, assessmentId: a.id, fileId: null }] : [])
            const totalSize = fileList.reduce((s, f) => s + (f.size || 0), 0)
            const tags = [
              a.team && { icon: Users, label: a.team },
              a.department && { icon: Building2, label: a.department },
              a.role && { icon: Briefcase, label: a.role },
            ].filter(Boolean)
            return (
              <Card key={a.id} className="group/card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{a.name}</div>
                    <div className="text-xs text-slate-400">
                      {fileList.length} file{fileList.length !== 1 ? 's' : ''}{totalSize ? ` · ${fmtSize(totalSize)}` : ''}
                    </div>
                  </div>
                  <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      aria-label="Edit assessment"
                      className="rounded-lg p-1.5 text-slate-300 opacity-0 transition duration-150 ease-snappy hover:bg-brand-50 hover:text-brand-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 group-hover/card:opacity-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      aria-label="Delete assessment"
                      className="rounded-lg p-1.5 text-slate-300 opacity-0 transition duration-150 ease-snappy hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 group-hover/card:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.map((t, i) => (
                      <Badge key={i} tone="gray" className="gap-1 normal-case">
                        <t.icon className="h-3 w-3 text-slate-400" />{t.label}
                      </Badge>
                    ))}
                  </div>
                )}

                {a.description && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{a.description}</p>}

                {fileList.length > 0 && (
                  <div className="mt-3 space-y-0.5">
                    {fileList.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => openFile(f)}
                        title={`Preview ${f.name}`}
                        className="group/file flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                      >
                        <FileTypeBadge name={f.name} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 group-hover/file:text-brand-700">{f.name}</span>
                        {f.size ? <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{fmtSize(f.size)}</span> : null}
                        <Eye className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity duration-150 group-hover/file:text-brand-500 group-hover/file:opacity-100" />
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <EditAssessmentModal
          assessment={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
