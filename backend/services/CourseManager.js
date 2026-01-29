/**
 * @fileoverview Gestión de cursos con persistencia en Google Sheets.
 * Guarda y carga cursos desde la carpeta "rubricas-cursos" en Drive.
 */

/**
 * Guarda un curso en Google Sheets
 * @param {Object} course Objeto del curso con {name, students, rubrics, grades}
 * @returns {string} JSON con {success: true, id: string} o {error: string}
 */
function saveCourseToSheet(course) {
  try {
    const folderName = "rubricas-cursos";

    // 1. Buscar o crear carpeta
    let folders = DriveApp.getFoldersByName(folderName);
    let folder = folders.hasNext()
      ? folders.next()
      : DriveApp.createFolder(folderName);

    // 2. Crear o actualizar archivo
    const fileName = `Curso_${course.name.replace(/[^a-z0-9]/gi, "_")}`;
    let ss;

    // Buscar si ya existe
    const existingFiles = folder.getFilesByName(fileName);
    if (existingFiles.hasNext()) {
      const fileId = existingFiles.next().getId();
      ss = SpreadsheetApp.openById(fileId);
    } else {
      ss = SpreadsheetApp.create(fileName);
      DriveApp.getFileById(ss.getId()).moveTo(folder);
    }

    // 3. Hoja 1: Información del curso
    let infoSheet =
      ss.getSheetByName("Información") || ss.insertSheet("Información");
    infoSheet.clear();
    infoSheet.getRange("A1:B5").setValues([
      ["Nombre del Curso", course.name],
      ["ID del Curso", course.id || `course_${Date.now()}`],
      ["Fecha de Creación", new Date().toLocaleDateString()],
      ["Total Estudiantes", course.students.length],
      ["Rúbricas Asignadas", Object.keys(course.rubrics || {}).length],
    ]);

    // 4. Hoja 2: Estudiantes
    let studentsSheet =
      ss.getSheetByName("Estudiantes") || ss.insertSheet("Estudiantes");
    studentsSheet.clear();
    studentsSheet
      .getRange("A1:B1")
      .setValues([["ID", "Nombre"]])
      .setFontWeight("bold");

    if (course.students && course.students.length > 0) {
      const studentData = course.students.map((s) => [s.id, s.name]);
      studentsSheet
        .getRange(2, 1, studentData.length, 2)
        .setValues(studentData);
    }

    // 5. Hoja 3: Evaluaciones
    let evalSheet =
      ss.getSheetByName("Evaluaciones") || ss.insertSheet("Evaluaciones");
    evalSheet.clear();
    evalSheet
      .getRange("A1:C1")
      .setValues([["ID Evaluación", "Nombre Evaluación", "ID Rúbrica"]])
      .setFontWeight("bold");

    if (
      course.evaluations &&
      Array.isArray(course.evaluations) &&
      course.evaluations.length > 0
    ) {
      const evalData = course.evaluations.map((ev) => [
        ev.id,
        ev.name,
        course.rubrics && course.rubrics[ev.id] ? course.rubrics[ev.id] : "",
      ]);
      evalSheet.getRange(2, 1, evalData.length, 3).setValues(evalData);
    } else if (course.rubrics && Object.keys(course.rubrics).length > 0) {
      // Migración legacy: si no hay lista explícita, usar las rubrics keys
      const evalData = Object.entries(course.rubrics).map(
        ([evalId, rubricId]) => [
          evalId,
          convertToReadableName(evalId),
          rubricId,
        ],
      );
      evalSheet.getRange(2, 1, evalData.length, 3).setValues(evalData);
    }

    Logger.log(`Curso guardado: ${course.name}`);

    return JSON.stringify({
      success: true,
      id: ss.getId(),
      name: course.name,
      url: ss.getUrl(),
    });
  } catch (e) {
    Logger.log(`Error al guardar curso: ${e.message}`);
    return JSON.stringify({
      error: `Error al guardar el curso: ${e.message}`,
    });
  }
}

function convertToReadableName(id) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Carga todos los cursos guardados desde Google Sheets
 * @returns {string} JSON array de cursos
 */
