/**
 * Creates example XLSX files for the repo
 * Run with: node scripts/create-examples.mjs
 */

import * as XLSX from "xlsx"

// Helper to create Date objects (months are 0-indexed in JS)
const d = (year, month, day) => new Date(year, month - 1, day)

// Example data for Process Plan (Prozessplan)
const processPlanData = [
  {
    Id: "1001",
    Prozessname: "Trockenbau Wände",
    Startdatum: d(2026, 3, 2),
    Enddatum: d(2026, 3, 6),
    Status: 0,
    "Status Text": "Offen",
    Dauer: 5,
    Gewerk: "Trockenbau",
    "Gewerk Hintergrundfarbe": "RGB(60,41,221)",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
  },
  {
    Id: "1002",
    Prozessname: "Elektro Rohinstallation",
    Startdatum: d(2026, 3, 9),
    Enddatum: d(2026, 3, 13),
    Status: 0,
    "Status Text": "Offen",
    Dauer: 5,
    Gewerk: "Elektro",
    "Gewerk Hintergrundfarbe": "RGB(192,212,61)",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
  },
  {
    Id: "1003",
    Prozessname: "Sanitär Rohinstallation",
    Startdatum: d(2026, 3, 9),
    Enddatum: d(2026, 3, 20),
    Status: 0,
    "Status Text": "Offen",
    Dauer: 10,
    Gewerk: "Sanitär",
    "Gewerk Hintergrundfarbe": "RGB(223,144,42)",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
  },
  {
    Id: "1004",
    Prozessname: "Estrich",
    Startdatum: d(2026, 3, 23),
    Enddatum: d(2026, 3, 27),
    Status: 0,
    "Status Text": "Offen",
    Dauer: 5,
    Gewerk: "Estrich",
    "Gewerk Hintergrundfarbe": "RGB(241,229,48)",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
  },
  {
    Id: "1005",
    Prozessname: "Maler Grundierung",
    Startdatum: d(2026, 3, 30),
    Enddatum: d(2026, 4, 3),
    Status: 0,
    "Status Text": "Offen",
    Dauer: 5,
    Gewerk: "Maler",
    "Gewerk Hintergrundfarbe": "RGB(0,176,151)",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
  },
  {
    Id: "1006",
    Prozessname: "Bodenbelag verlegen",
    Startdatum: d(2026, 4, 6),
    Enddatum: d(2026, 4, 10),
    Status: 0,
    "Status Text": "Offen",
    Dauer: 5,
    Gewerk: "Bodenbelag",
    "Gewerk Hintergrundfarbe": "RGB(168,255,0)",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
  },
]

// Example data for Plan Cards (Plankarten)
const planCardsData = [
  {
    Id: "1001-0#0",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 2),
    Prozessname: "Trockenbau Wände",
    "Prozess ID": "1001",
    Aufgabe: "Trockenbau Wände",
    Status: "OPEN",
    Gewerk: "Trockenbau",
  },
  {
    Id: "1001-0#1",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 3),
    Prozessname: "Trockenbau Wände",
    "Prozess ID": "1001",
    Aufgabe: "Trockenbau Wände",
    Status: "OPEN",
    Gewerk: "Trockenbau",
  },
  {
    Id: "1001-0#2",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 4),
    Prozessname: "Trockenbau Wände",
    "Prozess ID": "1001",
    Aufgabe: "Trockenbau Wände",
    Status: "OPEN",
    Gewerk: "Trockenbau",
  },
  {
    Id: "1002-0#0",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 9),
    Prozessname: "Elektro Rohinstallation",
    "Prozess ID": "1002",
    Aufgabe: "Elektro Rohinstallation",
    Status: "OPEN",
    Gewerk: "Elektro",
  },
  {
    Id: "1002-0#1",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 10),
    Prozessname: "Elektro Rohinstallation",
    "Prozess ID": "1002",
    Aufgabe: "Elektro Rohinstallation",
    Status: "OPEN",
    Gewerk: "Elektro",
  },
  {
    Id: "1003-0#0",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 9),
    Prozessname: "Sanitär Rohinstallation",
    "Prozess ID": "1003",
    Aufgabe: "Sanitär Rohinstallation",
    Status: "OPEN",
    Gewerk: "Sanitär",
  },
  {
    Id: "1004-0#0",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 23),
    Prozessname: "Estrich",
    "Prozess ID": "1004",
    Aufgabe: "Estrich",
    Status: "OPEN",
    Gewerk: "Estrich",
  },
  {
    Id: "1005-0#0",
    "Bereich Ebene 1": "Gebäude A",
    "Bereich Ebene 2": "EG",
    "Bereich Ebene 3": "Takt 1",
    Datum: d(2026, 3, 30),
    Prozessname: "Maler Grundierung",
    "Prozess ID": "1005",
    Aufgabe: "Maler Grundierung",
    Status: "OPEN",
    Gewerk: "Maler",
  },
]

// Create Process Plan workbook
const processPlanWb = XLSX.utils.book_new()
const processPlanWs = XLSX.utils.json_to_sheet(processPlanData, { cellDates: true })
XLSX.utils.book_append_sheet(processPlanWb, processPlanWs, "Sheet1")
XLSX.writeFile(processPlanWb, "examples/example-process-plan.xlsx")
console.log("Created examples/example-process-plan.xlsx")

// Create Plan Cards workbook
const planCardsWb = XLSX.utils.book_new()
const planCardsWs = XLSX.utils.json_to_sheet(planCardsData, { cellDates: true })
XLSX.utils.book_append_sheet(planCardsWb, planCardsWs, "Sheet1")
XLSX.writeFile(planCardsWb, "examples/example-plan-cards.xlsx")
console.log("Created examples/example-plan-cards.xlsx")
