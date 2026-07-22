import { PDFDownloadLink } from '@react-pdf/renderer';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SurveyResponsePdf, { type SurveyResponsePdfProps } from './SurveyResponsePdf';

/**
 * Download button for a single survey response's PDF.
 *
 * This is the default export intentionally so `ClientDetailDialog` can
 * `lazy(() => import('./SurveyPdfDownloadButton'))` and keep `@react-pdf/renderer`
 * (and its dependency graph) out of the main bundle — it only loads when a
 * user opens the "Encuesta" tab for a client with an answered survey.
 */

/** Strips characters that are unsafe/awkward in a downloaded filename. */
function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'cliente';
}

export interface SurveyPdfDownloadButtonProps extends SurveyResponsePdfProps {
  clientName: string;
}

const SurveyPdfDownloadButton = (props: SurveyPdfDownloadButtonProps) => {
  const filename = `encuesta-${sanitizeFilename(props.clientName)}.pdf`;

  return (
    <PDFDownloadLink document={<SurveyResponsePdf {...props} />} fileName={filename}>
      {({ loading }) => (
        <Button size="sm" variant="outline" disabled={loading} className="gap-1.5">
          <FileDown className="w-3.5 h-3.5" />
          {loading ? 'Generando...' : 'Descargar PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  );
};

export default SurveyPdfDownloadButton;
