import { useEffect, useRef, useState } from 'react'
import { ClipboardList, Upload, Eye, Trash2, FileText } from 'lucide-react'
import { api } from '../api'
import { Card, Button, Spinner, EmptyState, PageHeader, Field, inputClass, cx } from '../ui'
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

export default function Assessments() {
  usePageTitle('Assessments')
  const { toast } = useToast()
  const [items, setItems] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
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
      files.forEach((f) => fd.append('files', f))
      await api.createAssessment(fd)
      setName(''); setDesc(''); setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      await load()
      toast(files.length > 1 ? `Assessment added with ${files.length} files` : 'Assessment added')
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  async function remove(a) {
    if (!window.confirm(`Delete assessment "${a.name}"?`)) return
    try { await api.deleteAssessment(a.id); await load(); toast('Assessment deleted') } catch (err) { toast(err.message, 'error') }
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
            // assessments into one list, so every card renders identically.
            const fileList = (a.files && a.files.length)
              ? a.files.map((f) => ({ key: `f${f.id}`, name: f.filename, size: f.size, url: api.assessmentFileByIdUrl(a.id, f.id) }))
              : (a.filename ? [{ key: 'legacy', name: a.filename, size: a.size, url: api.assessmentFileUrl(a.id) }] : [])
            const totalSize = fileList.reduce((s, f) => s + (f.size || 0), 0)
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
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    aria-label="Delete assessment"
                    className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition duration-150 ease-snappy hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 group-hover/card:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {a.description && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{a.description}</p>}

                {fileList.length > 0 && (
                  <div className="mt-3 space-y-0.5">
                    {fileList.map((f) => (
                      <a
                        key={f.key}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`Preview ${f.name}`}
                        className="group/file flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                      >
                        <FileTypeBadge name={f.name} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 group-hover/file:text-brand-700">{f.name}</span>
                        {f.size ? <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{fmtSize(f.size)}</span> : null}
                        <Eye className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity duration-150 group-hover/file:text-brand-500 group-hover/file:opacity-100" />
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
