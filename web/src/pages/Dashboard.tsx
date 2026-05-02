import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Space, Badge, Tag, Alert } from 'antd';
import {
  ClockCircleOutlined,
  BookOutlined,
  FileTextOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useChild } from '@/hooks/useChild';
import { usePolling } from '@/hooks/usePolling';
import { getRealtimeStatus, getDailyStats, getSummary } from '@/api/stats';
import StatsChart from '@/components/StatsChart';
import type { RealtimeStatus, DailyStat, ReadingSummary } from '@/types';
import styles from './Dashboard.module.css';

const { Title } = Typography;

const Dashboard: React.FC = () => {
  const { currentChild, currentChildId } = useChild();
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [summary, setSummary] = useState<ReadingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 加载仪表盘数据
  useEffect(() => {
    if (!currentChildId) return;

    let cancelled = false;
    setLoading(true);
    setErrorMessage('');

    (async () => {
      try {
        const [status, stats, summaryData] = await Promise.all([
          getRealtimeStatus(currentChildId),
          getDailyStats(currentChildId, {}),
          getSummary(currentChildId, { period: 'week' }),
        ]);

        if (!cancelled) {
          setRealtimeStatus(status);
          setDailyStats(stats);
          setSummary(summaryData);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('加载仪表盘数据失败:', error);
          setErrorMessage('加载仪表盘数据失败，请稍后重试');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [currentChildId]);

  // 轮询实时状态（30秒）
  usePolling(
    async () => {
      if (currentChildId) {
        try {
          const status = await getRealtimeStatus(currentChildId);
          setRealtimeStatus(status);
        } catch (error) {
          console.error('获取实时状态失败:', error);
          setErrorMessage('实时状态刷新失败');
        }
      }
    },
    { interval: 30000, enabled: !!currentChildId }
  );

  // 格式化时长
  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
  };

  if (!currentChild) {
    return (
      <div className={styles.empty}>
        <Title level={4}>请先创建子账号</Title>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* 欢迎区域 */}
      <div className={styles.welcome}>
        <Title level={4}>欢迎回来，{currentChild.name} 的阅读数据</Title>
      </div>

      {/* 统计卡片 */}
      {errorMessage && (
        <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 16 }} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="今日阅读"
              value={realtimeStatus?.todayReadMinutes || 0}
              suffix="分钟"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="本周阅读"
              value={summary?.totalMinutes || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
              formatter={(value) => formatMinutes(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="阅读书籍"
              value={summary?.totalBooks || 0}
              suffix="本"
              prefix={<BookOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="阅读页数"
              value={summary?.totalPages || 0}
              suffix="页"
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 实时阅读状态 */}
      <Card
        title="当前阅读状态"
        className={styles.statusCard}
        extra={<Badge status={realtimeStatus?.isReading ? 'processing' : 'default'} text={realtimeStatus?.isReading ? '阅读中' : '未阅读'} />}
      >
        {realtimeStatus?.isReading ? (
          <div className={styles.readingStatus}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <BookOutlined className={styles.statusIcon} />
                <span>正在阅读《{realtimeStatus.bookTitle}》第 {realtimeStatus.currentPage} 页</span>
              </div>
              <div>
                <EyeOutlined className={styles.statusIcon} />
                <span>设备：{realtimeStatus.deviceName}</span>
              </div>
              <div>
                <ClockCircleOutlined className={styles.statusIcon} />
                <span>今日已读：{realtimeStatus.todayReadMinutes} 分钟</span>
              </div>
            </Space>
          </div>
        ) : (
          <div className={styles.notReading}>
            <span>暂无阅读活动</span>
          </div>
        )}
      </Card>

      {/* 本周阅读趋势 */}
      <Card title="本周阅读趋势" className={styles.chartCard}>
        <StatsChart data={dailyStats} type="bar" height={300} />
      </Card>

      {/* 阅读总结 */}
      {summary && (
        <Card title="本周阅读总结" className={styles.summaryCard}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
                <Statistic
                  title="平均每日阅读"
                  value={summary.averageDailyMinutes}
                  suffix="分钟"
                />
              </Col>
              <Col xs={24} sm={12}>
                <Statistic
                  title="书籍完成率"
                  value={summary.completionRate * 100}
                  precision={1}
                  suffix="%"
                />
              </Col>
            {summary.mostReadBook && (
              <Col xs={24}>
                <div className={styles.mostRead}>
                  <span>最爱阅读：</span>
                  <Tag color="blue">{summary.mostReadBook.title}</Tag>
                  <span>({summary.mostReadBook.minutes} 分钟)</span>
                </div>
              </Col>
            )}
          </Row>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
