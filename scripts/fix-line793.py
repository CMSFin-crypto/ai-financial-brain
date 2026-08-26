# -*- coding: utf-8 -*-

with open('src/components/financial-brain/ibkr-strategy.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Just replace the entire line 793 (0-indexed 792) with a clean version
# Read the original to get the exact content without inner quotes
old_line = lines[792]
# Replace all double quotes between { and } except the first and last
in_brace = False
result = []
quote_positions = []
for i, ch in enumerate(old_line):
    if ch == '{':
        in_brace = True
    elif ch == '}':
        in_brace = False

# Find desc={" and "}
start = old_line.find('desc={"')
if start >= 0:
    # Find content between {" and "}
    content_start = start + len('desc={"')
    # Find the matching close - look for "} >
    end = old_line.find('"} >', content_start)
    if end >= 0:
        inner = old_line[content_start:end]
        # Replace all " in the inner content with empty
        inner = inner.replace('"', '')
        lines[792] = old_line[:content_start] + inner + old_line[end:]

with open('src/components/financial-brain/ibkr-strategy.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Fixed')
