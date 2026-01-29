/**
 * Servicio para generación de reportes PDF y DOC de calificaciones.
 */

function generateStudentReportPDF(data) {
  try {
    const htmlContent = createReportHTML(data);
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML, "temp.html");
    const pdfBlob = blob
      .getAs(MimeType.PDF)
      .setName(`Reporte_${data.studentName}_${data.evaluationName}.pdf`);

    // Crear estructura de carpetas: RubricAPP / Reportes
    const rootFolder = getOrCreateFolder("RubricAPP");
    const reportsFolder = getOrCreateSubFolder(rootFolder, "Reportes");

    const file = reportsFolder.createFile(pdfBlob);

    // Hacer público temporalmente o devolver URL de descarga/vista
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return JSON.stringify({
      success: true,
      url: file.getUrl(),
      message: "PDF generado exitosamente en RubricAPP/Reportes.",
    });
  } catch (e) {
    Logger.log("Error generando PDF: " + e.message);
    return JSON.stringify({
      success: false,
      error: e.message,
    });
  }
}

// Nueva función para Documentos de Google - LOGICA REVISADA v3 (Matriz de datos)
function generateStudentReportDoc(data) {
  try {
    if (!data.rubric || !data.rubric.criteria || !data.rubric.levels) {
      throw new Error("Datos de rúbrica incompletos.");
    }

    const rootFolder = getOrCreateFolder("RubricAPP");
    const reportsFolder = getOrCreateSubFolder(rootFolder, "Reportes");

    const docName = `Reporte_${data.studentName}_${data.evaluationName}`;
    const doc = DocumentApp.create(docName);
    const docFile = DriveApp.getFileById(doc.getId());

    reportsFolder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);

    const body = doc.getBody();
    body
      .setMarginTop(30)
      .setMarginBottom(30)
      .setMarginLeft(40)
      .setMarginRight(40);

    // Estilos
    const baseStyle = {};
    baseStyle[DocumentApp.Attribute.FONT_FAMILY] = "Arial";
    baseStyle[DocumentApp.Attribute.FONT_SIZE] = 9;

    const boldStyle = {};
    boldStyle[DocumentApp.Attribute.FONT_FAMILY] = "Arial";
    boldStyle[DocumentApp.Attribute.FONT_SIZE] = 9;
    boldStyle[DocumentApp.Attribute.BOLD] = true;

    // Título
    body
      .appendParagraph("REPORTE DE EVALUACIÓN")
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(14)
      .setBold(true);

    body.appendParagraph("");

    // Cabecera Info
    const headerTable = body.appendTable([
      [`Estudiante: ${data.studentName}`, `Curso: ${data.courseName}`],
      [
        `Evaluación: ${data.evaluationName}`,
        `Fecha: ${new Date().toLocaleDateString()}`,
      ],
    ]);
    headerTable.setBorderWidth(0);

    for (let i = 0; i < headerTable.getNumRows(); i++) {
      const row = headerTable.getRow(i);
      for (let j = 0; j < row.getNumCells(); j++) {
        row
          .getCell(j)
          .setPaddingTop(2)
          .setPaddingBottom(2)
          .setAttributes(baseStyle);
      }
    }

    body.appendParagraph("");

    // Resumen Nota
    const summaryTable = body.appendTable([
      [
        `Rúbrica: ${data.rubric.name}`,
        `NOTA FINAL: ${data.finalGrade} (${data.totalScore} pts)`,
      ],
    ]);
    summaryTable.setBorderWidth(0);
    summaryTable.getRow(0).getCell(0).setAttributes(boldStyle);

    const scoreCell = summaryTable.getRow(0).getCell(1);
    scoreCell
      .setAttributes(boldStyle)
      .setForegroundColor("#FFFFFF")
      .setBackgroundColor("#333333")
      .setPaddingTop(4)
      .setPaddingBottom(4);

    if (scoreCell.getNumChildren() > 0) {
      scoreCell
        .getChild(0)
        .asParagraph()
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }

    body.appendParagraph("");

    // === TABLA RÚBRICA (Construcción por Matriz) ===
    const { rubric, scores } = data;

    // 1. Preparar datos
    const tableData = [];

    // Encabezados
    const headerRowInfo = ["Criterio"];
    rubric.levels.forEach((l) =>
      headerRowInfo.push(`${l.name}\n(${l.points} pts)`),
    );
    tableData.push(headerRowInfo);

    // Filas
    rubric.criteria.forEach((c) => {
      const rowInfo = [c.name];
      rubric.levels.forEach((l) => {
        const desc = c.level_descriptions
          ? c.level_descriptions.find((d) => d.level_id === l.id)
              ?.description || ""
          : "";
        rowInfo.push(desc);
      });
      tableData.push(rowInfo);
    });

    // 2. Crear tabla de golpe (Más estable)
    const rubTable = body.appendTable(tableData);
    rubTable.setBorderWidth(1).setBorderColor("#999999");

    // 3. Aplicar estilos iterando celdas
    const numRows = rubTable.getNumRows();

    // Estilar Header (Fila 0)
    const headerRow = rubTable.getRow(0);
    for (let j = 0; j < headerRow.getNumCells(); j++) {
      const cell = headerRow.getCell(j);
      cell
        .setBackgroundColor("#E5E7EB")
        .setAttributes(boldStyle)
        .setPaddingTop(4)
        .setPaddingBottom(4);
      if (cell.getNumChildren() > 0)
        cell
          .getChild(0)
          .asParagraph()
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }

    // Estilar Datos (Filas 1+)
    for (let i = 1; i < numRows; i++) {
      const row = rubTable.getRow(i);
      const criterioIdx = i - 1; // Ajuste por header
      const c = rubric.criteria[criterioIdx];

      // Celda 0: Nombre Criterio
      row
        .getCell(0)
        .setWidth(100)
        .setBackgroundColor("#F9FAFB")
        .setAttributes(boldStyle)
        .setPaddingTop(4)
        .setPaddingBottom(4);

      // Detectar Nota
      let selectedLevelId = scores[c.id];
      if (selectedLevelId === undefined)
        selectedLevelId = scores[criterioIdx.toString()];
      if (selectedLevelId === undefined) selectedLevelId = scores[criterioIdx];

      // Celdas Niveles (1 en adelante)
      for (let j = 1; j < row.getNumCells(); j++) {
        const cell = row.getCell(j);
        const levelIdx = j - 1;
        const l = rubric.levels[levelIdx];

        cell.setAttributes(baseStyle).setPaddingTop(4).setPaddingBottom(4);

        if (String(selectedLevelId) === String(l.id)) {
          cell.setBackgroundColor("#BBF7D0");
          const text = cell.editAsText();
          if (text.getText().length > 0) {
            text.insertText(0, "✓ ASIGNADO\n");
            text.setBold(0, 10, true);
            text.setForegroundColor(0, 10, "#166534");
          } else {
            cell.setText("✓ ASIGNADO");
            cell.setAttributes(boldStyle).setForegroundColor("#166534");
          }
        }
      }
    }

    // Feedback
    body.appendParagraph("");
    const fbHeader = body.appendParagraph("RETROALIMENTACIÓN DOCENTE:");
    fbHeader.setAttributes(boldStyle).setForegroundColor("#B45309");

    body
      .appendParagraph(data.feedback || "Sin comentarios adicionales.")
      .setAttributes(baseStyle)
      .setItalic(true);

    doc.saveAndClose();
    docFile.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW,
    );

    return JSON.stringify({
      success: true,
      url: doc.getUrl(),
      message: "Documento generado exitosamente.",
    });
  } catch (e) {
    Logger.log("Error DOC: " + e.message);
    return JSON.stringify({ success: false, error: e.message });
  }
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

