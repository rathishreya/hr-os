import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { api } from '../../api'
import { Card, Button, Field, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'

const MODE_LABEL = { paste: 'Paste resume', upload: 'Upload file', import: 'Import Excel' }

export default function AddCandidate({ roleId, onAdded }) {
  const { toast } = useToast()
  const [mode, setMode] = useState('paste')
  const [f, setF] = useState({ name: '', email: '', source: 'direct', resume_text: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function handleImport(f2) {
    if (!f2) return
    setBusy(true); setErr('')
    try {
      const res = await api.importCandidates(f2, roleId)  // applies each imported candidate to this role
      const parts = [`${res.created} new`, res.skipped ? `${res.skipped} skipped` : '', res.applied ? `${res.applied} added to role` : ''].filter(Boolean)
      toast(`Imported: ${parts.join(', ')}`)
      if (res.errors?.length) toast(`${res.errors.length} row(s) had issues (e.g. ${res.errors[0]})`, 'error')
      await onAdded()
    } catch (e) { setErr(e.message); toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      if (mode === 'upload') {
        if (!file) { setErr('Choose a PDF, DOCX, or TXT file.'); setBusy(false); return }
        const okExt = /\.(pdf|docx|txt)$/i.test(file.name)
        if (!okExt) {
          setErr(/\.doc$/i.test(file.name)
            ? 'Legacy .doc files aren’t supported — re-save as PDF or DOCX, or paste the resume text.'
            : 'Unsupported file type. Upload a PDF, DOCX, or TXT, or paste the resume text.')
          setBusy(false); return
        }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('name', f.name)
        fd.append('email', f.email)
        fd.append('source', f.source)
        fd.append('hiring_request_id', String(roleId))
        await api.uploadCandidate(fd)
      } else {
        await api.createCandidate({ ...f, hiring_request_id: Number(roleId) })
      }
      setF({ name: '', email: '', source: 'direct', resume_text: '' })
      setFile(null)
      await onAdded()
      toast('Candidate added and scored')
    } catch (e) {
      setErr(e.message)
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5" id="add-candidate">
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
        {['paste', 'upload', 'import'].map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-3 py-1 font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === 'import' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Bulk-add candidates from an Excel/CSV file — each row is added to this role. Existing emails are skipped.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="text-xs" onClick={() => api.downloadImportTemplate().catch((e) => toast(e.message, 'error'))}>
              <FileDown className="h-4 w-4" /> Download template
            </Button>
            <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
              {busy ? <><Spinner /> Importing…</> : 'Choose .xlsx / .csv'}
              <input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy}
                onChange={(e) => { const file2 = e.target.files?.[0]; e.target.value = ''; handleImport(file2) }} />
            </label>
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      ) : (
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name"><input className={inputClass} value={f.name} onChange={set('name')} placeholder="optional" /></Field>
          <Field label="Email"><input className={inputClass} value={f.email} onChange={set('email')} placeholder="optional" /></Field>
          <Field label="Source">
            <select className={inputClass} value={f.source} onChange={set('source')}>
              {['direct', 'referral', 'linkedin', 'naukri', 'agency', 'campus'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        {mode === 'paste' ? (
          <Field label="Resume text" hint="AI parses, embeds, and scores against this role">
            <textarea className={`${inputClass} h-28 resize-y`} value={f.resume_text} onChange={set('resume_text')} required placeholder="Paste full resume text here…" />
          </Field>
        ) : (
          <Field label="Resume file" hint="PDF / DOCX / TXT — legacy .doc not supported; paste text if extraction fails">
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
          </Field>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <Button type="submit" disabled={busy}>{busy ? <><Spinner /> Parsing + scoring…</> : 'Add & AI Score'}</Button>
      </form>
      )}
    </Card>
  )
}
