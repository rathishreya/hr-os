import { useState } from 'react'
import { api } from '../../api'
import { Card, Button, Field, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'

export default function AddCandidate({ roleId, onAdded }) {
  const { toast } = useToast()
  const [mode, setMode] = useState('paste')
  const [f, setF] = useState({ name: '', email: '', source: 'direct', resume_text: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      if (mode === 'upload') {
        if (!file) { setErr('Choose a PDF, DOCX, or TXT file.'); setBusy(false); return }
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
        {['paste', 'upload'].map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-3 py-1 font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {m === 'paste' ? 'Paste resume' : 'Upload file'}
          </button>
        ))}
      </div>
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
          <Field label="Resume file" hint="PDF / DOCX / TXT">
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
          </Field>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <Button type="submit" disabled={busy}>{busy ? <><Spinner /> Parsing + scoring…</> : 'Add & AI Score'}</Button>
      </form>
    </Card>
  )
}
