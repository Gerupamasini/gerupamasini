# More reference photographs from Wikimedia Commons (slow: the API is rate-limited):
#   python3 commons.py <species> <search> [<search> ...]
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import json, sys, urllib.request, urllib.parse, os, time
UA={'User-Agent':'HigataZukanShapeRef/0.2 (research; nishizawa)'}
def get(u):
    for k in range(6):
        try: return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
        except urllib.error.HTTPError as e:
            if e.code!=429: raise
            time.sleep(15*(k+1))
    raise RuntimeError('429')
tag=sys.argv[1]; out=f'{W}/photos/{tag}'
n=0
for q in sys.argv[2:]:
    r=json.loads(get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','generator':'search','gsrsearch':q+' filetype:bitmap','gsrnamespace':6,'gsrlimit':40,'prop':'imageinfo','iiprop':'url','iiurlwidth':1024,'format':'json'})))
    for p in (r.get('query',{}).get('pages',{}) or {}).values():
        ii=p.get('imageinfo',[{}])[0]; u=ii.get('thumburl')
        if not u: continue
        f=f"{out}/c{p['pageid']}.jpg"
        if os.path.exists(f): continue
        try: open(f,'wb').write(get(u)); n+=1
        except Exception as e: print('ERR',e)
        time.sleep(1.5)
    time.sleep(3)
print(tag,n)
