import json
from pathlib import Path

bundle = Path('/tmp/rinovabd-worker-dist/index.js').read_text()
metadata = {
    'main_module': 'index.js',
    'bindings': [
        {'type': 'kv_namespace', 'name': 'CACHE', 'namespace_id': '6386fcba4d63483c9766bef527a65593'},
        {'type': 'd1', 'name': 'DB', 'id': '300aea86-ac31-46b9-aec4-2314f1a78b01'},
        {'type': 'ai', 'name': 'AI'},
        {'type': 'plain_text', 'name': 'SHOP_NAME', 'text': 'Rinova BD'},
        {'type': 'plain_text', 'name': 'SHOP_PHONE', 'text': '01522105710'},
        {'type': 'plain_text', 'name': 'SHOP_ADDRESS', 'text': 'Rajshahi Malopara Police Fhari, Rajshahi, Bangladesh - 6100'},
    ],
}
boundary = 'RINOVA_UPLOAD_BOUNDARY_2026'
parts = [
    f'--{boundary}',
    'Content-Disposition: form-data; name="metadata"',
    'Content-Type: application/json',
    '',
    json.dumps(metadata),
    f'--{boundary}',
    'Content-Disposition: form-data; name="index.js"; filename="index.js"',
    'Content-Type: application/javascript+module',
    '',
    bundle,
    f'--{boundary}--',
]
body = '\r\n'.join(parts)
Path('/tmp/rinovabd-worker-upload.json').write_text(json.dumps({
    'code': f'async () => {{ const body = {json.dumps(body)}; return cloudflare.request({{method: "PUT", path: `/accounts/${{accountId}}/workers/scripts/rinovabd-worker`, body, contentType: "multipart/form-data; boundary={boundary}", rawBody: true}}); }}'
}))
print('/tmp/rinovabd-worker-upload.json')
