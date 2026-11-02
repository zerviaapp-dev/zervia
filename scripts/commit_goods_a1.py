"""Commit goods rails Phase A-1 onto main@40647a81 as a NEW branch.

Branch: lizzie/goods-rails-a1-2026-10-31
Only the files listed below are overlaid; everything else comes from main.
"""
import os, sys
sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
from dynamic_credentials import add_surrogate_to_request
import json, urllib.request

WORK = os.path.expanduser('~/workspace/zervia-production/app')
BASE = '40647a81f3e2b6beedcc18d2892079a1fd3bcd88'
BRANCH = 'lizzie/goods-rails-a1-2026-10-31'
FILES = [
    'lib/goods-rails.ts',
    'app/api/provider/listings/route.ts',
    'components/provider/ListingForm.tsx',
    'scripts/goods-rails-acceptance.mjs',
] + [f'messages/{l}.json' for l in
     ['en', 'ar', 'es', 'fr', 'ha', 'ig', 'pt', 'tl', 'yo', 'zh']]

ALLOWED = ['api.github.com']

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        'https://api.github.com' + path, data=data,
        headers={'Accept': 'application/vnd.github+json',
                 'User-Agent': 'lizzie-goods-a1',
                 'Content-Type': 'application/json'},
        method=method)
    add_surrogate_to_request(req, 'custom.github', allowed_hosts=ALLOWED)
    resp = urllib.request.urlopen(req, timeout=60)
    return json.load(resp)

base_commit = api('GET', f'/repos/zerviaapp-dev/zervia-app/git/commits/{BASE}')
base_tree = base_commit['tree']['sha']
print('base tree:', base_tree[:12])

tree_entries = []
for f in FILES:
    data = open(os.path.join(WORK, f), 'rb').read()
    blob = api('POST', '/repos/zerviaapp-dev/zervia-app/git/blobs',
               {'content': data.decode('utf-8'), 'encoding': 'utf-8'})
    tree_entries.append({'path': f, 'mode': '100644', 'type': 'blob',
                         'sha': blob['sha']})
    print('blob', f, blob['sha'][:9])

new_tree = api('POST', '/repos/zerviaapp-dev/zervia-app/git/trees',
               {'base_tree': base_tree, 'tree': tree_entries})
print('new tree:', new_tree['sha'][:12])

msg = """Lizzie: goods rails Phase A-1 — category rails enforcement (Oct 31, 2026)

- NEW lib/goods-rails.ts: HIDDEN_CATEGORIES (24, never postable),
  GOODS_SUB_RAILS (11 permitted buy_sell sub-rails), isHiddenCategory /
  isGoodsSubRail / visibleCategoryGroups helpers.
- app/api/provider/listings/route.ts: hidden category -> 422
  (errorCategoryNotAllowed); buy_sell with non-rail subcategory -> 422
  (errorGoodsRail). Retires the old sale-type subcategories for new posts.
- components/provider/ListingForm.tsx: category select renders only
  visible groups (hidden categories gone); buy_sell subcategory select
  offers only the 11 goods rails.
- messages/*.json x10: errorCategoryNotAllowed, errorGoodsRail (Provider),
  11 rail labels (Subcategories) — English fallback per convention.

Verified: 5/5 rails acceptance PASS
(scripts/goods-rails-acceptance.mjs); npx tsc --noEmit clean.

Preview-only. No production merge without owner GO naming the exact SHA."""

commit = api('POST', '/repos/zerviaapp-dev/zervia-app/git/commits',
             {'message': msg, 'tree': new_tree['sha'], 'parents': [BASE]})
print('NEW COMMIT:', commit['sha'])
ref = api('POST', '/repos/zerviaapp-dev/zervia-app/git/refs',
          {'ref': f'refs/heads/{BRANCH}', 'sha': commit['sha']})
print('BRANCH:', ref['ref'])
open(os.path.expanduser('~/workspace/zervia-production/app/GOODS_A1_SHA.txt'),
     'w').write(commit['sha'])
