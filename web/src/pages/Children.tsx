import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Space,
  Avatar,
  Popconfirm,
  message,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useChild } from '@/hooks/useChild';
import { createChild, updateChild, deleteChild } from '@/api/children';
import { getErrorMessage } from '@/utils/error';
import type { Child } from '@/types';
import styles from './Children.module.css';

const { Title } = Typography;

interface ChildFormData {
  name: string;
  birthDate?: dayjs.Dayjs;
}

const Children: React.FC = () => {
  const { children, loadChildren } = useChild();
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [form] = Form.useForm();

  // 加载数据
  useEffect(() => {
    setLoading(true);
    loadChildren().finally(() => setLoading(false));
  }, [loadChildren]);

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingChild(null);
    form.resetFields();
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const handleEdit = (record: Child) => {
    setEditingChild(record);
    form.setFieldsValue({
      name: record.name,
      birthDate: record.birthDate ? dayjs(record.birthDate) : undefined,
    });
    setModalVisible(true);
  };

  // 删除子账号
  const handleDelete = async (id: number) => {
    try {
      await deleteChild(id);
      message.success('删除成功');
      loadChildren();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败'));
    }
  };

  // 提交表单
  const handleSubmit = async (values: ChildFormData) => {
    try {
      const data = {
        name: values.name,
        birthDate: values.birthDate?.format('YYYY-MM-DD'),
      };

      if (editingChild) {
        await updateChild(editingChild.id, data);
        message.success('更新成功');
      } else {
        await createChild(data);
        message.success('创建成功');
      }

      setModalVisible(false);
      loadChildren();
    } catch (error) {
      message.error(getErrorMessage(error, '操作失败'));
    }
  };

  // 表格列定义
  const columns: ColumnsType<Child> = [
    {
      title: '头像',
      dataIndex: 'avatar',
      key: 'avatar',
      width: 80,
      render: (avatar: string) =>
        avatar ? (
          <Avatar src={avatar} />
        ) : (
          <Avatar icon={<UserOutlined />} />
        ),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '出生日期',
      key: 'birthDate',
      render: (_, record) => record.birthDate || '-',
    },
    {
      title: '书籍数量',
      key: 'booksCount',
      width: 100,
      render: (_, record) => `${record.booksCount ?? 0} 本`,
    },
    {
      title: '设备数量',
      key: 'devicesCount',
      width: 100,
      render: (_, record) => `${record.devicesCount ?? 0} 台`,
    },
    {
      title: '今日阅读',
      key: 'todayReadingMinutes',
      width: 120,
      render: (_, record) => `${record.todayReadingMinutes ?? 0} 分钟`,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该子账号吗？"
            description="删除后将同时删除相关的阅读数据"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.children}>
      <div className={styles.header}>
        <Title level={4}>子账号管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加子账号
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={children}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingChild ? '编辑子账号' : '新增子账号'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入孩子姓名" maxLength={50} />
          </Form.Item>

          <Form.Item
            name="birthDate"
            label="出生日期"
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder="请选择出生日期"
              disabledDate={(current) => current && current > dayjs()}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Children;
