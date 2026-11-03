// ===== 5. RESUMEN y filtros de temporada/grupo =====
function bars(el, items, fmtV){ // items: [{label, value, short?}], una sola serie, barras verticales
  if(!items.length){ el.innerHTML=""; return; }
  const W=360,H=150,top=22,bottom=28,left=6,right=6; const n=items.length;
  const max=Math.max(...items.map(i=>i.value),1); const bw=Math.min(40,(W-left-right)/n-4); const step=(W-left-right)/n;
  const y=v=>top+(H-top-bottom)*(1-v/max);
  // Hasta 12 barras: cada una con su cifra y su etiqueta. Con más, las cifras solo en la más alta y en la última,
  // y las etiquetas repartidas; nunca se queda sin cifra la barra más alta.
  const todas=n<=12, apretado=n>8, every=Math.ceil(n/8), iMax=items.findIndex(i=>i.value===max);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica"${apretado?' class="apretada"':""}>`;
  s+=`<line x1="${left}" x2="${W-right}" y1="${H-bottom}" y2="${H-bottom}"/>`;
  items.forEach((it,i)=>{ const x=left+step*i+(step-bw)/2; const yy=y(it.value); const h=H-bottom-yy; const cx=(x+bw/2).toFixed(1);
    s+=`<rect class="bar" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h,0).toFixed(1)}" rx="3"><title>${esc(it.label)}: ${esc(fmtV(it.value))}</title></rect>`;
    if(todas || i===iMax || i===n-1) s+=`<text class="v" x="${cx}" y="${(yy-5).toFixed(1)}" text-anchor="middle">${esc(fmtV(it.value))}</text>`;
    if(todas || i%every===0 || i===n-1) s+=`<text x="${cx}" y="${H-bottom+16}" text-anchor="middle">${esc(apretado&&it.short?it.short:it.label)}</text>`;
  });
  el.innerHTML=s+"</svg>";
}
// FILTRO COMÚN: una sola selección (temporada + grupo) compartida por Personas y Resumen
const ctx={season:null,group:"all"};
function ctxSeasons(){ const set=new Set([...Object.keys(data.sessions).map(sesSeason),...Object.keys(data.pagos).map(seasonOf)]); Object.values(data.persons).forEach(p=>{ if(p.active!==false) set.add(curSeasonKey()); }); return [...set].sort().reverse(); }
// Un solo desplegable: las temporadas con dos grupos (la T1) salen ya separadas: "T1 matí", "T1 tarda".
function gruposDe(season){ const g=new Set(); Object.keys(data.sessions).forEach(k=>{ if(sesSeason(k)===season && data.sessions[k].group) g.add(data.sessions[k].group); }); return [...g].sort(); }
function opcionesCtx(){ const o=[]; ctxSeasons().forEach(s=>{ const gs=gruposDe(s);
  if(gs.length>1) gs.forEach(g=>o.push({v:s+"|"+g, l:seasonLabel(s).replace(/^(\S+)/,"$1 "+g)})); else o.push({v:s, l:seasonLabel(s)}); }); return o; }
