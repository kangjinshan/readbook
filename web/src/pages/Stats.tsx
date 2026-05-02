import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Alert,
  Select,
  Button,
  Statistic,
  Row,
  Col,
  Table,
  Typography,
  DatePicker,
  Space,
  message,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useChild } from '@/hooks/useChild';
import ChildSelector from '@/components/ChildSelector';
import StatsChart from '@/components/StatsChart';
import {
  getDailyStats,
  getSummary,
  getReadingHistory,
  exportStats,
  downloadExportFile,
} from '@/api/stats';
import type { DailyStat, ReadingSummary, ReadingRecord } from '@/types';
import { getErrorMessage } from '@/utils/error';
import styles from './Stats.module.css';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const Stats: React.FC = () => {
  const { children, currentChildId, switchChild } = useChild();
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [summary, setSummary] = useState<ReadingSummary | null>(null);
  const [historyRecords, setHistoryRecords] = useState<ReadingRecord[]>([]);
  const [historyPagination, setHistoryPagination] = useState({ total: 0, page: 1 });
  const [errorMessage, setErrorMessage] = useState('');

  // 加载统计数据
  const loadStats = useCallback(async () => {
    if (!currentChildId) return;

    setLoading(true);
    setErrorMessage('');
    try {
      const rangeParams = dateRange ? {
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
      } : {};

      const [stats, summaryData, history] = await Promise.all([
        getDailyStats(currentChildId, rangeParams),
        getSummary(currentChildId, { period }),
        getReadingHistory(currentChildId, { ...rangeParams, page: 1, limit: 10 }),
      ]);

      setDailyStats(stats);
      setSummary(summaryData);
      setHistoryRecords(history.records);
      setHistoryPagination({ total: history.total, page: 1 });
    } catch (error) {
      console.error('加载统计数据失败:', error);
      setErrorMessage(getErrorMessage(error, '加载统计数据失败'));
    } finally {
      setLoading(false);
    }
  }, [currentChildId, period, dateRange]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 导出数据
  const handleExport = async () => {
    if (!currentChildId) return;

    try {
      const params = {
        format: 'csv' as const,
        ...(dateRange ? {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
        } : {}),
      };

      const blob = await exportStats(currentChildId, params);
      const filename = `阅读统计_${dayjs().format('YYYY-MM-DD')}.csv`;
      downloadExportFile(blob, filename);
      message.success('导出成功');
    } catch (error) {
      message.error(getErrorMessage(error, '导出失败'));
    }
  };

  // 历史记录表格列
  const historyColumns: ColumnsType<ReadingRecord> = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '书籍',
      dataIndex: 'bookTitle',
      key: 'bookTitle',
    },
    {
      title: '时间段',
      key: 'time',
      width: 150,
      render: (_, record) => `${record.startTime} - ${record.endTime ?? '--'}`,
    },
    {
      title: '时长',
      dataIndex: 'durationMinutes',
      key: 'durationMinutes',
      width: 100,
      render: (minutes: number) => `${minutes} 分钟`,
    },
    {
      title: '页数',
      dataIndex: 'pages',
      key: 'pages',
      width: 80,
      render: (pages: number) => `${pages} 页`,
    },
  ];

  // 时间范围选项
  const periodOptions = [
    { label: '今天', value: 'day' },
    { label: '本周', value: 'week' },
    { label: '本月', value: 'month' },
  ];

  return (
    <div className={styles.stats}>
      <div className={styles.header}>
        <Title level={4}>阅读统计</Title>
        <Space>
          <ChildSelector
            children={children}
            value={currentChildId}
            onChange={switchChild}
            placeholder="选择子账号"
            allowClear={false}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 CSV
          </Button>
        </Space>
      </div>

      {currentChildId ? (
        <>
          {errorMessage && (
            <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 16 }} />
          )}
          {/* 时间范围选择 */}
          <Card className={styles.filterCard}>
            <Space>
              <span>时间范围：</span>
              <Select
                value={period}
                onChange={setPeriod}
                options={periodOptions}
                style={{ width: 120 }}
              />
            </Space>
          </Card>

          {/* 统计卡片 */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} sm={8}>
              <Card loading={loading}>
                <Statistic
                  title="总阅读时长"
                  value={summary?.totalMinutes || 0}
                  suffix="分钟"
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card loading={loading}>
                <Statistic
                  title="平均每日"
                  value={summary?.averageDailyMinutes || 0}
                  suffix="分钟"
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card loading={loading}>
                <Statistic
                  title="书籍完成率"
                  value={(summary?.completionRate || 0) * 100}
                  precision={1}
                  suffix="%"
                />
              </Card>
            </Col>
          </Row>

          {/* 阅读趋势图 */}
          <Card title="每日阅读时长趋势" className={styles.chartCard}>
            <StatsChart data={dailyStats} type="bar" height={300} />
          </Card>

          {/* 最爱阅读 */}
          {summary?.mostReadBook && (
            <Card title="最爱阅读" className={styles.favoriteCard}>
              <div className={styles.favorite}>
                <span>《{summary.mostReadBook.title}》</span>
                <span className={styles.favoriteTime}>
                  {summary.mostReadBook.minutes} 分钟
                </span>
              </div>
            </Card>
          )}

          {/* 阅读记录 */}
          <Card title="阅读记录" className={styles.historyCard}>
            <Table
              columns={historyColumns}
              dataSource={historyRecords}
              rowKey={(record) => `${record.date}-${record.bookTitle}`}
              loading={loading}
              pagination={{
                current: historyPagination.page,
                total: historyPagination.total,
                pageSize: 10,
                onChange: (page) => {
                  getReadingHistory(currentChildId, {
                    page,
                    limit: 10,
                    ...(dateRange ? {
                      startDate: dateRange[0].format('YYYY-MM-DD'),
                      endDate: dateRange[1].format('YYYY-MM-DD'),
                    } : {}),
                  }).then((res) => {
                    setHistoryRecords(res.records);
                    setHistoryPagination({ total: res.total, page });
                  }).catch((error) => {
                    message.error(getErrorMessage(error, '加载阅读记录失败'));
                  });
                },
              }}
              locale={{ emptyText: '暂无阅读记录' }}
            />
          </Card>
        </>
      ) : (
        <Card>
          <div className={styles.empty}>请选择子账号</div>
        </Card>
      )}
    </div>
  );
};

export default Stats;
