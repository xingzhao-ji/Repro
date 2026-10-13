#!/usr/bin/env python3
"""Dependency-free starter-kit structural checks, not full product verification."""
from pathlib import Path
import json
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
errors = []
required = ['README.md', 'GOAL.md', 'AGENTS.md', 'STATE.md', 'docs/PRODUCT.md',
'docs/ARCHITECTURE.md', 'docs/SECURITY.md', 'docs/ACCEPTANCE.md', 'docs/DESIGN.md',
'docs/PROMPTING-RESEARCH.md', 'docs/METRICS.md', 'docs/DEPENDENCIES.md',
'benchmarks/PROTOCOL.md', 'schemas/capsule.schema.json', 'schemas/run-result.schema.json',
'fixtures/README.md', 'assets/prototype.html', 'assets/tokens.css', 'assets/UI-BRIEF.md',
'prompts/design-review.md', 'prompts/independent-review.md', 'prompts/resume-work.md']
for name in required:
    if not (root / name).is_file(): errors.append(f'missing: {name}')
json_count = 0
for p in root.rglob('*.json'):
    if p.relative_to(root).parts[0] in {'verification', '.repro-runs', '.repro-cache', 'node_modules', 'dist', '.git'}:
        continue  # generated reports may be open for writing during this check
    try: json.loads(p.read_text()); json_count += 1
    except Exception as e: errors.append(f'JSON {p.relative_to(root)}: {e}')
svg_count = 0
for p in root.rglob('*.svg'):
    if p.relative_to(root).parts[0] in {'.repro-runs', '.repro-cache', 'node_modules', 'dist', '.git'}:
        continue
    try: ET.parse(p); svg_count += 1
    except Exception as e: errors.append(f'SVG {p.relative_to(root)}: {e}')
skills = list((root / '.agents/skills').glob('*/SKILL.md'))
if len(skills) != 6: errors.append(f'expected six skills, found {len(skills)}')
for p in skills:
    text = p.read_text()
    if not text.startswith('---\n'): errors.append(f'frontmatter missing: {p}')
    if not re.search(r'^name: repro-[a-z-]+$', text, re.M): errors.append(f'invalid skill name: {p}')
    if not re.search(r'^description: .+', text, re.M): errors.append(f'skill description missing: {p}')
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if '://' not in target and not target.startswith('#'):
            candidate = (p.parent / target.split('#')[0]).resolve()
            if not candidate.exists(): errors.append(f'broken skill link: {p.name} -> {target}')
print(json.dumps({'scope': 'starter-kit structure only; not product/browser/security verification',
                  'required_files': len(required), 'json_parsed': json_count,
                  'svg_parsed': svg_count, 'skills_checked': len(skills), 'errors': errors}, indent=2))
sys.exit(1 if errors else 0)
