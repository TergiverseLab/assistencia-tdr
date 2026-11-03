// ===================== VISTES · 2. DIBUJO DE LAS PESTAÑAS =====================
// actualitzarVistes() rehace todas las pestañas para mirar a partir de las pestañas de datos.

const COL = {vermell:"#C4553D", negre:"#111111", gris:"#6b6b6b", gris2:"#9a9a9a", linia:"#dcdcdc", suau:"#f3f3f3", marca:"#e4e4e4", blanc:"#ffffff"};
const FONT_TITOL = "Josefin Sans";
const VISTES_OBSOLETES = [];   // pestañas de versiones anteriores que se borran solas
const ORDRE_VISTES = ["Inici", "Participants", "Assistència T1", "Assistència T2", "Quotes T1", "Quotes T2", "Loli"];

function vista(nom){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (!sh) sh = ss.insertSheet(nom);
  else {
    sh.getImages().forEach(i=>i.remove());
    sh.setFrozenRows(0); sh.setFrozenColumns(0);
    const r = sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()); r.breakApart(); sh.clear(); sh.setConditionalFormatRules([]);
  }
  sh.setHiddenGridlines(true); sh.setTabColor(COL.vermell);
  return sh;
}
function titol(sh, text, sub){
  sh.getRange(1,1).setValue(text).setFontFamily(FONT_TITOL).setFontSize(16).setFontWeight("bold");
  if (sub) sh.getRange(2,1).setValue(sub).setFontColor(COL.gris).setFontSize(10);
}
function capcalera(rang){ rang.setBackground(COL.vermell).setFontColor(COL.blanc).setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle"); }
function seccio(sh, fila, text){ sh.getRange(fila,2).setValue(text.toUpperCase()).setFontFamily(FONT_TITOL).setFontWeight("bold").setFontSize(11).setFontColor(COL.negre); }

// ---------- Inici ----------
function vistaInici(m, sts){
  const sh = vista("Inici");
  sh.setColumnWidth(1, 120); [2,3,4,5,6,7,8,9,10].forEach(c=>sh.setColumnWidth(c, c===3||c===4 ? 170 : 105));
  try { const img = sh.insertImage(LOGO_URL, 1, 1); img.setWidth(96).setHeight(96); } catch(e) {}
  sh.getRange(1,2).setValue("TALLER DE MOVIMENT CREATIU").setFontFamily(FONT_TITOL).setFontSize(22).setFontWeight("bold").setFontColor(COL.vermell);
  sh.getRange(2,2).setValue("Assistència i quotes · Casal de la Dona · Palafolls").setFontSize(11).setFontColor(COL.gris);
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

  if (PECES.length){ seccio(sh, f, "Peces públiques"); f++;
  const capP = ["Temporada","Peça","Què és","Data","Lloc"];
  sh.getRange(f,2,1,capP.length).setValues([capP]); capcalera(sh.getRange(f,2,1,capP.length));
  const fp = PECES.map(p=>[p[0], p[1], p[2], dmy(p[3]), p[4]]);
  sh.getRange(f+1,2,fp.length,capP.length).setValues(fp).setFontSize(10);
  sh.getRange(f+1,3,fp.length,1).setFontWeight("bold");
  f += fp.length + 2; }

  seccio(sh, f, "Per a documents i convocatòries"); f++;
  sts.forEach(st=>{ sh.getRange(f,2,1,8).merge().setValue(fraseDocument(st)).setFontSize(10).setWrap(true); sh.setRowHeight(f, 34); f++; });
  f++;

  seccio(sh, f, "Com llegir aquest document"); f++;
  ["Participants: una fila per persona, amb temporades, sessions i quotes.",
   "Assistència T1, T2: ✓ = ha vingut (llista de la sessió). · = inscrita aquell mes (T1: llista reconstruïda per quotes).",
   "Quotes T1, T2: el que ha pagat cada persona cada mes, i el que correspon a Loli (Casal de la Dona).",
   "Loli: el que s'ha de lliurar al Casal cada mes (15 % de les quotes + altes del Casal) i si ja s'ha lliurat.",
   "Les pestanyes «dades · …» (al final, en gris) les escriu la web. No s'han de tocar a mà.",
   "Aquest document s'actualitza sol cada 10 minuts. Per forçar-ho: menú Moviment Creatiu › Actualitzar ara."]
   .forEach(t=>{ sh.getRange(f,2,1,8).merge().setValue(t).setFontSize(9).setFontColor(COL.gris).setWrap(true); f++; });
  return sh;
}

// ---------- Participants ----------
function vistaParticipants(m, sts){
  const sh = vista("Participants");
  titol(sh, "Participants", "Totes les persones que han passat pel Taller de Moviment Creatiu. Les actives, primer.");
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
  const nomGrup = st.grup ? " " + st.grup : "";
  const sh = vista("Assistència " + st.t.id + nomGrup);
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
  sh.getRange(f+1+nf,1,3,n).setValues([g.total, g.persones, g.loli]).setFontWeight("bold").setBackground(COL.suau).setFontSize(10);
  sh.getRange(f+1+nf,2,1,n-1).setHorizontalAlignment("center").setNumberFormat('#,##0 "€"');
  sh.getRange(f+2+nf,2,1,n-1).setHorizontalAlignment("center");
  sh.getRange(f+3+nf,2,1,n-1).setHorizontalAlignment("center").setNumberFormat('#,##0.## "€"'); sh.getRange(f+3+nf,1,1,n).setFontColor(COL.vermell);
  sh.getRange(f,1,nf+4,n).setBorder(true,true,true,true,true,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
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
  const props = PropertiesService.getScriptProperties(); props.deleteProperty("vistesPendents"); // al principio: lo que se guarde mientras, se rehará después
  try { rehacerVistes(); } catch(e) { props.setProperty("vistesPendents", "1"); throw e; }
}
function rehacerVistes(){
  const avui = Utilities.formatDate(new Date(), "Europe/Madrid", "yyyy-MM-dd");
  const m = construirModel(rows("persons"), rows("sessions"), rows("pagos"), avui);
  const sts = TEMPORADES.filter(t=>t.ini <= avui).map(t=>estadistiques(t, m));
  vistaInici(m, sts);
  vistaParticipants(m, sts);
  sts.forEach(st=>vistaAssistencia(st, m));
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  VISTES_OBSOLETES.forEach(n=>{ const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  sts.forEach(st=>vistaQuotes(st, m));
  vistaLoli(m);
  ordenarPestanyes();
}

// Lo llama el reloj cada 10 minutos: solo rehace si la web ha guardado algo
function actualitzarSiCal(){
  if (PropertiesService.getScriptProperties().getProperty("vistesPendents")) actualitzarVistes();
}

function onOpen(){
  SpreadsheetApp.getUi().createMenu("Moviment Creatiu").addItem("Actualitzar ara", "actualitzarVistes").addItem("Olvidé la contraseña de las fichas", "oblidarClauFitxes").addToUi();
}

// ===================== INSTAL·LACIÓ (ejecutar UNA vez) =====================
// 1) Crea las pestañas de datos.  2) Carga el histórico (T1 feb–jun 2026 y T2 sept–oct 2026) si la hoja está vacía.
// 3) Monta las pestañas para mirar.  4) Pone el reloj de cada 10 minutos y las copias de seguridad.
function instalar(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(k=>sheet(k));
  { const sh = sheet("sessions"); sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat("@"); }
  { const sh = sheet("registre"); sh.getRange(1, 3, sh.getMaxRows(), 1).setNumberFormat("@"); }
  if (rows("persons").filter(r=>r[0]).length === 0) importarHistoric();
  const buida = ss.getSheetByName("Full 1") || ss.getSheetByName("Hoja 1") || ss.getSheetByName("Sheet1");
  actualitzarVistes();
  if (buida && ss.getSheets().length > 1) try { ss.deleteSheet(buida); } catch(e) {}
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="actualitzarSiCal").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("actualitzarSiCal").timeBased().everyMinutes(10).create();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="copiesDeSeguretat").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("copiesDeSeguretat").timeBased().everyDays(1).atHour(3).create();
  copiesDeSeguretat(true);
  Logger.log("Fet: dades carregades, vistes muntades, rellotge de 10 minuts i còpies de seguretat activats.");
}

// ---------- Loli (Casal de la Dona) ----------
// Cada mes: cuotas cobradas, 15 % + altas del Casal = lo que hay que entregarle, y si ya se entregó (Config: loli:AAAA-MM)
function vistaLoli(m){
  const sh = vista("Loli");
  titol(sh, "Loli · Casal de la Dona", "Des de setembre de 2026: 15 % de les quotes de cada mes + 20 € per cada alta del Casal. T1: 30 € fixos al mes.");
  const cfg = {}; rows("settings").filter(r=>r[0]).forEach(r=>{ try{ cfg[String(r[0])] = JSON.parse(r[1]); }catch(e){ cfg[String(r[0])] = r[1]; } });
  const mesos = [...new Set(m.pagos.map(p=>p.mes))].filter(mm=>mm <= m.avui.slice(0,7)).sort();
  const altes = mm => Object.values(m.persons).filter(p=>p.socia && p.socia.casal && String(p.socia.casal.date||"").slice(0,7)===mm);
  const cap = ["Mes","Quotes cobrades","Part de Loli","Altes del Casal","Total per a Loli","Lliurat","Pendent"];
  let pend = 0;
  const files = mesos.map(mm=>{
    const q = m.pagos.filter(p=>p.mes===mm).reduce((a,p)=>a+p.imp,0); const al = altes(mm);
    const tot = loliMes(mm, q, al.length); const lli = cfg["loli:"+mm];
    const pendent = lli ? 0 : tot; if (mm >= LOLI_DES_DE) pend += pendent;
    return [nomMes(mm), q, mm >= LOLI_DES_DE ? tot - 20*al.length : tot, al.length ? al.length + " × 20 € (" + al.map(p=>p.nom).join(", ") + ")" : "", tot,
            lli ? "✓ " + (lli.data ? dmy(lli.data) : "") : (mm < LOLI_DES_DE ? "(T1)" : ""), mm < LOLI_DES_DE ? "" : pendent || ""];
  });
  const f = 4;
  sh.getRange(3,1).setValue("Pendent de lliurar ara: " + Math.round(pend*100)/100 + " €").setFontWeight("bold").setFontColor(COL.vermell).setFontSize(12);
  sh.getRange(f,1,1,cap.length).setValues([cap]); capcalera(sh.getRange(f,1,1,cap.length));
  if (files.length){
    sh.getRange(f+1,1,files.length,cap.length).setValues(files).setFontSize(10);
    sh.getRange(f+1,2,files.length,1).setNumberFormat('#,##0 "€"'); sh.getRange(f+1,3,files.length,1).setNumberFormat('#,##0.## "€"');
    sh.getRange(f+1,5,files.length,1).setNumberFormat('#,##0.## "€"').setFontWeight("bold"); sh.getRange(f+1,7,files.length,1).setNumberFormat('#,##0.## "€"').setFontColor(COL.vermell);
    sh.getRange(f,1,files.length+1,cap.length).setBorder(true,true,true,true,true,true,COL.linia,SpreadsheetApp.BorderStyle.SOLID);
  }
  sh.setColumnWidth(1,110); sh.setColumnWidth(2,110); sh.setColumnWidth(3,100); sh.setColumnWidth(4,320); sh.setColumnWidth(5,110); sh.setColumnWidth(6,100); sh.setColumnWidth(7,90);
  sh.setFrozenRows(f);
  return sh;
}

// ===================== CÒPIES DE SEGURETAT =====================
// Cada día a las 3 h: si es lunes, copia semanal (se guardan 8); si es día 1, copia mensual (se guardan 12).
// Van a la carpeta "Còpies de seguretat", dentro de la carpeta donde está esta hoja.
const COPIES_SETMANALS = 8, COPIES_MENSUALS = 12;
function copiesDeSeguretat(forcar){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ara = new Date(); const dia = Number(Utilities.formatDate(ara, "Europe/Madrid", "u")); const dm = Number(Utilities.formatDate(ara, "Europe/Madrid", "d"));
  const pare = DriveApp.getFileById(ss.getId()).getParents().next();
  const it = pare.getFoldersByName("Còpies de seguretat"); const carpeta = it.hasNext() ? it.next() : pare.createFolder("Còpies de seguretat");
  const fer = (prefix, data, max)=>{
    const nom = prefix + " · " + data;
    if (!carpeta.getFilesByName(nom).hasNext()) DriveApp.getFileById(ss.getId()).makeCopy(nom, carpeta);
    const totes = []; const f = carpeta.getFiles(); while (f.hasNext()){ const x = f.next(); if (x.getName().indexOf(prefix + " · ") === 0) totes.push(x); }
    totes.sort((a,b)=>b.getName().localeCompare(a.getName())).slice(max).forEach(x=>x.setTrashed(true));
  };
  if (forcar === true || dia === 1) fer("TdR · còpia setmanal", Utilities.formatDate(ara, "Europe/Madrid", "yyyy-MM-dd"), COPIES_SETMANALS);
  if (forcar === true || dm === 1)  fer("TdR · còpia mensual",  Utilities.formatDate(ara, "Europe/Madrid", "yyyy-MM"), COPIES_MENSUALS);
}
