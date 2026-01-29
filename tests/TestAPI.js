/**
 * Script de prueba para verificar la configuración de la API de Gemini
 * Para ejecutar: Abre el editor de Apps Script y ejecuta la función testGeminiAPI()
 */

/**
 * Función de prueba simple para verificar la conexión con la API de Gemini
 */
function testGeminiAPI() {
  Logger.log("=== INICIANDO PRUEBA DE API DE GEMINI ===");

  // Verificar que la API key esté configurada
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
    Logger.log("❌ ERROR: La GEMINI_API_KEY no está configurada");
    Logger.log("Por favor, edita Code.gs y añade tu API key en la línea 9");
    return;
  }

  Logger.log(
    "✓ API Key detectada (primeros 8 caracteres): " +
      GEMINI_API_KEY.substring(0, 8) +
      "..."
  );
  Logger.log("✓ Modelo: " + GEMINI_MODEL);

  // Prueba 1: Llamada simple sin JSON estructurado
  Logger.log("\n--- PRUEBA 1: Generación de texto simple ---");
  try {
    const simplePrompt = "Di 'Hola mundo' en español.";
    const result1 = callGeminiAPI(
      "Eres un asistente útil.",
      simplePrompt,
      false
    );

    if (result1.startsWith("{") && result1.includes("error")) {
      Logger.log("❌ Error en prueba 1:");
      Logger.log(result1);
    } else {
      Logger.log("✓ Prueba 1 exitosa. Respuesta:");
      Logger.log(result1);
    }
  } catch (e) {
    Logger.log("❌ Excepción en prueba 1: " + e.message);
  }

  // Prueba 2: Llamada con JSON estructurado (rúbrica)
  Logger.log("--- PRUEBA 2: Generación de JSON estructurado ---");
  try {
    const jsonPrompt =
      "Crea una rúbrica simple para evaluar una presentación oral con 2 criterios y 3 niveles.";
    const result2 = callGeminiAPI(
      "Eres un experto en diseño curricular. Genera rúbricas detalladas.",
      jsonPrompt,
      true
    );

    if (result2.startsWith("{") && result2.includes("error")) {
      Logger.log("❌ Error en prueba 2:");
      Logger.log(result2);
    } else {
      Logger.log("✓ Prueba 2 exitosa. JSON generado:");
      try {
        const parsed = JSON.parse(result2);
        Logger.log("  - Nombre: " + parsed.name);
        Logger.log(
          "  - Criterios: " + (parsed.criteria ? parsed.criteria.length : 0)
        );
        Logger.log(
          "  - Niveles: " + (parsed.levels ? parsed.levels.length : 0)
        );
      } catch (parseError) {
        Logger.log("⚠️ Respuesta recibida pero no es JSON válido:");
        Logger.log(result2.substring(0, 200) + "...");
      }
    }
  } catch (e) {
    Logger.log("❌ Excepción en prueba 2: " + e.message);
  }

  Logger.log("\n=== PRUEBA COMPLETADA ===");
  Logger.log("Revisa los logs arriba para ver los resultados.");
}

/**
 * Función para probar solo la estructura del schema
 */
function testSchemaStructure() {
  Logger.log("=== VERIFICANDO ESTRUCTURA DEL SCHEMA ===");
  Logger.log(JSON.stringify(RUBRIC_SCHEMA, null, 2));
  Logger.log("\n✓ El schema está definido correctamente");
  Logger.log("✓ Tipo: " + RUBRIC_SCHEMA.type);
  Logger.log(
    "✓ Propiedades principales: " +
      Object.keys(RUBRIC_SCHEMA.properties).join(", ")
  );
}

/**
 * Función para hacer una llamada de prueba a la API con logging detallado
 */
function testAPICallWithDetailedLogging() {
  Logger.log("=== PRUEBA CON LOGGING DETALLADO ===");

  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
    Logger.log("❌ ERROR: La GEMINI_API_KEY no está configurada");
    return;
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  Logger.log("URL: " + apiUrl.replace(GEMINI_API_KEY, "***KEY_HIDDEN***"));

  const payload = {
    contents: [{ parts: [{ text: "Di hola" }] }],
    systemInstruction: { parts: [{ text: "Eres un asistente amigable" }] },
  };

  Logger.log("\nPayload enviado:");
  Logger.log(JSON.stringify(payload, null, 2));

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log("\nCódigo de respuesta: " + responseCode);
    Logger.log("Respuesta completa:");
    Logger.log(responseText);

    if (responseCode === 200) {
      const jsonResponse = JSON.parse(responseText);
      Logger.log("\n✓ Llamada exitosa!");
      Logger.log(
        "Texto generado: " + jsonResponse.candidates[0].content.parts[0].text
      );
    } else {
      Logger.log("\n❌ Error en la llamada");
    }
  } catch (e) {
    Logger.log("\n❌ Excepción: " + e.message);
    Logger.log("Stack: " + e.stack);
  }
}
