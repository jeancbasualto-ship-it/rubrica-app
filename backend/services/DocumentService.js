/**
 * @fileoverview Funciones de Apps Script para generar Google Docs con rúbricas y feedback de IA.
 */

/**
 * Crea un documento de Google Docs con la rúbrica aplicada.
 * @param {string} courseName Nombre del curso.
 * @param {string} studentName Nombre del estudiante.
 * @param {string} evaluationName Nombre de la evaluación.
 * @param {Object} activeRubric La rúbrica completa.
 * @param {Object} currentGrading El puntaje seleccionado por criterio.
 * @param {string} finalGrade La nota 1.0 - 7.0 calculada.
 * @returns {string} El ID del documento creado o un mensaje de error.
 */
function createGradingDoc(
  courseName,
  studentName,
  evaluationName,
  activeRubric,
  currentGrading,
  finalGrade
) {
  try {
    const docName = `[CALIFICACIÓN] ${evaluationName} - ${studentName} (${courseName})`;
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();

    // Encabezado
    body
      .appendParagraph(docName)
      .setHeading(DocumentApp.ParagraphHeading.TITLE)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body
      .appendParagraph(`Rúbrica: ${activeRubric.name}`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(activeRubric.description);
    body.appendParagraph("");

    // Tabla de Rúbrica
    const numCols = activeRubric.levels.length + 1;
    const numRows = activeRubric.criteria.length + 1;
    const table = body.appendTable(
      new Array(numRows).fill(null).map(() => new Array(numCols).fill(""))
    );

    table.getCell(0, 0).setText("Criterio").setBold(true);
    activeRubric.levels.forEach((level, i) => {
      table
        .getCell(0, i + 1)
        .setText(`${level.name} (${level.points} pts)`)
        .setBold(true);
    });

    activeRubric.criteria.forEach((criterion, r) => {
      const criterionIndex = r.toString();
      table
        .getCell(r + 1, 0)
        .setText(criterion.name)
        .setBold(true);
      const selectedLevelId = currentGrading[criterionIndex];

      activeRubric.levels.forEach((level, c) => {
        const desc =
          criterion.level_descriptions.find((d) => d.level_id === level.id)
            ?.description || "N/A";
        // Marcar con ★ los niveles seleccionados (setBackground no está disponible)
        const prefix = level.id === selectedLevelId ? "★ " : "";
        table.getCell(r + 1, c + 1).setText(prefix + desc);
      });
    });

    // Resumen de Puntaje
    const totalAchieved = calculateTotalAchieved(activeRubric, currentGrading);
    const totalMax = activeRubric.criteria.reduce(
      (sum, c) => sum + c.max_points,
      0
    );

    body.appendParagraph("\n");
    body
      .appendParagraph("--- RESUMEN DE CALIFICACIÓN ---")
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    body
      .appendListItem(`Puntaje Logrado: ${totalAchieved} / ${totalMax}`)
      .setBold(true);
    // Indicador visual de aprobado/reprobado (setForeground no disponible)
    const passEmoji = parseFloat(finalGrade) >= 4.0 ? "✅" : "❌";
    body
      .appendListItem(`${passEmoji} NOTA FINAL (1.0 - 7.0): ${finalGrade}`)
      .setBold(true);

    doc.saveAndClose();

    // Retornar estructura con ID y URL
    return JSON.stringify({
      success: true,
      id: doc.getId(),
      url: doc.getUrl(),
      name: docName,
    });
  } catch (e) {
    Logger.log("Error al crear Docs simple: " + e.message);
    return JSON.stringify({
      error: "Error al generar el documento: " + e.message,
    });
  }
}

/**
 * Genera retroalimentación de IA y la añade a un documento de calificación existente.
 * @param {string} courseName
 * @param {string} studentName
 * @param {string} evaluationName
 * @param {Object} activeRubric
 * @param {Object} currentGrading
 * @param {string} finalGrade
 * @returns {string} Mensaje de éxito o error.
 */
function createDocWithFeedback(
  courseName,
  studentName,
  evaluationName,
  activeRubric,
  currentGrading,
  finalGrade
) {
  try {
    // 1. Llama a la IA para obtener el texto de feedback
    // Usar generatePersonalizedFeedback de FeedbackService.gs (más completo)
    const feedbackText = generatePersonalizedFeedback(
      studentName,
      courseName,
      evaluationName,
      activeRubric,
      currentGrading,
      finalGrade
    );
    if (feedbackText.startsWith("ERROR:")) {
      return feedbackText;
    }

    // 2. Crea el documento base con la rúbrica y la calificación
    const docResponse = createGradingDoc(
      courseName,
      studentName,
      evaluationName,
      activeRubric,
      currentGrading,
      finalGrade
    );

    const docData = JSON.parse(docResponse);
    if (docData.error) {
      return docResponse;
    }

    const docId = docData.id;

    // 3. Abre el documento recién creado y añade el feedback
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    body.appendParagraph("\n");
    body
      .appendParagraph(
        "🤖 --- RETROALIMENTACIÓN INTELIGENTE (GENERADA POR IA) ---"
      )
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);

    feedbackText.split("\n").forEach((line) => {
      if (line.trim().length > 0) {
        body.appendParagraph(line.trim());
      }
    });
    doc.saveAndClose();

    // 4. Mueve el documento final a la carpeta de calificaciones
    const folderName = "Calificaciones Generadas";
    let folder = DriveApp.getFoldersByName(folderName);
    if (!folder.hasNext()) {
      folder = DriveApp.createFolder(folderName);
    } else {
      folder = folder.next();
    }

    const file = DriveApp.getFileById(docId);
    const docName = file.getName();
    file.moveTo(folder);

    // Retornar respuesta estructurada con URL
    return JSON.stringify({
      success: true,
      message: `Documento de calificación creado: ${docName}`,
      url: docData.url,
      id: docId,
      name: docName,
      folder: folderName,
    });
  } catch (e) {
    Logger.log("Error en createDocWithFeedback: " + e.message);
    return JSON.stringify({
      error:
        "No se pudo generar la retroalimentación de la IA y el documento. " +
        e.message,
    });
  }
}

/**
 * Función auxiliar para calcular el puntaje total logrado. Requerida por createGradingDoc.
 */
function calculateTotalAchieved(rubric, grading) {
  let totalAchieved = 0;
  rubric.criteria.forEach((criterion, index) => {
    const selectedLevelId = grading[index.toString()];
    const level = rubric.levels.find((l) => l.id === selectedLevelId);
    if (level) {
      totalAchieved += level.points;
    }
  });
  return totalAchieved;
}
