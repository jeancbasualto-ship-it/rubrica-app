/**
 * @fileoverview Servicio de generación de feedback con IA.
 * FASE 4: Feedback real personalizado usando Gemini API.
 */

/**
 * Genera feedback personalizado con IA para un estudiante.
 * @param {string} studentName Nombre del estudiante.
 * @param {string} courseName Nombre del curso.
 * @param {string} evaluationName Nombre de la evaluación.
 * @param {Object} rubric Rúbrica utilizada.
 * @param {Object} currentGrading Calificación asignada.
 * @param {string} finalGrade Nota final 1.0-7.0.
 * @returns {string} Feedback generado por IA o fallback en caso de error.
 */
function generatePersonalizedFeedback(
  studentName,
  courseName,
  evaluationName,
  rubric,
  currentGrading,
  finalGrade
) {

  // comentario eliminado: línea accidental "ánimo concreto"
  try {
    // Generar retroalimentación técnica limitada a 5-6 líneas.
    const objective = rubric.name || evaluationName || courseName || "el objetivo evaluado";

    // Calcular desempeño por criterio (porcentaje) para priorizar mejoras
    const criteriaWithScore = rubric.criteria.map((criterion, cIndex) => {
      const selectedLevelId = currentGrading[cIndex.toString()];
      const level = rubric.levels.find((l) => l.id === selectedLevelId);
      const levelPoints = level ? level.points : 0;
      const maxPoints = criterion.max_points || 0;
      const percentage = maxPoints > 0 ? (levelPoints / maxPoints) * 100 : 0;
      return { criterion, cIndex, level, levelPoints, maxPoints, percentage };
    });

    // Priorizar criterios con peor desempeño (ascendente) y mantener orden estable
    criteriaWithScore.sort((a, b) => a.percentage - b.percentage || a.cIndex - b.cIndex);

    // Determinar cuántas líneas: máximo 6, ideal 5-6. Si hay menos de 5 criterios, usar la cantidad disponible.
    const maxLines = Math.min(6, Math.max(1, rubric.criteria.length));
    const selected = criteriaWithScore.slice(0, maxLines);

    // Primero intentamos delegar a la IA (Gemini) para obtener una versión breve y dirigida a estudiantes
    try {
      // Construir resumen compacto de la rúbrica y calificaciones para el prompt
      let rubricText = `Rúbrica: ${rubric.name || 'Sin nombre'}\nEvaluación: ${evaluationName || ''}\nCurso: ${courseName || ''}\n\n`;
      rubric.criteria.forEach((criterion, idx) => {
        const sel = currentGrading[idx] !== undefined ? currentGrading[idx] : null;
        const selLevel = rubric.levels.find(l => l.id === sel);
        rubricText += `Criterio: ${criterion.name} | Nivel alcanzado: ${selLevel ? selLevel.name : 'Sin calificación'}\n`;
      });

      const systemPrompt = `Eres un generador de retroalimentación breve para estudiantes. Debes devolver ÚNICAMENTE el bloque de retroalimentación, en español, sin saludos ni explicaciones adicionales. Requisitos estrictos:
1) Máximo 5-6 líneas.
2) Lenguaje simple y directo, sin tecnicismos.
3) Cada retroalimentación debe: nombrar el error principal, explicar brevemente por qué afecta el logro, e indicar una mejora concreta.
4) Prioriza el error más importante (criterios con peor desempeño).
5) No uses encabezados; devuelve sólo las líneas.
Ejemplo de formato esperado (exacto, 4 líneas posible):
"Te faltó explicar cómo llegaste a tu resultado.\nEsto es importante porque muestra que comprendes el proceso.\nPara mejorar, escribe cada paso y revisa si tus cálculos están bien hechos.\nCon eso podrás avanzar al nivel esperado."
Devuelve 1 a 6 líneas como en el ejemplo, directo al estudiante.`;

      const userPrompt = `Genera la retroalimentación breve basada en la siguiente rúbrica y calificación:\n\n${rubricText}\nDevuelve SOLO las líneas de retroalimentación conforme a los requisitos.`;

      const aiResponse = callGeminiAPI(systemPrompt, userPrompt, false);
      if (aiResponse && typeof aiResponse === 'string') {
        // Preferir párrafos (separados por línea en blanco) si la IA los devuelve
        const paragraphs = aiResponse.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
        if (paragraphs.length >= 1 && paragraphs.length <= 6) {
          const tooLongPara = paragraphs.some(p => p.length > 1000);
          if (!tooLongPara) return paragraphs.join('\n\n');
        }

        // Si no hay párrafos, intentar convertir líneas individuales en párrafos
        const linesAi = aiResponse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (linesAi.length >= 1 && linesAi.length <= 6) {
          const tooLong = linesAi.some(l => l.length > 200);
          if (!tooLong) return linesAi.map(l => l).join('\n\n');
        }
      }
      // Si la IA no devolvió el formato correcto, continuar con el fallback determinista
    } catch (aiErr) {
      Logger.log('IA no entregó formato breve esperado: ' + (aiErr && aiErr.message));
      // seguir a fallback
    }

    // Fallback determinista: generar retroalimentación breve y simple por criterio
    if (!selected || selected.length === 0) {
      return `No fue posible identificar un criterio para dar retroalimentación breve.`;
    }

    // Para cada criterio seleccionado (hasta 6), generamos un párrafo con 3 oraciones cortas:
    // 1) Nombrar el error principal (muy breve)
    // 2) Por qué afecta el logro (una frase simple)
    // 3) Mejora concreta (acción clara que el estudiante puede hacer)
    const paragraphs = selected.slice(0, 6).map(item => {
      const c = item.criterion;
      const lvl = item.level;

      // Extraer una frase corta de evidencia si existe
      let evidence = '';
      if (lvl) {
        if (c.level_descriptions && c.level_descriptions.length > 0) {
          const descObj = c.level_descriptions.find(d => d.level_id === lvl.id);
          evidence = descObj && descObj.description ? descObj.description.split(/[\.\n]/)[0].trim() : lvl.name;
        } else {
          evidence = lvl.name;
        }
      }

      // Determinar mensaje principal corto
      let mainError = '';
      const le = (evidence || '').toLowerCase();
      if (!lvl) {
        mainError = `Te faltó evidencia o explicación en ${c.name}.`;
      } else if (/(omit|falt|no present|sin)/.test(le)) {
        mainError = `Te faltó evidencia o explicación en ${c.name}.`;
      } else if (/(imprecis|error|incorrect)/.test(le)) {
        mainError = `Tu respuesta tiene errores en ${c.name}.`;
      } else if (/(confus|incoher)/.test(le)) {
        mainError = `La explicación en ${c.name} está confusa.`;
      } else {
        mainError = `Tu trabajo en ${c.name} está incompleto.`;
      }

      const impact = `Esto afecta el logro porque impide comprobar que comprendes lo que se pide.`;
      const improvement = `Para mejorar, ${lvl ? 'revisa y corrige' : 'añade'} una explicación breve y clara de los pasos que seguiste en ${c.name}.`;

      // Construir párrafo (3 oraciones cortas). Evitar tecnicismos.
      return `${mainError} ${impact} ${improvement}`;
    });

    // Devolver párrafos separados por una línea en blanco
    return paragraphs.join('\n\n');
  } catch (e) {
    Logger.log(`Error al generar retroalimentación técnica: ${e.message}`);
    return `Retroalimentación técnica según rúbrica: No fue posible generar la retroalimentación técnica debido a un error interno.`;
  }
}

