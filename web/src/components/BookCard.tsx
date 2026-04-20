import React from 'react';
import { Card, Tag, Progress } from 'antd';
import { BookOutlined, DownloadOutlined } from '@ant-design/icons';
import type { Book } from '@/types';
import { BOOK_FORMAT_TAG_COLORS, STORAGE_BASE_URL } from '@/config';
import styles from './BookCard.module.css';

interface BookCardProps {
  book: Book;
  onClick?: () => void;
  showProgress?: boolean;
  progress?: number; // 0-100
  assigned?: boolean;
  downloadHref?: string;
}

const BookCard: React.FC<BookCardProps> = ({
  book,
  onClick,
  showProgress = false,
  progress = 0,
  assigned = false,
  downloadHref,
}) => {
  return (
    <Card
      hoverable
      className={styles.card}
      cover={
        <div className={styles.cover}>
          {book.coverPath ? (
                <img
                  src={`${STORAGE_BASE_URL}/${book.coverPath}`}
                  alt={book.title}
                  className={styles.coverImage}
                />
          ) : (
            <div className={styles.coverPlaceholder}>
              <BookOutlined className={styles.coverIcon} />
            </div>
          )}
          <Tag color={BOOK_FORMAT_TAG_COLORS[book.format] || 'default'} className={styles.formatTag}>
            {book.format}
          </Tag>
          {assigned && (
            <Tag color="success" className={styles.assignedTag}>
              已授权
            </Tag>
          )}
        </div>
      }
      onClick={onClick}
    >
      <div className={styles.content}>
        <h4 className={styles.title} title={book.title}>
          {book.title}
        </h4>
        {book.author && (
          <p className={styles.author} title={book.author}>
            {book.author}
          </p>
        )}
        <p className={styles.pages}>{book.totalPages} 页</p>
        {downloadHref && (
          <a
            href={downloadHref}
            download
            className={styles.downloadLink}
            onClick={(event) => event.stopPropagation()}
          >
            <DownloadOutlined />
            <span>下载源文件</span>
          </a>
        )}
        {showProgress && (
          <Progress
            percent={progress}
            size="small"
            showInfo={false}
            className={styles.progress}
          />
        )}
      </div>
    </Card>
  );
};

export default BookCard;
