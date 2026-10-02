# Prints the three country matrices in the terminal. C confirmed, D declared live, h half credit, . not found.
import json, os
root = os.path.join(os.path.dirname(__file__), '..', 'data')
ed = json.load(open(os.path.join(root, 'editors.json')))
mk = json.load(open(os.path.join(root, 'markets.json')))
cn = json.load(open(os.path.join(root, 'connections.json')))
W = {'dominant': 3, 'important': 2, 'secondary': 1}
def cr(c): return 0 if not c else 1 if c['status'] == 'confirmed' else .5 if c['kind'] in ('file_export', 'unknown') else 1
idx = {(c['editorId'], c['softwareId']): c for c in cn}
sym = lambda c: '.' if not c else 'C' if c['status'] == 'confirmed' else 'h' if cr(c) == .5 else 'D'
for co in ['FR', 'DE', 'BE']:
    ms = sorted([m for m in mk if m['country'] == co], key=lambda m: -W[m['importance']])
    print('\n' + co.ljust(15) + ' '.join(m['softwareId'][:9].ljust(9) for m in ms))
    rows = []
    for e in ed:
        tot = sum(W[m['importance']] for m in ms)
        got = sum(cr(idx.get((e['id'], m['softwareId']))) * W[m['importance']] for m in ms)
        rows.append((round(100 * got / tot), e['id'], ' '.join(sym(idx.get((e['id'], m['softwareId']))).ljust(9) for m in ms)))
    for r in sorted(rows, reverse=True): print(f"{r[1]:10s}{r[0]:3d}  {r[2]}")
    print(f"average   {round(sum(r[0] for r in rows) / len(rows)):3d}")
