import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { getAspectsForOrigin, getSatisfactionLevel, SURVEY_ORIGIN_LABEL } from '@/lib/satisfaction';

/**
 * Printable PDF document for a single answered satisfaction survey.
 *
 * Lazily imported/code-split via `SurveyPdfDownloadButton` — this file (and
 * its `@react-pdf/renderer` import) must NOT be pulled into the main bundle.
 */

/**
 * `@react-pdf/renderer`'s color parser does not reliably accept a bare HSL
 * triplet (react-pdf CSS "hsl(...)" support is inconsistent across
 * versions/build targets), so we convert `getSatisfactionLevel(...).color`
 * ("H S% L%") to a hex string here instead of wrapping it as `hsl(${color})`
 * like the DOM-rendered components (SatisfactionOverview, etc.) do.
 */
function hslTripletToHex(hslTriplet: string): string {
  const [hStr, sStr, lStr] = hslTriplet.split(' ');
  const h = Number(hStr);
  const s = Number(sStr.replace('%', '')) / 100;
  const l = Number(lStr.replace('%', '')) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface SurveyResponsePdfProps {
  clientName: string;
  dealershipName: string | null;
  salesperson: string | null;
  soldPlate: string | null;
  respondedAt: string;
  responses: {
    key: string;
    score: number;
  }[];
  /**
   * Postventa answers, in questionnaire order. That survey has no 1..5 scale, so its answers
   * cannot travel through `responses`. Present only when origin === 'service'.
   */
  serviceAnswers?: {
    title: string;
    /** The option the customer picked, e.g. "No fue lavado/aspirado". */
    label: string;
    /** 5 / 3 / 1 — only to colour the line, same scale the sale survey reports on. */
    score: number;
  }[];
  npsRecomienda: boolean | null;
  comment: string | null;
  overallScore: number;
  /**
   * 'won' | 'repurchase' | 'service'. Selects the aspect titles — a postventa survey
   * scored the workshop, not the sale, so rendering it under the sale titles would
   * misreport what the customer actually answered. Optional: absent means the sale set,
   * which is what every survey predating postventa is.
   */
  origin?: string | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 16,
  },
  metaBlock: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  metaItem: {
    flexGrow: 1,
  },
  metaLabel: {
    fontSize: 8,
    color: '#6b7280',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  aspectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  aspectTitle: {
    fontSize: 10,
    flexGrow: 1,
    paddingRight: 8,
  },
  aspectScore: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    width: 90,
    textAlign: 'right',
  },
  npsBlock: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  npsLine: {
    fontSize: 10,
    marginBottom: 6,
  },
  commentBox: {
    backgroundColor: '#f9fafb',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  overallBlock: {
    marginTop: 20,
    padding: 12,
    borderRadius: 4,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  overallLabel: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 4,
  },
  overallScore: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
  },
  overallSubLabel: {
    fontSize: 10,
    marginTop: 4,
  },
});

const SurveyResponsePdf = ({
  clientName,
  dealershipName,
  salesperson,
  soldPlate,
  respondedAt,
  responses,
  serviceAnswers,
  npsRecomienda,
  comment,
  overallScore,
  origin,
}: SurveyResponsePdfProps) => {
  const overallLevel = getSatisfactionLevel(Math.round(overallScore));
  const overallColor = hslTripletToHex(overallLevel.color);
  const aspects = getAspectsForOrigin(origin);
  const isService = origin === 'service';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {isService ? 'Encuesta de Postventa' : 'Encuesta de Satisfacción'}
        </Text>
        <Text style={styles.subtitle}>
          {clientName} — {respondedAt}
          {origin && SURVEY_ORIGIN_LABEL[origin] ? ` — ${SURVEY_ORIGIN_LABEL[origin]}` : ''}
        </Text>

        <View style={styles.metaBlock}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Concesionario</Text>
            <Text style={styles.metaValue}>{dealershipName || '-'}</Text>
          </View>
          <View style={styles.metaItem}>
            {/* A postventa survey has no salesperson — the field is the service advisor's
                counterpart and is simply absent on that origin. */}
            <Text style={styles.metaLabel}>{isService ? 'Asesor' : 'Vendedor'}</Text>
            <Text style={styles.metaValue}>{salesperson || '-'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Placa</Text>
            <Text style={styles.metaValue}>{soldPlate || '-'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {isService ? 'Respuestas' : 'Evaluación por aspecto'}
        </Text>

        {isService && (serviceAnswers ?? []).map(answer => {
          const color = hslTripletToHex(getSatisfactionLevel(answer.score).color);
          return (
            <View key={answer.title} style={styles.aspectRow}>
              <Text style={styles.aspectTitle}>{answer.title}</Text>
              <Text style={[styles.aspectScore, { color }]}>{answer.label}</Text>
            </View>
          );
        })}

        {aspects.map(aspect => {
          const response = responses.find(r => r.key === aspect.key);
          const score = response?.score ?? 0;
          const level = getSatisfactionLevel(score);
          const color = hslTripletToHex(level.color);
          return (
            <View key={aspect.key} style={styles.aspectRow}>
              <Text style={styles.aspectTitle}>{aspect.title}</Text>
              <Text style={[styles.aspectScore, { color }]}>
                {score}/5 — {level.label}
              </Text>
            </View>
          );
        })}

        <View style={styles.npsBlock}>
          {/* El cuestionario de postventa no pregunta recomendación, así que la línea se
              omite en vez de imprimir un "—" que se lee como respuesta faltante. */}
          {!isService && (
            <Text style={styles.npsLine}>
              ¿Recomienda a GAC? {npsRecomienda === null ? '—' : npsRecomienda ? 'Sí' : 'No'}
            </Text>
          )}
          {comment && (
            <View>
              <Text style={styles.npsLine}>Comentario del cliente:</Text>
              <View style={styles.commentBox}>
                <Text>{comment}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.overallBlock}>
          <Text style={styles.overallLabel}>Puntaje general</Text>
          <Text style={[styles.overallScore, { color: overallColor }]}>
            {overallScore.toFixed(1)}
          </Text>
          <Text style={styles.overallSubLabel}>{overallLevel.label}</Text>
        </View>
      </Page>
    </Document>
  );
};

export default SurveyResponsePdf;
