/**
 * @fileoverview Gestión de rúbricas en Google Drive.
 * Maneja guardado, carga, listado y eliminación de rúbricas.
 * FASE 1 y FASE 2: Guardado automático y asignación a cursos.
 */

// ====================================================================
// FASE 1: GUARDADO Y CARGA DE RÚBRICAS
// ====================================================================

/**
 * Guarda una rúbrica en Google Drive como archivo JSON.
 * @param {Object} rubricData La rúbrica a guardar.
 * @param {string} origin Origen: 'ai', 'import', 'manual'.
 * @returns {string} JSON con {success: true, id: string} o {error: string}.
 */
function saveRubricToDrive(rubricData, origin = "manual") {
  try {
    const folderName = "Rúbricas - Repositorio";

    // 1. Buscar o crear carpeta
    let folders = DriveApp.getFoldersByName(folderName);
    let folder = folders.hasNext()
      ? folders.next()
      : DriveApp.createFolder(folderName);

    // 2. Generar ID único si no tiene
    const rubricId =
      rubricData.id ||
      `rubric_${Date.now()}_${Utilities.getUuid().substring(0, 8)}`;

    // 3. Agregar metadatos
    const rubricWithMeta = {
      ...rubricData,
      id: rubricId,
      version: rubricData.version || 1,
      created: rubricData.created || new Date().toISOString(),
      modified: new Date().toISOString(),
      origin: origin,
      assignedTo: rubricData.assignedTo || [],
    };

    // 4. Guardar como JSON
    const fileName = `${rubricId}.json`;
    const jsonContent = JSON.stringify(rubricWithMeta, null, 2);

    // Verificar si ya existe y sobrescribir
    const existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      const existingFile = existingFiles.next();
      existingFile.setContent(jsonContent);
      Logger.log(`Rúbrica actualizada: ${rubricId}`);
    } else {
      folder.createFile(fileName, jsonContent, MimeType.PLAIN_TEXT);
      Logger.log(`Rúbrica creada: ${rubricId}`);
    }

    return JSON.stringify({
      success: true,
      id: rubricId,
      name: rubricWithMeta.name,
    });
  } catch (e) {
    Logger.log(`Error al guardar rúbrica: ${e.message}`);
    return JSON.stringify({
      error: `Error al guardar la rúbrica: ${e.message}`,
    });
  }
}

/**
 * Lista todas las rúbricas guardadas en Drive.
 * @returns {string} JSON array de rúbricas con metadatos.
 */
function listSavedRubrics() {
  try {
    const folderName = "Rúbricas - Repositorio";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify([]);
    }

    const folder = folders.next();
    const files = folder.getFilesByType(MimeType.PLAIN_TEXT);
    const rubrics = [];

    while (files.hasNext()) {
      const file = files.next();
      try {
        const content = file.getBlob().getDataAsString();
        const rubric = JSON.parse(content);

        // Solo retornar metadatos, no toda la rúbrica
        rubrics.push({
          id: rubric.id,
          name: rubric.name,
          description: rubric.description,
          created: rubric.created,
          modified: rubric.modified,
          origin: rubric.origin,
          version: rubric.version,
          assignedTo: rubric.assignedTo || [],
          criteriaCount: rubric.criteria ? rubric.criteria.length : 0,
          levelsCount: rubric.levels ? rubric.levels.length : 0,
        });
      } catch (parseError) {
        Logger.log(`Error parseando ${file.getName()}: ${parseError.message}`);
      }
    }

    // Ordenar por fecha de modificación (más reciente primero)
    rubrics.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    return JSON.stringify(rubrics);
  } catch (e) {
    Logger.log(`Error al listar rúbricas: ${e.message}`);
    return JSON.stringify({ error: `Error al listar rúbricas: ${e.message}` });
  }
}

/**
 * Carga una rúbrica específica por su ID.
 * @param {string} rubricId El ID de la rúbrica.
 * @returns {string} JSON de la rúbrica completa o error.
 */
