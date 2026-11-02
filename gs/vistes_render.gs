// ===================== VISTES · 2. DIBUJO DE LAS PESTAÑAS =====================
// actualitzarVistes() rehace todas las pestañas para mirar a partir de las pestañas de datos.

const COL = {negre:"#111111", gris:"#6b6b6b", gris2:"#9a9a9a", linia:"#dcdcdc", suau:"#f3f3f3", marca:"#e4e4e4", blanc:"#ffffff"};
const FONT_TITOL = "Josefin Sans";
const ORDRE_VISTES = ["Inici", "Participants", "Assistència T1", "Assistència T2", "Assistència T3", "Quotes T2", "Quotes T3"];

function vista(nom){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (!sh) sh = ss.insertSheet(nom);
  else {
    sh.getImages().forEach(i=>i.remove());
    sh.setFrozenRows(0); sh.setFrozenColumns(0);
    const r = sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()); r.breakApart(); sh.clear(); sh.setConditionalFormatRules([]);
  }
  sh.setHiddenGridlines(true); sh.setTabColor(COL.negre);
  return sh;
}
function titol(sh, text, sub){
  sh.getRange(1,1).setValue(text).setFontFamily(FONT_TITOL).setFontSize(16).setFontWeight("bold");
  if (sub) sh.getRange(2,1).setValue(sub).setFontColor(COL.gris).setFontSize(10);
}
function capcalera(rang){ rang.setBackground(COL.negre).setFontColor(COL.blanc).setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle"); }
function seccio(sh, fila, text){ sh.getRange(fila,2).setValue(text.toUpperCase()).setFontFamily(FONT_TITOL).setFontWeight("bold").setFontSize(11).setFontColor(COL.negre); }

// ---------- Inici ----------
function vistaInici(m, sts){
  const sh = vista("Inici");
  sh.setColumnWidth(1, 120); [2,3,4,5,6,7,8,9,10].forEach(c=>sh.setColumnWidth(c, c===3||c===4 ? 170 : 105));
  try { const img = sh.insertImage(LOGO_URL, 1, 1); img.setWidth(96).setHeight(96); } catch(e) {}
  sh.getRange(1,2).setValue("TEATRE DELS RECORDS").setFontFamily(FONT_TITOL).setFontSize(22).setFontWeight("bold");
  sh.getRange(2,2).setValue("Assistència i quotes · Malgrat de Mar").setFontSize(11).setFontColor(COL.gris);
  sh.getRange(3,2).setValue("Un projecte de l'Associació Laboratori Línia de Fuga").setFontSize(9).setFontColor(COL.gris);
  sh.getRange(4,2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText("Obrir la web per passar llista →").setLinkUrl(WEB_URL).build()).setFontSize(10);
  sh.getRange(4,5).setValue("Actualitzat: " + Utilities.formatDate(new Date(), "Europe/Madrid", "dd/MM/yyyy HH:mm")).setFontSize(9).setFontColor(COL.gris);
  sh.setRowHeights(1, 4, 26);

  let f = 6; seccio(sh, f, "Temporades"); f++;
  const cap = ["Temporada","Període","Finançament","Sessions","Hores","Participants","Mitjana per sessió","Inscrites per mes"];
  const files = sts.map(st=>[st.t.id, st.t.periode, st.t.finan, st.ses.length, st.hores, st.gent.size,
                             st.mitjana==null ? "" : num1(st.mitjana), st.insMin==null ? "" : (st.insMin===st.insMax ? st.insMin : st.insMin+"–"+st.insMax)]);
  const totalGent = new Set(); sts.forEach(st=>st.gent.forEach(p=>totalGent.add(p)));
  const total = ["Total", "", "", sts.reduce((a,st)=>a+st.ses.length,0), sts.reduce((a,st)=>a+st.hores,0), totalGent.size, "", ""];
  sh.getRange(f,2,1,cap.length).setValues([cap]); capcalera(sh.getRange(f,2,1,cap.length));
  sh.getRange(f+1,2,files.length,cap.length).setValues(files).setFontSize(10).setVerticalAlignment("middle");
  sh.getRange(f+1,5,files.length+1,5).setHorizontalAlignment("center");
  sh.getRange(f+1+files.length,2,1,cap.length).setValues([total]).setFontWeight("bold").setBackground(COL.suau);
  sh.getRange(f,2,files.length+2,cap.length).setBorder(null,null,true,null,null,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  f += files.length + 3;

  seccio(sh, f, "Peces públiques"); f++;
  const capP = ["Temporada","Peça","Què és","Data","Lloc"];
  sh.getRange(f,2,1,capP.length).setValues([capP]); capcalera(sh.getRange(f,2,1,capP.length));
  const fp = PECES.map(p=>[p[0], p[1], p[2], dmy(p[3]), p[4]]);
  sh.getRange(f+1,2,fp.length,capP.length).setValues(fp).setFontSize(10);
  sh.getRange(f+1,3,fp.length,1).setFontWeight("bold");
  f += fp.length + 2;

  seccio(sh, f, "Per a documents i convocatòries"); f++;
  sts.forEach(st=>{ sh.getRange(f,2,1,8).merge().setValue(fraseDocument(st)).setFontSize(10).setWrap(true); sh.setRowHeight(f, 34); f++; });
  f++;

  seccio(sh, f, "Com llegir aquest document"); f++;
  ["Participants: una fila per persona, amb temporades, sessions i quotes.",
   "Assistència T1, T2, T3: ✓ = ha vingut (llista de la sessió). · = inscrita aquell mes; la sessió no té llista. Columna grisa = sessió sense dades.",
   "Quotes T2, T3: el que ha pagat cada persona cada mes.",
   "Les pestanyes «dades · …» (al final, en gris) les escriu la web. No s'han de tocar a mà.",
   "Aquest document s'actualitza sol cada 10 minuts. Per forçar-ho: menú Teatre dels Records › Actualitzar ara."]
   .forEach(t=>{ sh.getRange(f,2,1,8).merge().setValue(t).setFontSize(9).setFontColor(COL.gris).setWrap(true); f++; });
  return sh;
}

// ---------- Participants ----------
function vistaParticipants(m, sts){
  const sh = vista("Participants");
  titol(sh, "Participants", "Totes les persones que han passat pel Teatre dels Records. Les actives, primer.");
  const t = taulaParticipants(m, sts); const f = 4; const n = t.cap.length;
  sh.getRange(f,1,1,n).setValues([t.cap]); capcalera(sh.getRange(f,1,1,n));
  if (t.files.length){
    sh.getRange(f+1,1,t.files.length,n).setValues(t.files).setFontSize(10);
    sh.getRange(f+1,2,t.files.length,n-1).setHorizontalAlignment("center");
    sh.getRange(f+1,n-1,t.files.length,1).setNumberFormat('#,##0 "€"');
    const bg = t.files.map(r=>Array(n).fill(r[1]==="activa" ? COL.blanc : COL.suau));
    const fc = t.files.map(r=>Array(n).fill(r[1]==="activa" ? COL.negre : COL.gris));
    sh.getRange(f+1,1,t.files.length,n).setBackgrounds(bg).setFontColors(fc);
    sh.getRange(f,1,t.files.length+1,n).setBorder(null,null,true,null,null,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  }
  sh.setColumnWidth(1, 230); for (let c=2;c<=n;c++) sh.setColumnWidth(c, c<=4 ? 90 : 70);
  sh.setColumnWidth(n-3, 110); sh.setColumnWidth(n-2, 90); sh.setColumnWidth(n-1, 90); sh.setColumnWidth(n, 90);
  sh.setFrozenRows(f); sh.setFrozenColumns(1);
  return sh;
}

// ---------- Assistència Tn ----------
function vistaAssistencia(st, m){
  const sh = vista("Assistència " + st.t.id);
  const g = graellaAssistencia(st, m); const n = g.cap2.length;
  const mitj = st.mitjana==null ? "" : ` · mitjana ${num1(st.mitjana)} per sessió`;
  titol(sh, `Assistència · ${st.t.id} (${st.t.periode})`, `${st.ses.length} sessions · ${st.gent.size} participants${mitj}`);
  sh.getRange(3,1).setValue("✓ ha vingut   ·  inscrita aquell mes (sessió sense llista)   columna grisa: sessió sense dades").setFontSize(9).setFontColor(COL.gris);
  if (!g.ses.length){ sh.getRange(5,1).setValue("Encara no hi ha sessions en aquesta temporada."); return sh; }
  const f = 5;
  sh.getRange(f,1,2,n).setValues([g.cap1, g.cap2]); capcalera(sh.getRange(f,1,2,n));
  sh.getRange(f,1,2,1).setHorizontalAlignment("left");
  g.ses.forEach((s,i)=>{ if (s.font==="sense") sh.getRange(f,2+i,2,1).setBackground(COL.gris2); else if (s.font==="inscrites") sh.getRange(f,2+i,2,1).setBackground("#4a4a4a"); });
  const nf = g.files.length;
  if (nf){
    sh.getRange(f+2,1,nf,n).setValues(g.files).setFontSize(10);
    sh.getRange(f+2,2,nf,n-1).setHorizontalAlignment("center");
    const bg = g.files.map(r=>r.map((c,j)=> j===0||j===n-1 ? COL.blanc : (g.ses[j-1].font==="sense" ? COL.suau : c==="✓" ? COL.marca : COL.blanc)));
    const fc = g.files.map(r=>r.map(c=> c==="·" ? COL.gris2 : COL.negre));
    sh.getRange(f+2,1,nf,n).setBackgrounds(bg).setFontColors(fc);
    sh.getRange(f+2,n,nf,1).setFontWeight("bold");
  }
  const extra = [g.totals]; if (g.provar) extra.push(g.provar);
  sh.getRange(f+2+nf,1,extra.length,n).setValues(extra).setFontWeight("bold").setBackground(COL.suau).setFontSize(10);
  sh.getRange(f+2+nf,2,extra.length,n-1).setHorizontalAlignment("center");
  sh.getRange(f,1,nf+2+extra.length,n).setBorder(true,true,true,true,true,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 220); for (let c=2;c<n;c++) sh.setColumnWidth(c, 46); sh.setColumnWidth(n, 72);
  sh.setFrozenRows(f+1); sh.setFrozenColumns(1);
  return sh;
}

// ---------- Quotes Tn ----------
function vistaQuotes(st, m){
  const sh = vista("Quotes " + st.t.id);
  const g = graellaQuotes(st, m); const n = g.cap.length;
  titol(sh, `Quotes · ${st.t.id} (${st.t.periode})`, `${g.files.length} persones han pagat alguna quota · total ${g.total[n-1]} €`);
  const f = 4;
  sh.getRange(f,1,1,n).setValues([g.cap]); capcalera(sh.getRange(f,1,1,n)); sh.getRange(f,1).setHorizontalAlignment("left");
  const nf = g.files.length;
  if (nf){
    sh.getRange(f+1,1,nf,n).setValues(g.files).setFontSize(10);
    sh.getRange(f+1,2,nf,n-1).setHorizontalAlignment("center").setNumberFormat('#,##0 "€"');
    sh.getRange(f+1,n,nf,1).setFontWeight("bold");
  }
  sh.getRange(f+1+nf,1,2,n).setValues([g.total, g.persones]).setFontWeight("bold").setBackground(COL.suau).setFontSize(10);
  sh.getRange(f+1+nf,2,1,n-1).setHorizontalAlignment("center").setNumberFormat('#,##0 "€"');
  sh.getRange(f+2+nf,2,1,n-1).setHorizontalAlignment("center");
  sh.getRange(f,1,nf+3,n).setBorder(true,true,true,true,true,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 220); for (let c=2;c<=n;c++) sh.setColumnWidth(c, 80);
  sh.setFrozenRows(f); sh.setFrozenColumns(1);
  return sh;
}

// ---------- Orden, datos en gris ----------
function ordenarPestanyes(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let pos = 1;
  ORDRE_VISTES.forEach(nom=>{ const sh = ss.getSheetByName(nom); if (sh){ ss.setActiveSheet(sh); ss.moveActiveSheet(pos++); } });
  Object.keys(SHEETS).forEach(k=>{
    const sh = sheet(k); ss.setActiveSheet(sh); ss.moveActiveSheet(ss.getNumSheets());
    sh.setTabColor(COL.gris2);
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sh.protect().setDescription("Dades de la web: no tocar a mà").setWarningOnly(true);
  });
  ss.setActiveSheet(ss.getSheetByName("Inici"));
}

// ---------- Entrada principal ----------
function actualitzarVistes(){
  const avui = Utilities.formatDate(new Date(), "Europe/Madrid", "yyyy-MM-dd");
  const m = construirModel(rows("persons"), rows("sessions"), rows("pagos"), avui);
  const sts = TEMPORADES.filter(t=>t.ini <= avui).map(t=>estadistiques(t, m));
  vistaInici(m, sts);
  vistaParticipants(m, sts);
  sts.forEach(st=>vistaAssistencia(st, m));
  sts.filter(st=>st.t.id!=="T1").forEach(st=>vistaQuotes(st, m));
  ordenarPestanyes();
  PropertiesService.getScriptProperties().deleteProperty("vistesPendents");
}

// Lo llama el reloj cada 10 minutos: solo rehace si la web ha guardado algo
function actualitzarSiCal(){
  if (PropertiesService.getScriptProperties().getProperty("vistesPendents")) actualitzarVistes();
}

function onOpen(){
  SpreadsheetApp.getUi().createMenu("Teatre dels Records").addItem("Actualitzar ara", "actualitzarVistes").addToUi();
}

// ===================== INSTAL·LACIÓ (ejecutar UNA vez) =====================
// 1) Copia las pestañas antiguas (las de Emi) a un archivo aparte "Arxiu" y las quita de aquí.
// 2) Borra las sesiones de prueba del 2/11 (y la del 4/11 si está vacía) y el 10/6/2026, que fue la gala
//    The Divas (pieza pública, no sesión de taller).
// 3) Monta las pestañas para mirar.  4) Pone el reloj de cada 10 minutos.
function instalar(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const propies = ORDRE_VISTES.concat(Object.keys(SHEETS).map(k=>SHEETS[k][0]), Object.keys(SHEETS).map(k=>SHEETS[k][2]));
  Object.keys(SHEETS).forEach(k=>sheet(k)); // renombra las de datos si tenían el nombre antiguo
  const antigues = ss.getSheets().filter(sh=>!propies.includes(sh.getName()));
  if (antigues.length){
    const arxiu = SpreadsheetApp.create("Arxiu · pestanyes originals (Excel d'Emi) · Assistència i quotes TdR");
    antigues.forEach(sh=>{ const c = sh.copyTo(arxiu); c.setName(sh.getName()); });
    arxiu.getSheets().filter(sh=>!antigues.some(a=>a.getName()===sh.getName())).forEach(sh=>arxiu.deleteSheet(sh));
    try { const carpeta = DriveApp.getFileById(ss.getId()).getParents().next(); DriveApp.getFileById(arxiu.getId()).moveTo(carpeta); } catch(e) {}
    if (!ss.getSheetByName("Inici")) ss.insertSheet("Inici");  // una hoja tiene que quedar siempre
    antigues.forEach(sh=>ss.deleteSheet(sh));
    Logger.log("Arxivades a «" + arxiu.getName() + "»: " + antigues.map(s=>s.getName()).join(", "));
  }
  const shS = sheet("sessions"); const v = shS.getDataRange().getValues();
  for (let i = v.length-1; i >= 1; i--){
    const id = norm(v[i][0]);
    if (id === "2026-11-02" || id === "2026-06-10" || (id === "2026-11-04" && !String(v[i][3]).trim())) shS.deleteRow(i+1);
  }
  actualitzarVistes();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="actualitzarSiCal").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("actualitzarSiCal").timeBased().everyMinutes(10).create();
  Logger.log("Fet: vistes muntades i rellotge de 10 minuts activat.");
}
