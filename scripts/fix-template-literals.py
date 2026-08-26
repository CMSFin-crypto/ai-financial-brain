with open('/home/z/my-project/src/components/financial-brain/ibkr-strategy.tsx', 'r') as f:
    content = f.read()

# Fix each broken value= line
content = content.replace(
    'value={` + `1:${stock.rewardRiskRatio}`' + ',
    'value={`1:${stock.rewardRiskRatio}`}'
)

content = content.replace(
    'value={` + `${stock.riskPct}%`' + ',
    'value={`${stock.riskPct}%`}'
)

content = content.replace(
    'value={` + `${stock.rsVsSPY > 0 ? \'+\' : \'\'${stock.rsVsSPY.toFixed(1)}%`' + ',
    'value={`${stock.rsVsSPY > 0 ? \'+\' : \'\'${stock.rsVsSPY.toFixed(1)}%`}'
)

content = content.replace(
    'value={` + `${stock.atrPct}%`' + ',
    'value={`${stock.atrPct}%`}'
)

content = content.replace(
    'value={` + `${(stock.avgDolVol20d / 1e6).toFixed(0)}M`' + ',
    'value={`${(stock.avgDolVol20d / 1e6).toFixed(0)}M`}'
)

with open('/home/z/my-project/src/components/financial-brain/ibkr-strategy.tsx', 'w') as f:
    f.write(content)

print('Fixed')
