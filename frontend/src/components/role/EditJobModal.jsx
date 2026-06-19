import { useState } from 'react'
import { api } from '../../api'
import { Modal, Button, Field, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'
import MultiSelect from '../MultiSelect'
import { SkillChecklist, ApplicationQuestionsBuilder, InterviewTypesPicker, BudgetCtcField, ComboField, useFieldOptions, useTeamOptions } from './jobFormParts'

// Edit an existing job's details. Mounted only while open (see call site) so state initializes
// from the role without an effect. Saves via PATCH /api/hiring-requests/{id}.
export default function EditJobModal({ role, onClose, onSaved }) {
  const { toast } = useToast()
  const teamOpts = useTeamOptions()
  const deptOptions = useFieldOptions('department')
  const locationOptions = useFieldOptions('location')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState(() => ({
    position: role.position || '',
    department: role.department || '',
    budget_ctc: role.budget_ctc || '',
    location: role.location || '',
    role_brief: role.role_brief || '',
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

  // 'closed' is terminal — once a role is closed it can't be edited back open. We lock the status
  // select on closed roles and route status changes through the lifecycle endpoint (not the plain
  // PATCH) so the state-machine rules are enforced server-side.
  const isClosed = role.status === 'closed'

  async function save() {
    if (!f.position.trim()) { toast('Position is required', 'error'); return }
    setBusy(true)
    try {
      const { panelists, status, ...rest } = f
      let updated = await api.updateRole(role.id, {
        ...rest,
        yoe_min: Number(f.yoe_min) || 0,
        yoe_max: Number(f.yoe_max) || 0,
        num_openings: Number(f.num_openings) || 1,
        interview_panel: panelists,
      })
      // Apply a status change separately through the guarded lifecycle endpoint.
      if (status && status !== role.status) {
        updated = await api.changeRoleStatus(role.id, status)
        if (updated.status !== status) toast(`Role parked as ${updated.status} (on hold over 3 months)`)
      }
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
          <Field label="Role *"><input className={inputClass} value={f.position} onChange={set('position')} /></Field>
          <ComboField label="Department" listId="edit-dept-options" value={f.department} onChange={setKey('department')} options={deptOptions} placeholder="Pick or type to add" />
          <div className="sm:col-span-2">
            <BudgetCtcField value={f.budget_ctc} onChange={setKey('budget_ctc')} />
          </div>
          <ComboField label="Location" listId="edit-location-options" value={f.location} onChange={setKey('location')} options={locationOptions} placeholder="Pick or type to add" />
          <Field label="Min YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_min} onChange={set('yoe_min')} /></Field>
          <Field label="Max YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_max} onChange={set('yoe_max')} /></Field>
          <Field label="Priority">
            <select className={inputClass} value={f.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
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
          <Field label="Status" hint={isClosed ? 'Closed roles are final and cannot be reopened' : undefined}>
            <select className={inputClass} value={f.status} onChange={set('status')} disabled={isClosed}>
              <option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option><option value="draft">Draft</option>
              {/* 'paused' is an auto-set lifecycle state; shown only when the role is already paused. */}
              {f.status === 'paused' && <option value="paused">Paused</option>}
            </select>
          </Field>
        </div>

        <Field label="Role description" hint="100–200 word brief the AI uses to draft a sharper JD on regenerate">
          <textarea className={`${inputClass} h-24 resize-y`} value={f.role_brief} onChange={set('role_brief')} placeholder="What this role does, why it's open, what makes it unique…" />
        </Field>

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
