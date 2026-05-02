import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Devices from './Devices';

vi.mock('@/hooks/useChild', () => ({
  useChild: () => ({
    children: [],
    currentChild: null,
    currentChildId: null,
    loadChildren: vi.fn(),
    switchChild: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/devices', () => ({
  getDevices: vi.fn(),
  getAllDevices: vi.fn(),
  bindDevice: vi.fn(),
  directBindDevice: vi.fn(),
  updateDevice: vi.fn(),
  unbindDevice: vi.fn(),
  sendCommand: vi.fn(),
}));

import { getAllDevices, getDevices } from '@/api/devices';

const mockGetDevices = vi.mocked(getDevices);
const mockGetAllDevices = vi.mocked(getAllDevices);

describe('Devices page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDevices.mockResolvedValue([
      {
        id: 1,
        deviceName: '客厅电视',
        childName: '小明',
        bound: true,
        online: true,
      },
    ]);
    mockGetAllDevices.mockResolvedValue([
      {
        id: 1,
        deviceName: '客厅电视',
        childName: '小明',
        bound: true,
        online: true,
      },
      {
        id: 2,
        bound: false,
        online: false,
      },
    ]);
  });

  it('defaults to the bound devices tab on first render', async () => {
    render(<Devices />);

    await waitFor(() => {
      expect(mockGetDevices).toHaveBeenCalledTimes(1);
      expect(mockGetAllDevices).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByRole('tab', { name: /已绑定设备/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /待绑定设备/i })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });
});
