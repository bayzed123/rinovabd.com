from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / '.github' / 'workflows' / 'rinovabd-ci-cd.yml'
text = path.read_text()
required = [
    'name: Rinova BD CI/CD',
    'pull_request:',
    'push:',
    'workflow_dispatch:',
    'jobs:',
    'validate:',
    'deploy:',
    'pnpm install --frozen-lockfile',
    'pnpm build',
    'cloudflare/wrangler-action@v3',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'STEADFAST_API_KEY',
    'STEADFAST_SECRET_KEY',
    'STEADFAST_WEBHOOK_TOKEN',
    'ADMIN_API_TOKEN',
]
missing = [item for item in required if item not in text]
if missing:
    print('Missing workflow markers:', ', '.join(missing))
    sys.exit(1)
if 'CLOUDFLARE_ACCOUNT_SUBDOMAIN' in text:
    print('Unexpected deprecated subdomain secret found')
    sys.exit(1)
print(f'Workflow validation passed: {path}')
