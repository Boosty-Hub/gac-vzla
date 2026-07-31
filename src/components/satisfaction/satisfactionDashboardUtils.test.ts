import { describe, it, expect } from 'vitest';
import {
  UNKNOWN_BRAND,
  UNKNOWN_MODEL,
  ALL_VALUE,
  surveyBrand,
  surveyModel,
  surveyMonthKey,
  deriveBrandFacets,
  deriveModelFacets,
  monthKeyToLabel,
  deriveMonthOptions,
  filterSurveys,
  groupSurveysByClient,
  type SatisfactionSurveyRow,
  type SatisfactionFilterState,
} from './satisfactionDashboardUtils';

let rowCounter = 0;

/** Matches the PostgREST select in `SatisfactionDashboard.tsx`:
 * `id, client_id, client_name, client_phone, sold_plate, status, origin,
 *  suppressed_reason, created_at, responded_at, dealership_id, salesperson,
 *  dealerships(name), vehicles(plate, vehicle_models(brand, name)),
 *  response:satisfaction_responses(*)`. */
const makeRow = (overrides: Partial<SatisfactionSurveyRow> = {}): SatisfactionSurveyRow => {
  rowCounter += 1;
  return {
    id: `survey-${rowCounter}`,
    client_id: `client-${rowCounter}`,
    client_name: 'Juan Perez',
    client_phone: '+584121234567',
    sold_plate: 'ABC123',
    status: 'responded',
    origin: 'won',
    suppressed_reason: null,
    created_at: '2026-06-15T10:00:00Z',
    responded_at: '2026-06-16T10:00:00Z',
    dealership_id: 'dealership-1',
    salesperson: 'Maria Lopez',
    dealerships: { name: 'GAC Caracas' },
    vehicles: { plate: 'ABC123', vehicle_models: { brand: 'GAC', name: 'GS3' } },
    response: null,
    ...overrides,
  };
};

const makeResponse = (overallScore: number | string) => ({
  q_atencion_digital: 5,
  q_bienvenida_presencial: 5,
  q_negociacion_asesoria: 5,
  q_financiamiento_tramites: 5,
  q_experiencia_entrega: 5,
  nps_recomienda: true,
  overall_score: overallScore,
  has_low_score: false,
});

const NO_FILTER: SatisfactionFilterState = { brand: ALL_VALUE, model: ALL_VALUE, month: ALL_VALUE };

describe('surveyBrand / surveyModel', () => {
  it('resolves brand and model through vehicles.vehicle_models', () => {
    const row = makeRow({ vehicles: { plate: 'XYZ987', vehicle_models: { brand: 'DFSK', name: 'Glory 500' } } });
    expect(surveyBrand(row)).toBe('DFSK');
    expect(surveyModel(row)).toBe('Glory 500');
  });

  it('buckets a legacy row (vehicle_id IS NULL, vehicles embed null) into Sin marca / Sin modelo instead of dropping it', () => {
    const row = makeRow({ vehicles: null });
    expect(surveyBrand(row)).toBe(UNKNOWN_BRAND);
    expect(surveyModel(row)).toBe(UNKNOWN_MODEL);
  });

  it('falls back to Sin marca / Sin modelo when vehicles is present but vehicle_models is null', () => {
    const row = makeRow({ vehicles: { plate: 'ABC123', vehicle_models: null } });
    expect(surveyBrand(row)).toBe(UNKNOWN_BRAND);
    expect(surveyModel(row)).toBe(UNKNOWN_MODEL);
  });

  it('trims whitespace and treats a blank-after-trim brand/name as unknown', () => {
    const row = makeRow({ vehicles: { plate: 'ABC123', vehicle_models: { brand: '  SHINERAY  ', name: '   ' } } });
    expect(surveyBrand(row)).toBe('SHINERAY');
    expect(surveyModel(row)).toBe(UNKNOWN_MODEL);
  });

  it('never reads a Kommo brand enum or the prospect free-text model_interest, even if present on the row', () => {
    // `SatisfactionSurveyRow` has no `model_interest`/Kommo-enum field at all — this pins
    // that structural guarantee: an extra property is ignored, and a vehicle-less row
    // resolves to the Sin marca/Sin modelo bucket, never to an "(estimada)" guess.
    const row = { ...makeRow({ vehicles: null }), model_interest: 'GAC GS3', kommo_brand_enum: 7832208 } as unknown as SatisfactionSurveyRow;
    expect(surveyBrand(row)).toBe(UNKNOWN_BRAND);
    expect(surveyModel(row)).toBe(UNKNOWN_MODEL);
  });
});

