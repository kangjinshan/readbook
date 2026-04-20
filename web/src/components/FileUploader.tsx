import React, { useState } from 'react';
import { Upload, message, Progress, Button } from 'antd';
import { InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import styles from './FileUploader.module.css';

export interface UploadSummary {
  totalCount: number;
  successCount: number;
  failedCount: number;
}

interface FileUploaderProps {
  accept?: string; // 接受的文件类型
  maxSize?: number | null; // 最大文件大小（字节），null 表示不限制
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<void>;
  onSuccess?: (summary: UploadSummary) => void;
  buttonText?: string;
  showDragger?: boolean;
  multiple?: boolean;
}

type FileUploadStatus = 'pending' | 'uploading' | 'error';

const FileUploader: React.FC<FileUploaderProps> = ({
  accept = '.epub,.pdf,.txt,.docx,.mobi,.azw3',
  maxSize = null,
  onUpload,
  onSuccess,
  buttonText = '上传文件',
  showDragger = true,
  multiple = false,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [statusMap, setStatusMap] = useState<Record<string, FileUploadStatus>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const syncFileState = (nextFileList: UploadFile[]) => {
    setProgressMap((prev) => {
      const next: Record<string, number> = {};
      for (const file of nextFileList) {
        next[file.uid] = prev[file.uid] ?? 0;
      }
      return next;
    });
    setStatusMap((prev) => {
      const next: Record<string, FileUploadStatus> = {};
      for (const file of nextFileList) {
        next[file.uid] = prev[file.uid] ?? 'pending';
      }
      return next;
    });
    setErrorMap((prev) => {
      const next: Record<string, string> = {};
      for (const file of nextFileList) {
        if (prev[file.uid]) {
          next[file.uid] = prev[file.uid];
        }
      }
      return next;
    });
  };

  // 文件上传前的校验
  const beforeUpload = (file: File) => {
    // 检查文件类型
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = accept.split(',').map((e) => e.trim().replace('.', ''));
    if (!allowedExts.includes(ext || '')) {
      message.error(`不支持的文件格式，仅支持 ${accept} 格式`);
      return false;
    }

    // 检查文件大小
    if (typeof maxSize === 'number' && file.size > maxSize) {
      message.error(`文件大小不能超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
      return false;
    }

    return false; // 阻止自动上传
  };

  // 手动上传
  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件');
      return;
    }

    setUploading(true);
    setProgressMap(
      Object.fromEntries(fileList.map((file) => [file.uid, 0]))
    );
    setStatusMap(
      Object.fromEntries(fileList.map((file) => [file.uid, 'uploading' as const]))
    );
    setErrorMap({});

    const results = await Promise.all(fileList.map(async (item) => {
      const file = item.originFileObj as File | undefined;

      if (!file) {
        return {
          uid: item.uid,
          success: false,
          message: '文件读取失败，请重新选择',
        };
      }

      try {
        await onUpload(file, (percent) => {
          setProgressMap((prev) => ({
            ...prev,
            [item.uid]: percent,
          }));
        });

        return {
          uid: item.uid,
          success: true,
          message: '',
        };
      } catch (error) {
        return {
          uid: item.uid,
          success: false,
          message: error instanceof Error ? error.message : '上传失败',
        };
      }
    }));

    const failedItems = new Set<string>();
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        successCount += 1;
        continue;
      }

      failedItems.add(result.uid);
    }

    const failedCount = failedItems.size;
    const totalCount = results.length;
    const failedFileList = fileList.filter((item) => failedItems.has(item.uid));

    setUploading(false);

    if (failedCount === 0) {
      message.success(totalCount === 1 ? '上传成功' : `成功上传 ${successCount} 本书籍`);
      setFileList([]);
      setProgressMap({});
      setStatusMap({});
      setErrorMap({});
      onSuccess?.({ totalCount, successCount, failedCount });
      return;
    }

    const nextStatusMap: Record<string, FileUploadStatus> = {};
    const nextProgressMap: Record<string, number> = {};
    const nextErrorMap: Record<string, string> = {};

    for (const result of results) {
      if (!failedItems.has(result.uid)) {
        continue;
      }

      nextStatusMap[result.uid] = 'error';
      nextProgressMap[result.uid] = 0;
      nextErrorMap[result.uid] = result.message;
    }

    setFileList(failedFileList);
    setProgressMap(nextProgressMap);
    setStatusMap(nextStatusMap);
    setErrorMap(nextErrorMap);

    if (successCount > 0) {
      message.warning(`已成功上传 ${successCount} 本，仍有 ${failedCount} 本失败，请重试失败项`);
      onSuccess?.({ totalCount, successCount, failedCount });
      return;
    }

    message.error(results[0]?.message || '上传失败');
  };

  // 移除文件
  const handleRemove = (uid: string) => {
    const nextFileList = fileList.filter((file) => file.uid !== uid);
    setFileList(nextFileList);
    syncFileState(nextFileList);
  };

  const uploadHint = multiple
    ? '支持 EPUB、PDF、TXT、DOCX、MOBI、AZW3 格式，可一次选择多个文件'
    : '支持 EPUB、PDF、TXT、DOCX、MOBI、AZW3 格式';

  return (
    <div className={styles.uploader}>
      {showDragger ? (
        <Upload.Dragger
          fileList={fileList}
          beforeUpload={beforeUpload}
          showUploadList={false}
          onChange={({ fileList: nextFileList }) => {
            setFileList(nextFileList);
            syncFileState(nextFileList);
          }}
          accept={accept}
          maxCount={multiple ? undefined : 1}
          multiple={multiple}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            {uploadHint}
          </p>
        </Upload.Dragger>
      ) : (
        <Upload
          fileList={fileList}
          beforeUpload={beforeUpload}
          showUploadList={false}
          onChange={({ fileList: nextFileList }) => {
            setFileList(nextFileList);
            syncFileState(nextFileList);
          }}
          accept={accept}
          maxCount={multiple ? undefined : 1}
          multiple={multiple}
        >
          <Button>{buttonText}</Button>
        </Upload>
      )}

      {fileList.length > 0 && (
        <div className={styles.fileList}>
          {fileList.map((file) => {
            const status = statusMap[file.uid] ?? 'pending';
            const percent = progressMap[file.uid] ?? 0;
            const errorMessage = errorMap[file.uid];

            return (
              <div key={file.uid} className={styles.fileInfo}>
                <div className={styles.fileName}>
                  <span>{file.name}</span>
                  <Button
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemove(file.uid)}
                    disabled={uploading}
                  />
                </div>
                {(uploading || status === 'error') && (
                  <Progress
                    percent={status === 'error' ? 0 : percent}
                    size="small"
                    status={status === 'error' ? 'exception' : 'active'}
                  />
                )}
                {errorMessage && (
                  <div className={styles.errorText}>{errorMessage}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fileList.length > 0 && !uploading && (
        <Button
          type="primary"
          onClick={handleUpload}
          className={styles.uploadBtn}
        >
          {multiple ? `开始上传（共 ${fileList.length} 个）` : '开始上传'}
        </Button>
      )}
    </div>
  );
};

export default FileUploader;
