import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Space,
  Popconfirm,
  message,
  Typography,
  Tag,
  Empty,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useChild } from '@/hooks/useChild';
import ChildSelector from '@/components/ChildSelector';
import { getBookmarks, deleteBookmark, batchDeleteBookmarks } from '@/api/bookmarks';
import { getBooks } from '@/api/books';
import type { Bookmark, Book } from '@/types';
import { getErrorMessage } from '@/utils/error';
import styles from './Bookmarks.module.css';

const { Title } = Typography;

const Bookmarks: React.FC = () => {
  const { children, currentChildId, switchChild } = useChild();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载书籍列表
  useEffect(() => {
    const loadBookOptions = async () => {
      try {
        const data = await getBooks({ limit: 1000 });
        setBooks(data.items);
      } catch (error) {
        console.error('加载书籍列表失败:', error);
        message.error(getErrorMessage(error, '加载书籍列表失败'));
      }
    };

    loadBookOptions();
  }, []);

  // 加载书签列表
  const loadBookmarks = async () => {
    if (!currentChildId) return;

    setLoading(true);
    try {
      const data = await getBookmarks({
        childId: currentChildId,
        bookId: selectedBookId || undefined,
      });
      setBookmarks(data);
    } catch (error) {
      message.error(getErrorMessage(error, '加载书签失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, [currentChildId, selectedBookId]);

  // 删除书签
  const handleDelete = async (id: number) => {
    try {
      await deleteBookmark(id);
      message.success('删除成功');
      loadBookmarks();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败'));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的书签');
      return;
    }

    try {
      await batchDeleteBookmarks(selectedRowKeys as number[]);
      message.success('删除成功');
      setSelectedRowKeys([]);
      loadBookmarks();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败'));
    }
  };

  // 表格列定义
  const columns: ColumnsType<Bookmark> = [
    {
      title: '书籍',
      dataIndex: 'bookTitle',
      key: 'bookTitle',
      render: (title: string) => <Tag color="blue">{title}</Tag>,
    },
    {
      title: '页码',
      dataIndex: 'pageNumber',
      key: 'pageNumber',
      width: 100,
      render: (page: number) => `第 ${page} 页`,
    },
    {
      title: '预览文本',
      dataIndex: 'previewText',
      key: 'previewText',
      ellipsis: true,
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Popconfirm
          title="确定删除该书签吗？"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // 书籍筛选选项
  const bookOptions = [
    { label: '全部书籍', value: null },
    ...books.map((book) => ({ label: book.title, value: book.id })),
  ];

  return (
    <div className={styles.bookmarks}>
      <div className={styles.header}>
        <Title level={4}>书签管理</Title>
        <ChildSelector
          children={children}
          value={currentChildId}
          onChange={switchChild}
          placeholder="选择子账号"
          allowClear={false}
        />
      </div>

      {currentChildId ? (
        <>
          {/* 筛选栏 */}
          <Card className={styles.filterCard}>
            <Space>
              <span>筛选：</span>
              <Select
                value={selectedBookId}
                onChange={setSelectedBookId}
                options={bookOptions}
                style={{ width: 200 }}
                placeholder="选择书籍"
              />
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={`确定删除选中的 ${selectedRowKeys.length} 个书签吗？`}
                  onConfirm={handleBatchDelete}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />}>
                    批量删除 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Card>

          {/* 书签列表 */}
          <Card>
            <Table
              columns={columns}
              dataSource={bookmarks}
              rowKey="id"
              loading={loading}
              rowSelection={rowSelection}
              pagination={{ pageSize: 10 }}
              locale={{ emptyText: <Empty description="暂无书签" /> }}
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

export default Bookmarks;
