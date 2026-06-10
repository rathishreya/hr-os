import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Spinner, Button, Modal, inputClass } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import JobDetailShell from '../components/role/JobDetailShell'
import JobApplicationsWorkspace from '../components/role/JobApplicationsWorkspace'
import InsightsTab from '../components/role/InsightsTab'
import JobPostTab from '../components/role/JobPostTab'
import EditJobModal from '../components/role/EditJobModal'

function stageToView(stage) {
  if (stage === 'shortlisted') return 'shortlisted'
  if (stage === 'offer' || stage === 'hired') return 'positions'
  return 'applications'
}

const TABLE_VIEWS = new Set(['applications', 'shortlisted', 'positions', 'pool', 'analytics'])
const KNOWN_VIEWS = new Set([...TABLE_VIEWS, 'insights', 'jd'])

export default function RoleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const stageFromUrl = searchParams.get('stage') || ''
  const viewFromUrl = searchParams.get('view') || ''  // deep-link a specific tab, e.g. ?view=jd to review the JD
  const { toast } = useToast()
  const [role, setRole] = useState(null)
  const [summary, setSummary] = useState(null)
  const [jd, setJd] = useState(null)
  const [board, setBoard] = useState([])
  const [boardLoading, setBoardLoading] = useState(true)
  const [view, setView] = useState(() => (KNOWN_VIEWS.has(viewFromUrl) ? viewFromUrl : stageToView(stageFromUrl)))
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteStep, setDeleteStep] = useState(0)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  usePageTitle(role?.position || 'Job')

  const hasLive = useMemo(() => board.some((r) => r.meta?.is_live), [board])

  const loadBoard = useCallback(() => {
    setBoardLoading(true)
    return Promise.all([
      api.pipelineBoard(id),
      api.pipelineSummary(id).catch(() => null),
    ])
      .then(([rows, sum]) => {
        setBoard(rows)
        setSummary(sum)
      })
      .catch(() => {
        setBoard([])
        setSummary(null)
      })
      .finally(() => setBoardLoading(false))
  }, [id])

  useEffect(() => {
    api.getRole(id).then(setRole).catch(() => {})
    api.getJD(id).then(setJd).catch(() => setJd(null))
    loadBoard()
  }, [id, loadBoard])

  useEffect(() => {
    if (!hasLive) return
    const t = setInterval(loadBoard, 15000)
    return () => clearInterval(t)
  }, [hasLive, loadBoard])

  useEffect(() => {
    if (KNOWN_VIEWS.has(viewFromUrl)) setView(viewFromUrl)
    else if (stageFromUrl) setView(stageToView(stageFromUrl))
  }, [viewFromUrl, stageFromUrl])

  async function duplicateRole() {
    try {
      const copy = await api.duplicateRole(id)
      toast('Job duplicated')
      navigate(`/roles/${copy.id}`)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function closeRole() {
    try {
      const updated = await api.updateRole(id, { status: 'closed' })
      setRole(updated)
      toast('Role closed')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function reopenRole() {
    try {
      const updated = await api.updateRole(id, { status: 'open' })
      setRole(updated)
      toast('Role reopened')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  function openDeleteFlow() {
    setDeleteConfirmText('')
    setDeleteStep(1)
  }

  function closeDeleteFlow() {
    setDeleteStep(0)
    setDeleteConfirmText('')
  }

  async function confirmDeleteJob() {
    setDeleting(true)
    try {
      await api.deleteRole(id)
      toast('Job deleted')
      navigate('/roles')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setDeleting(false)
      closeDeleteFlow()
    }
  }

  const confirmMatches = deleteConfirmText.trim() === role?.position?.trim()

  if (!role) {
    return <div className="flex h-48 items-center justify-center gap-2 text-slate-500"><Spinner /> Loading…</div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <JobDetailShell
        role={role}
        summary={summary}
        jd={jd}
        activeView={view}
        onViewChange={setView}
        hasLiveScreen={hasLive}
        onAddUpload={() => setAddModalOpen(true)}
        onAddPool={() => setView('pool')}
        onEdit={() => setEditOpen(true)}
        onDuplicate={duplicateRole}
        onCloseRole={closeRole}
        onReopenRole={reopenRole}
        onDelete={openDeleteFlow}
        roleStatus={role.status}
      />

      {editOpen && (
        <EditJobModal
          role={role}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { setRole(updated); setEditOpen(false); loadBoard() }}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col bg-slate-50/50 p-3 lg:p-4">
        {TABLE_VIEWS.has(view) ? (
          <JobApplicationsWorkspace
            roleId={id}
            roleTitle={role.position}
            board={board}
            loading={boardLoading}
            onRefresh={loadBoard}
            summary={summary}
            workspaceTab={view}
            addModalOpen={addModalOpen}
            onAddModalClose={() => setAddModalOpen(false)}
          />
        ) : view === 'insights' ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <InsightsTab role={role} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <JobPostTab roleId={id} jd={jd} onGenerated={setJd} budgetCtc={role.budget_ctc} />
          </div>
        )}
      </div>

      <Modal open={deleteStep === 1} onClose={closeDeleteFlow} title="Delete this job?" footer={(
        <>
          <Button variant="ghost" onClick={closeDeleteFlow}>Cancel</Button>
          <Button variant="danger" onClick={() => setDeleteStep(2)}>Continue</Button>
        </>
      )}>
        <p className="text-sm text-slate-600">
          Delete <strong>{role.position}</strong> and {board.length} application{board.length === 1 ? '' : 's'}? Candidates stay in talent pool.
        </p>
      </Modal>

      <Modal open={deleteStep === 2} onClose={closeDeleteFlow} title="Confirm deletion" footer={(
        <>
          <Button variant="ghost" onClick={() => setDeleteStep(1)} disabled={deleting}>Back</Button>
          <Button variant="danger" onClick={confirmDeleteJob} disabled={deleting || !confirmMatches}>
            {deleting ? <Spinner /> : 'Delete permanently'}
          </Button>
        </>
      )}>
        <p className="text-sm text-slate-600">Type the job title to confirm:</p>
        <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm">{role.position}</p>
        <input className={`${inputClass} mt-3`} value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} autoFocus />
      </Modal>
    </div>
  )
}
