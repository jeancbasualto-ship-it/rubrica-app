/**
 * @fileoverview Archivo principal que actúa como controlador.
 * Maneja las solicitudes del cliente, el procesamiento de archivos y la delegación a los servicios de IA y Documentos.
 * @version 2.2.0 - Robust doGet with try-catch and debug
 */
// ====================================================================
// CONFIGURACIÓN GLOBAL
// ====================================================================
// API Key se obtiene de las Propiedades del Script (Configuración del proyecto)
// Para configurar: Editor > Configuración del proyecto > Propiedades del script
// Agregar: GEMINI_API_KEY = tu_clave_aquí
const GEMINI_API_KEY =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-2.5-flash";

// Define la estructura JSON esperada para la rúbrica (Schema para Gemini)
// Formato OpenAPI Schema compatible con la API REST v1beta
const RUBRIC_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description:
        "Título conciso de la rúbrica, ej: 'Rúbrica para Ensayo de Historia'",
    },
    description: {
      type: "string",
      description: "Descripción breve del propósito o tarea de la rúbrica.",
    },
    levels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          points: { type: "integer" },
        },
        required: ["id", "name", "points"],
      },
    },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          max_points: { type: "integer" },
          level_descriptions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                level_id: { type: "integer" },
                description: { type: "string" },
              },
              required: ["level_id", "description"],
            },
          },
        },
        required: ["name", "max_points", "level_descriptions"],
      },
    },
  },
  required: ["name", "description", "levels", "criteria"],
};

// ====================================================================
// FUNCIONES PÚBLICAS (LLAMADAS DESDE EL FRONTEND)
// ====================================================================

/**
 * Sirve la página principal de la aplicación.
 */
function doGet() {
  try {
    Logger.log("doGet initiated");
    var template = HtmlService.createTemplateFromFile("frontend/index");
    var output = template.evaluate();
    // Setting iframe options to allow embedding if needed
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    output.addMetaTag("viewport", "width=device-width, initial-scale=1");
    return output;
  } catch (e) {
    Logger.log("Error in doGet: " + e.toString());
    return HtmlService.createHtmlOutput(
      "<h3>Error en el servidor</h3><p>" +
        e.toString() +
        "</p><pre>" +
        e.stack +
        "</pre>",
    );
  }
}

/**
 * Función include para cargar archivos HTML parciales
 * Usa createHtmlOutputFromFile para inyectar contenido en el template
 * @param {string} filename - Ruta del archivo a incluir (sin extensión)
 * @returns {string} Contenido HTML del archivo
 */
