/**
 * @fileoverview Editor de rúbricas con versionado.
 * FASE 3: Edición de criterios, niveles y metadatos.
 */

// ====================================================================
// FASE 3: EDICIÓN DE RÚBRICAS
// ====================================================================

/**
 * Guarda una versión editada de una rúbrica.
 * Incrementa el número de versión automáticamente.
 * @param {Object} rubricData La rúbrica editada.
 * @returns {string} JSON con resultado.
 */
function saveEditedRubric(rubricData) {
  try {
    // Cargar versión actual para obtener historial
    const currentRubricJson = loadRubricById(rubricData.id);
    const currentRubric = JSON.parse(currentRubricJson);

    let newVersion = 1;
    if (!currentRubric.error) {
      newVersion = (currentRubric.version || 1) + 1;
    }

    // Preparar nueva versión
    const editedRubric = {
      ...rubricData,
      version: newVersion,
      modified: new Date().toISOString(),
      origin: currentRubric.origin || "manual",
    };

    // Guardar nueva versión
    const result = saveRubricToDrive(editedRubric, editedRubric.origin);

    Logger.log(`Rúbrica editada, nueva versión: v${newVersion}`);
    return result;
  } catch (e) {
    Logger.log(`Error al guardar rúbrica editada: ${e.message}`);
    return JSON.stringify({ error: `Error al guardar cambios: ${e.message}` });
  }
}

/**
 * Valida la estructura de una rúbrica antes de guardar.
 * @param {Object} rubricData La rúbrica a validar.
 * @returns {Object} {valid: boolean, errors: Array<string>}.
 */
function validateRubricStructure(rubricData) {
  const errors = [];

  // Validar nombre
  if (!rubricData.name || rubricData.name.trim() === "") {
    errors.push("El nombre de la rúbrica es obligatorio.");
  }

  // Validar niveles
  if (!rubricData.levels || rubricData.levels.length === 0) {
    errors.push("La rúbrica debe tener al menos un nivel de desempeño.");
  } else {
    rubricData.levels.forEach((level, index) => {
      if (!level.name || level.name.trim() === "") {
        errors.push(`El nivel ${index + 1} debe tener un nombre.`);
      }
      if (level.points === undefined || level.points < 0) {
        errors.push(`El nivel ${index + 1} debe tener un puntaje válido (≥0).`);
      }
      if (level.id === undefined) {
        errors.push(`El nivel ${index + 1} debe tener un ID único.`);
      }
    });

    // Verificar IDs únicos de niveles
    const levelIds = rubricData.levels.map((l) => l.id);
    const uniqueLevelIds = new Set(levelIds);
    if (levelIds.length !== uniqueLevelIds.size) {
      errors.push("Los niveles deben tener IDs únicos.");
    }
  }

  // Validar criterios
  if (!rubricData.criteria || rubricData.criteria.length === 0) {
    errors.push("La rúbrica debe tener al menos un criterio de evaluación.");
  } else {
    rubricData.criteria.forEach((criterion, index) => {
      if (!criterion.name || criterion.name.trim() === "") {
        errors.push(`El criterio ${index + 1} debe tener un nombre.`);
      }
      if (criterion.max_points === undefined || criterion.max_points <= 0) {
        errors.push(
          `El criterio ${index + 1} debe tener un puntaje máximo válido (>0).`
        );
      }

      // Validar descripciones de niveles
      if (
        !criterion.level_descriptions ||
        criterion.level_descriptions.length === 0
      ) {
        errors.push(
          `El criterio ${index + 1} debe tener descripciones para cada nivel.`
        );
      } else {
        const levelIds = rubricData.levels.map((l) => l.id);
        const descriptionLevelIds = criterion.level_descriptions.map(
          (d) => d.level_id
        );

        levelIds.forEach((levelId) => {
          if (!descriptionLevelIds.includes(levelId)) {
            errors.push(
              `El criterio "${criterion.name}" le falta descripción para el nivel ID ${levelId}.`
            );
          }
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Crea una nueva rúbrica desde cero con valores por defecto.
 * @param {string} name Nombre de la rúbrica.
 * @param {string} description Descripción.
 * @returns {string} JSON de la rúbrica creada.
 */
function createBlankRubric(name, description) {
  const blankRubric = {
    name: name || "Nueva Rúbrica",
    description: description || "Descripción de la rúbrica",
    levels: [
      { id: 1, name: "Excelente", points: 10 },
      { id: 2, name: "Bueno", points: 7 },
      { id: 3, name: "Suficiente", points: 4 },
      { id: 4, name: "Insuficiente", points: 1 },
    ],
    criteria: [
      {
        name: "Criterio 1",
        max_points: 10,
        level_descriptions: [
          { level_id: 1, description: "Desempeño sobresaliente" },
          { level_id: 2, description: "Desempeño bueno" },
          { level_id: 3, description: "Desempeño suficiente" },
          { level_id: 4, description: "Desempeño insuficiente" },
        ],
      },
    ],
  };

  return saveRubricToDrive(blankRubric, "manual");
}

/**
 * Duplica una rúbrica existente para crear una copia editable.
 * @param {string} rubricId ID de la rúbrica a duplicar.
 * @param {string} newName Nombre para la copia.
 * @returns {string} JSON con resultado.
 */
function duplicateRubric(rubricId, newName) {
  try {
    const rubricJson = loadRubricById(rubricId);
    const rubric = JSON.parse(rubricJson);

    if (rubric.error) {
      return rubricJson;
    }

    // Crear copia con nuevo nombre y sin ID (se generará uno nuevo)
    const duplicate = {
      ...rubric,
      id: undefined, // Forzar generación de nuevo ID
      name: newName || `${rubric.name} (Copia)`,
      version: 1,
      created: undefined, // Se generará nuevo timestamp
      assignedTo: [], // Nueva copia no tiene asignaciones
    };

    return saveRubricToDrive(duplicate, "manual");
  } catch (e) {
    Logger.log(`Error al duplicar rúbrica: ${e.message}`);
    return JSON.stringify({ error: `Error al duplicar rúbrica: ${e.message}` });
  }
}