function getOrCreateSubFolder(parentFolder, subFolderName) {
  const folders = parentFolder.getFoldersByName(subFolderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(subFolderName);
  }
}

function createReportHTML(data) {
  const { rubric, scores } = data;

  let tableRows = "";

  // Header Row (Compacto)
  let headerRow =
    '<tr><th style="border:1px solid #999; padding:4px; background-color:#e5e7eb; font-size:9px;">Criterio</th>';
  rubric.levels.forEach((l) => {
    headerRow += `<th style="border:1px solid #999; padding:4px; background-color:#e5e7eb; text-align:center; font-size:9px;">${l.name}<br>(${l.points} pts)</th>`;
  });
  headerRow += "</tr>";

  // Body Rows
  rubric.criteria.forEach((c, idx) => {
    let row = `<tr><td style="border:1px solid #999; padding:5px; font-weight:bold; font-size:9px; width: 18%; background-color:#f9fafb;">${c.name}</td>`;

    // LÓGICA DE DETECCIÓN DE NOTA (PDF)
    let selectedLevelId = scores[c.id];
    if (selectedLevelId === undefined) selectedLevelId = scores[idx.toString()];
    if (selectedLevelId === undefined) selectedLevelId = scores[idx];

    rubric.levels.forEach((l) => {
      const isSelected = String(selectedLevelId) === String(l.id);

      const bgStyle = isSelected
        ? "background-color: #bbf7d0 !important; -webkit-print-color-adjust: exact;"
        : "";
      const bgColorAttr = isSelected ? 'bgcolor="#bbf7d0"' : "";
      const fontWeight = isSelected ? "font-weight:bold;" : "";

      const checkMark = isSelected
        ? '<div style="color:#166534; font-size:12px; margin-bottom:2px;">☑ ASIGNADO</div>'
        : "";

      const descObj = c.level_descriptions
        ? c.level_descriptions.find((d) => d.level_id === l.id)
        : null;
      const description = descObj ? descObj.description : "";

      row += `<td ${bgColorAttr} style="border:1px solid #999; padding:5px; text-align:center; ${bgStyle} font-size:9px; ${fontWeight}">
                    ${checkMark}
                    <div>${description}</div>
                  </td>`;
    });
    row += "</tr>";
    tableRows += row;
  });

  // Header Ultra Compacto (Estilo Carnet)
  const headerInfo = `
    <div style="border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px; display:flex; justify-content: space-between; align-items: flex-end;">
        <div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:2px;">${data.studentName}</div>
            <div style="font-size:11px; color:#555;">Evaluación: <strong>${data.evaluationName}</strong> | Curso: ${data.courseName}</div>
        </div>
        <div style="text-align:right;">
             <div style="font-size:10px; color:#666;">Fecha: ${new Date().toLocaleDateString()}</div>
             <div style="font-size:14px; font-weight:bold; background:#333; color:#fff; padding:3px 10px; border-radius:4px; margin-top:4px;">
                Nota: ${data.finalGrade}
             </div>
        </div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
            @page { size: A4; margin: 1cm; }
            body { 
                font-family: 'Helvetica', 'Arial', sans-serif; 
                padding: 10px; 
                color: #000;
                font-size: 10px;
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                background-color: white;
            }
            table { width: 100%; border-collapse: collapse; }
            .feedback { 
                margin-top: 15px; 
                border: 1px solid #fcd34d; 
                background-color: #fffbeb !important; 
                padding: 8px; 
                font-size: 10px;
                -webkit-print-color-adjust: exact;
            }
        </style>
      </head>
      <body>
        ${headerInfo}
        
        <table>
           ${headerRow}
           ${tableRows}
        </table>
        
        <div class="feedback" bgcolor="#fffbeb">
           <strong style="color:#b45309;">RETROALIMENTACIÓN DOCENTE:</strong>
           <p style="margin: 4px 0 0 0; font-style: italic;">${data.feedback || "Sin comentarios."}</p>
        </div>
      </body>
    </html>
  `;
}