function loadCoursesFromSheets() {
  try {
    const folderName = "rubricas-cursos";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify([]);
    }

    const folder = folders.next();
    const files = folder.getFiles();
    const courses = [];

    while (files.hasNext()) {
      const file = files.next();
      try {
        const ss = SpreadsheetApp.openById(file.getId());

        // Leer información del curso
        const infoSheet = ss.getSheetByName("Información");
        if (!infoSheet) continue;

        const courseName = infoSheet.getRange("B1").getValue();
        const courseId = infoSheet.getRange("B2").getValue();

        // Leer estudiantes
        const studentsSheet = ss.getSheetByName("Estudiantes");
        const students = [];

        if (studentsSheet) {
          const lastRow = studentsSheet.getLastRow();
          if (lastRow > 1) {
            const studentData = studentsSheet
              .getRange(2, 1, lastRow - 1, 2)
              .getValues();
            studentData.forEach((row) => {
              if (row[0] && row[1]) {
                students.push({
                  id: row[0].toString(),
                  name: row[1].toString(),
                });
              }
            });
          }
        }

        // Leer evaluaciones
        const rubrics = {};
        const evaluations = [];
        const evalSheet = ss.getSheetByName("Evaluaciones");

        if (evalSheet) {
          try {
            const lastRow = evalSheet.getLastRow();
            if (lastRow > 1) {
              // Check headers to identify format safely
              const headers = evalSheet.getRange(1, 1, 1, 3).getValues()[0];
              const hasNameCol =
                headers[1] &&
                headers[1].toString().toLowerCase().includes("nombre");

              const colsToRead = hasNameCol ? 3 : 2;
              const evalData = evalSheet
                .getRange(2, 1, lastRow - 1, colsToRead)
                .getValues();

              evalData.forEach((row) => {
                const id = row[0] ? row[0].toString() : "";
                if (id) {
                  const name =
                    hasNameCol && row[1]
                      ? row[1].toString()
                      : convertToReadableName(id);
                  // Manejo seguro de índices para rubricId
                  let rubricId = "";
                  if (hasNameCol && row.length > 2)
                    rubricId = row[2] ? row[2].toString() : "";
                  else if (!hasNameCol && row.length > 1)
                    rubricId = row[1] ? row[1].toString() : "";

                  evaluations.push({ id: id, name: name });
                  if (rubricId) rubrics[id] = rubricId;
                }
              });
            }
          } catch (evalErr) {
            Logger.log(
              "Error leyendo evaluaciones de " +
                courseName +
                ": " +
                evalErr.message,
            );
            // Continuar sin evaluaciones si falla esta parte
          }
        }

        courses.push({
          id: courseId,
          name: courseName,
          students: students,
          rubrics: rubrics, // Legacy map support
          evaluations: evaluations, // New explicit list
          grades: {},
        });
      } catch (parseError) {
        Logger.log(
          `Error parseando curso ${file.getName()}: ${parseError.message}`,
        );
      }
    }

    Logger.log(`Cursos cargados: ${courses.length}`);
    return JSON.stringify(courses);
  } catch (e) {
    Logger.log(`Error al cargar cursos: ${e.message}`);
    return JSON.stringify({
      error: `Error al cargar cursos: ${e.message}`,
    });
  }
}

/**
 * Elimina un curso de Google Sheets
 * @param {string} courseName Nombre del curso a eliminar
 * @returns {string} JSON con resultado
 */
function deleteCourseSheet(courseName) {
  try {
    const folderName = "rubricas-cursos";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify({
        error: "No se encontró la carpeta de cursos.",
      });
    }

    const folder = folders.next();
    const fileName = `Curso_${courseName.replace(/[^a-z0-9]/gi, "_")}`;
    const files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      return JSON.stringify({
        error: `Curso no encontrado: ${courseName}`,
      });
    }

    const file = files.next();
    file.setTrashed(true);

    Logger.log(`Curso eliminado: ${courseName}`);
    return JSON.stringify({
      success: true,
      message: "Curso eliminado correctamente.",
    });
  } catch (e) {
    Logger.log(`Error al eliminar curso: ${e.message}`);
    return JSON.stringify({
      error: `Error al eliminar el curso: ${e.message}`,
    });
  }
}

// ====================================================================
// PERSISTENCIA DE CALIFICACIONES
// ====================================================================

/**
 * Guarda la calificación de un estudiante en la hoja del curso.
 * @param {string} courseName Nombre del curso.
 * @param {string} studentId ID del estudiante.
 * @param {string} evaluationId ID de la evaluación.
 * @param {Object} gradingData Objeto con {scores: {criterioIndex: levelId}, finalGrade: string, totalScore: string}.
 * @returns {string} JSON con resultado.
 */
