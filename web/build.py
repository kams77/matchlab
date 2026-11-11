"""Assemble web/ en une page unique : app/src/main/assets/index.html (APK) et web/dist/matchlab.html (version web)."""
import os
d=os.path.dirname(os.path.abspath(__file__))
r=lambda f:open(os.path.join(d,f),encoding='utf-8').read()
page=r('head.html')+'<script>\n'+r('engine.js')+'</script>\n<script>\n'+r('ui.js')+'</script>\n'
os.makedirs(os.path.join(d,'dist'),exist_ok=True)
open(os.path.join(d,'dist','matchlab.html'),'w',encoding='utf-8').write(page)
app=('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#1D6A43">\n'
 '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n'
 +page+'</body></html>\n')
open(os.path.join(d,'..','app','src','main','assets','index.html'),'w',encoding='utf-8').write(app)
print('ok',len(page))
