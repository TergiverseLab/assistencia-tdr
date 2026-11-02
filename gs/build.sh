#!/bin/sh
# Monta apps-script.gs (el archivo que se pega en Apps Script) a partir de los módulos
cd "$(dirname "$0")/.." && cat gs/pont.gs gs/pont_calcul.gs gs/fitxes.gs gs/vistes_calcul.gs gs/vistes_render.gs gs/historic.gs > apps-script.gs && node -e "new Function(require('fs').readFileSync('apps-script.gs','utf8'));console.log('apps-script.gs OK', require('fs').statSync('apps-script.gs').size)"
