#!/bin/sh
# Monta mc/apps-script.gs (el puente de Moviment Creatiu)
cd "$(dirname "$0")/.." && cat gs/pont.gs gs/pont_calcul.gs gs/fitxes.gs gs/vistes_calcul.gs gs/vistes_render.gs gs/historic_mc.gs > apps-script.gs && node -e "new Function(require('fs').readFileSync('apps-script.gs','utf8'));console.log('mc/apps-script.gs OK', require('fs').statSync('apps-script.gs').size)"