function saveGradeToSheet(courseName, studentId, evaluationId, gradingData) {
  try {
    const folderName = "rubricas-cursos";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify({ error: "Carpeta de cursos no encontrada." });
    }

    const folder = folders.next();
    const fileName = `Curso_${courseName.replace(/[^a-z0-9]/gi, "_")}`;
    const existingFiles = folder.getFilesByName(fileName);

    if (!existingFiles.hasNext()) {
      return JSON.stringify({ error: `Curso no encontrado: ${courseName}` });
    }

    const fileId = existingFiles.next().getId();
    const ss = SpreadsheetApp.openById(fileId);

    // Buscar o crear hoja de calificaciones
    const sheetName = `Calificaciones_${evaluationId}`;
    let gradeSheet = ss.getSheetByName(sheetName);

    if (!gradeSheet) {
      gradeSheet = ss.insertSheet(sheetName);
      gradeSheet
        .getRange("A1:E1")
        .setValues([
          [
            "ID Estudiante",
            "Puntaje Total",
            "Nota Final",
            "Detalle JSON",
            "FeedBack",
          ],
        ])
        .setFontWeight("bold");
    }

    // Buscar si ya existe calificación para este estudiante
    const lastRow = gradeSheet.getLastRow();
    let rowIndex = -1;

    if (lastRow > 1) {
      const studentIds = gradeSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < studentIds.length; i++) {
        if (studentIds[i][0] === studentId) {
          rowIndex = i + 2;
          break;
        }
      }
    }

    const rowData = [
      studentId,
      gradingData.totalScore || "0/0",
      gradingData.finalGrade || "1.0",
      JSON.stringify(gradingData.scores || {}),
      gradingData.feedback || "",
    ];

    if (rowIndex > 0) {
      // Actualizar existente
      gradeSheet.getRange(rowIndex, 1, 1, 5).setValues([rowData]);
    } else {
      // Agregar nueva fila
      gradeSheet.appendRow(rowData);
    }

    Logger.log(
      `Calificación guardada: ${courseName}/${studentId}/${evaluationId}`,
    );

    return JSON.stringify({
      success: true,
      message: "Calificación guardada correctamente.",
    });
  } catch (e) {
    Logger.log(`Error al guardar calificación: ${e.message}`);
    return JSON.stringify({
      error: `Error al guardar calificación: ${e.message}`,
    });
  }
}

/**
 * Carga las calificaciones de una evaluación para un curso.
 * @param {string} courseName Nombre del curso.
 * @param {string} evaluationId ID de la evaluación.
 * @returns {string} JSON con array de calificaciones o error.
 */
function loadGradesFromSheet(courseName, evaluationId) {
  try {
    const folderName = "rubricas-cursos";
    let folders = DriveApp.getFoldersByName(folderName);

    if (!folders.hasNext()) {
      return JSON.stringify([]);
    }

    const folder = folders.next();
    const fileName = `Curso_${courseName.replace(/[^a-z0-9]/gi, "_")}`;
    const existingFiles = folder.getFilesByName(fileName);

    if (!existingFiles.hasNext()) {
      return JSON.stringify([]);
    }

    const fileId = existingFiles.next().getId();
    const ss = SpreadsheetApp.openById(fileId);

    const sheetName = `Calificaciones_${evaluationId}`;
    const gradeSheet = ss.getSheetByName(sheetName);

    if (!gradeSheet) {
      return JSON.stringify([]);
    }

    const lastRow = gradeSheet.getLastRow();
    if (lastRow <= 1) {
      return JSON.stringify([]);
    }

    // Detectar número de columnas para saber si hay feedback
    const lastCol = gradeSheet.getLastColumn();
    const colsToRead = lastCol >= 5 ? 5 : 4;

    const data = gradeSheet.getRange(2, 1, lastRow - 1, colsToRead).getValues();
    const grades = data.map((row) => ({
      studentId: row[0],
      totalScore: row[1],
      finalGrade: row[2],
      scores: row[3] ? JSON.parse(row[3]) : {},
      feedback: row[4] ? row[4].toString() : "",
    }));

    Logger.log(
      `Calificaciones cargadas: ${grades.length} para ${evaluationId}`,
    );
    return JSON.stringify(grades);
  } catch (e) {
    Logger.log(`Error al cargar calificaciones: ${e.message}`);
    return JSON.stringify({
      error: `Error al cargar calificaciones: ${e.message}`,
    });
  }
}
