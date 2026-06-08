'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface Prediction {
  ticker: string;
  signal: string;
  confidence: number;
}

interface AnalysisChartsProps {
  predictions: Prediction[];
}

const SIGNAL_COLORS: Record<string, string> = {
  BUY: '#21c55e',
  HOLD: '#f59e0b',
  SELL: '#ef4444',
};

const PIE_COLORS = ['#21c55e', '#f59e0b', '#ef4444'];

export function AnalysisCharts({ predictions }: AnalysisChartsProps) {
  // Signal distribution for pie chart
  const signalCounts = predictions.reduce(
    (acc, p) => {
      const signal = p.signal || 'HOLD';
      acc[signal] = (acc[signal] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = Object.entries(signalCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // Confidence bar chart data
  const barData = predictions.map((p) => ({
    name: p.ticker,
    confidence: p.confidence,
    fill: SIGNAL_COLORS[p.signal] || '#f59e0b',
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Signal Distribution Pie Chart */}
      {pieData.length > 0 && (
        <div className="border border-border/50 rounded-xl p-4 bg-card/50">
          <h3 className="text-sm font-medium mb-3 text-center">
            Shpërndarja e Sinjaleve
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  strokeWidth={0}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={SIGNAL_COLORS[entry.name] || PIE_COLORS[index]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      BUY: 'BLEJ',
                      HOLD: 'MBAJ',
                      SELL: 'SHIT',
                    };
                    return labels[value] || value;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Confidence Bar Chart */}
      {barData.length > 0 && (
        <div className="border border-border/50 rounded-xl p-4 bg-card/50">
          <h3 className="text-sm font-medium mb-3 text-center">
            Besueshmëria parashikimit
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Besueshmëria']}
                />
                <Bar dataKey="confidence" radius={[0, 6, 6, 0]} barSize={18} opacity={0.85}>
                  {barData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
