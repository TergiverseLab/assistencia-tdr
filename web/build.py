"""Ensambla la página: style.css + page.html + store.js + app.js -> un solo HTML.
   build.py            -> /home/claude/assistencia.html (versión Claude, sin skeleton)
   build.py github URL -> /home/claude/gh/index.html   (versión GitHub, documento completo, SHEET_URL = URL)"""
import base64, pathlib, sys
S = pathlib.Path(__file__).parent; SRC = S/"src"
def b64(n): return "data:image/png;base64," + base64.b64encode((S/"logos"/n).read_bytes()).decode()
mode = sys.argv[1] if len(sys.argv)>1 else "claude"
sheet = sys.argv[2] if len(sys.argv)>2 else ""
css = (SRC/"style.css").read_text().replace("{{TDR_BLACK}}", b64("tdr_black.png")).replace("{{LF_BLACK}}", b64("lf_black.png"))
page = (SRC/"page.html").read_text()
import datetime
ver = datetime.datetime.now().strftime("%d/%m %H:%M:%S")
mods = sorted((SRC/"app").glob("*.js"))  # módulos de la página, en orden: 1_base, 2_lista, …
js = (SRC/"store.js").read_text().replace("{{SHEET_URL}}", sheet) + "\n(function(){\n" + "\n".join(m.read_text() for m in mods).replace("{{VERSION}}", ver) + "\n})();\n"
head = ('<title>Assistència Teatre dels Records</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poiret+One&family=Josefin+Sans:wght@400;600;700&family=Source+Sans+3:wght@400;600&display=swap">\n'
        '')
body = head + "<style>\n" + css + "</style>\n" + page + "\n<script>\n" + js + "</script>\n"
if mode == "claude":
    out = pathlib.Path("/home/claude/assistencia.html"); out.write_text(body)
else:
    out = pathlib.Path("/home/claude/gh/index.html"); out.parent.mkdir(exist_ok=True)
    out.write_text('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
                   '<meta name="theme-color" content="#ffffff">\n<link rel="manifest" href="manifest.json">\n<link rel="icon" type="image/png" href="icons/favicon.png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Assistència TdR">\n' + body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','') .replace("</style>\n","</style>\n</head>\n<body>\n",1) + "</body>\n</html>\n")
print(out, len(out.read_text()))
