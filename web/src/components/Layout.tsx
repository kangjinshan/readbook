import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Button, Space, Spin } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  DesktopOutlined,
  BookOutlined,
  ControlOutlined,
  BarChartOutlined,
  BookFilled,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';
import { useChild } from '@/hooks/useChild';
import type { Child } from '@/types';
import styles from './Layout.module.css';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/children', icon: <TeamOutlined />, label: '子账号管理' },
  { key: '/devices', icon: <DesktopOutlined />, label: '设备管理' },
  { key: '/books', icon: <BookOutlined />, label: '书籍管理' },
  { key: '/control', icon: <ControlOutlined />, label: '阅读管控' },
  { key: '/stats', icon: <BarChartOutlined />, label: '阅读统计' },
  { key: '/bookmarks', icon: <BookFilled />, label: '书签管理' },
];

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAuth();
  const { children, currentChild, currentChildId, switchChild, loadChildren } = useChild();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // 初始化加载数据
  useEffect(() => {
    const init = async () => {
      await loadChildren();
      setLoading(false);
    };
    init();
  }, [loadChildren]);

  // 处理菜单点击
  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  // 子账号选择菜单
  const childMenuItems = children.map((child: Child) => ({
    key: child.id.toString(),
    label: (
      <Space>
        {child.avatar && <Avatar size="small" src={child.avatar} />}
        <span>{child.name}</span>
      </Space>
    ),
  }));

  // 处理子账号切换
  const handleChildChange = ({ key }: { key: string }) => {
    switchChild(parseInt(key, 10));
  };

  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className={styles.sider}
        theme="light"
      >
        <div className={styles.logo}>
          {collapsed ? '阅读' : '儿童护眼阅读器'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={['/' + location.pathname.split('/')[1]]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header className={styles.header}>
          <div className={styles.headerLeft}>
            {/* 子账号选择器 */}
            {children.length > 0 && (
              <Dropdown
                menu={{
                  items: childMenuItems,
                  selectedKeys: currentChildId ? [currentChildId.toString()] : [],
                  onClick: handleChildChange,
                }}
              >
                <Button type="text" className={styles.childSelector}>
                  <Space>
                    <UserOutlined />
                    <span>{currentChild?.name || '选择子账号'}</span>
                  </Space>
                </Button>
              </Dropdown>
            )}
          </div>
          <div className={styles.headerRight}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className={styles.userInfo}>
                <Avatar icon={<UserOutlined />} />
                <span>{admin?.username}</span>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content className={styles.content}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
