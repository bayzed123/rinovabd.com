from pathlib import Path
import sys

try:
    import yaml
except ImportError:
    print('PyYAML is unavailable; workflow marker checks will still run in the doctor script.')
    raise SystemExit(0)

root = Path(__file__).resolve().parents[1]
path = root / '.github' / 'workflows' / 'doctor.yml'
data = yaml.safe_load(path.read_text(encoding='utf-8'))
if not isinstance(data, dict):
    raise SystemExit('doctor.yml is not a YAML mapping')
if 'name' not in data or 'jobs' not in data or 'workflow_dispatch' not in data.get('on', {}):
    raise SystemExit('doctor.yml must contain name, on.workflow_dispatch, and jobs')
doctor = data['jobs'].get('doctor', {})
if doctor.get('defaults', {}).get('run', {}).get('working-directory') != '${{ github.workspace }}':
    raise SystemExit('doctor job must run from ${{ github.workspace }}')
if not any(step.get('run') == 'node scripts/rinova-doctor.mjs' for step in doctor.get('steps', []) if isinstance(step, dict)):
    raise SystemExit('doctor job must run scripts/rinova-doctor.mjs')
print(f'Workflow YAML validation passed: {path}')
