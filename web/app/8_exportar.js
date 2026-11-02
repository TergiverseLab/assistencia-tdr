// ===== 8. EXPORTAR a Excel según lo que se está mirando en Resumen =====
// "Todas las temporadas" → la hoja de Google entera (la de verdad). Una temporada o un grupo → un Excel solo con eso,
// hecho aquí mismo con los mismos números que se ven en pantalla. La librería (SheetJS) se carga solo al pulsar.
let xlsxP=null;
function cargarXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(!xlsxP) xlsxP=new Promise((ok,ko)=>{ const s=document.createElement("script"); s.src="lib/xlsx.mini.min.js";
    s.onload=()=>ok(window.XLSX); s.onerror=()=>{ xlsxP=null; s.remove(); ko(new Error("red")); }; document.head.append(s); });
  return xlsxP;
}
function etiquetaCtx(){ if(ctx.season==="all") return "Todas las temporadas"; const l=seasonLabel(ctx.season); return ctx.group!=="all" ? l.replace(/^(\S+)/,"$1 "+ctx.group) : l; }
function updExport(){
  const todo=ctx.season==="all";
  $("r-xlsx").textContent = todo ? "Descargar la hoja maestra (Excel)" : "Descargar Excel simplificado · "+etiquetaCtx().split(" · ")[0];
  $("r-xlsx").href = todo ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx` : "#";
  $("r-xlsx").target = todo ? "_blank" : "";
  $("r-exnote").textContent = todo
    ? "La hoja maestra «Assistència i quotes TdR» entera, con sus pestañas para mirar (Inici, Participants, Assistència, Quotes) y los datos. Hace falta tener acceso con tu cuenta de Google."
    : `Excel sencillo, sin el diseño de la hoja maestra: solo ${etiquetaCtx()}, en tablas (resumen, sesiones, asistencia por persona, cuotas), con los mismos números que ves aquí. La versión con diseño es la hoja maestra: elige «Todas las temporadas» o ábrela abajo.`;
}
// Las mismas cuentas que Resumen, en tablas
function tablasCtx(){
  const nm=k=>(data.persons[k]||{name:k}).name; const r1=v=>Math.round(v*10)/10;
  const ids=Object.keys(data.sessions).filter(inCtxSession).sort((a,b)=>(data.sessions[a].date||a).localeCompare(data.sessions[b].date||b)||a.localeCompare(b));
  const gente=new Set(); ids.forEach(id=>data.sessions[id].present.forEach(p=>gente.add(p)));
  const months=Object.keys(data.pagos).filter(inCtxMonth).sort();
  if(ctx.group==="all") months.forEach(m=>Object.keys(data.pagos[m].rows||{}).forEach(p=>gente.add(p)));
  const asis=ids.map(id=>sesAsistencia(id,ctx.group)).filter(v=>v!=null); const media=asis.length?asis.reduce((a,b)=>a+b,0)/asis.length:0;
  const probes=new Set(); ids.forEach(id=>(data.sessions[id].others||[]).forEach(o=>probes.add(o.toLowerCase())));
  const conLista=ids.filter(sesConLista); const counts={}; conLista.forEach(id=>data.sessions[id].present.forEach(k=>counts[k]=(counts[k]||0)+1));
  const pagRows=m=>{ const rows=data.pagos[m].rows||{}; return Object.keys(rows).filter(p=>ctx.group==="all"||gente.has(p)); };
  // Resumen
  const resum=[["Teatre dels Records · "+etiquetaCtx()],[],
    ["Sesiones",ids.length],["Participantes",gente.size],["Media de asistentes por sesión",r1(media)],["Personas que vinieron a probar",probes.size]];
  if(months.length){ resum.push([],["Mes","Inscritas","Cuotas (€)"]); months.forEach(m=>{ const ps=pagRows(m); resum.push([monthName(m),ps.length,ps.reduce((a,p)=>a+(data.pagos[m].rows[p].amount||0),0)]); }); }
  resum.push([],["Descargado el "+fmt(todayISO())+" desde la web de asistencia"]);
  // Sesiones
  const conGrupo=ids.some(id=>data.sessions[id].group);
  const sesiones=[["Fecha"].concat(conGrupo?["Grupo"]:[],["Asistentes"])].concat(ids.map(id=>{ const s=data.sessions[id]; return [fmt(s.date||id)].concat(conGrupo?[s.group||""]:[],[Math.round(sesAsistencia(id,ctx.group)||0)]); }));
  // Asistencia por persona (solo sesiones con lista)
  let porPersona=null;
  if(conLista.length){
    const quien=Object.keys(counts).sort((a,b)=>nm(a).localeCompare(nm(b),"es"));
    porPersona=[["Persona"].concat(conLista.map(id=>fmt(data.sessions[id].date||id).slice(0,5)),["Total"])];
    quien.forEach(k=>porPersona.push([nm(k)].concat(conLista.map(id=>data.sessions[id].present.includes(k)?"X":""),[counts[k]])));
    porPersona.push(["Asistentes"].concat(conLista.map(id=>sesAsistencia(id,ctx.group)),[""]));
  }
  // Cuotas: persona × mes
  let cuotas=null;
  if(months.length){
    const quien=[...new Set(months.flatMap(pagRows))].sort((a,b)=>nm(a).localeCompare(nm(b),"es"));
    if(quien.length){
      cuotas=[["Persona"].concat(months.map(shortMonth),["Total (€)"])];
      quien.forEach(k=>{ const v=months.map(m=>{ const r=(data.pagos[m].rows||{})[k]; return r?(r.amount||0):""; }); cuotas.push([nm(k)].concat(v,[v.reduce((a,x)=>a+(Number(x)||0),0)])); });
      const tot=months.map(m=>pagRows(m).reduce((a,p)=>a+(data.pagos[m].rows[p].amount||0),0)); cuotas.push(["Total"].concat(tot,[tot.reduce((a,b)=>a+b,0)]));
    }
  }
  return {resum, sesiones, porPersona, cuotas};
}
async function exportarCtx(){
  const b=$("r-xlsx"), txt=b.textContent; b.textContent="Preparando el Excel…";
  try{
    const X=await cargarXLSX(); const t=tablasCtx(); const wb=X.utils.book_new();
    const hoja=(aoa,nombre,anchos)=>{ const ws=X.utils.aoa_to_sheet(aoa); ws["!cols"]=anchos.map(w=>({wch:w})); X.utils.book_append_sheet(wb,ws,nombre); };
    hoja(t.resum,"Resumen",[34,12,12]);
    hoja(t.sesiones,"Sesiones",t.sesiones[0].length>2?[12,10,11]:[12,11]);
    if(t.porPersona) hoja(t.porPersona,"Asistencia por persona",[24].concat(t.porPersona[0].slice(1).map(()=>6)));
    if(t.cuotas) hoja(t.cuotas,"Cuotas",[24].concat(t.cuotas[0].slice(1).map(()=>9)));
    const nombre=("TdR_"+ctx.season+(ctx.group!=="all"?"_"+ctx.group:"")).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^\w-]+/g,"_")+"_"+todayISO()+".xlsx";
    X.writeFile(wb,nombre); b.textContent=txt;
  }catch(e){ b.textContent=txt; banner("No se ha podido preparar el Excel. Comprueba la conexión y vuelve a probar.","err"); }
}
$("r-xlsx").addEventListener("click",e=>{ if(ctx.season==="all") return; e.preventDefault(); exportarCtx(); });