function include(filename) {
  // Normalizar slashes y espacios
  var cleanName = filename.replace(/\\/g, "/").trim();

  // Quitar prefijos src/ o /src/ si existen
  if (cleanName.indexOf("src/") === 0) {
    cleanName = cleanName.substring(4);
  } else if (cleanName.indexOf("/src/") === 0) {
    cleanName = cleanName.substring(5);
  }

  // Quitar slash inicial si quedó
  if (cleanName.indexOf("/") === 0) {
    cleanName = cleanName.substring(1);
  }

  try {
    var content = HtmlService.createHtmlOutputFromFile(cleanName).getContent();
    // Logger.log('[INCLUDE] ✅ Cargado: ' + cleanName);
    return content;
  } catch (e) {
    Logger.log("[INCLUDE] ❌ Error: " + cleanName + " - " + e.message);

    // Fallback: intentar con nombre aplanado (slashes → underscores)
    try {
      var flatName = cleanName.replace(/\//g, "_");
      var fallbackContent =
        HtmlService.createHtmlOutputFromFile(flatName).getContent();
      Logger.log("[INCLUDE] ✅ Fallback exitoso: " + flatName);
      return fallbackContent;
    } catch (e2) {
      Logger.log(
        "[INCLUDE] ❌ Fallback falló: " + flatName + " - " + e2.message,
      );

      // Último intento: agregar extensión .html
      try {
        var withExtension = cleanName + ".html";
        var extContent =
          HtmlService.createHtmlOutputFromFile(withExtension).getContent();
        // Logger.log('[INCLUDE] ✅ Con extensión exitoso: ' + withExtension);
        return extContent;
      } catch (e3) {
        // Si todo falla, retornar comentario de error
        var errorMsg =
          "<!-- Error crítico incluyendo: " +
          filename +
          " (intentado: " +
          cleanName +
          ", " +
          flatName +
          ", " +
          withExtension +
          ") -->";
        return errorMsg;
      }
    }
  }
}

/**
 * Procesa la carga de un archivo, lo convierte a texto y llama al servicio de IA para su análisis.
 * @param {Object} fileObject Objeto con {data: Array<number>, name: string, mimeType: string}.
 * @returns {string} El JSON de la rúbrica o un JSON de error.
 */
function uploadAndAnalyzeRubricContent(fileObject) {
  let fileContent = "";
  try {
    fileContent = extractTextFromFile(fileObject);
    if (fileContent.startsWith("Error:")) {
      return JSON.stringify({ error: fileContent });
    }
  } catch (e) {
    return JSON.stringify({
      error: `Error al procesar el archivo ${fileObject.name}: ${e.message}`,
    });
  }

  if (!fileContent.trim()) {
    return JSON.stringify({
      error: "No se pudo extraer texto significativo del archivo.",
    });
  }

  // Delega el análisis al servicio de IA
  return analyzeRubricContent(
    fileContent,
    fileObject.name,
    fileObject.mimeType,
  );
}

/**
 * Exporta la rúbrica a Google Sheets.
 * @param {Object} rubricData La rúbrica en formato JSON.
 * @param {string} filename Nombre del archivo.
 * @returns {string} Mensaje de éxito o error.
 */
function exportRubric(rubricData, filename) {
  try {
    const ss = SpreadsheetApp.create("Rúbrica - " + filename);
    const sheet = ss.getActiveSheet();

    const headers = ["Criterio"];
    rubricData.levels.forEach((level) =>
      headers.push(`${level.name} (${level.points} pts)`),
    );
    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setBackground("#4f46e5")
      .setFontColor("white");

    const data = rubricData.criteria.map(function (criterion) {
      const row = [criterion.name];
      rubricData.levels.forEach(function (level) {
        var found = null;
        if (
          criterion.level_descriptions &&
          Array.isArray(criterion.level_descriptions)
        ) {
          for (var i = 0; i < criterion.level_descriptions.length; i++) {
            if (criterion.level_descriptions[i].level_id === level.id) {
              found = criterion.level_descriptions[i];
              break;
            }
          }
        }
        var desc = found && found.description ? found.description : "N/A";
        row.push(desc);
      });
      return row;
    });

    sheet
      .getRange(2, 1, data.length, data[0].length)
      .setValues(data)
      .setVerticalAlignment("top")
      .setWrap(true);

    sheet.autoResizeColumns(1, headers.length);

    const folderName = "Rúbricas Generadas";
    let folder = DriveApp.getFoldersByName(folderName);
    folder = folder.hasNext()
      ? folder.next()
      : DriveApp.createFolder(folderName);

    DriveApp.getFileById(ss.getId()).moveTo(folder);

    return `Éxito: Rúbrica exportada a Google Sheets. Archivo: '${ss.getName()}' en la carpeta '${folderName}'.`;
  } catch (e) {
    Logger.log("Error de exportación a Sheets: " + e.message);
    return "Error: No se pudo exportar la rúbrica. " + e.message;
  }
}

// ====================================================================
// NOTA: Las funciones de gestión de rúbricas (guardar, cargar, listar)
// están ahora en RubricManager.gs para modularidad.
// ====================================================================

// ====================================================================
// FUNCIONES PRIVADAS (LÓGICA INTERNA)
// ====================================================================

function extractTextFromFile(fileObject) {
  const { data, name, mimeType } = fileObject;

  Logger.log(
    `extractTextFromFile llamado para: ${name}, tipo: ${mimeType}, tamaño de data: ${
      data ? data.length : "null"
    }`,
  );

  // Validar y normalizar el array de bytes
  if (!data || !Array.isArray(data)) {
    Logger.log(`Error: data no es un array válido. Tipo: ${typeof data}`);
    return `Error: Los datos del archivo no son válidos.`;
  }

  // Asegurar que todos los valores sean bytes válidos (0-255)
  const validByteArray = data.map((byte) => {
    const num = Number(byte);
    return isNaN(num) ? 0 : Math.max(0, Math.min(255, Math.floor(num)));
  });

  Logger.log(
    `Array normalizado con ${
      validByteArray.length
    } bytes. Primeros 5: [${validByteArray.slice(0, 5).join(", ")}]`,
  );

  // Crear el blob desde el array de bytes validado
  let fileBlob;
  try {
    fileBlob = Utilities.newBlob(validByteArray, mimeType, name);
    Logger.log(`Blob creado exitosamente: ${fileBlob.getBytes().length} bytes`);
  } catch (e) {
    Logger.log(`Error al crear blob: ${e.message}`);
    Logger.log(`Stack trace: ${e.stack}`);
    return `Error: No se pudo procesar el archivo. ${e.message}`;
  }

  let tempFileId = null;

  try {
    if (mimeType.startsWith("text/")) {
      Logger.log("Archivo de texto detectado, extrayendo contenido...");
      return fileBlob.getDataAsString();
    }

    const resource = {
      name: `TEMP_CONVERT_${name}`,
      mimeType: mimeType,
    };
    let convertedMimeType;

    if (mimeType.includes("pdf") || mimeType.includes("word")) {
      convertedMimeType = MimeType.GOOGLE_DOCS;
    } else if (mimeType.includes("sheet")) {
      convertedMimeType = MimeType.GOOGLE_SHEETS;
    } else {
      return `Error: Tipo de archivo no soportado para conversión (${mimeType}).`;
    }

    // Crear archivo temporal en Drive CON CONVERSIÓN AUTOMÁTICA
    Logger.log(`Creando archivo temporal en Drive: ${resource.name}`);
    Logger.log(
      `MimeType original: ${mimeType}, Convertir a: ${convertedMimeType}`,
    );

    // IMPORTANTE: Drive API v3 requiere parámetros opcionales como tercer argumento
    // con supportsAllDrives si es necesario, pero convert no está disponible en v3
    // Solución: Usar DriveApp nativo que maneja conversión automáticamente
    let tempFile;
    try {
      // Crear archivo usando DriveApp que convierte automáticamente
      const driveFile = DriveApp.createFile(fileBlob);
      tempFileId = driveFile.getId();

      // Copiar y convertir el archivo usando Drive API
      const copyResource = {
        name: resource.name,
        mimeType: convertedMimeType, // Especificar el tipo de destino
      };

      // Copiar el archivo y convertirlo al tipo deseado
      tempFile = Drive.Files.copy(copyResource, tempFileId);

      // Eliminar el archivo original
      DriveApp.getFileById(tempFileId).setTrashed(true);

      // Actualizar tempFileId con el archivo convertido
      tempFileId = tempFile.id;

      Logger.log(`Archivo convertido exitosamente con ID: ${tempFileId}`);
    } catch (conversionError) {
      Logger.log(`Error en conversión: ${conversionError.message}`);
      throw conversionError;
    }

    // Convertir y extraer texto usando la API de Drive
    if (convertedMimeType === MimeType.GOOGLE_DOCS) {
      Logger.log("Convirtiendo documento a texto usando Drive API...");

      // Usar Drive API para exportar directamente a texto plano
      // Esto evita el error de "No se puede acceder al documento"
      const exportUrl = `https://www.googleapis.com/drive/v2/files/${tempFileId}/export?mimeType=text/plain`;
      const response = UrlFetchApp.fetch(exportUrl, {
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        },
        muteHttpExceptions: true,
      });

      if (response.getResponseCode() === 200) {
        const textContent = response.getContentText();
        Logger.log(
          `Texto extraído exitosamente: ${textContent.length} caracteres`,
        );
        return textContent;
      } else {
        Logger.log(
          `Error en exportación: ${response.getResponseCode()} - ${response.getContentText()}`,
        );
        return `Error: No se pudo exportar el documento. Código: ${response.getResponseCode()}`;
      }
    } else if (convertedMimeType === MimeType.GOOGLE_SHEETS) {
      Logger.log("Convirtiendo hoja de cálculo a texto usando Drive API...");

      // Para hojas de cálculo, exportar como CSV y luego procesar
      const exportUrl = `https://www.googleapis.com/drive/v2/files/${tempFileId}/export?mimeType=text/csv`;
      const response = UrlFetchApp.fetch(exportUrl, {
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        },
        muteHttpExceptions: true,
      });

      if (response.getResponseCode() === 200) {
        const csvContent = response.getContentText();
        Logger.log(
          `CSV extraído exitosamente: ${csvContent.length} caracteres`,
        );
        return csvContent;
      } else {
        Logger.log(
          `Error en exportación: ${response.getResponseCode()} - ${response.getContentText()}`,
        );
        return `Error: No se pudo exportar la hoja de cálculo. Código: ${response.getResponseCode()}`;
      }
    }
    return "Error: Lógica de conversión no encontrada.";
  } catch (e) {
    Logger.log(`Error en extractTextFromFile: ${e.message}`);
    return `Error al procesar el archivo: ${e.message}. Asegúrate de que la Drive API v3 está habilitada.`;
  } finally {
    // Limpiar archivo temporal
    if (tempFileId) {
      try {
        Drive.Files.remove(tempFileId);
      } catch (cleanupError) {
        Logger.log(
          `Fallo al eliminar archivo temporal ${tempFileId}: ${cleanupError.message}`,
        );
      }
    }
  }
}
