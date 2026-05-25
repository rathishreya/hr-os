import { Link } from 'react-router-dom'
import { Pencil, Link2 } from 'lucide-react'
import { Badge, Button, cx } from '../../ui'
import { useToast } from '../Toast'

export default function JobRoleHeader({ role, summary, onCopyApplyLink }) {
  const { toast } = useToast()
  const meta = summary || {}
  const hm = meta.hiring_manager || role?.interview_panel?.[1] || ''
  const recruiter = meta.recruiter || role?.interview_panel?.[0] || ''

  async function copyLink() {
    const url = `${window.location.origin}/roles/${role.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Job link copied')
      onCopyApplyLink?.(url)
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <Link to="/roles" className="text-xs font-medium text-slate-400 hover:text-violet-600">← All jobs</Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {role.position}
                <span className="ml-2 font-semibold text-slate-400">#{role.id}</span>
              </h1>
              <Badge tone={role.status === 'open' ? 'green' : 'gray'}>{role.status}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" className="h-8 px-2.5 text-xs" title="Edit job">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" className="h-8 gap-1.5 px-3 text-xs text-violet-700" onClick={copyLink}>
                <Link2 className="h-3.5 w-3.5" /> Copy apply link
              </Button>
            </div>
          </div>
          <dl className="grid shrink-0 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:text-right">
            <div>
              <dt className="text-slate-400">Department</dt>
              <dd className="font-medium text-slate-700">{role.department || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Location</dt>
              <dd className="font-medium text-slate-700">{role.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Hiring manager</dt>
              <dd className="font-medium text-slate-700">{hm || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Recruiter</dt>
              <dd className="font-medium text-slate-700">{recruiter || '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
