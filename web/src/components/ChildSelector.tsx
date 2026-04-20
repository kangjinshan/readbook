import React from 'react';
import { Select, Avatar, Space } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { Child } from '@/types';

interface ChildSelectorProps {
  children: Child[];
  value?: number | null;
  onChange?: (childId: number | null) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  allowClear?: boolean;
}

const ChildSelector: React.FC<ChildSelectorProps> = ({
  children,
  value,
  onChange,
  placeholder = '选择子账号',
  style,
  allowClear = true,
}) => {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ minWidth: 200, ...style }}
      allowClear={allowClear}
      showSearch
      optionFilterProp="label"
      options={children.map((child) => ({
        value: child.id,
        label: (
          <Space>
            {child.avatar ? (
              <Avatar size="small" src={child.avatar} />
            ) : (
              <Avatar size="small" icon={<UserOutlined />} />
            )}
            <span>{child.name}</span>
          </Space>
        ),
      }))}
      optionRender={(option) => option.data.label}
    />
  );
};

export default ChildSelector;
