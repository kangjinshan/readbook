import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  Popconfirm,
  message,
  Typography,
  Descriptions,
  Tabs,
  Select,
} from 'antd';
import {
  LinkOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  LogoutOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { useChild } from '@/hooks/useChild';
import ChildSelector from '@/components/ChildSelector';
import {
  getDevices,
  getAllDevices,
  bindDevice,
  directBindDevice,
  updateDevice,
  unbindDevice,
  sendCommand,
} from '@/api/devices';
import type { Device } from '@/types';
import { getErrorMessage } from '@/utils/error';
import styles from './Devices.module.css';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Title } = Typography;

const Devices: React.FC = () => {
  const { children } = useChild();
  const [devices, setDevices] = useState<Device[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [bindModalVisible, setBindModalVisible] = useState(false);
  const [directBindModalVisible, setDirectBindModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [bindForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [directBindForm] = Form.useForm();

  // 加载设备列表
  const loadDevices = async () => {
    setLoading(true);
    try {
      const [boundData, allData] = await Promise.all([
        getDevices(),
        getAllDevices(),
      ]);
      setDevices(boundData);
      setAllDevices(allData);
    } catch (error) {
      message.error(getErrorMessage(error, '加载设备列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // 打开绑定码弹窗
  const handleBind = () => {
    bindForm.resetFields();
    setBindModalVisible(true);
  };

  // 提交绑定码绑定
  const handleBindSubmit = async (values: { bindCode: string; childId: number }) => {
    try {
      await bindDevice(values);
      message.success('绑定成功');
      setBindModalVisible(false);
      loadDevices();
    } catch (error) {
      message.error(getErrorMessage(error, '绑定失败'));
    }
  };

  // 打开直接绑定弹窗
  const handleDirectBind = (deviceId: number) => {
    setSelectedDeviceId(deviceId);
    directBindForm.resetFields();
    setDirectBindModalVisible(true);
  };

  // 提交直接绑定
  const handleDirectBindSubmit = async (values: { childId: number }) => {
    if (!selectedDeviceId) return;
    try {
      await directBindDevice(selectedDeviceId, values);
      message.success('绑定成功');
      setDirectBindModalVisible(false);
      loadDevices();
    } catch (error) {
      message.error(getErrorMessage(error, '绑定失败'));
    }
  };

  // 打开编辑弹窗
  const handleEdit = (record: Device) => {
    setEditingDevice(record);
    editForm.setFieldsValue({ deviceName: record.deviceName });
    setEditModalVisible(true);
  };

  // 提交编辑
  const handleEditSubmit = async (values: { deviceName: string }) => {
    if (!editingDevice) return;

    try {
      await updateDevice(editingDevice.id, values);
      message.success('更新成功');
      setEditModalVisible(false);
      loadDevices();
    } catch (error) {
      message.error(getErrorMessage(error, '更新失败'));
    }
  };

  // 解绑设备
  const handleUnbind = async (id: number) => {
    try {
      await unbindDevice(id);
      message.success('解绑成功');
      loadDevices();
    } catch (error) {
      message.error(getErrorMessage(error, '解绑失败'));
    }
  };

  // 发送远程指令
  const handleCommand = async (id: number, command: 'exit' | 'lock' | 'restart') => {
    try {
      await sendCommand(id, command);
      message.success('指令已发送');
      loadDevices();
    } catch (error) {
      message.error(getErrorMessage(error, '发送失败'));
    }
  };

  // 格式化时间
  const formatTime = (time: string) => {
    if (!time) return '-';
    return dayjs(time).fromNow();
  };

  // 已绑定设备表格列定义
  const boundColumns: ColumnsType<Device> = [
    {
      title: '设备名称',
      dataIndex: 'deviceName',
      key: 'deviceName',
      render: (name: string) => name || '未命名设备',
    },
    {
      title: '绑定账号',
      dataIndex: 'childName',
      key: 'childName',
      render: (name: string) => name || '-',
    },
    {
      title: '状态',
      dataIndex: 'online',
      key: 'online',
      width: 100,
      render: (online: boolean) => (
        <Tag color={online ? 'success' : 'default'}>
          {online ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: '最后在线',
      dataIndex: 'lastOnlineAt',
      key: 'lastOnlineAt',
      width: 120,
      render: (time: string) => formatTime(time),
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_, record) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={<LogoutOutlined />}
            onClick={() => handleCommand(record.id, 'exit')}
          >
            退出
          </Button>
          <Button
            type="link"
            size="small"
            icon={<LockOutlined />}
            onClick={() => handleCommand(record.id, 'lock')}
          >
            锁屏
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            重命名
          </Button>
          <Popconfirm
            title="确定解绑该设备吗？"
            onConfirm={() => handleUnbind(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              解绑
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 未绑定设备表格列定义
  const unboundColumns: ColumnsType<Device> = [
    {
      title: '设备名称',
      dataIndex: 'deviceName',
      key: 'deviceName',
      render: (name: string) => name || '未命名设备',
    },
    {
      title: '状态',
      dataIndex: 'online',
      key: 'online',
      width: 100,
      render: (online: boolean) => (
        <Tag color={online ? 'success' : 'default'}>
          {online ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: '最后在线',
      dataIndex: 'lastOnlineAt',
      key: 'lastOnlineAt',
      width: 120,
      render: (time: string) => formatTime(time),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (time: string) => formatTime(time),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => handleDirectBind(record.id)}
        >
          绑定
        </Button>
      ),
    },
  ];

  // 分离已绑定和未绑定的设备
  const boundDevices = allDevices.filter(d => d.bound);
  const unboundDevices = allDevices.filter(d => !d.bound);

  return (
    <div className={styles.devices}>
      <div className={styles.header}>
        <Title level={4}>设备管理</Title>
        <Button type="primary" icon={<LinkOutlined />} onClick={handleBind}>
          通过绑定码绑定
        </Button>
      </div>

      {/* 绑定说明 */}
      <Card className={styles.helpCard}>
        <Descriptions column={1}>
          <Descriptions.Item label="绑定方式">
            <ul className={styles.steps}>
              <li><strong>直接绑定：</strong>在下方"待绑定设备"列表中选择设备，点击"绑定"按钮选择子账号即可</li>
              <li><strong>绑定码绑定：</strong>在电视上打开阅读应用获取6位绑定码，点击上方"通过绑定码绑定"按钮</li>
            </ul>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 设备列表 */}
      <Card style={{ marginTop: 16 }}>
        <Tabs
          defaultActiveKey="bound"
          items={[
            {
              key: 'unbound',
              label: `待绑定设备 (${unboundDevices.length})`,
              children: (
                <Table
                  columns={unboundColumns}
                  dataSource={unboundDevices}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  locale={{ emptyText: '暂无待绑定设备' }}
                />
              ),
            },
            {
              key: 'bound',
              label: `已绑定设备 (${boundDevices.length})`,
              children: (
                <Table
                  columns={boundColumns}
                  dataSource={boundDevices}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  locale={{ emptyText: '暂无绑定设备' }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 绑定码弹窗 */}
      <Modal
        title="通过绑定码绑定"
        open={bindModalVisible}
        onCancel={() => setBindModalVisible(false)}
        onOk={() => bindForm.submit()}
        okText="绑定"
        cancelText="取消"
      >
        <Form form={bindForm} layout="vertical" onFinish={handleBindSubmit}>
          <Form.Item
            name="bindCode"
            label="绑定码"
            rules={[
              { required: true, message: '请输入绑定码' },
              { pattern: /^\d{6}$/, message: '绑定码为 6 位数字' },
            ]}
          >
            <Input placeholder="请输入电视上显示的 6 位绑定码" maxLength={6} />
          </Form.Item>

          <Form.Item
            name="childId"
            label="绑定子账号"
            rules={[{ required: true, message: '请选择子账号' }]}
          >
            <ChildSelector
              children={children}
              placeholder="请选择要绑定的子账号"
              allowClear={false}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 直接绑定弹窗 */}
      <Modal
        title="绑定设备到子账号"
        open={directBindModalVisible}
        onCancel={() => setDirectBindModalVisible(false)}
        onOk={() => directBindForm.submit()}
        okText="确定绑定"
        cancelText="取消"
      >
        <Form form={directBindForm} layout="vertical" onFinish={handleDirectBindSubmit}>
          <Form.Item
            name="childId"
            label="选择子账号"
            rules={[{ required: true, message: '请选择子账号' }]}
          >
            <ChildSelector
              children={children}
              placeholder="请选择要绑定的子账号"
              allowClear={false}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title="重命名设备"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={() => editForm.submit()}
        okText="确定"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="deviceName"
            label="设备名称"
            rules={[{ required: true, message: '请输入设备名称' }]}
          >
            <Input placeholder="如：客厅电视" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Devices;
