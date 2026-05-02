import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  InputNumber,
  TimePicker,
  Checkbox,
  Button,
  Popconfirm,
  message,
  Typography,
  Divider,
} from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/utils/error';
import dayjs from 'dayjs';
import { useChild } from '@/hooks/useChild';
import ChildSelector from '@/components/ChildSelector';
import { getControlPolicy, updateControlPolicy, resetDailyReading } from '@/api/control';
import styles from './Control.module.css';

const { Title } = Typography;

const Control: React.FC = () => {
  const { children, currentChildId, switchChild } = useChild();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载防沉迷策略
  const loadPolicy = async (childId: number) => {
    setLoading(true);
    try {
      const policy = await getControlPolicy(childId);
      form.setFieldsValue({
        dailyLimitMinutes: policy.dailyLimitMinutes,
        continuousLimitMinutes: policy.continuousLimitMinutes,
        restMinutes: policy.restMinutes,
        forbiddenStartTime: policy.forbiddenStartTime
          ? dayjs(policy.forbiddenStartTime, 'HH:mm')
          : null,
        forbiddenEndTime: policy.forbiddenEndTime
          ? dayjs(policy.forbiddenEndTime, 'HH:mm')
          : null,
        allowedFontSizes: policy.allowedFontSizes || ['small', 'medium', 'large'],
        allowedThemes: policy.allowedThemes || ['yellow', 'white', 'dark'],
      });
    } catch (error) {
      message.error(getErrorMessage(error, '加载策略失败'));
    } finally {
      setLoading(false);
    }
  };

  // 子账号变更时重新加载
  useEffect(() => {
    if (currentChildId) {
      loadPolicy(currentChildId);
    }
  }, [currentChildId]);

  // 保存策略
  const handleSave = async (values: {
    dailyLimitMinutes: number;
    continuousLimitMinutes: number;
    restMinutes: number;
    forbiddenStartTime: dayjs.Dayjs | null;
    forbiddenEndTime: dayjs.Dayjs | null;
    allowedFontSizes: string[];
    allowedThemes: string[];
  }) => {
    if (!currentChildId) {
      message.warning('请先选择子账号');
      return;
    }

    if (!values.allowedFontSizes || values.allowedFontSizes.length === 0) {
      message.error('至少需要选择一个字号');
      return;
    }
    if (!values.allowedThemes || values.allowedThemes.length === 0) {
      message.error('至少需要选择一个主题');
      return;
    }

    setSaving(true);
    try {
      await updateControlPolicy(currentChildId, {
        dailyLimitMinutes: values.dailyLimitMinutes,
        continuousLimitMinutes: values.continuousLimitMinutes,
        restMinutes: values.restMinutes,
        forbiddenStartTime: values.forbiddenStartTime?.format('HH:mm'),
        forbiddenEndTime: values.forbiddenEndTime?.format('HH:mm'),
        allowedFontSizes: values.allowedFontSizes,
        allowedThemes: values.allowedThemes,
      });
      message.success('保存成功');
    } catch (error) {
      message.error(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  // 重置今日阅读时长
  const handleResetDaily = async () => {
    if (!currentChildId) return;

    try {
      await resetDailyReading(currentChildId);
      message.success('已重置今日阅读时长');
    } catch (error) {
      message.error(getErrorMessage(error, '重置失败'));
    }
  };

  // 字号选项
  const fontSizeOptions = [
    { label: '小号', value: 'small' },
    { label: '中号', value: 'medium' },
    { label: '大号', value: 'large' },
  ];

  // 主题选项
  const themeOptions = [
    { label: '护眼黄', value: 'yellow' },
    { label: '白天模式', value: 'white' },
    { label: '夜间模式', value: 'dark' },
  ];

  return (
    <div className={styles.control}>
      <div className={styles.header}>
        <Title level={4}>阅读管控配置</Title>
        <ChildSelector
          children={children}
          value={currentChildId}
          onChange={switchChild}
          placeholder="选择子账号"
          allowClear={false}
        />
      </div>

      {currentChildId ? (
        <Card loading={loading}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            initialValues={{
              dailyLimitMinutes: 120,
              continuousLimitMinutes: 45,
              restMinutes: 15,
              allowedFontSizes: ['small', 'medium', 'large'],
              allowedThemes: ['yellow', 'white', 'dark'],
            }}
          >
            {/* 每日阅读时长限制 */}
            <div className={styles.section}>
              <Title level={5}>每日阅读时长限制</Title>
              <Form.Item name="dailyLimitMinutes" label="每日最大阅读时长（分钟）">
                <InputNumber min={30} max={480} step={10} style={{ width: 200 }} />
              </Form.Item>
            </div>

            <Divider />

            {/* 连续阅读时长限制 */}
            <div className={styles.section}>
              <Title level={5}>连续阅读时长限制</Title>
              <div className={styles.fieldGrid} data-testid="continuous-limit-fields">
                <Form.Item name="continuousLimitMinutes" label="连续阅读时长（分钟）">
                  <InputNumber min={1} max={120} step={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="restMinutes" label="强制休息时长（分钟）">
                  <InputNumber min={5} max={60} step={5} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </div>

            <Divider />

            {/* 禁止阅读时段 */}
            <div className={styles.section}>
              <Title level={5}>禁止阅读时段</Title>
              <div className={styles.fieldGrid} data-testid="forbidden-time-fields">
                <Form.Item name="forbiddenStartTime" label="开始时间">
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="forbiddenEndTime" label="结束时间">
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <p className={styles.hint}>例如：设置 22:00 到 07:00，该时段内禁止阅读</p>
            </div>

            <Divider />

            {/* 允许的字号 */}
            <div className={styles.section}>
              <Title level={5}>允许的字号</Title>
              <Form.Item name="allowedFontSizes">
                <Checkbox.Group options={fontSizeOptions} />
              </Form.Item>
            </div>

            <Divider />

            {/* 允许的主题 */}
            <div className={styles.section}>
              <Title level={5}>允许的主题</Title>
              <Form.Item name="allowedThemes">
                <Checkbox.Group options={themeOptions} />
              </Form.Item>
            </div>

            <Divider />

            {/* 操作按钮 */}
            <div className={styles.actions}>
              <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                保存配置
              </Button>
              <Popconfirm
                title="确认清零今日累计阅读时长？"
                description="只会将今日累计阅读时长归零，不会删除阅读记录，也不会修改限制配置。"
                okText="确认清零"
                cancelText="取消"
                onConfirm={handleResetDaily}
              >
                <Button icon={<ReloadOutlined />}>
                  清零今日累计阅读时长
                </Button>
              </Popconfirm>
            </div>
          </Form>
        </Card>
      ) : (
        <Card>
          <div className={styles.empty}>请选择子账号</div>
        </Card>
      )}
    </div>
  );
};

export default Control;