describe('surveyMonthKey', () => {
  it('extracts YYYY-MM from created_at', () => {
    const row = makeRow({ created_at: '2026-03-22T08:00:00Z' });
    expect(surveyMonthKey(row)).toBe('2026-03');
  });

  it('keys on created_at, not responded_at, when they fall in different months', () => {
    const row = makeRow({ created_at: '2026-06-30T23:59:00Z', responded_at: '2026-07-02T09:00:00Z' });
    expect(surveyMonthKey(row)).toBe('2026-06');
  });

  it('keys on created_at when responded_at is null — an unanswered survey still belongs to the month it was created', () => {
    const row = makeRow({ created_at: '2026-05-10T12:00:00Z', responded_at: null, status: 'sent' });
    expect(surveyMonthKey(row)).toBe('2026-05');
  });
});

describe('deriveBrandFacets', () => {
  it('returns sorted unique brands', () => {
    const rows = [
      makeRow({ vehicles: { plate: 'A', vehicle_models: { brand: 'SHINERAY', name: 'X30' } } }),
      makeRow({ vehicles: { plate: 'B', vehicle_models: { brand: 'DFSK', name: 'Glory 500' } } }),
      makeRow({ vehicles: { plate: 'C', vehicle_models: { brand: 'GAC', name: 'GS3' } } }),
      makeRow({ vehicles: { plate: 'D', vehicle_models: { brand: 'DFSK', name: 'Glory 580' } } }), // duplicate brand
    ];
    expect(deriveBrandFacets(rows)).toEqual(['DFSK', 'GAC', 'SHINERAY']);
  });

  it('includes Sin marca for legacy vehicle_id IS NULL rows instead of dropping them', () => {
    const rows = [
      makeRow({ vehicles: { plate: 'A', vehicle_models: { brand: 'GAC', name: 'GS3' } } }),
      makeRow({ vehicles: null }),
    ];
    expect(deriveBrandFacets(rows)).toContain(UNKNOWN_BRAND);
  });

  it('always sorts Sin marca last, regardless of alphabetical position', () => {
    const rows = [
      makeRow({ vehicles: null }),
      makeRow({ vehicles: { plate: 'A', vehicle_models: { brand: 'ZZZ Brand', name: 'M' } } }),
      makeRow({ vehicles: { plate: 'B', vehicle_models: { brand: 'AAA Brand', name: 'M' } } }),
    ];
    expect(deriveBrandFacets(rows)).toEqual(['AAA Brand', 'ZZZ Brand', UNKNOWN_BRAND]);
  });
});

describe('deriveModelFacets', () => {
  const rows = [
    makeRow({ vehicles: { plate: 'A', vehicle_models: { brand: 'GAC', name: 'GS3' } } }),
    makeRow({ vehicles: { plate: 'B', vehicle_models: { brand: 'GAC', name: 'GA4' } } }),
    makeRow({ vehicles: { plate: 'C', vehicle_models: { brand: 'DFSK', name: 'Glory 500' } } }),
    makeRow({ vehicles: null }),
  ];

  it('scopes models to the given brand', () => {
    expect(deriveModelFacets(rows, 'GAC')).toEqual(['GA4', 'GS3']);
  });

  it('returns models across every brand when scoped to ALL_VALUE', () => {
    expect(deriveModelFacets(rows, ALL_VALUE)).toEqual(['GA4', 'Glory 500', 'GS3', UNKNOWN_MODEL]);
  });

  it('sorts Sin modelo last', () => {
    const models = deriveModelFacets(rows, ALL_VALUE);
    expect(models[models.length - 1]).toBe(UNKNOWN_MODEL);
  });

  it('scoping to Sin marca returns only Sin modelo, for the legacy rows', () => {
    expect(deriveModelFacets(rows, UNKNOWN_BRAND)).toEqual([UNKNOWN_MODEL]);
  });
});

describe('monthKeyToLabel', () => {
  it('maps a YYYY-MM key to a Spanish "Month Year" label', () => {
    expect(monthKeyToLabel('2026-07')).toBe('Julio 2026');
    expect(monthKeyToLabel('2026-01')).toBe('Enero 2026');
    expect(monthKeyToLabel('2026-12')).toBe('Diciembre 2026');
  });
});

