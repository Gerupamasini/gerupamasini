# Reference photographs from iNaturalist (research grade; --any: every observation, up to 5 photos each):
#   python3 fetch.py <count> [species,...] [--any]     → $FISH_MEASURE/photos/<species>/<photo id>.jpg, meta.json (attributions)
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import json, sys, urllib.request, urllib.parse, os, time, concurrent.futures as cf
UA={'User-Agent':'HigataZukanShapeRef/0.2 (research)'}
def get(u):
    for k in range(5):
        try: return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
        except Exception as e:
            time.sleep(2*(k+1)); err=e
    raise err
SP={'suzuki':'Lateolabrax japonicus','mejina':'Girella punctata','kisu':'Sillago japonica','magochi':'Platycephalus indicus','hirame':'Paralichthys olivaceus','bora':'Mugil cephalus','sappa':'Sardinella zunasi','konoshiro':'Konosirus punctatus','ishimochi':'Pennahia argentata'}
ANY='--any' in sys.argv
args=[a for a in sys.argv[1:] if a!='--any']
N=int(args[0]) if args else 120
if len(args)>1: SP={k:v for k,v in SP.items() if k in args[1].split(',')}
out=W + '/photos'
meta={}
for tag,name in SP.items():
    t=json.loads(get('https://api.inaturalist.org/v1/taxa?'+urllib.parse.urlencode({'q':name,'per_page':1})))['results'][0]
    urls=[]; page=1
    while len(urls)<N and page<6:
        r=json.loads(get('https://api.inaturalist.org/v1/observations?'+urllib.parse.urlencode({'taxon_id':t['id'],**({} if ANY else {'quality_grade':'research'}),'photos':'true','per_page':100,'page':page,'order_by':'votes'})))
        for o in r['results']:
            for p in o['photos'][:5 if ANY else 2]:
                urls.append((o['id'],p['id'],p['url'].replace('square','large'),p.get('attribution','')))
        if not r['results']: break
        page+=1; time.sleep(1)
    urls=urls[:N]
    os.makedirs(f'{out}/{tag}',exist_ok=True)
    def dl(x):
        oid,pid,u,a=x
        f=f'{out}/{tag}/{pid}.jpg'
        if not os.path.exists(f): open(f,'wb').write(get(u))
        return f
    with cf.ThreadPoolExecutor(6) as ex: files=list(ex.map(dl,urls))
    meta[tag]={'taxon':t['id'],'name':t['name'],'photos':[{'obs':o,'photo':p,'attribution':a} for o,p,u,a in urls]}
    print(tag,t['name'],len(files),flush=True)
old=json.load(open(f'{out}/meta.json')) if os.path.exists(f'{out}/meta.json') else {}
old.update(meta)
json.dump(old,open(f'{out}/meta.json','w'),ensure_ascii=False,indent=1)
