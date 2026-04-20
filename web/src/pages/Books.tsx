import React, { useState, useEffect } from 'react';
import {
  Card,
  Alert,
  Input,
  Button,
  Pagination,
  Empty,
  Spin,
  Typography,
  Modal,
} from 'antd';
import {
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import BookCard from '@/components/BookCard';
import FileUploader, { type UploadSummary } from '@/components/FileUploader';
import { getBooks, getBookSourceDownloadUrl, uploadBook } from '@/api/books';
import type { Book, PaginatedData } from '@/types';
import { getErrorMessage } from '@/utils/error';
import styles from './Books.module.css';

const { Title } = Typography;

const Books: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20 });
  const [searchText, setSearchText] = useState('');
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 加载书籍列表
  const loadBooks = async (page = 1, search = '') => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data: PaginatedData<Book> = await getBooks({
        page,
        limit: pagination.limit,
        search: search || undefined,
      });
      setBooks(data.items || []);
      setPagination({
        total: data.total,
        page: data.page,
        limit: data.limit,
      });
    } catch (error) {
      console.error('加载书籍列表失败:', error);
      setErrorMessage(getErrorMessage(error, '加载书籍列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  // 搜索
  const handleSearch = () => {
    loadBooks(1, searchText);
  };

  // 翻页
  const handlePageChange = (page: number) => {
    loadBooks(page, searchText);
  };

  // 点击书籍卡片
  const handleBookClick = (book: Book) => {
    navigate(`/books/${book.id}`);
  };

  // 上传书籍
  const handleUpload = async (file: File, onProgress: (percent: number) => void) => {
    await uploadBook({
      file,
      onProgress,
    });
  };

  // 上传成功后刷新列表
  const handleUploadSuccess = ({ failedCount }: UploadSummary) => {
    if (failedCount === 0) {
      setUploadModalVisible(false);
    }
    void loadBooks(1, searchText);
  };

  return (
    <div className={styles.books}>
      <div className={styles.header}>
        <Title level={4}>书籍管理</Title>
        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={() => setUploadModalVisible(true)}
        >
          上传书籍
        </Button>
      </div>

      {/* 搜索栏 */}
      <Card className={styles.searchCard}>
        <div className={styles.searchBar}>
          <Input
            placeholder="搜索书名或作者"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
        </div>
      </Card>

      {/* 书籍列表 */}
      <Card className={styles.listCard}>
        {errorMessage && (
          <Alert
            type="error"
            showIcon
            message={errorMessage}
            style={{ marginBottom: 16 }}
          />
        )}
        <Spin spinning={loading}>
          {books.length === 0 ? (
            <Empty description="暂无书籍" />
          ) : (
            <>
              <div className={styles.bookGrid}>
                {books.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onClick={() => handleBookClick(book)}
                    assigned={!!book.assignedChildren?.length}
                    downloadHref={getBookSourceDownloadUrl(book.id)}
                  />
                ))}
              </div>

              <div className={styles.pagination}>
                <Pagination
                  current={pagination.page}
                  pageSize={pagination.limit}
                  total={pagination.total}
                  onChange={handlePageChange}
                  showSizeChanger={false}
                  showTotal={(total) => `共 ${total} 本`}
                />
              </div>
            </>
          )}
        </Spin>
      </Card>

      {/* 上传弹窗 */}
      <Modal
        title="上传书籍"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <FileUploader
          accept=".epub,.pdf,.txt,.docx,.mobi,.azw3"
          onUpload={handleUpload}
          onSuccess={handleUploadSuccess}
          multiple
        />
      </Modal>
    </div>
  );
};

export default Books;
