/**
 * Wrapper público para guardar un curso desde el frontend.
 * @param {Object} course Objeto del curso.
 * @returns {string} JSON con resultado de guardado.
 */
function saveCourse(course) {
  return saveCourseToSheet(course);
}

/**
 * Wrapper público para eliminar un curso (mover a la papelera el Sheet)
 * @param {string} courseName Nombre del curso a eliminar
 * @returns {string} JSON con resultado
 */
function deleteCourse(courseName) {
  return deleteCourseSheet(courseName);
}
/**
 * @fileoverview Wrappers de compatibilidad para el frontend.
 * Mantiene la API pública estable mientras delega a módulos especializados.
 * IMPORTANTE: Este archivo es necesario porque el frontend llama a estas funciones
 * directamente desde google.script.run
 */

/**
 * Wrapper para generateRubric - Delega a IAService.gs
 * El frontend llama a esta función desde app_logic.html línea 227
 * @param {string} prompt La descripción de la rúbrica deseada.
 * @return {string} El objeto JSON de la rúbrica como string o un mensaje de error JSON.
 */
function generateRubric(prompt) {
  return generateRubricAI(prompt);
}

/**
 * getDriveAccessToken - Requerido por el frontend para Google Picker API
 * @returns {string} El token de acceso a Drive.
 */
function getDriveAccessToken() {
  return ScriptApp.getOAuthToken();
}

/**
 * Función para importar y analizar el contenido de un archivo de Drive (PDF, DOCX, etc.)
 * CONSERVADA de server_functions.gs - No hay versión moderna equivalente
 * @param {string} fileId El ID del archivo de Drive seleccionado por el usuario.
 * @returns {string} Un objeto JSON de la rúbrica generada.
 */
function importAndAnalyzeRubric(fileId) {
  try {
    const file = Drive.Files.get(fileId);
    const mimeType = file.mimeType;
    let content = "No se pudo extraer contenido.";

    if (mimeType.includes("document")) {
      const response = UrlFetchApp.fetch(
        "https://www.googleapis.com/drive/v2/files/" +
          fileId +
          "/export?mimeType=text/plain",
        {
          headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        }
      );
      content = response.getContentText();
    } else if (mimeType.includes("pdf") || mimeType.includes("plain")) {
      content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
    }

    const name = DriveApp.getFileById(fileId)
      .getName()
      .replace(/\.[^/.]+$/, "");

    // Usar la función de IA para analizar el contenido
    return analyzeRubricContent(content, name, mimeType);
  } catch (e) {
    return JSON.stringify({
      error: `Error de Generación o Conversión de Archivo: ${e.message}. Asegúrate de que el SERVICIO AVANZADO 'Drive API' esté habilitado.`,
    });
  }
}
