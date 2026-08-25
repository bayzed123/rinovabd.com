from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / '.github' / 'workflows' / 'doctor.yml'
workflow_text = path.read_text(encoding='utf-8')
required_markers = (
    'name: Rinova BD Doctor', 'on:', 'workflow_dispatch:', 'working-directory: .',
    'scripts/rinova-doctor.mjs', 'DOCTOR_REPORT_DIR:', 'Doctor-report/runs/', 'actions/upload-artifact@v4',
)
missing = [marker for marker in required_markers if marker not in workflow_text]
if missing:
    raise SystemExit(f'doctor.yml is missing markers: {", ".join(missing)}')
if '/home/ubuntu/rinovabd.com' in workflow_text or 'C:\\Users\\' in workflow_text:
    raise SystemExit('doctor.yml contains a developer-specific absolute path')
try:
    import yaml
except ImportError:
    print(f'Workflow YAML marker validation passed without PyYAML: {path}')
else:
    data = yaml.safe_load(workflow_text)
    if not isinstance(data, dict) or 'jobs' not in data or 'workflow_dispatch' not in data.get('on', {}):
        raise SystemExit('doctor.yml must contain name, on.workflow_dispatch, and jobs')
    doctor = data['jobs'].get('doctor', {})
    if doctor.get('defaults', {}).get('run', {}).get('working-directory') != '.':
        raise SystemExit('doctor job must run from the checked-out repository root')
    if not any(step.get('run') == 'node scripts/rinova-doctor.mjs' for step in doctor.get('steps', []) if isinstance(step, dict)):
        raise SystemExit('doctor job must run scripts/rinova-doctor.mjs')
    print(f'Workflow YAML validation passed: {path}')