function loadRubricById(rubricId) {
  try {
    const folderName = "Rúbricas - Repositorio";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify({
        error: "No se encontró la carpeta de rúbricas.",
      });
    }

    const folder = folders.next();
    const fileName = `${rubricId}.json`;
    const files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      return JSON.stringify({ error: `Rúbrica no encontrada: ${rubricId}` });
    }

    const file = files.next();
    const content = file.getBlob().getDataAsString();
    const rubric = JSON.parse(content);

    Logger.log(`Rúbrica cargada: ${rubricId}`);
    return JSON.stringify(rubric);
  } catch (e) {
    Logger.log(`Error al cargar rúbrica ${rubricId}: ${e.message}`);
    return JSON.stringify({
      error: `Error al cargar la rúbrica: ${e.message}`,
    });
  }
}

/**
 * Elimina una rúbrica (la mueve a la papelera).
 * @param {string} rubricId El ID de la rúbrica.
 * @returns {string} JSON con resultado.
 */
function deleteRubricById(rubricId) {
  try {
    const folderName = "Rúbricas - Repositorio";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify({
        error: "No se encontró la carpeta de rúbricas.",
      });
    }

    const folder = folders.next();
    const fileName = `${rubricId}.json`;
    const files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      return JSON.stringify({ error: `Rúbrica no encontrada: ${rubricId}` });
    }

    const file = files.next();
    file.setTrashed(true);

    Logger.log(`Rúbrica eliminada: ${rubricId}`);
    return JSON.stringify({
      success: true,
      message: "Rúbrica eliminada correctamente.",
    });
  } catch (e) {
    Logger.log(`Error al eliminar rúbrica ${rubricId}: ${e.message}`);
    return JSON.stringify({
      error: `Error al eliminar la rúbrica: ${e.message}`,
    });
  }
}

// ====================================================================
// FASE 2: ASIGNACIÓN DE RÚBRICAS A CURSOS
// ====================================================================

/**
 * Actualiza las asignaciones de una rúbrica a cursos/evaluaciones.
 * @param {string} rubricId El ID de la rúbrica.
 * @param {Array} assignedTo Array de {courseId, evaluationId}.
 * @returns {string} JSON con resultado.
 */
function updateRubricAssignments(rubricId, assignedTo) {
  try {
    // Cargar rúbrica actual
    const rubricJson = loadRubricById(rubricId);
    const rubricData = JSON.parse(rubricJson);

    if (rubricData.error) {
      return rubricJson; // Retornar error
    }

    // Actualizar asignaciones
    rubricData.assignedTo = assignedTo;
    rubricData.modified = new Date().toISOString();

    // Guardar
    return saveRubricToDrive(rubricData, rubricData.origin);
  } catch (e) {
    Logger.log(`Error al actualizar asignaciones: ${e.message}`);
    return JSON.stringify({
      error: `Error al actualizar asignaciones: ${e.message}`,
    });
  }
}

// ====================================================================
// FASE 3: DUPLICACIÓN DE RÚBRICAS
// ====================================================================

/**
 * Duplica una rúbrica existente con un nuevo nombre.
 * @param {string} rubricId El ID de la rúbrica original.
 * @param {string} newName El nombre para la copia.
 * @returns {string} JSON con {success: true, id: string} o {error: string}.
 */
function duplicateRubric(rubricId, newName) {
  try {
    // Cargar rúbrica original
    const originalJson = loadRubricById(rubricId);
    const original = JSON.parse(originalJson);

    if (original.error) {
      return originalJson; // Retornar el error
    }

    // Crear copia con nuevo ID y nombre
    const duplicate = {
      ...original,
      id: null, // Se generará nuevo ID en saveRubricToDrive
      name: newName || `${original.name} (Copia)`,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      version: 1,
      assignedTo: [], // Limpiar asignaciones
    };

    // Guardar la copia
    const result = saveRubricToDrive(duplicate, "manual");
    const parsedResult = JSON.parse(result);

    if (parsedResult.success) {
      Logger.log(`Rúbrica duplicada: ${rubricId} -> ${parsedResult.id}`);
      return JSON.stringify({
        success: true,
        id: parsedResult.id,
        name: newName,
        message: `Rúbrica duplicada exitosamente como "${newName}".`,
      });
    } else {
      return result;
    }
  } catch (e) {
    Logger.log(`Error al duplicar rúbrica ${rubricId}: ${e.message}`);
    return JSON.stringify({
      error: `Error al duplicar la rúbrica: ${e.message}`,
    });
  }
}
