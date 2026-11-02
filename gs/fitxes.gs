// ===================== FICHAS: datos personales de cada persona =====================
// DNI, fecha de nacimiento, teléfono, email y dirección. Van en "dades · Fitxes" y la web SOLO los lee o
// escribe con la contraseña de las fichas. Sin ella, el puente no los da a nadie.
// En el Registre solo se apunta QUÉ campos cambiaron, nunca los datos.
const CAMPS_FITXA = ["dni","naixement","telefon","email","adreca"];
const NOMS_CAMPS = {dni:"DNI", naixement:"fecha de nacimiento", telefon:"teléfono", email:"email", adreca:"dirección"};

// La contraseña la eligen Mario y Emi: la PRIMERA que se escribe en una ficha se queda como contraseña.
// Si se olvida: menú Teatre dels Records › Olvidé la contraseña de las fichas (la siguiente que se escriba será la nueva).
function comprovarClau(d){
  const pr = PropertiesService.getScriptProperties(); const c = String(d.clau || ""); const actual = pr.getProperty("clauFitxes");
  if (!actual){ if (c.length < 4) throw new Error("contraseña demasiado corta"); pr.setProperty("clauFitxes", c); return "nueva"; }
  if (c !== actual) throw new Error("contraseña incorrecta");
  return "ok";
}
function oblidarClauFitxes(){
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("Olvidé la contraseña de las fichas", "Se borrará la contraseña. La próxima que se escriba en una ficha de la web será la nueva. Los datos no se tocan. ¿Seguir?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteProperty("clauFitxes"); ui.alert("Hecho. Escribid la nueva contraseña en una ficha de la web.");
}
function llegirFitxes(){
  const o = {};
  rows("fitxes").filter(r=>r[0]).forEach(r=>{ o[String(r[0])] = {dni:String(r[1]), naixement:fmtDate(r[2]), telefon:String(r[3]), email:String(r[4]), adreca:String(r[5]), savedAt:iso(r[6])}; });
  return o;
}
function opFitxa(d, ara){
  const sh = sheet("fitxes"); const v = sh.getDataRange().getValues(); let fila = -1;
  for (let i = 1; i < v.length; i++){ if (String(v[i][0]) === String(d.id)){ fila = i; break; } }
  const cur = fila > 0 ? {dni:String(v[fila][1]), naixement:fmtDate(v[fila][2]), telefon:String(v[fila][3]), email:String(v[fila][4]), adreca:String(v[fila][5])} : {dni:"",naixement:"",telefon:"",email:"",adreca:""};
  const set = d.set || {}; const canvis = [];
  CAMPS_FITXA.forEach(k=>{ if (set[k] != null){ const nou = netejaText(String(set[k]).slice(0, 200)); if (nou !== cur[k]){ cur[k] = nou; canvis.push(NOMS_CAMPS[k]); } } });
  const fil = [String(d.id), cur.dni, cur.naixement, cur.telefon, cur.email, cur.adreca, ara];
  if (fila > 0) sh.getRange(fila+1, 1, 1, fil.length).setValues([fil]); else sh.appendRow(fil);
  const nom = nomsPersones()[String(d.id)] || d.id;
  registrar("persona", d.id, canvis.length ? "Ficha de " + nom + ": " + canvis.join(", ") : "Ficha de " + nom + ": sin cambios", ara);
  return Object.assign({id:String(d.id)}, cur, {savedAt:iso(ara)});
}