let multiGroup=false;
function renderCtx(){
  const ops=opcionesCtx();
  if(ctx.season===null){ const v=ops.find(o=>o.v.split("|")[0]===curSeasonKey()); const x=(v||ops[0]||{v:"all"}).v.split("|"); ctx.season=x[0]; ctx.group=x[1]||"all"; }
  const val = ctx.season==="all" ? "all" : (ctx.group!=="all" ? ctx.season+"|"+ctx.group : ctx.season);
  if(ctx.season!=="all" && ctx.group==="all" && gruposDe(ctx.season).length>1){ ctx.group=gruposDe(ctx.season)[0]; } // la T1 siempre por grupo
  multiGroup=false;
  document.querySelectorAll('select[data-ctx="season"]').forEach(sel=>{ sel.innerHTML='<option value="all">Todas las temporadas</option>'+ops.map(o=>`<option value="${esc(o.v)}">${esc(o.l)}</option>`).join("");
    sel.value = ctx.season==="all" ? "all" : (ctx.group!=="all" ? ctx.season+"|"+ctx.group : ctx.season); });
  document.querySelectorAll('[data-ctx-groupwrap]').forEach(w=>w.hidden=true);
}
document.querySelectorAll('select[data-ctx="season"]').forEach(sel=>sel.addEventListener("change",()=>{ const x=sel.value.split("|"); ctx.season=x[0]; ctx.group=x[1]||"all"; renderCtx(); if(vistaActual==="pers") renderPersons(); if(vistaActual==="res") renderSummary(); }));
const inCtxSession = k => (ctx.season==="all"||sesSeason(k)===ctx.season) && (ctx.group==="all"||sesGroup(k)===ctx.group||(!data.sessions[k].group&&sesSeason(k)==="T1")); // T1: los ensayos sin grupo salen en los dos
const inCtxMonth = ym => ctx.season==="all"||seasonOf(ym)===ctx.season;
function renderSummary(){
  renderCtx(); updExport();
  const ids=Object.keys(data.sessions).filter(inCtxSession).sort((a,b)=>(data.sessions[a].date||a).localeCompare(data.sessions[b].date||b)||a.localeCompare(b)); const n=ids.length;
  $("r-noses").hidden=n>0; $("r-noses").textContent = Object.keys(data.sessions).length ? `Todavía no hay sesiones guardadas en ${seasonLabel(ctx.season)}${ctx.group!=="all"?" · grup "+ctx.group:""}. Elige otra temporada arriba para ver las anteriores.` : "Todavía no se ha pasado lista ninguna vez. Las sesiones aparecerán aquí a partir de la primera que guardes."; $("r-tiles").hidden=n===0;
  // participantes: quien vino a alguna sesión o pagó algún mes de la selección
  const gente=new Set(); ids.forEach(id=>data.sessions[id].present.forEach(p=>gente.add(p)));
  if(ctx.group==="all") Object.keys(data.pagos).filter(inCtxMonth).forEach(m=>Object.keys(data.pagos[m].rows||{}).forEach(p=>gente.add(p)));
  const asis=ids.map(id=>sesAsistencia(id,ctx.group)).filter(v=>v!=null); const media=asis.length?asis.reduce((a,b)=>a+b,0)/asis.length:0;
  $("r-sess").textContent=n; $("r-avg").textContent=asis.length?media.toFixed(1).replace(".",","):"–"; $("r-new").textContent=gente.size;
  const probes=new Set(); ids.forEach(id=>(data.sessions[id].others||[]).forEach(o=>probes.add(o.toLowerCase())));
  $("r-probes").hidden=!probes.size; $("r-probes").textContent=`${probes.size} ${probes.size===1?"persona ha":"personas han"} venido a probar.`;
  bars($("r-chart-ses"), ids.map(id=>({label:fmt(data.sessions[id].date||id).slice(0,5)+(multiGroup&&data.sessions[id].group?" "+data.sessions[id].group[0]:""), value:Math.round(sesAsistencia(id,ctx.group)||0)})), v=>String(v));
  // por persona: solo sesiones con lista real
  const conLista=ids.filter(sesConLista); const counts={}; conLista.forEach(id=>data.sessions[id].present.forEach(k=>counts[k]=(counts[k]||0)+1));
  $("r-tit").textContent = "Asistencia · " + (typeof etiquetaCtx==="function" ? etiquetaCtx() : seasonLabel(ctx.season));
  // lista de sesiones: fecha y personas
  const ts=$("r-sestable").querySelector("tbody"); ts.innerHTML="";
  ids.forEach(id=>{ const s=data.sessions[id], d=s.date||id, x=new Date(d+"T12:00:00"); const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(DIAS[x.getDay()]||"")} ${esc(fmt(d))}${multiGroup&&s.group?" · "+esc(s.group):""}</td><td class="n">${Math.round(sesAsistencia(id,ctx.group)||0)}</td>`; ts.append(tr); });
  const nm=k=>(data.persons[k]||{name:k}).name;
  const tb=$("r-table").querySelector("tbody"); tb.innerHTML="";
  $("r-wrap").hidden=!conLista.length; $("r-nolista").hidden=!!conLista.length||!n;
  const hayGente=Object.keys(counts).length>0; $("r-nolista").hidden=true; $("r-perstit").hidden=!hayGente; $("r-wrap").hidden=!hayGente;   // solo si hay alguien en alguna lista   // sin listas por persona: esta parte no sale
  Object.keys(counts).sort((a,b)=>counts[b]-counts[a]||nm(a).localeCompare(nm(b),"es")).forEach(k=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${esc(nm(k))}</td><td class="n">${counts[k]} de ${conLista.length}</td>`; tb.append(tr); });
  $("r-tablenote").textContent="";   // sin notas: la tabla habla sola
  const months=Object.keys(data.pagos).filter(inCtxMonth).sort(); // de más antiguo a más reciente
  const tp=$("r-pagos").querySelector("tbody"); tp.innerHTML="";
  const mi=months.map(m=>{ const rows=data.pagos[m].rows||{}; const t=Object.values(rows).reduce((a,x)=>a+(x.amount||0),0); const tr=document.createElement("tr"); tr.innerHTML=`<td>${monthName(m)}</td><td class="n">${Object.keys(rows).length}</td><td class="n">${t} €</td>`; tp.append(tr); return {label:shortMonth(m),short:MESES[+m.slice(5,7)-1].slice(0,3),value:t}; });
  bars($("r-chart-pag"), mi, v=>v+" €");
  const sKey = (ctx.season==="all"||!SEASONS.find(s=>s.id===ctx.season)) ? curSeasonKey() : ctx.season; const socias=Object.values(data.persons).filter(p=>isSocia(p,sKey));
  $("r-socias").hidden=!socias.length; $("r-socias").textContent = socias.length ? `Socias de la asociación ${sKey}: ${socias.length} (${socias.reduce((a,p)=>a+(p.socia[sKey].amount||0),0)} € en cuotas de socia).` : `Todavía no hay socias de la asociación registradas en la temporada ${sKey}.`;
}

// "Abrir la hoja" = la hoja de Google de verdad. "Descargar Excel" depende de lo que se mire: ver 8_exportar.js
const SHEET_ID="1yTIa_RV2Yb_k9BLf40xuxZcDD9t2EzukTQco4fAoj9A";
$("r-open").href=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

