import { describe, it, expect } from 'vitest';
import {
  SERVICE_SURVEY_SECTIONS,
  SERVICE_SURVEY_QUESTIONS,
  getServiceSurveyOption,
  getAspectsForOrigin,
  isServiceSurvey,
  SATISFACTION_ASPECTS,
} from './satisfaction';

/**
 * El cuestionario del frontend y el CHECK de la base tienen que decir lo mismo. Si divergen,
 * el cliente elige una opción que la RPC rechaza — y lo descubre recién al enviar, con toda
 * la encuesta ya respondida.
 *
 * Los valores de abajo están copiados de
 * supabase/migrations/20260813120000_postventa_survey_questionnaire.sql.
 */
const DB_OPTIONS: Record<string, string[]> = {
  recepcion_imagen: ['si', 'no'],
  explicacion_tecnica: ['muy_clara', 'aceptable', 'confusa'],
  informe_tecnico: ['si', 'no'],
  garantia_repuestos: ['si', 'no', 'no_mencionado'],
  presentacion_equipo: ['si', 'no'],
  limpieza_entrega: ['impecable', 'parcial', 'no_lavado'],
  precio_mano_obra: ['excelente', 'adecuado', 'elevado'],
  conclusion_tecnica: ['satisfecho', 'parcial', 'persiste'],
};

describe('cuestionario de postventa', () => {
  it('tiene las 8 preguntas que definió GAC, en 5 secciones', () => {
    expect(SERVICE_SURVEY_QUESTIONS).toHaveLength(8);
    expect(SERVICE_SURVEY_SECTIONS).toHaveLength(5);
    expect(SERVICE_SURVEY_SECTIONS.map(s => s.title)).toEqual([
      'Atención y Diagnóstico Inicial',
      'Calidad del Trabajo Técnico y Repuestos',
      'Entrega y Acabado del Vehículo',
      'Transparencia y Valor de Servicio',
      'Calificación General',
    ]);
  });

  it('cada opción existe también en el CHECK de la base', () => {
    for (const question of SERVICE_SURVEY_QUESTIONS) {
      const allowed = DB_OPTIONS[question.column];
      expect(allowed, `columna desconocida: ${question.column}`).toBeDefined();
      expect(question.options.map(o => o.value).sort()).toEqual([...allowed].sort());
    }
  });

  it('no deja ninguna columna de la base sin pregunta', () => {
    expect(SERVICE_SURVEY_QUESTIONS.map(q => q.column).sort()).toEqual(Object.keys(DB_OPTIONS).sort());
  });

  it('puntúa 5 la mejor opción y 1 la peor, en cada pregunta', () => {
    for (const question of SERVICE_SURVEY_QUESTIONS) {
      const scores = question.options.map(o => o.score);
      expect(Math.max(...scores)).toBe(5);
      expect(Math.min(...scores)).toBe(1);
    }
  });

  it('trata "No me lo mencionaron" como intermedia, no como negativa', () => {
    // Es una omisión al comunicar, no la negación de la garantía. La base usa el mismo 3.
    expect(getServiceSurveyOption('garantia_repuestos', 'no_mencionado')?.score).toBe(3);
    expect(getServiceSurveyOption('garantia_repuestos', 'no')?.score).toBe(1);
  });

  it('devuelve undefined para un valor que no está en el catálogo', () => {
    expect(getServiceSurveyOption('recepcion_imagen', 'quizas')).toBeUndefined();
    expect(getServiceSurveyOption('recepcion_imagen', null)).toBeUndefined();
  });

  it('no ofrece aspectos 1..5 para una encuesta de postventa', () => {
    // Devolver la lista de venta haría que cada consumidor pintara títulos de venta sobre
    // columnas que ya no existen: cinco filas de "NaN/5" con aspecto de reporte válido.
    expect(getAspectsForOrigin('service')).toEqual([]);
    expect(isServiceSurvey('service')).toBe(true);
  });

  it('deja intacta la encuesta de venta', () => {
    expect(getAspectsForOrigin('won')).toEqual(SATISFACTION_ASPECTS);
    expect(getAspectsForOrigin('repurchase')).toEqual(SATISFACTION_ASPECTS);
    expect(getAspectsForOrigin(null)).toEqual(SATISFACTION_ASPECTS);
    expect(isServiceSurvey('won')).toBe(false);
  });
});