describe('deriveMonthOptions', () => {
  it('returns unique months sorted most-recent first, with correct labels', () => {
    const rows = [
      makeRow({ created_at: '2026-05-01T00:00:00Z' }),
      makeRow({ created_at: '2026-07-15T00:00:00Z' }),
      makeRow({ created_at: '2026-07-20T00:00:00Z' }), // duplicate month
      makeRow({ created_at: '2026-06-10T00:00:00Z' }),
    ];
    expect(deriveMonthOptions(rows)).toEqual([
      { value: '2026-07', label: 'Julio 2026' },
      { value: '2026-06', label: 'Junio 2026' },
      { value: '2026-05', label: 'Mayo 2026' },
    ]);
  });

  it('includes the month of an unanswered survey (responded_at null)', () => {
    const rows = [makeRow({ created_at: '2026-08-01T00:00:00Z', responded_at: null, status: 'sent' })];
    expect(deriveMonthOptions(rows)).toEqual([{ value: '2026-08', label: 'Agosto 2026' }]);
  });
});

describe('filterSurveys', () => {
  it('empty/ALL_VALUE filters mean no filtering — every row passes through', () => {
    const rows = [makeRow(), makeRow({ vehicles: null }), makeRow({ created_at: '2020-01-01T00:00:00Z' })];
    expect(filterSurveys(rows, NO_FILTER)).toEqual(rows);
  });

  it('ANDs brand + model + month together — a row must satisfy all three, not just one', () => {
    const target = makeRow({
      vehicles: { plate: 'T', vehicle_models: { brand: 'DFSK', name: 'X' } },
      created_at: '2026-06-01T00:00:00Z',
    });
    const wrongBrand = makeRow({
      vehicles: { plate: 'W1', vehicle_models: { brand: 'GAC', name: 'X' } }, // matches model+month only
      created_at: '2026-06-05T00:00:00Z',
    });
    const wrongModel = makeRow({
      vehicles: { plate: 'W2', vehicle_models: { brand: 'DFSK', name: 'Y' } }, // matches brand+month only
      created_at: '2026-06-10T00:00:00Z',
    });
    const wrongMonth = makeRow({
      vehicles: { plate: 'W3', vehicle_models: { brand: 'DFSK', name: 'X' } }, // matches brand+model only
      created_at: '2026-07-01T00:00:00Z',
    });
    const rows = [target, wrongBrand, wrongModel, wrongMonth];

    const filters: SatisfactionFilterState = { brand: 'DFSK', model: 'X', month: '2026-06' };
    const result = filterSurveys(rows, filters);

    expect(result).toEqual([target]);
  });

  it('does not silently drop legacy vehicle_id IS NULL rows when filtering by Sin marca/Sin modelo', () => {
    const legacy = makeRow({ vehicles: null, created_at: '2026-06-01T00:00:00Z' });
    const withVehicle = makeRow({
      vehicles: { plate: 'V', vehicle_models: { brand: 'GAC', name: 'GS3' } },
      created_at: '2026-06-01T00:00:00Z',
    });
    const rows = [legacy, withVehicle];

    const filters: SatisfactionFilterState = { brand: UNKNOWN_BRAND, model: ALL_VALUE, month: ALL_VALUE };
    expect(filterSurveys(rows, filters)).toEqual([legacy]);
  });

  it('excludes legacy rows by default when a real brand is selected (they do not silently pass every filter)', () => {
    const legacy = makeRow({ vehicles: null });
    const withVehicle = makeRow({ vehicles: { plate: 'V', vehicle_models: { brand: 'GAC', name: 'GS3' } } });
    const rows = [legacy, withVehicle];

    const filters: SatisfactionFilterState = { brand: 'GAC', model: ALL_VALUE, month: ALL_VALUE };
    expect(filterSurveys(rows, filters)).toEqual([withVehicle]);
  });

  it('month filter keys on created_at, not responded_at', () => {
    // Created in June, answered in July — must match a June filter, not a July one.
    const createdJuneRespondedJuly = makeRow({
      created_at: '2026-06-28T00:00:00Z',
      responded_at: '2026-07-02T00:00:00Z',
    });
    // Created in July but with a June responded_at (defensive/backdated data) — must
    // match a July filter, never leak into June via responded_at.
    const createdJulyRespondedJune = makeRow({
      created_at: '2026-07-01T00:00:00Z',
      responded_at: '2026-06-30T00:00:00Z',
    });
    const rows = [createdJuneRespondedJuly, createdJulyRespondedJune];

    const juneFilter: SatisfactionFilterState = { brand: ALL_VALUE, model: ALL_VALUE, month: '2026-06' };
    expect(filterSurveys(rows, juneFilter)).toEqual([createdJuneRespondedJuly]);

    const julyFilter: SatisfactionFilterState = { brand: ALL_VALUE, model: ALL_VALUE, month: '2026-07' };
    expect(filterSurveys(rows, julyFilter)).toEqual([createdJulyRespondedJune]);
  });

  it('month filter includes an unanswered survey (responded_at null) for the month it was created', () => {
    const pending = makeRow({ created_at: '2026-06-15T00:00:00Z', responded_at: null, status: 'sent' });
    const filters: SatisfactionFilterState = { brand: ALL_VALUE, model: ALL_VALUE, month: '2026-06' };
    expect(filterSurveys([pending], filters)).toEqual([pending]);
  });
});

