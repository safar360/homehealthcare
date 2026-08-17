import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import {
  humanise,
  inr,
  monthLabel,
  monthStart,
  today,
  type MoneyLine,
  type Patient,
} from './lib/types';
import type { PatientsScope } from './PatientsPanel';

/**
 * What each patient owes this month, from the days actually recorded.
 *
 * Every figure here is computed by build_monthly_bill on the server. The
 * pricing rule — round once, on the line — lives in one place, and this screen
 * never re-derives it.
 */

type Bill = {
  bill_id: string | null;
  patient_id: string;
  month: string;
  status: string;
  lines: MoneyLine[];
  days_served: number;
  total_earned: number;
  advance: number;
  received: number;
  balance: number;
  suggested_advance: number;
};

type PaymentForm = {
  amount: string;
  kind: string;
  method: string;
  paid_on: string;
  reference: string;
  note: string;
};

export default function MonthlyPanel({
  scope,
  onError,
  onNotice,
}: {
  scope: PatientsScope;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const managerId = scope.kind === 'manager' ? scope.managerId : null;

  const [month, setMonth] = useState(monthStart());
  const [patients, setPatients] = useState<Patient[]>([]);
  const [bills, setBills] = useState<Record<string, Bill>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payFor, setPayFor] = useState<Patient | null>(null);
  const [form, setForm] = useState<PaymentForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    let query = supabase.from('patients').select('*').eq('is_active', true).neq('status', 'closed');
    if (managerId) query = query.eq('assigned_manager_id', managerId);

    const { data, error } = await query.order('full_name');
    if (error) {
      onError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as Patient[]) ?? [];
    setPatients(list);

    // One call per patient. build_monthly_bill both prices the month and
    // returns it, so the totals a manager reads are the same rows a bill is
    // issued from — never a second, client-side calculation that could drift.
    const results = await Promise.all(
      list.map((p) => supabase.rpc('build_monthly_bill', { p_patient_id: p.id, p_month: month }))
    );

    const next: Record<string, Bill> = {};
    for (let i = 0; i < list.length; i++) {
      const { data: bill, error: billError } = results[i];
      if (billError) {
        onError(billError.message);
        continue;
      }
      next[list[i].id] = bill as Bill;
    }
    setBills(next);
    setLoading(false);
  }, [month, managerId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const all = Object.values(bills);
    return {
      days: all.reduce((sum, b) => sum + Number(b.days_served ?? 0), 0),
      earned: all.reduce((sum, b) => sum + Number(b.total_earned ?? 0), 0),
      received: all.reduce((sum, b) => sum + Number(b.received ?? 0), 0),
      balance: all.reduce((sum, b) => sum + Number(b.balance ?? 0), 0),
    };
  }, [bills]);

  const openPayment = (patient: Patient) => {
    const bill = bills[patient.id];
    setPayFor(patient);
    setForm({
      // The 50% advance is offered, never imposed — what was actually collected
      // is what gets recorded.
      amount: bill?.advance ? '' : String(bill?.suggested_advance ?? ''),
      kind: bill?.advance ? 'receipt' : 'advance',
      method: 'upi',
      paid_on: today(),
      reference: '',
      note: '',
    });
  };

  const savePayment = async () => {
    if (!payFor || !form) return;
    const amount = Number(form.amount);
    if (!isFinite(amount) || amount <= 0) {
      onError('Enter the amount that was received.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc('record_patient_payment', {
      p_patient_id: payFor.id,
      p_month: month,
      p_amount: amount,
      p_kind: form.kind,
      p_method: form.method || null,
      p_reference: form.reference.trim() || null,
      p_note: form.note.trim() || null,
      p_paid_on: form.paid_on || today(),
    });
    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    setPayFor(null);
    setForm(null);
    onNotice(`${inr(amount)} recorded for ${payFor.full_name}.`);
    await load();
  };

  const issue = async (patient: Patient) => {
    const bill = bills[patient.id];
    if (!bill?.bill_id) return;
    if (
      !window.confirm(
        `Issue ${patient.full_name}'s bill for ${monthLabel(month)} at ${inr(bill.total_earned)}?\n\nAn issued bill stops recalculating, so days recorded afterwards will not change it.`
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from('monthly_bills')
      .update({ status: 'issued', issued_at: new Date().toISOString() })
      .eq('id', bill.bill_id);

    if (error) {
      onError(error.message);
      return;
    }
    onNotice(`Bill issued for ${patient.full_name}.`);
    await load();
  };

  return (
    <>
      <section className="content-section">
        <div className="section-header">
          <div>
            <h2>{monthLabel(month)}</h2>
            <p className="muted">Priced from the days recorded on the day sheet.</p>
          </div>
          <input
            type="month"
            className="filter-input"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : monthStart())}
          />
        </div>

        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>Days served</h3>
            <p className="stat-number">{totals.days}</p>
          </div>
          <div className="stat-card">
            <h3>Billed</h3>
            <p className="stat-number">{inr(totals.earned)}</p>
          </div>
          <div className="stat-card">
            <h3>Received</h3>
            <p className="stat-number stat-good">{inr(totals.received)}</p>
          </div>
          <div className="stat-card">
            <h3>Outstanding</h3>
            <p className="stat-number stat-warn">{inr(totals.balance)}</p>
          </div>
        </div>

        {loading ? (
          <p className="muted">Pricing the month…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Days</th>
                  <th>Billed</th>
                  <th>Advance</th>
                  <th>Received</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const bill = bills[p.id];
                  const balance = Number(bill?.balance ?? 0);
                  const isOpen = expanded === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => setExpanded(isOpen ? null : p.id)}
                          >
                            {isOpen ? '▾' : '▸'} {p.full_name}
                          </button>
                        </td>
                        <td>{Number(bill?.days_served ?? 0)}</td>
                        <td className="num">{inr(bill?.total_earned)}</td>
                        <td className="num">{inr(bill?.advance)}</td>
                        <td className="num">{inr(bill?.received)}</td>
                        <td className={`num ${balance > 0 ? 'cell-warn' : ''}`}>{inr(balance)}</td>
                        <td>
                          <span
                            className={`status ${bill?.status === 'paid' ? 'active' : 'inactive'}`}
                          >
                            {humanise(bill?.status ?? 'draft')}
                          </span>
                        </td>
                        <td className="actions">
                          <button className="btn-small" type="button" onClick={() => openPayment(p)}>
                            Payment
                          </button>
                          {bill?.status === 'draft' && Number(bill.total_earned) > 0 && (
                            <button
                              className="btn-small"
                              type="button"
                              onClick={() => void issue(p)}
                            >
                              Issue
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="breakdown-cell">
                            {(bill?.lines ?? []).length === 0 ? (
                              <span className="muted">No days recorded this month.</span>
                            ) : (
                              <table className="breakdown">
                                <tbody>
                                  {bill.lines.map((line) => (
                                    <tr key={`${line.service_type}-${line.rate}`}>
                                      <td>{line.label}</td>
                                      <td>
                                        {Number(line.days)} of{' '}
                                        {line.billing_mode === 'monthly' ? '30 days' : 'days'}
                                      </td>
                                      <td>
                                        {inr(line.rate)}
                                        {line.billing_mode === 'monthly' ? '/month' : '/day'}
                                      </td>
                                      <td className="num">{inr(line.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {patients.length === 0 && <div className="no-data">No patients yet.</div>}
          </div>
        )}
      </section>

      {form && payFor && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Record payment — {payFor.full_name}</h2>
            <p className="muted">
              {monthLabel(month)} · billed {inr(bills[payFor.id]?.total_earned)} · remaining{' '}
              {inr(bills[payFor.id]?.balance)}
            </p>

            <Field label="This payment is">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="advance">Advance</option>
                <option value="receipt">Receipt against the bill</option>
                <option value="refund">Refund</option>
              </select>
            </Field>
            <Field label="Amount" required>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              {form.kind === 'advance' && Number(bills[payFor.id]?.suggested_advance) > 0 && (
                <p className="muted">
                  50% of the month so far is {inr(bills[payFor.id]?.suggested_advance)}.
                </p>
              )}
            </Field>
            <Field label="Received on">
              <input
                type="date"
                value={form.paid_on}
                onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
              />
            </Field>
            <Field label="Method">
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
              >
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </Field>
            <Field label="Reference">
              <input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="UPI reference or cheque number"
              />
            </Field>
            <Field label="Note">
              <textarea
                rows={2}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>

            <div className="modal-actions">
              <button className="btn-primary" type="button" disabled={saving} onClick={savePayment}>
                {saving ? 'Saving…' : 'Record payment'}
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setPayFor(null);
                  setForm(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="form-group">
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  );
}
