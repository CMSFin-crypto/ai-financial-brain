with open('/home/z/my-project/src/components/financial-brain/ibkr-strategy.tsx', 'r') as f:
    lines = f.readlines()

new_block = '''          <StatPopover label="RSI" value={stock.rsi} good={stock.rsi >= 40 && stock.rsi <= 65} warn={stock.rsi > 70 || stock.rsi < 30}
            ideal="40 - 65 (pullback zone)" warnRange="mbi 70 (mbivleresuar) ose nen 30"
            desc="Relative Strength Index — mat forcen e levizjes se fundit ne nje shkalle 0-100. Ne pullback swing, duam RSI 40-65."
            verdict={vRSI}
          />
          <StatPopover label="R:R" value={\`1:\${stock.rewardRiskRatio}\`} good={stock.rewardRiskRatio >= 2} warn={stock.rewardRiskRatio < 1.5}
            ideal="1:2.0 ose me i larte" warnRange="nen 1:1.5 (rrezik me i madh se shperblimi)"
            desc="Reward-to-Risk Ratio — sa dollar fitimi per cdo dollar rreziqi. Me R:R te larte, edhe nje winrate me te ulet jep fitim."
            verdict={vRR}
          />
          <StatPopover label="Risk" value={\`\${stock.riskPct}%\`} good={stock.riskPct <= 4} warn={stock.riskPct > 6}
            ideal="2% - 4%" warnRange="mbi 6% (shume i larte per nje swing trade)"
            desc="Rreziku per aksion — distance nga Entry deri te Stop si perqindje e cmimit te hyrjes. Maximum 8%."
            verdict={vRisk}
          />
          <StatPopover label="RS SPY" value={\`\${stock.rsVsSPY > 0 ? '+' : ''}\${stock.rsVsSPY.toFixed(1)}%\`} good={stock.rsVsSPY > 0} warn={stock.rsVsSPY < -3}
            ideal="Positive (mbi 0%)" warnRange="nen -3% (aksioni eshte me i dobet se tregu)"
            desc="Relative Strength vs SPY — sa me mire ka performuar aksioni ne 22 dite krah SPY."
            verdict={vRS}
          />
          <StatPopover label="ATR" value={\`\${stock.atrPct}%\`} good={stock.atrPct <= 2} warn={stock.atrPct > 3.5}
            ideal="1% - 2.5%" warnRange="mbi 3.5% (shume volatil, i pakontrollueshem)"
            desc="Average True Range — mat volatilitetin mesatar ditor. Perdoret per te vendosur stop-loss."
            verdict={vATR}
          />
          <StatPopover label="DolVol" value={\`$\${(stock.avgDolVol20d / 1e6).toFixed(0)}M\`} good={stock.avgDolVol20d >= 50e6} warn={stock.avgDolVol20d < 20e6}
            ideal="mbi $50M/dite" warnRange="nen $20M/dite (likuiditet i ulet, spread i gjere)"
            desc="Dollar Volume mesatar 20-ditor — sa dollarra tregtohen ne dite. DolVol i larte siguron ekzekutim pa problem."
            verdict={vDolVol}
          />
          <StatPopover label="ADX" value={stock.adx} good={stock.adx > 25} warn={stock.adx < 20}
            ideal="mbi 25 (trend i forte)" warnRange="nen 20 (pa trend ose trend i dobet)"
            desc="Average Directional Index — mat forcen e trendit pa marre parasysh drejtimin. 25-50 = trend i forte."
            verdict={vADX}
          />'''

lines[457:505] = [new_block]

with open('/home/z/my-project/src/components/financial-brain/ibkr-strategy.tsx', 'w') as f:
    f.writelines(lines)

print(f'Replaced lines 457-504 with {len(new_block.splitlines())} lines')