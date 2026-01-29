/**
 * @fileoverview Tests para verificar que las funciones refactorizadas funcionan correctamente.
 * Ejecutar estas funciones desde el editor de Apps Script para validar los cambios.
 */

/**
 * Test 1: Verificar que el wrapper generateRubric funciona
 */
function testGenerateRubricWrapper() {
  Logger.log("=== Test: generateRubric wrapper ===");

  const testPrompt = "Rúbrica de prueba para ensayo de historia";
  const result = generateRubric(testPrompt);

  Logger.log("Resultado:");
  Logger.log(result);

  try {
    const parsed = JSON.parse(result);
    if (parsed.error) {
      Logger.log("❌ ERROR: " + parsed.error);
    } else {
      Logger.log("✅ SUCCESS: La función wrapper funciona correctamente");
      Logger.log("Nombre de rúbrica: " + parsed.name);
    }
  } catch (e) {
    Logger.log("❌ ERROR al parsear: " + e.message);
  }
}

/**
 * Test 2: Verificar que getDriveAccessToken funciona
 */
function testGetDriveAccessToken() {
  Logger.log("=== Test: getDriveAccessToken wrapper ===");

  const token = getDriveAccessToken();

  if (token && token.length > 0) {
    Logger.log("✅ SUCCESS: Token obtenido correctamente");
    Logger.log(
      "Token (primeros 20 caracteres): " + token.substring(0, 20) + "..."
    );
  } else {
    Logger.log("❌ ERROR: No se pudo obtener el token");
  }
}

/**
 * Test 3: Verificar que createDocWithFeedback tiene las dependencias correctas
 */
function testDocWithFeedbackDependencies() {
  Logger.log("=== Test: Verificar dependencias de createDocWithFeedback ===");

  // Verificar que generatePersonalizedFeedback existe
  if (typeof generatePersonalizedFeedback === "function") {
    Logger.log("✅ generatePersonalizedFeedback está definida");
  } else {
    Logger.log("❌ ERROR: generatePersonalizedFeedback NO está definida");
  }

  // Verificar que createDocWithFeedback existe
  if (typeof createDocWithFeedback === "function") {
    Logger.log("✅ createDocWithFeedback está definida");
  } else {
    Logger.log("❌ ERROR: createDocWithFeedback NO está definida");
  }

  // Verificar que generateRubricAI existe
  if (typeof generateRubricAI === "function") {
    Logger.log("✅ generateRubricAI está definida");
  } else {
    Logger.log("❌ ERROR: generateRubricAI NO está definida");
  }
}

/**
 * Test 4: Ejecutar todos los tests
 */
function runAllRefactoringTests() {
  Logger.log("\n");
  Logger.log("╔════════════════════════════════════════════════════════╗");
  Logger.log("║     TESTS DE VERIFICACIÓN DE REFACTORING             ║");
  Logger.log("╚════════════════════════════════════════════════════════╝");
  Logger.log("\n");

  testGetDriveAccessToken();
  Logger.log("\n");

  testDocWithFeedbackDependencies();
  Logger.log("\n");

  // testGenerateRubricWrapper(); // Comentado porque requiere API key
  Logger.log(
    "Test de generateRubric wrapper comentado (requiere API key configurada)"
  );
  Logger.log("\n");

  Logger.log("╔════════════════════════════════════════════════════════╗");
  Logger.log("║                 TESTS COMPLETADOS                     ║");
  Logger.log("╚════════════════════════════════════════════════════════╝");
}

// Nota: prueba manual para guardar un curso
Logger.log && Logger.log; // línea inofensiva para mantener formato

/**
 * Test 5: Verificar que saveCourseToSheet crea carpeta/archivo y devuelve ID
 * Ejecutar manualmente desde el editor de Apps Script. Requiere permisos de escritura en Drive.
 */
function testSaveCourseToSheet() {
  Logger.log("=== Test: saveCourseToSheet ===");

  const course = {
    name: "Curso Prueba Test",
    students: [
      { id: "s1", name: "Alumno Uno" },
      { id: "s2", name: "Alumno Dos" }
    ],
    rubrics: {},
    grades: {}
  };

  try {
    const response = saveCourseToSheet(course);
    Logger.log("Respuesta cruda: " + response);

    try {
      const parsed = JSON.parse(response);
      if (parsed.error) {
        Logger.log("❌ Error al guardar curso: " + parsed.error);
      } else {
        Logger.log("✅ Curso guardado. ID: " + parsed.id + " URL: " + parsed.url);
      }
    } catch (e) {
      Logger.log("⚠️ No se pudo parsear la respuesta JSON: " + e.message);
    }
  } catch (e) {
    Logger.log("❌ Excepción al ejecutar saveCourseToSheet: " + e.message);
  }
}
