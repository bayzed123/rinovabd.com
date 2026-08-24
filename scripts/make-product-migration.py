import json
from pathlib import Path

sql = Path('/home/ubuntu/rinovabd.com/worker/migrations/0003-user-product-catalog.sql').read_text()
Path('/tmp/rinovabd-product-migration.json').write_text(json.dumps({
    'code': f'async () => {{ const sql = {json.dumps(sql)}; return cloudflare.request({{method: "POST", path: `/accounts/${{accountId}}/d1/database/300aea86-ac31-46b9-aec4-2314f1a78b01/query`, body: {{sql}}}}); }}'
}))
print('/tmp/rinovabd-product-migration.json')
