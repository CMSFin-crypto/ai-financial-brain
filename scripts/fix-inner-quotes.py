# -*- coding: utf-8 -*-
import re

with open('src/components/financial-brain/ibkr-strategy.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 793 (0-indexed 792) - remove inner double quotes
line = lines[792]
# Find text between {" and "} and remove any inner double quotes
m = re.search(r'desc=\{"(.*)"\}', line)
if m:
    inner = m.group(1)
    # Remove inner double quotes around words
    inner = re.sub(r'"(\w+)"', r'\1', inner)
    line = line[:m.start(1)] + inner + line[m.end(1):]
    lines[792] = line

with open('src/components/financial-brain/ibkr-strategy.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Fixed')
