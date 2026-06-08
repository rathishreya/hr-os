import { useState } from 'react'
import { api } from '../../api'
import { Modal, Button, Field, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'
import MultiSelect from '../MultiSelect'
import { SkillChecklist, ApplicationQuestionsBuilder, InterviewTypesPicker, useTeamOptions } from './jobFormParts'

// Edit an existing job's details. Mounted only while open (see call site) so state initializes
// from the role without an effect. Saves via PATCH /api/hiring-requests/{id}.
export default function EditJobModal({ role, onClose, onSaved }) {
  const { toast } = useToast()
  const teamOpts = useTeamOptions()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState(() => ({
    position: role.position || '',
    department: role.department || '',
    budget_ctc: role.budget_ctc || '',
    location: role.location || '',
    yoe_min: role.yoe_min ?? 0,
    yoe_max: role.yoe_max ?? 0,
    priority: role.priority || 'medium',
    work_mode: role.work_mode || 'onsite',
    hiring_deadline: role.hiring_deadline || '',
    start_hiring_date: role.start_hiring_date || '',
    num_openings: role.num_openings ?? 1,
    status: role.status || 'open',
    hiring_manager: role.hiring_manager || '',
    recruiter: role.recruiter || '',
    panelists: role.interview_panel || [],
    mandatory_skills: role.mandatory_skills || [],
    preferred_skills: role.preferred_skills || [],
    application_questions: role.application_questions || [],
    interview_types: role.interview_types || [],
  }))
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const setKey = (k) => (next) => setF((p) => ({ ...p, [k]: next }))

  async function save() {
    if (!f.position.trim()) { toast('Position is required', 'error'); return }
    setBusy(true)
    try {
      const { panelists, ...rest } = f
      const updated = await api.updateRole(role.id, {
        ...rest,
        yoe_min: Number(f.yoe_min) || 0,
        yoe_max: Number(f.yoe_max) || 0,
        num_openings: Number(f.num_openings) || 1,
        interview_panel: panelists,
      })
      toast('Job updated')
      onSaved(updated)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Edit job"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Save changes'}</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Position *"><input className={inputClass} value={f.position} onChange={set('position')} /></Field>
          <Field label="Department"><input className={inputClass} value={f.department} onChange={set('department')} /></Field>
          <Field label="Budget / CTC"><input className={inputClass} value={f.budget_ctc} onChange={set('budget_ctc')} /></Field>
          <Field label="Location"><input className={inputClass} value={f.location} onChange={set('location')} /></Field>
          <Field label="Min YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_min} onChange={set('yoe_min')} /></Field>
          <Field label="Max YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_max} onChange={set('yoe_max')} /></Field>
          <Field label="Priority">
            <select className={inputClass} value={f.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Work mode">
            <select className={inputClass} value={f.work_mode} onChange={set('work_mode')}>
              <option value="onsite">Onsite</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
          <Field label="Hiring deadline"><input type="date" className={inputClass} value={f.hiring_deadline} onChange={set('hiring_deadline')} /></Field>
          <Field label="Start hiring date"><input type="date" className={inputClass} value={f.start_hiring_date} onChange={set('start_hiring_date')} /></Field>
          <Field label="Openings"><input type="number" min="1" className={inputClass} value={f.num_openings} onChange={set('num_openings')} /></Field>
          <Field label="Status">
            <select className={inputClass} value={f.status} onChange={set('status')}>
              <option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option><option value="draft">Draft</option>
            </select>
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Hiring manager">
              <select className={inputClass} value={f.hiring_manager} onChange={set('hiring_manager')}>
                <option value="">Select…</option>
                {teamOpts.hm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Recruiter">
              <select className={inputClass} value={f.recruiter} onChange={set('recruiter')}>
                <option value="">Select…</option>
                {teamOpts.rec.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Panelists">
              <MultiSelect options={teamOpts.panel} value={f.panelists} onChange={setKey('panelists')} placeholder="Select panelists…" />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkillChecklist label="Mandatory skills" selected={f.mandatory_skills} setSelected={setKey('mandatory_skills')} suggestions={[]} accent="violet" />
          <SkillChecklist label="Preferred skills" selected={f.preferred_skills} setSelected={setKey('preferred_skills')} suggestions={[]} accent="amber" />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application form questions</h3>
          <p className="text-xs text-slate-400">Shown on the public application form.</p>
          <ApplicationQuestionsBuilder questions={f.application_questions} setQuestions={setKey('application_questions')} />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interview rounds</h3>
          <InterviewTypesPicker selected={f.interview_types} setSelected={setKey('interview_types')} />
        </div>
      </div>
    </Modal>
  )
}
