import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DailyStat } from '@/types';

interface StatsChartProps {
  data: DailyStat[];
  type?: 'bar' | 'line';
  height?: number;
}

const StatsChart: React.FC<StatsChartProps> = ({ data, type = 'bar', height = 300 }) => {
  // 格式化数据
  const chartData = data.map((item) => ({
    date: item.date.slice(5), // MM-DD
    totalMinutes: item.totalMinutes,
    pages: item.pagesRead,
    books: item.booksRead,
  }));

  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: '#fff',
            padding: '8px 12px',
            border: '1px solid #eee',
            borderRadius: 4,
          }}
        >
          <p style={{ margin: 0, fontWeight: 'bold' }}>{label}</p>
          <p style={{ margin: 0, color: '#1890ff' }}>
            阅读时长: {payload[0]?.value} 分钟
          </p>
          <p style={{ margin: 0, color: '#52c41a' }}>
            阅读页数: {payload[0]?.payload?.pages} 页
          </p>
        </div>
      );
    }
    return null;
  };

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="totalMinutes"
            stroke="#1890ff"
            strokeWidth={2}
            dot={{ fill: '#1890ff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="totalMinutes" fill="#1890ff" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default StatsChart;
