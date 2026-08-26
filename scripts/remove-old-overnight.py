# -*- coding: utf-8 -*-

with open('src/components/financial-brain/ibkr-strategy.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines 718-800 (0-indexed 717-799) — the old overnight section inside expanded
new_lines = lines[:717] + lines[800:]

with open('src/components/financial-brain/ibkr-strategy.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'Removed lines 718-800 ({800-717} lines)')
