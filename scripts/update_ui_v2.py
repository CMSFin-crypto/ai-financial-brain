with open('/home/z/my-project/src/components/financial-brain/ibkr-strategy.tsx', 'r') as f:
    content = f.read()

# 1. Add sector badge after horizon badge in StockCard
old = "<Badge variant=\"outline\" className=\"text-[11px] border-border/30 text-muted-foreground px-2 py-0.5\">{stock.horizon}</Badge>"
new = """"<Badge variant=\"outline\" className=\"text-[11px] border-border/30 text-muted-foreground px-2 py-0.5\">{stock.horizon}</Badge>\n              {stock.sector && <Badge variant=\"outline\" className=\"text-[11px] border-indigo-500/30 text-indigo-400 bg-indigo-500/10 px-2 py-0.5\">{stock.sector}</Badge>}\n            \"""
content = content.replace(old, new)
print('1. Sector badge:', 'OK' if old in content else 'FAILED')

# 2. Add position size in price line
old_price = f'${{stock.price.toFixed(2)}} \u00b7 Pullback {{stock.pullbackDays}}d'
new_price = f'${{stock.price.toFixed(2)}} \u00b7 Pullback {{stock.pullbackDays}}d ({{stock.pullbackPct > 0 ? "+" : \"\"}}{{stock.pullbackPct.toFixed(1)}}%)\n              {{stock.positionSize > 0 && <span className=\"text-blue-400/70 ml-2\">{{stock.positionSize}} shares</span>}}'
content = content.replace(old_price, new_price)
print('2. Position size:', 'OK' if old_price in content else 'FAILED')

# 3. Change target grid from 4 cols to 5 and add 3R
old_grid = 'grid-cols-4 gap-2"'
new_grid = 'grid-cols-5 gap-2"'
content = content.replace(old_grid, new_grid)
print('3. Grid cols:', 'OK' if old_grid in content else 'FAILED')

old_t2r = '<EntryBox label="TARGET 2R" value={stock.target2R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/20" />'
new_t2r = '<EntryBox label="TARGET 2R" value={stock.target2R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/15" />\n          <EntryBox label="TARGET 3R" value={stock.target3R} color="text-emerald-400" bg="bg-emerald-500/5 border-emerald-500/25" />'
content = content.replace(old_t2r, new_t2r)
print('4. 3R target:', 'OK' if old_t2r in content else 'FAILED')

# 4. Add ADX stat after DolVol
old_dolvol = 'desc="Dollar Volume mesatar 20-ditor \u2014 sa dollarra tregtohen ne dite.'
new_dolvol = 'desc="Dollar Volume mesatar 20-ditor \u2014 sa dollarra tregtohen ne dite.'
content = content.replace(old_dolvol, new_dolvol + "\n          <StatPopover label=\"ADX\" value={stock.adx ?? '-'} good={(stock.adx ?? 0) > 25} warn={(stock.adx ?? 0) < 20}\n            ideal=\"mbi 25 (trend i forte)\" warnRange=\"nen 20 (asne trend ose trend i dobet)\"\n            desc=\"Average Directional Index \u2014 mat forcen e trendit pa marre parasy drejtimin. ADX > 25 tregon nje trend te percaktuar. Ne blueprint kerkohet ADX > 25 per hyrje.\" />")
print('5. ADX stat:', 'OK' if old_dolvol in content else 'FAILED')

# 5. Update Trend score description
old_trend = "desc: 'Mat cil\u00ebsin\u00eb e trendit rrites: cmimi mbi SMA50 (+25), cmimi mbi SMA200 (+25), SMA50 mbi SMA200 / Golden Cross (+25), dhe higher-high structure"
new_trend = "desc: 'Mat cilesine e trendit: cmimi mbi SMA50 (+20), cmimi mbi SMA200 (+20), SMA50 mbi SMA200 / Golden Cross (+15), Stacked MA close > EMA20 > SMA50 > SMA200 (+15), higher-high structure (+15), ADX > 25 forca trendi (+15). Versioni i ri perfshin te gjithe afshet.""
content = content.replace(old_trend, new_trend)
print('6. Trend score desc:', 'OK' if old_trend in content else 'FAILED')

with open('/home/z/my-project/src/components/financial-brain/ibkr-strategy.tsx', 'w') as f:
    f.write(content)
print('File saved')
