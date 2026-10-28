// Geração de CSV com prevenção de injeção de fórmulas (planilhas executam células iniciadas por = + - @).
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

export function csvCell(value) {
  if (value == null) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // BOM para que o Excel reconheça UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}
