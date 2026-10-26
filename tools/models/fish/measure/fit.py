# One step of fitting a species' dorsal / ventral profile tables to the photographs' median silhouette:
#   table(s) += k · (photo(s) − model body(s)), smoothed over ±3 % TL, skipping the stretches named with --exT / --exB
#   (where the photographs' fins or a hanging pelvic fin widen the outline), interpolated across them.
import os
W = os.environ.get('FISH_MEASURE', '/tmp/fish-measure')  # work folder: photos, masks, renders (not in the repository)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
import sys, re, json, numpy as np
SP, NAME = sys.argv[1], sys.argv[2]; K = float(sys.argv[3]) if len(sys.argv) > 3 else 0.8
def ranges(flag):
    if flag not in sys.argv: return []
    v = sys.argv[sys.argv.index(flag) + 1]
    return [tuple(float(x) for x in r.split('-')) for r in v.split(',') if r]
exT, exB = ranges('--exT'), ranges('--exB')
fuT, fuB = ranges('--fullT'), ranges('--fullB')
src = open(REPO + '/src/creatures/fish/species.ts').read()
i = src.index(f'const {NAME}: FishSpec'); j = src.index('\n};', i); blk = src[i:j]
def table(key):
    m = re.search(r"\n  " + key + r": (\[\[.*?\]\]),\n", blk); return json.loads(m.group(1)), m
top, mt = table('top'); bot, mb = table('bot')
cb = float(re.search(r"caudalBase: ([0-9.]+)", blk).group(1))
ph = json.load(open(f'{W}/agg_{SP}_side.json'))
mo = json.load(open(W + '/model/norm/' + SP + '.json'))[f'{SP}_sidebody']
B = len(ph['top']); s_ = (np.arange(B) + 0.5) / B
P = lambda arr: np.array([np.nan if v is None else v for v in arr])
dT, dB = P(ph['top']) - P(mo['top']), P(ph['bot']) - P(mo['bot'])
# where the photographs' fins are as opaque as the body (--fullT / --fullB), the model's whole outline is compared
mf = json.load(open(W + '/model/norm/' + SP + '.json'))[f'{SP}_side']
for rr, d, key in ((fuT, dT, 'top'), (fuB, dB, 'bot')):
    for a, b in rr:
        sel = (s_ > a) & (s_ < b)
        d[sel] = (P(ph[key]) - P(mf[key]))[sel]
def mask(ex, d):
    m = np.zeros(B, bool)
    for a, b in ex: m |= (s_ > a) & (s_ < b)
    return ~m & (s_ < cb - 0.005) & (s_ > 0.004) & ~np.isnan(d)
okT, okB = mask(exT, dT), mask(exB, dB)
def corr(d, ok, ex, s):
    xs, ys = s_[ok], d[ok]
    near = np.abs(xs - s) < 0.03
    if near.sum() >= 3 and not any(a < s < b for a, b in ex): return float(ys[near].mean())
    return float(np.interp(s, xs, ys))
def upd(tab, d, ok, ex):
    out = []
    for s, v in tab:
        c = corr(d, ok, ex, min(max(s, 0.006), cb - 0.01))
        out.append([s, round(max(0.002, v + K * c), 4)])
    return out
nt, nb = upd(top, dT, okT, exT), upd(bot, dB, okB, exB)
print('dTop', ' '.join(f'{corr(dT, okT, exT, min(max(s, 0.006), cb - 0.01)):+.3f}' for s, _ in top))
print('dBot', ' '.join(f'{corr(dB, okB, exB, min(max(s, 0.006), cb - 0.01)):+.3f}' for s, _ in bot))
f = lambda t: '[' + ', '.join(f'[{a:g}, {b:g}]' for a, b in t) + ']'
blk2 = blk.replace(mt.group(1), f(nt), 1).replace(mb.group(1), f(nb), 1)
if '--write' in sys.argv:
    open(REPO + '/src/creatures/fish/species.ts', 'w').write(src[:i] + blk2 + src[j:])
