import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Control from './Control';

const getControlPolicyMock = vi.fn();
const updateControlPolicyMock = vi.fn();
const resetDailyReadingMock = vi.fn();

vi.mock('@/hooks/useChild', () => ({
  useChild: () => ({
    children: [{ id: 1, name: '小明' }],
    currentChild: null,
    currentChildId: 1,
    loadChildren: vi.fn(),
    switchChild: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/components/ChildSelector', () => ({
  default: () => <div data-testid="child-selector" />,
}));

vi.mock('@/api/control', () => ({
  getControlPolicy: (...args: unknown[]) => getControlPolicyMock(...args),
  updateControlPolicy: (...args: unknown[]) => updateControlPolicyMock(...args),
  resetDailyReading: (...args: unknown[]) => resetDailyReadingMock(...args),
}));

describe('Control page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getControlPolicyMock.mockResolvedValue({
      childId: 1,
      dailyLimitMinutes: 120,
      continuousLimitMinutes: 45,
      restMinutes: 15,
      forbiddenStartTime: '22:00',
      forbiddenEndTime: '07:00',
      allowedFontSizes: ['small', 'medium', 'large'],
      allowedThemes: ['yellow', 'white', 'dark'],
    });
    updateControlPolicyMock.mockResolvedValue(undefined);
    resetDailyReadingMock.mockResolvedValue(undefined);
  });

  it('renders dedicated field groups for multi-column control sections', async () => {
    render(<Control />);

    await waitFor(() => {
      expect(getControlPolicyMock).toHaveBeenCalledWith(1);
    });

    const continuousSection = screen.getByRole('heading', { name: '连续阅读时长限制' }).parentElement;
    const forbiddenSection = screen.getByRole('heading', { name: '禁止阅读时段' }).parentElement;

    expect(continuousSection).not.toBeNull();
    expect(forbiddenSection).not.toBeNull();

    expect(screen.getByTestId('continuous-limit-fields')).toBeInTheDocument();
    expect(screen.getByTestId('forbidden-time-fields')).toBeInTheDocument();
    expect(continuousSection?.querySelector('.ant-space')).toBeNull();
    expect(forbiddenSection?.querySelector('.ant-space')).toBeNull();
  });

  it('confirms reset only clears today accumulated minutes', async () => {
    const user = userEvent.setup();

    render(<Control />);

    await waitFor(() => {
      expect(getControlPolicyMock).toHaveBeenCalledWith(1);
    });

    await user.click(screen.getByRole('button', { name: /清零今日累计阅读时长/ }));

    expect(await screen.findByText('只会将今日累计阅读时长归零，不会删除阅读记录，也不会修改限制配置。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认清零' }));

    await waitFor(() => {
      expect(resetDailyReadingMock).toHaveBeenCalledWith(1);
    });
  });

  it('allows saving a 1 minute continuous reading limit for testing', async () => {
    const user = userEvent.setup();

    render(<Control />);

    await waitFor(() => {
      expect(getControlPolicyMock).toHaveBeenCalledWith(1);
    });

    const continuousLimitInput = screen.getByDisplayValue('45');
    await user.clear(continuousLimitInput);
    await user.type(continuousLimitInput, '1');

    await user.click(screen.getByRole('button', { name: /保存配置/ }));

    await waitFor(() => {
      expect(updateControlPolicyMock).toHaveBeenCalledWith(1, expect.objectContaining({
        continuousLimitMinutes: 1,
      }));
    });
  });
});
