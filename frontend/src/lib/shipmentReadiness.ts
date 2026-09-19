// Whether a shipment draft is actually ready to confirm, and if not, what is
// missing. The list page groups by this and the editor shows it as a
// checklist, so both screens answer the same question the same way — and it
// mirrors what the confirm endpoint enforces.

export type ShipmentReadinessState = 'empty' | 'incomplete' | 'ready';

export interface ShipmentReadinessInput {
  order_count?: number;
  fcl_lcl?: string | null;
  vessel_name?: string | null;
  vessel_etd?: string | null;
  vessel_eta_to_port?: string | null;
}

export interface ShipmentReadinessCheck {
  key: string;
  label: string;
  done: boolean;
  /** Optional — can be filled in after the shipment sails. */
  optional?: boolean;
  /** What the check found, shown next to it when satisfied. */
  detail?: string;
}

export interface ShipmentReadiness {
  state: ShipmentReadinessState;
  /** Short reason for the list row, e.g. "Needs ETA". */
  label: string;
  /** Everything still outstanding, longest form. */
  missing: string[];
  /** ETA lands before ETD — impossible, and blocks confirmation. */
  datesImpossible: boolean;
}

function hasValue(v: string | null | undefined): boolean {
  return typeof v === 'string' ? v.trim().length > 0 : false;
}

/** ETA earlier than ETD. Both are ISO strings, so a string compare is enough. */
export function sailingDatesImpossible(
  etd: string | null | undefined,
  eta: string | null | undefined,
): boolean {
  if (!hasValue(etd) || !hasValue(eta)) return false;
  return eta!.slice(0, 10) < etd!.slice(0, 10);
}

export function getShipmentReadiness(d: ShipmentReadinessInput): ShipmentReadiness {
  const datesImpossible = sailingDatesImpossible(d.vessel_etd, d.vessel_eta_to_port);

  if (!d.order_count) {
    return { state: 'empty', label: 'Nothing added', missing: ['styles'], datesImpossible };
  }

  const missing: string[] = [];
  if (!hasValue(d.fcl_lcl)) missing.push('container type');
  if (!hasValue(d.vessel_name)) missing.push('vessel');
  if (!hasValue(d.vessel_etd)) missing.push('ETD');
  if (!hasValue(d.vessel_eta_to_port)) missing.push('ETA');

  if (datesImpossible) {
    return { state: 'incomplete', label: 'Check dates', missing, datesImpossible };
  }
  if (missing.length === 0) {
    return { state: 'ready', label: 'Ready', missing, datesImpossible };
  }
  // One thing outstanding reads better named; several read better counted.
  const label = missing.length === 1 ? `Needs ${missing[0]}` : `Needs ${missing.length} details`;
  return { state: 'incomplete', label, missing, datesImpossible };
}

/** The editor's checklist — same rules, itemised, with tracking as optional. */
export function getShipmentChecklist(
  d: ShipmentReadinessInput & { unit_count?: number; tracking_reference?: string | null },
): ShipmentReadinessCheck[] {
  const count = d.order_count || 0;
  const units = d.unit_count || 0;
  const datesImpossible = sailingDatesImpossible(d.vessel_etd, d.vessel_eta_to_port);
  return [
    {
      key: 'skus',
      label: 'Styles selected',
      done: count > 0,
      detail: count > 0 ? `${count} style${count === 1 ? '' : 's'}, ${units.toLocaleString()} units` : undefined,
    },
    {
      key: 'fcl',
      label: 'Container type',
      done: hasValue(d.fcl_lcl),
      detail: d.fcl_lcl || undefined,
    },
    {
      key: 'vessel',
      label: 'Vessel name',
      done: hasValue(d.vessel_name),
      detail: d.vessel_name || undefined,
    },
    {
      key: 'etd',
      label: 'Vessel ETD',
      done: hasValue(d.vessel_etd),
    },
    {
      key: 'eta',
      label: datesImpossible ? 'ETA to port — lands before it sails' : 'ETA to port',
      done: hasValue(d.vessel_eta_to_port) && !datesImpossible,
    },
    {
      key: 'tracking',
      label: 'P-number',
      done: hasValue(d.tracking_reference),
      optional: true,
      detail: d.tracking_reference || 'can follow later',
    },
  ];
}
