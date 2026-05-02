import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Button,
  Descriptions,
  Table,
  Checkbox,
  Space,
  Popconfirm,
  message,
  Typography,
  Divider,
  Image,
  Modal,
  Input,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useChild } from '@/hooks/useChild';
import { getBook, updateBook, deleteBook, assignBook, unassignBook, uploadBookCover, reparseBook, type BookParseMode } from '@/api/books';
import type { BookDetail, Chapter } from '@/types';
import { STORAGE_BASE_URL } from '@/config';
import { getErrorMessage } from '@/utils/error';
import styles from './BookDetail.module.css';

const { Title } = Typography;

const PARSE_MODE_LABELS: Record<BookParseMode, string> = {
  plainText: '纯文本解析',
  webview: 'WebView 解析',
};

const BookDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { children, loadChildren } = useChild();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [reparsingMode, setReparsingMode] = useState<BookParseMode | null>(null);
  const [coverVersion, setCoverVersion] = useState<number>(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', author: '', publisher: '' });
  const [selectedChildren, setSelectedChildren] = useState<number[]>([]);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // 加载书籍详情
  const loadBook = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const data = await getBook(parseInt(id, 10));
      setBook(data);
      setEditForm({
        title: data.title,
        author: data.author || '',
        publisher: data.publisher || '',
      });
      setSelectedChildren(data.assignedChildren?.map((c) => c.childId) || []);
    } catch (error) {
      console.error('加载书籍详情失败:', error);
      message.error(getErrorMessage(error, '加载书籍详情失败'));
    } finally {
      setLoading(false);
    }
  };

  // 加载子账号列表
  useEffect(() => {
    if (children.length === 0) {
      loadChildren();
    }
  }, [children.length, loadChildren]);

  useEffect(() => {
    setCoverVersion(0);
    loadBook();
  }, [id]);

  // 删除书籍
  const handleDelete = async () => {
    if (!book) return;

    try {
      await deleteBook(book.id);
      message.success('删除成功');
      navigate('/books');
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败'));
    }
  };

  // 更新书籍信息
  const handleUpdate = async () => {
    if (!book) return;

    try {
      await updateBook(book.id, editForm);
      message.success('更新成功');
      setEditModalVisible(false);
      loadBook();
    } catch (error) {
      message.error(getErrorMessage(error, '更新失败'));
    }
  };

  const handleCoverFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !book) {
      return;
    }

    setCoverUploading(true);
    try {
      await uploadBookCover(book.id, file);
      message.success('封面更新成功');
      setCoverVersion(Date.now());
      await loadBook();
    } catch (error) {
      message.error(getErrorMessage(error, '封面更新失败'));
    } finally {
      event.target.value = '';
      setCoverUploading(false);
    }
  };

  const handleReparse = async (parseMode: BookParseMode) => {
    if (!book) {
      return;
    }

    setReparsingMode(parseMode);
    try {
      await reparseBook(book.id, parseMode);
      message.success(`${PARSE_MODE_LABELS[parseMode]}成功，已重建章节并重置该书进度/书签`);
      setCoverVersion(Date.now());
      await loadBook();
    } catch (error) {
      message.error(getErrorMessage(error, `${PARSE_MODE_LABELS[parseMode]}失败`));
    } finally {
      setReparsingMode(null);
    }
  };

  // 保存授权
  const handleSaveAssign = async () => {
    if (!book) return;

    try {
      const currentChildIds = book.assignedChildren?.map((c) => c.childId) || [];
      const childIdsToRemove = currentChildIds.filter((childId) => !selectedChildren.includes(childId));
      const childIdsToAdd = selectedChildren.filter((childId) => !currentChildIds.includes(childId));

      if (childIdsToRemove.length > 0) {
        await unassignBook(book.id, childIdsToRemove);
      }
      if (childIdsToAdd.length > 0) {
        await assignBook(book.id, childIdsToAdd);
      }
      message.success('保存成功');
      loadBook();
    } catch (error) {
      message.error(getErrorMessage(error, '保存失败'));
    }
  };

  // 预览章节
  const handlePreview = async (chapter: number, page: number) => {
    if (!book) return;

    const previewUrl = `/books/${book.id}/preview?chapter=${chapter}&page=${page}`;
    window.open(previewUrl, '_blank', 'noopener');
  };

  // 章节表格列
  const chapterColumns = [
    {
      title: '章节',
      dataIndex: 'index',
      key: 'index',
      width: 80,
      render: (index: number) => `第 ${index} 章`,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '页码范围',
      key: 'pages',
      width: 150,
      render: (_: unknown, record: Chapter) => `${record.startPage} - ${record.endPage}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: Chapter) => (
        <Button type="link" onClick={() => handlePreview(record.index, record.startPage)}>
          预览
        </Button>
      ),
    },
  ];

  if (!book) {
    if (loading) {
      return <div>加载中...</div>;
    }
    return <div>书籍加载失败，请返回重试</div>;
  }

  const coverSrc = book.coverPath
    ? `${STORAGE_BASE_URL}/${book.coverPath}${coverVersion ? `?v=${coverVersion}` : ''}`
    : null;
  const currentParseMode = book.parseMode || 'plainText';

  return (
    <div className={styles.detail}>
      <div className={styles.header}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/books')}>
          返回书籍列表
        </Button>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => setEditModalVisible(true)}>
            编辑信息
          </Button>
          <Popconfirm
            title="确定按纯文本方式重新解析这本书吗？"
            description="会切换为纯文本解析，重新生成章节资源，并重置这本书的阅读进度和书签。"
            onConfirm={() => handleReparse('plainText')}
            okText="纯文本重新解析"
            cancelText="取消"
          >
            <Button icon={<ReloadOutlined />} loading={reparsingMode === 'plainText'}>
              纯文本重新解析
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确定按 WebView 方式重新解析这本书吗？"
            description="会切换为 WebView 解析，重新生成章节资源，并重置这本书的阅读进度和书签。"
            onConfirm={() => handleReparse('webview')}
            okText="WebView重新解析"
            cancelText="取消"
          >
            <Button icon={<ReloadOutlined />} loading={reparsingMode === 'webview'}>
              WebView重新解析
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确定删除该书籍吗？"
            description="删除后无法恢复"
            onConfirm={handleDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />}>
              删除书籍
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Card loading={loading}>
        <div className={styles.info}>
          <div className={styles.cover}>
            {book.coverPath ? (
              <Image
                src={coverSrc || undefined}
                alt={book.title}
                width={200}
                height={280}
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div className={styles.coverPlaceholder}>暂无封面</div>
            )}
            <div className={styles.coverActions}>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className={styles.coverInput}
                data-testid="cover-upload-input"
                onChange={handleCoverFileChange}
              />
              <Button
                onClick={() => coverInputRef.current?.click()}
                loading={coverUploading}
              >
                修改封面
              </Button>
            </div>
          </div>
          <div className={styles.meta}>
            <Title level={3}>{book.title}</Title>
            <Descriptions column={2}>
              <Descriptions.Item label="作者">{book.author || '未知'}</Descriptions.Item>
              <Descriptions.Item label="出版社">{book.publisher || '未知'}</Descriptions.Item>
              <Descriptions.Item label="格式">{book.format}</Descriptions.Item>
              <Descriptions.Item label="解析方式">{PARSE_MODE_LABELS[currentParseMode]}</Descriptions.Item>
              <Descriptions.Item label="总页数">{book.totalPages} 页</Descriptions.Item>
              <Descriptions.Item label="章节数">{book.totalChapters || 0} 章</Descriptions.Item>
            </Descriptions>
          </div>
        </div>

        <Divider />

        {/* 授权管理 */}
        <div className={styles.section}>
          <Title level={5}>授权管理</Title>
          <div className={styles.assignList}>
            {children.map((child) => (
              <Checkbox
                key={child.id}
                checked={selectedChildren.includes(child.id)}
                onChange={(e) => {
                  const newSelected = e.target.checked
                    ? [...selectedChildren, child.id]
                    : selectedChildren.filter((id) => id !== child.id);
                  setSelectedChildren(newSelected);
                }}
              >
                {child.name}
              </Checkbox>
            ))}
          </div>
          {children.length > 0 && (
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveAssign}>
              保存授权
            </Button>
          )}
        </div>

        <Divider />

        {/* 目录预览 */}
        {book.chapters && book.chapters.length > 0 && (
          <div className={styles.section}>
            <Title level={5}>目录预览</Title>
            <Table
              columns={chapterColumns}
              dataSource={book.chapters}
              rowKey="index"
              pagination={{ pageSize: 10 }}
              size="small"
            />
          </div>
        )}
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑书籍信息"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleUpdate}
        okText="保存"
        cancelText="取消"
      >
        <div className={styles.editForm}>
          <div className={styles.formItem}>
            <label>书名：</label>
            <Input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            />
          </div>
          <div className={styles.formItem}>
            <label>作者：</label>
            <Input
              value={editForm.author}
              onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
            />
          </div>
          <div className={styles.formItem}>
            <label>出版社：</label>
            <Input
              value={editForm.publisher}
              onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BookDetail;
