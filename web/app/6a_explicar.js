// ===== 6a. HISTORIAL EN CLARO: cada línea del registro se explica con un título y qué se hizo =====
// El registro de la hoja guarda frases cortas ("Sesión del 04/11/2026: +Ana León · 12 personas"). Aquí se
// reescriben para leerlas de un vistazo: "Asistencia · miércoles 04/11/2026" / "Han venido: Ana León" / "Total: 12".
const trozos = t => t ? t.split(", ").map(x=>x.trim()).filter(Boolean) : [];
function diaDe(dmy){ const [d,m,y]=dmy.split("/"); const x=new Date(`${y}-${m}-${d}T12:00:00`); return isNaN(x)?dmy:`${DIAS[x.getDay()]} ${dmy}`; }
function explicarRegistro(r){
  const t=String(r.text||""); let m;
  if((m=t.match(/^Sesión del (\d\d\/\d\d\/\d{4})(?: \(grupo ([^)]+)\))?: (.*) · (\d+) personas$/))){
    const ps=m[3]==="sin cambios en la lista"?[]:trozos(m[3]);
    const vino=ps.filter(x=>x[0]==="+").map(x=>x.slice(1)), fuera=ps.filter(x=>x[0]==="−").map(x=>x.slice(1));
    const det=[]; if(vino.length) det.push(`Marcadas como presentes: ${vino.join(", ")}`); if(fuera.length) det.push(`Quitadas de la lista: ${fuera.join(", ")}`);
    if(!det.length) det.push("Guardada sin cambios en la lista");
    det.push(`Total de la sesión: ${m[4]} ${m[4]==="1"?"persona":"personas"}`);
    return {titulo:`Asistencia · ${diaDe(m[1])}${m[2]?" · grupo "+m[2]:""}`, det};
  }
  if((m=t.match(/^Pagos de (.+?): (.*)$/))){
    const ps=m[2]==="sin cambios"?[]:trozos(m[2]); const det=[];
    const pag=ps.filter(x=>x[0]==="+").map(x=>x.slice(1).replace(/ (\d+(?:[.,]\d+)?) €$/," ($1 €)"));
    const qui=ps.filter(x=>x[0]==="−").map(x=>x.slice(1));
    const cam=ps.filter(x=>x[0]!=="+"&&x[0]!=="−").map(x=>x.replace(/ (\d+(?:[.,]\d+)?) → (\d+(?:[.,]\d+)?) €$/,": de $1 € a $2 €"));
    if(pag.length) det.push(`Cuota pagada: ${pag.join(", ")}`); if(qui.length) det.push(`Pago quitado: ${qui.join(", ")}`); if(cam.length) det.push(`Importe corregido: ${cam.join("; ")}`);
    if(!det.length) det.push("Guardadas sin cambios");
    return {titulo:`Cuotas · ${m[1]}`, det};
  }
  if((m=t.match(/^Mes (cerrado|reabierto): (.+)$/))) return {titulo:`Cuotas · ${m[2]}`, det:[m[1]==="cerrado"?"Mes cerrado: ya no se pueden tocar sus cuotas sin desbloquear":"Mes reabierto para corregir"]};
  if((m=t.match(/^Ficha de (.+?): (.*)$/))) return {titulo:`Datos personales · ${m[1]}`, det:[m[2]==="sin cambios"?"Guardados sin cambios":`Actualizado: ${m[2]}`]};
  if((m=t.match(/^Sesión borrada: (\d{4}-\d\d-\d\d)(-\w+)?$/))) return {titulo:`Asistencia · ${diaDe(fmt(m[1]))}`, det:["Sesión borrada"]};
  if((m=t.match(/^Sesión borrada: (.+)$/))) return {titulo:"Asistencia", det:[`Sesión borrada: ${m[1]}`]};
  // personas: puede haber varios cambios separados por " · "
  const partes=t.split(" · "), det=[]; let quien="";
  for(const x of partes){
    if((m=x.match(/^Alta: (.+)$/))){ quien=m[1]; det.push("Alta nueva en el taller"); }
    else if((m=x.match(/^Baja: (.+)$/))){ quien=m[1]; det.push("Dada de baja (conserva su historial)"); }
    else if((m=x.match(/^Vuelve a estar activa: (.+)$/))){ quien=m[1]; det.push("Vuelve a estar activa"); }
    else if((m=x.match(/^Nombre cambiado: (.+) → (.+)$/))){ quien=m[2]; det.push(`Nombre corregido (antes: ${m[1]})`); }
    else if((m=x.match(/^Socia (\S+): (.+) \((\d+(?:[.,]\d+)?) €\)$/))){ quien=m[2]; det.push(`Ahora es socia de la asociación (${m[3]} €)`); }
    else if((m=x.match(/^Socia (\S+) quitada: (.+)$/))){ quien=m[2]; det.push("Ya no consta como socia de la asociación"); }
    else if((m=x.match(/^Persona (.+): sin cambios$/))){ quien=m[1]; det.push("Guardada sin cambios"); }
    else return {titulo:"", det:[t]};
  }
  return {titulo:`Personas · ${quien}`, det};
}