describe('facet derivation uses the full unfiltered set (design.md D7)', () => {
  it('narrowing one filter never removes another filter\'s available options', () => {
    const gacJune = makeRow({
      vehicles: { plate: 'A', vehicle_models: { brand: 'GAC', name: 'GS3' } },
      created_at: '2026-06-01T00:00:00Z',
    });
    const dfskJuly = makeRow({
      vehicles: { plate: 'B', vehicle_models: { brand: 'DFSK', name: 'Glory 500' } },
      created_at: '2026-07-01T00:00:00Z',
    });
    const fullSet = [gacJune, dfskJuly];

    // Narrow to June only — DFSK disappears from the *filtered* rows...
    const filteredByMonth = filterSurveys(fullSet, { brand: ALL_VALUE, model: ALL_VALUE, month: '2026-06' });
    expect(deriveBrandFacets(filteredByMonth)).toEqual(['GAC']);

    // ...but the facet dropdowns are built from the full unfiltered set (as
    // `SatisfactionFilters.tsx` does by passing `rows`, not `filteredRows`),
    // so DFSK and July both remain selectable even while the June filter is active.
    expect(deriveBrandFacets(fullSet)).toEqual(['DFSK', 'GAC']);
    expect(deriveMonthOptions(fullSet).map(m => m.value)).toEqual(['2026-07', '2026-06']);
  });
});

describe('groupSurveysByClient', () => {
  it('groups multiple surveys under the same client_id into one aggregated row', () => {
    const rows = [
      makeRow({ client_id: 'client-1', created_at: '2026-06-01T00:00:00Z', response: makeResponse(4) }),
      makeRow({ client_id: 'client-1', created_at: '2026-06-10T00:00:00Z', response: null }),
    ];
    const result = groupSurveysByClient(rows);
    expect(result).toHaveLength(1);
    expect(result[0].surveysCount).toBe(2);
    expect(result[0].respondedCount).toBe(1);
  });

  it('gives each legacy client_id IS NULL row its own non-clickable entry instead of merging or dropping them', () => {
    const rows = [
      makeRow({ id: 'survey-legacy-1', client_id: null }),
      makeRow({ id: 'survey-legacy-2', client_id: null }),
    ];
    const result = groupSurveysByClient(rows);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.clientId === null)).toBe(true);
    // Distinct synthetic keys so React can key each row independently.
    expect(new Set(result.map(r => r.key)).size).toBe(2);
  });

  it('takes clientName/clientPhone/dealershipName/lastOverallScore from the most recent survey by created_at', () => {
    const rows = [
      makeRow({
        client_id: 'client-1',
        created_at: '2026-06-01T00:00:00Z',
        client_name: 'Old Name',
        client_phone: '+58000',
        dealerships: { name: 'Old Dealership' },
        response: makeResponse(2),
      }),
      makeRow({
        client_id: 'client-1',
        created_at: '2026-06-20T00:00:00Z',
        client_name: 'New Name',
        client_phone: '+58111',
        dealerships: { name: 'New Dealership' },
        response: makeResponse(5),
      }),
    ];
    const [result] = groupSurveysByClient(rows);
    expect(result.clientName).toBe('New Name');
    expect(result.clientPhone).toBe('+58111');
    expect(result.dealershipName).toBe('New Dealership');
    expect(result.lastSurveyAt).toBe('2026-06-20T00:00:00Z');
    expect(result.lastOverallScore).toBe(5);
  });

  it('coerces a string overall_score (PostgREST numeric style) to a number', () => {
    const rows = [makeRow({ response: makeResponse('4.50') })];
    const [result] = groupSurveysByClient(rows);
    expect(result.lastOverallScore).toBe(4.5);
  });

  it('sorts the grouped client rows most-recent-activity first', () => {
    const rows = [
      makeRow({ client_id: 'client-old', created_at: '2026-05-01T00:00:00Z' }),
      makeRow({ client_id: 'client-new', created_at: '2026-06-01T00:00:00Z' }),
    ];
    const result = groupSurveysByClient(rows);
    expect(result.map(r => r.clientId)).toEqual(['client-new', 'client-old']);
  });

  it('falls back to "Sin nombre" when client_name is null/empty', () => {
    const rows = [makeRow({ client_name: null })];
    const [result] = groupSurveysByClient(rows);
    expect(result.clientName).toBe('Sin nombre');
  });
});
