/**
 * @fileoverview Funciones de Apps Script para interactuar con el modelo Gemini.
 * Incluye la generación de rúbricas, análisis de archivos y generación de feedback.
 */

// NOTA: Usamos las constantes globales (ej. API_KEY, GEMINI_MODEL) que deberían estar en Code.gs

/**
 * Llama a la IA para generar una nueva rúbrica basada en un prompt de texto libre.
 * @param {string} prompt La descripción de la rúbrica deseada.
 * @return {string} El objeto JSON de la rúbrica como string o un mensaje de error JSON.
 */
function generateRubricAI(prompt) {
  const systemPrompt =
    "Actúa como un experto en diseño curricular. Genera una rúbrica detallada en español. La rúbrica debe tener al menos 4 criterios y 4 niveles de desempeño (ej. Sobresaliente, Bueno, Aceptable, Necesita Mejora). El puntaje total máximo debe ser de 40 puntos. El JSON de salida DEBE seguir estrictamente el esquema proporcionado. El prompt del usuario es: " +
    prompt;
  return callGeminiAPI(systemPrompt, prompt, true);
}

/**
 * Lee el contenido de un archivo, lo envía a la IA y pide que lo convierta a la estructura JSON de rúbrica.
 * @param {string} fileContent El contenido de texto del archivo a analizar.
 * @param {string} fileName El nombre del archivo original.
 * @param {string} mimeType El tipo MIME del archivo original.
 * @return {string} El objeto JSON de la rúbrica como string o un mensaje de error JSON.
 */
function analyzeRubricContent(fileContent, fileName, mimeType) {
  const systemPrompt =
    "Actúa como un analista de documentos pedagógicos. Analiza el siguiente contenido de texto. Identifica los criterios de evaluación, los niveles de logro (y sus puntajes implícitos o explícitos), y las descripciones asociadas. Transforma esta información en la estructura JSON de RÚBRICA. Asegúrate de asignar un título (name) y una descripción (description) basados en el contexto. El JSON de salida DEBE seguir estrictamente el esquema proporcionado.";
  const userPrompt = `Analiza este documento titulado "${fileName}" (Tipo: ${mimeType}) y conviértelo en una rúbrica JSON. El contenido extraído es: \n\n--- CONTENIDO ---\n${fileContent}\n--- FIN CONTENIDO ---`;
  return callGeminiAPI(systemPrompt, userPrompt, true);
}

/**
 * Llama a Gemini para generar un texto de retroalimentación constructiva.
 * @param {string} studentName
 * @param {Object} rubric
 * @param {Object} grading
 * @param {string} finalGrade
 * @returns {string} Texto de retroalimentación generado por la IA.
 */
function generateFeedback(studentName, rubric, grading, finalGrade) {
  // Construir un resumen legible de la calificación para el prompt
  let gradingSummary = `El estudiante ${studentName} obtuvo una nota final de ${finalGrade} en la evaluación '${rubric.name}'.\n\nDesempeño por criterio:\n`;

  rubric.criteria.forEach((criterion, index) => {
    const selectedLevelId = grading[index.toString()];
    const level = rubric.levels.find((l) => l.id === selectedLevelId);
    const description =
      criterion.level_descriptions.find((d) => d.level_id === selectedLevelId)
        ?.description || "N/A";

    if (level) {
      gradingSummary += `- Criterio: ${criterion.name}. Nivel obtenido: ${level.name} (${level.points} pts). Descripción: ${description}\n`;
    }
  });

  const systemPrompt = `Eres un profesor experto y amable. Tu tarea es generar una retroalimentación constructiva y personalizada para un estudiante basándote en el resumen de calificación de una rúbrica.
    La retroalimentación debe:
    1. Dirigirse al estudiante por su nombre.
    2. Comenzar felicitando el trabajo.
    3. Destacar de 2 a 3 puntos fuertes (criterios donde el desempeño fue alto).
    4. Identificar claramente 2 o 3 áreas de mejora específicas (criterios donde el desempeño fue bajo o necesita más esfuerzo).
    5. Terminar con una frase de aliento.
    6. El tono debe ser profesional y motivacional.`;

  const userQuery = `Genera la retroalimentación para el siguiente resumen de calificación:\n\n${gradingSummary}`;

  // Llama a Gemini sin forzar una respuesta JSON
  return callGeminiAPI(systemPrompt, userQuery, false);
}

/**
 * Función centralizada para interactuar con la API de Gemini.
 * @param {string} systemInstruction La instrucción del sistema para guiar el modelo.
 * @param {string} userQuery La consulta del usuario.
 * @param {boolean} forceJson Si se debe forzar una respuesta en formato JSON con el schema de la rúbrica.
 * @returns {string} El JSON de la respuesta de Gemini (o error) como string.
 */
function callGeminiAPI(systemInstruction, userQuery, forceJson) {
  // --- VALIDACIÓN DE API KEY ---
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
    return JSON.stringify({
      error:
        "CONFIGURACIÓN REQUERIDA: La GEMINI_API_KEY no ha sido configurada. Por favor, añade tu clave de API en el archivo 'Code.gs'.",
    });
  }
  // --- FIN DE VALIDACIÓN ---

  if (!GEMINI_API_KEY && typeof __api_key !== "undefined") {
    // Handle API key injection if necessary
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };

  // Solo añade la configuración de JSON si es requerido
  if (forceJson) {
    payload.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: RUBRIC_SCHEMA,
    };
  }

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl, options);
    const jsonResponse = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200 || jsonResponse.error) {
      Logger.log("Error de API: " + response.getContentText());
      return JSON.stringify({
        error: `Error en la llamada a la API de Gemini: ${
          jsonResponse.error?.message || response.getContentText()
        }`,
      });
    }

    const generatedText = jsonResponse.candidates[0].content.parts[0].text;
    return generatedText;
  } catch (e) {
    Logger.log("Excepción al llamar a Gemini: " + e.message);
    return JSON.stringify({
      error: "Excepción del servidor de Apps Script: " + e.message,
    });
  }
}
