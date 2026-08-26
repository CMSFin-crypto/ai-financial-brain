import re

with open('src/components/financial-brain/ibkr-strategy.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if 'desc="' in line and ('Gap' in line or 'Overnight' in line or 'Dist. Stop' in line or 'Direksioni' in line):
        # Convert desc="..." to desc={"..."}
        line = re.sub(r'desc="', 'desc={"', line)
        # Find the closing " > and replace with "} >
        # Find last occurrence of " >
        line = re.sub(r'"\s*>$', '"} >', line)
    new_lines.append(line)

with open('src/components/financial-brain/ibkr-strategy.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Fixed all overnight desc attributes')