/**
 * Analiza la calificación para identificar fortalezas y áreas de mejora.
 * @param {Object} rubric Rúbrica utilizada.
 * @param {Object} currentGrading Calificación asignada.
 * @returns {Object} {strengths: Array, improvements: Array}.
 */
function analyzeGradingResults(rubric, currentGrading) {
  const strengths = [];
  const improvements = [];

  rubric.criteria.forEach((criterion, cIndex) => {
    const selectedLevelId = currentGrading[cIndex.toString()];
    if (selectedLevelId !== undefined) {
      const level = rubric.levels.find((l) => l.id === selectedLevelId);
      if (level) {
        const percentage = (level.points / criterion.max_points) * 100;

        if (percentage >= 80) {
          strengths.push(criterion.name);
        } else if (percentage < 60) {
          improvements.push(criterion.name);
        }
      }
    }
  });

  return { strengths, improvements };
}

/**
 * Genera feedback de fallback cuando la IA falla.
 * @param {string} studentName Nombre del estudiante.
 * @param {string} finalGrade Nota final.
 * @param {string} gradingSummary Resumen de calificación.
 * @returns {string} Feedback genérico pero útil.
 */
function getFallbackFeedback(studentName, finalGrade, gradingSummary) {
  const isPassing = parseFloat(finalGrade) >= 4.0;

  return `Estimado/a ${studentName},

${
  isPassing
    ? `Felicitaciones por tu desempeño en esta evaluación, alcanzando una nota de ${finalGrade}. Tu trabajo demuestra comprensión de los conceptos trabajados.`
    : `Has obtenido una nota de ${finalGrade} en esta evaluación. Aunque no alcanzaste el mínimo aprobatorio, esta es una oportunidad de aprendizaje para mejorar.`
}

A continuación, encontrarás el detalle de tu calificación por criterio:

${gradingSummary}

Te animo a revisar los comentarios específicos de cada criterio y a trabajar en las áreas que necesitan refuerzo. Si tienes dudas, no dudes en consultar. ¡Sigue adelante!`;
}

/**
 * Función auxiliar para formatear la calificación en texto.
 * Esta función también existe en Server_Functions.gs pero la duplicamos aquí
 * para independencia del módulo.
 * @param {Object} rubric Objeto de la rúbrica.
 * @param {Object} currentGrading Puntuación seleccionada por criterio.
 * @returns {string} Resumen de la calificación.
 */
function getGradingSummary(rubric, currentGrading) {
  let summary = "";
  let totalAchieved = 0;
  let totalMax = 0;

  rubric.criteria.forEach((criterion, cIndex) => {
    totalMax += criterion.max_points;
    const selectedLevelId = currentGrading[cIndex.toString()];
    let achieved = 0;

    if (selectedLevelId !== undefined) {
      const level = rubric.levels.find((l) => l.id === selectedLevelId);
      achieved = level ? Math.min(level.points, criterion.max_points) : 0;
      const levelName = level ? level.name : "N/A";

      summary += `- ${criterion.name}: ${achieved} / ${criterion.max_points} (${levelName})\n`;
      totalAchieved += achieved;
    } else {
      summary += `- ${criterion.name}: Sin Calificar / ${criterion.max_points}\n`;
    }
  });

  summary += `\nPuntaje Total: ${totalAchieved} / ${totalMax}`;
  return summary;
}
