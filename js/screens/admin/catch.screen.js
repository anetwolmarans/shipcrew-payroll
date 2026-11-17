/**
 * catch.screen.js — Catch & Quota (Phase 4).
 *
 * Two jobs on one screen:
 *   1. THE CATCH REGISTER per trip — species, category, weight, landing
 *      site, paperwork refs. Records are history: changes happen as visible
 *      amendments with a reason, never silent edits.
 *   2. QUOTA-COMMISSION ALLOCATIONS per trip — the six methods from the
 *      project brief (equal split, percentage, fixed weight, rank points,
 *      contractual formula, custom). Different crew can sit under different
 *      arrangements; an allocation can be re-run and supersedes the old one,
 *      which stays in history.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, openModal, confirmDialog } from '../../core/ui.js';
import * as ops from '../../core/operations.service.js';
import * as catchSvc from '../../core/catch.service.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { fmtDate, fmtDateTime } from '../../core/time.js';
import { CATCH_SPECIES, CATCH_CATEGORIES, QUOTA_METHODS, APP } from '../../config.js';

function fmtKg(kg) {
  return `${(Number(kg) || 0).toLocaleString('en', { maximumFractionDigits: 1 })} kg`;
}
function fmtT(kg) {
  return `${((Number(kg) || 0) / 1000).toFixed(3)} t`;
}

export async function render(root, ctx) {
  const trips = await ops.listTrips();
  const canManage = can(ctx.session.role, CAPABILITIES.MANAGE_CATCH_QUOTA);

  const body = `
    <div class="banner banner-info">${icon('fish', 18)}<div>
      <b>Phase 4: the catch register and quota allocations.</b>
      Record what each trip landed (species, weight, paperwork) and split the quota commission among the crew —
      equal split, percentages, fixed weights, rank points, contractual formula or custom amounts.
      Money itself is calculated in Phase 5; here the tonnes and the shares are recorded.
    </div></div>

    <div class="table-toolbar" style="margin-top:1rem">
      <select class="input" id="f-trip" style="width:auto;padding:.4rem .6rem">
        <option value="">Choose a trip…</option>
        ${trips.map(t => `<option value="${esc(t.id)}">${esc(t.reference)} — ${esc(t.vesselName)} (${esc(t.status)})</option>`).join('')}
      </select>
      <span class="text-small text-muted" id="trip-summary"></span>
    </div>

    <div id="catch-content"></div>

    <p class="text-xs text-muted" style="margin:.8rem 0 0">
      ${icon('shield', 14)} Catch records and quota allocations are history: amendments keep the original values and
      require a reason; superseded allocations stay visible. Nothing is ever deleted.
    </p>`;

  const content = renderAdminShell(root, ctx, { title: 'Catch & Quota', navKey: 'catch', body });

  async function paint() {
    const tripId = content.querySelector('#f-trip').value;
    const box = content.querySelector('#catch-content');
    const summary = content.querySelector('#trip-summary');

    if (!tripId) {
      summary.textContent = '';
      box.innerHTML = `<div class="empty-state">${icon('fish', 30)}<div class="title">Choose a trip</div>
        <p>Select a trip above to see its catch register and quota allocations.</p></div>`;
      return;
    }

    const trip = trips.find(t => t.id === tripId);
    const [records, totals, allocations, crew] = await Promise.all([
      catchSvc.listCatchForTrip(tripId),
      catchSvc.tripCatchTotals(tripId),
      catchSvc.listQuotaAllocations({ tripId }),
      catchSvc.crewForTrip(tripId)
    ]);
    const active = allocations.filter(a => a.status === 'active');

    summary.textContent = `${records.length} catch record${records.length === 1 ? '' : 's'} · ${fmtT(totals.totalKg)} total`;

    box.innerHTML = `
      <div class="stat-grid" style="margin-top:0">
        <div class="stat-card"><div class="stat-label">${icon('fish', 15)} Total catch</div><div class="stat-value">${esc(fmtT(totals.totalKg))}</div><div class="stat-sub">${records.length} records</div></div>
        <div class="stat-card"><div class="stat-label">${icon('ship', 15)} Species</div><div class="stat-value">${totals.bySpecies.length}</div><div class="stat-sub">${esc(totals.bySpecies.slice(0, 2).map(s => s.species.split(' (')[0]).join(', ') || '—')}${totals.bySpecies.length > 2 ? '…' : ''}</div></div>
        <div class="stat-card"><div class="stat-label">${icon('users', 15)} Crew on trip</div><div class="stat-value">${crew.length}</div><div class="stat-sub">from assignments</div></div>
        <div class="stat-card"><div class="stat-label">${icon('coins', 15)} Allocations</div><div class="stat-value">${active.length}</div><div class="stat-sub">${allocations.length - active.length} superseded (kept)</div></div>
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>${icon('fish', 18)} Catch register — ${esc(trip.reference)}</span>
          ${canManage ? `<button class="btn btn-primary btn-sm" id="btn-add-catch">${icon('plus', 16)} Record catch</button>` : ''}
        </div>
        ${records.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Species</th><th>Category</th><th>Weight</th><th>Landed</th><th>Site</th><th>Paperwork</th>${canManage ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${records.map(c => `
              <tr>
                <td class="cell-strong">${esc(c.species)}${c.amendments?.length ? ` <span class="badge badge-warning" title="Amended — original values preserved">amended ×${c.amendments.length}</span>` : ''}</td>
                <td class="text-small">${esc(c.category)}</td>
                <td class="text-small"><b>${esc(fmtKg(c.weightKg))}</b></td>
                <td class="text-small nowrap">${esc(fmtDate(c.landedAt))}</td>
                <td class="text-small">${esc(c.landingSite)}</td>
                <td class="text-xs text-muted">${c.landingNoteRef ? `LN ${esc(c.landingNoteRef)}` : ''}${c.monitoringRef ? `${c.landingNoteRef ? '<br>' : ''}Mon ${esc(c.monitoringRef)}` : '—'}</td>
                ${canManage ? `<td class="nowrap"><button class="btn btn-outline btn-sm" data-amend="${esc(c.id)}" title="Amend with a visible reason">${icon('edit', 14)} Amend</button></td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table></div>
        <div style="margin-top:.6rem">
          <b class="text-small">By species:</b>
          ${totals.bySpecies.map(s => `<span class="badge badge-info" style="margin:.15rem .2rem">${esc(s.species)} — ${esc(fmtT(s.weightKg))}</span>`).join('')}
        </div>`
        : `<div class="empty-state">${icon('fish', 30)}<div class="title">No catch recorded for this trip</div>
           <p>${canManage ? 'Use "Record catch" to add the first landing.' : 'The vessel manager records the catch.'}</p></div>`}
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>${icon('coins', 18)} Quota allocations — ${esc(trip.reference)}</span>
          ${canManage ? `<button class="btn btn-primary btn-sm" id="btn-allocate">${icon('plus', 16)} New allocation</button>` : ''}
        </div>
        <div id="alloc-list"></div>
      </div>`;

    /* ----- allocation list ----- */
    const allocList = box.querySelector('#alloc-list');
    if (!allocations.length) {
      allocList.innerHTML = `<div class="empty-state">${icon('coins', 30)}<div class="title">No allocations yet</div>
        <p>${canManage ? 'Create one with any of the six methods.' : 'The vessel manager creates allocations.'}</p></div>`;
    } else {
      allocList.innerHTML = allocations.map(a => `
        <div class="card" style="box-shadow:none;border:1px solid var(--line);margin-bottom:.8rem;${a.status === 'superseded' ? 'opacity:.65' : ''}">
          <div class="card-title" style="margin-bottom:.4rem">
            ${icon('coins', 16)} ${esc(a.methodLabel)}
            <span class="badge ${a.status === 'active' ? 'badge-success' : 'badge-neutral'}">${a.status === 'active' ? 'active' : 'superseded'}</span>
            <span class="text-xs text-muted" style="font-weight:400">· ${esc(fmtDateTime(a.createdAt))} by ${esc(a.createdBy)} · total catch ${esc(fmtT(a.totalCatchKg))}</span>
          </div>
          ${a.reason ? `<p class="text-xs text-muted" style="margin:0 0 .5rem">Reason: ${esc(a.reason)}</p>` : ''}
          ${a.methodInput?.contractNote ? `<p class="text-xs text-muted" style="margin:0 0 .5rem">Contract note: ${esc(a.methodInput.contractNote)}</p>` : ''}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Crew member</th><th>Position</th><th>Share</th><th>Quota weight</th><th>Note</th></tr></thead>
            <tbody>
              ${a.lines.map(l => `
                <tr>
                  <td class="cell-strong">${esc(l.crewName)}</td>
                  <td class="text-small">${esc(l.position || '—')}</td>
                  <td class="text-small">${l.share !== null && l.share !== undefined ? `${l.share.toFixed(2)}%` : '—'}</td>
                  <td class="text-small">${l.shareKg !== null && l.shareKg !== undefined ? esc(fmtKg(l.shareKg)) : '—'}</td>
                  <td class="text-xs text-muted">${esc(l.note || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`).join('');
    }

    /* ----- record catch dialog ----- */
    const addBtn = box.querySelector('#btn-add-catch');
    if (addBtn) addBtn.addEventListener('click', () => {
      openModal({
        title: `Record catch — ${trip.reference}`,
        icon: 'fish',
        wide: true,
        body: `
          <div class="form-grid">
            <label class="field"><span>Species *</span>
              <select class="input" id="cc-species">${CATCH_SPECIES.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
            <label class="field"><span>Category *</span>
              <select class="input" id="cc-cat">${CATCH_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Weight (kg) *</span>
              <input class="input" id="cc-kg" type="number" min="0.1" step="0.1" placeholder="e.g. 12500"></label>
            <label class="field"><span>Landing site</span>
              <input class="input" id="cc-site" value="Walvis Bay" maxlength="40"></label>
            <label class="field"><span>Landed at (Namibian date)</span>
              <input class="input" id="cc-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="field"><span>Landing note ref</span>
              <input class="input" id="cc-ln" maxlength="40" placeholder="e.g. LN-2026-0342"></label>
            <label class="field"><span>Monitoring ref</span>
              <input class="input" id="cc-mon" maxlength="40" placeholder="e.g. MFA-8817"></label>
          </div>
          <label class="field" style="margin-top:.8rem"><span>Notes</span>
            <textarea class="input" id="cc-notes" rows="2" maxlength="240" placeholder="Optional — e.g. trip total per the factory weighbridge"></textarea></label>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Record catch', kind: 'btn-primary',
            onClick: async (overlay) => {
              const kg = Number(overlay.querySelector('#cc-kg').value);
              if (!Number.isFinite(kg) || kg <= 0) { toast('Enter a positive weight in kilograms.', 'warn'); return true; }
              const dateVal = overlay.querySelector('#cc-date').value;
              try {
                await catchSvc.createCatchRecord({
                  tripId: trip.id,
                  species: overlay.querySelector('#cc-species').value,
                  category: overlay.querySelector('#cc-cat').value,
                  weightKg: kg,
                  landingSite: overlay.querySelector('#cc-site').value.trim() || 'Walvis Bay',
                  landedAt: dateVal ? new Date(dateVal + 'T12:00:00+02:00').toISOString() : undefined,
                  landingNoteRef: overlay.querySelector('#cc-ln').value.trim(),
                  monitoringRef: overlay.querySelector('#cc-mon').value.trim(),
                  notes: overlay.querySelector('#cc-notes').value.trim()
                });
                toast('Catch recorded.', 'success');
                await paint();
                return false;
              } catch (err) {
                toast(err?.message || 'Could not record the catch.', 'error', 6000);
                return true;
              }
            }
          }
        ]
      });
    });

    /* ----- amend catch dialog ----- */
    box.querySelectorAll('[data-amend]').forEach(btn =>
      btn.addEventListener('click', () => {
        const rec = records.find(r => r.id === btn.dataset.amend);
        if (!rec) return;
        openModal({
          title: `Amend catch — ${rec.species}`,
          icon: 'edit',
          body: `
            <p class="text-xs text-muted" style="margin:0 0 .6rem">Amendments are visible history: the original weight stays in the record.</p>
            <label class="field"><span>Corrected weight (kg) — was ${esc(fmtKg(rec.weightKg))}</span>
              <input class="input" id="am-kg" type="number" min="0.1" step="0.1" value="${rec.weightKg}"></label>
            <label class="field" style="margin-top:.6rem"><span>Reason (required) *</span>
              <textarea class="input" id="am-reason" rows="2" maxlength="240" placeholder="e.g. Weighbridge slip corrected by the factory manager"></textarea></label>
            ${rec.amendments?.length ? `<div class="banner banner-info" style="margin-top:.6rem">${icon('activity', 14)}<div class="text-xs">
              ${rec.amendments.map(a => `${esc(fmtDate(a.at))} — ${esc(a.by)}: ${esc(a.reason)}${a.changes.weightKg ? ` (${esc(fmtKg(a.changes.weightKg.from))} → ${esc(fmtKg(a.changes.weightKg.to))})` : ''}`).join('<br>')}
            </div></div>` : ''}`,
          actions: [
            { label: 'Cancel', kind: 'btn-outline' },
            {
              label: 'Save amendment', kind: 'btn-primary',
              onClick: async (overlay) => {
                const kg = Number(overlay.querySelector('#am-kg').value);
                const reason = overlay.querySelector('#am-reason').value.trim();
                if (!reason) { toast('A reason is required.', 'warn'); return true; }
                if (!Number.isFinite(kg) || kg <= 0) { toast('Enter a positive weight.', 'warn'); return true; }
                try {
                  await catchSvc.amendCatchRecord(rec.id, { weightKg: kg, reason });
                  toast('Amendment saved — the original value is preserved.', 'success');
                  await paint();
                  return false;
                } catch (err) {
                  toast(err?.message || 'Could not amend.', 'error', 6000);
                  return true;
                }
              }
            }
          ]
        });
      }));

    /* ----- allocation dialog (the six methods) ----- */
    const allocBtn = box.querySelector('#btn-allocate');
    if (allocBtn) allocBtn.addEventListener('click', async () => {
      if (!crew.length) {
        toast('This trip has no crew assignments — assign crew on the Trips screen first.', 'warn', 6000);
        return;
      }
      if (totals.totalKg <= 0) {
        const goOn = await confirmDialog({
          title: 'No catch recorded for this trip',
          message: 'This trip has no catch yet. Percentage, rank-point and equal-split allocations need a catch total. You can still allocate fixed weights, a contractual formula or custom amounts. Continue?',
          confirmLabel: 'Continue'
        });
        if (!goOn) return;
      }
      openModal({
        title: `Quota allocation — ${trip.reference}`,
        icon: 'coins',
        wide: true,
        body: `
          <label class="field"><span>Allocation method</span>
            <select class="input" id="qa-method">
              ${QUOTA_METHODS.map(m => `<option value="${esc(m.key)}">${esc(m.label)}</option>`).join('')}
            </select>
            <span class="text-xs text-muted" id="qa-desc" style="display:block;margin-top:.3rem"></span></label>
          <div id="qa-inputs" style="margin-top:.8rem"></div>
          <div id="qa-preview" style="margin-top:.8rem"></div>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Save allocation', kind: 'btn-primary',
            onClick: async (overlay) => {
              const method = overlay.querySelector('#qa-method').value;
              const methodInput = readMethodInputs(overlay, method, crew);
              let reason = overlay.querySelector('#qa-reason')?.value.trim() || '';
              if (method === 'custom' && !reason) { toast('Custom allocations need a reason.', 'warn'); return true; }
              try {
                const { record, warnings } = await catchSvc.saveQuotaAllocation({
                  tripId: trip.id, method, methodInput, crew, reason
                });
                toast(`Allocation saved (${record.lines.length} crew members).${warnings.length ? ` Warning: ${warnings[0]}` : ''}`,
                  warnings.length ? 'warn' : 'success', warnings.length ? 7000 : 4200);
                await paint();
                return false;
              } catch (err) {
                toast(err?.message || 'Could not save the allocation.', 'error', 6500);
                return true;
              }
            }
          }
        ]
      });

      /* --- method-specific inputs + live preview --- */
      const overlay = document.querySelector('.modal-overlay:last-of-type .modal');
      const methodSel = overlay.querySelector('#qa-method');
      const descEl = overlay.querySelector('#qa-desc');
      const inputsEl = overlay.querySelector('#qa-inputs');
      const previewEl = overlay.querySelector('#qa-preview');

      function renderInputs() {
        const method = methodSel.value;
        descEl.textContent = QUOTA_METHODS.find(m => m.key === method)?.description || '';
        if (method === 'percentage') {
          inputsEl.innerHTML = `
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Crew member</th><th>Position</th><th>Percentage</th></tr></thead>
              <tbody>${crew.map(m => `
                <tr><td class="cell-strong">${esc(m.crewName)}</td><td class="text-small">${esc(m.position || '—')}</td>
                <td><input class="input qa-pct" data-crew="${esc(m.crewId)}" type="number" min="0" max="100" step="0.01" style="width:110px" placeholder="e.g. 12.5"></td></tr>`).join('')}
              </tbody></table></div>
            <p class="text-xs text-muted" id="qa-pct-sum" style="margin:.5rem 0 0">Percentages must total 100%.</p>`;
        } else if (method === 'fixed_weight') {
          inputsEl.innerHTML = `
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Crew member</th><th>Position</th><th>Fixed weight (kg)</th></tr></thead>
              <tbody>${crew.map(m => `
                <tr><td class="cell-strong">${esc(m.crewName)}</td><td class="text-small">${esc(m.position || '—')}</td>
                <td><input class="input qa-fixed" data-crew="${esc(m.crewId)}" type="number" min="0" step="1" style="width:130px" placeholder="e.g. 2000"></td></tr>`).join('')}
              </tbody></table></div>`;
        } else if (method === 'rank_based') {
          inputsEl.innerHTML = `
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Crew member</th><th>Position</th><th>Rank points</th></tr></thead>
              <tbody>${crew.map(m => `
                <tr><td class="cell-strong">${esc(m.crewName)}</td><td class="text-small">${esc(m.position || '—')}</td>
                <td><input class="input qa-points" data-crew="${esc(m.crewId)}" type="number" min="0" step="1" style="width:110px" placeholder="e.g. 2"></td></tr>`).join('')}
              </tbody></table></div>
            <p class="text-xs text-muted" style="margin:.5rem 0 0">Suggestion: skipper 5 · mate 4 · engineer 4 · deck boss 3 · deckhand 2.</p>`;
        } else if (method === 'contractual') {
          inputsEl.innerHTML = `
            <label class="field"><span>Contractual formula (recorded here; settled in payroll — Phase 5)</span>
              <textarea class="input" id="qa-contract" rows="3" maxlength="300" placeholder="e.g. 30% of net proceeds after fuel and bait costs, split per clause 4.2 of each crew contract"></textarea></label>`;
        } else if (method === 'custom') {
          inputsEl.innerHTML = `
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Crew member</th><th>Position</th><th>Amount (kg)</th></tr></thead>
              <tbody>${crew.map(m => `
                <tr><td class="cell-strong">${esc(m.crewName)}</td><td class="text-small">${esc(m.position || '—')}</td>
                <td><input class="input qa-custom" data-crew="${esc(m.crewId)}" type="number" min="0" step="1" style="width:130px" placeholder="0"></td></tr>`).join('')}
              </tbody></table></div>
            <label class="field" style="margin-top:.6rem"><span>Reason (required for custom allocations) *</span>
              <textarea class="input" id="qa-reason" rows="2" maxlength="240"></textarea></label>`;
        } else {
          inputsEl.innerHTML = `<p class="text-small text-muted" style="margin:0">Every selected crew member receives an equal share — no numbers needed.</p>`;
        }
        renderPreview();
      }

      function collectInputs() {
        const method = methodSel.value;
        const input = {};
        if (method === 'percentage') {
          input.percentages = {};
          overlay.querySelectorAll('.qa-pct').forEach(i => { if (i.value !== '') input.percentages[i.dataset.crew] = Number(i.value); });
        } else if (method === 'fixed_weight') {
          input.fixedWeights = {};
          overlay.querySelectorAll('.qa-fixed').forEach(i => { if (i.value !== '') input.fixedWeights[i.dataset.crew] = Number(i.value); });
        } else if (method === 'rank_based') {
          input.rankPoints = {};
          overlay.querySelectorAll('.qa-points').forEach(i => { if (i.value !== '') input.rankPoints[i.dataset.crew] = Number(i.value); });
        } else if (method === 'contractual') {
          input.contractNote = overlay.querySelector('#qa-contract')?.value.trim() || '';
        } else if (method === 'custom') {
          input.customAmounts = {};
          overlay.querySelectorAll('.qa-custom').forEach(i => { if (i.value !== '') input.customAmounts[i.dataset.crew] = Number(i.value); });
        }
        return input;
      }

      function renderPreview() {
        const method = methodSel.value;
        const methodInput = collectInputs();
        const { lines, warnings } = catchSvc.computeQuotaShares({ method, crew, totalKg: totals.totalKg, methodInput });
        previewEl.innerHTML = lines.length ? `
          <b class="text-small">Preview</b>
          ${warnings.length ? `<div class="banner banner-warn" style="margin:.5rem 0">${icon('alert', 14)}<div class="text-xs">${warnings.map(esc).join('<br>')}</div></div>` : ''}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Crew member</th><th>Share</th><th>Quota weight</th><th>Note</th></tr></thead>
            <tbody>${lines.map(l => `
              <tr><td class="cell-strong">${esc(l.crewName)}</td>
              <td class="text-small">${l.share !== null && l.share !== undefined ? `${l.share.toFixed(2)}%` : '—'}</td>
              <td class="text-small">${l.shareKg !== null && l.shareKg !== undefined ? esc(fmtKg(l.shareKg)) : '—'}</td>
              <td class="text-xs text-muted">${esc(l.note || '')}</td></tr>`).join('')}
            </tbody></table></div>` : '';
        const sumEl = overlay.querySelector('#qa-pct-sum');
        if (sumEl && method === 'percentage') {
          const sum = Object.values(input_percentages_sum(overlay)).reduce((s, v) => s + v, 0);
          sumEl.textContent = `Total: ${sum.toFixed(2)}% ${Math.abs(sum - 100) < 0.01 ? '✓' : '— must total 100%'}`;
        }
      }
      function input_percentages_sum(scope) {
        const out = {};
        scope.querySelectorAll('.qa-pct').forEach(i => { if (i.value !== '') out[i.dataset.crew] = Number(i.value); });
        return out;
      }

      function readMethodInputs(scope, method) {
        const input = {};
        if (method === 'percentage') {
          input.percentages = {};
          scope.querySelectorAll('.qa-pct').forEach(i => { if (i.value !== '') input.percentages[i.dataset.crew] = Number(i.value); });
        } else if (method === 'fixed_weight') {
          input.fixedWeights = {};
          scope.querySelectorAll('.qa-fixed').forEach(i => { if (i.value !== '') input.fixedWeights[i.dataset.crew] = Number(i.value); });
        } else if (method === 'rank_based') {
          input.rankPoints = {};
          scope.querySelectorAll('.qa-points').forEach(i => { if (i.value !== '') input.rankPoints[i.dataset.crew] = Number(i.value); });
        } else if (method === 'contractual') {
          input.contractNote = scope.querySelector('#qa-contract')?.value.trim() || '';
        } else if (method === 'custom') {
          input.customAmounts = {};
          scope.querySelectorAll('.qa-custom').forEach(i => { if (i.value !== '') input.customAmounts[i.dataset.crew] = Number(i.value); });
        }
        return input;
      }

      methodSel.addEventListener('change', renderInputs);
      inputsEl.addEventListener('input', renderPreview);
      renderInputs();
    });
  }

  content.querySelector('#f-trip').addEventListener('change', paint);
  await paint();
}
