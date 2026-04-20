import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store/useStore';
import { act } from '@testing-library/react';

describe('useStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    act(() => {
      useStore.setState({
        isLoggedIn: false,
        admin: null,
        currentChildId: null,
        currentChild: null,
        children: [],
        devices: [],
        books: [],
        loading: false,
      });
    });
  });

  describe('Authentication', () => {
    it('should have initial logged out state', () => {
      const state = useStore.getState();
      expect(state.isLoggedIn).toBe(false);
      expect(state.admin).toBeNull();
    });

    it('should set admin and logged in state', () => {
      const admin = { id: 1, username: 'admin', email: 'admin@test.com' };

      act(() => {
        useStore.getState().setAdmin(admin);
      });

      const state = useStore.getState();
      expect(state.admin).toEqual(admin);
      expect(state.isLoggedIn).toBe(true);
    });

    it('should clear admin when set to null', () => {
      act(() => {
        useStore.getState().setAdmin({ id: 1, username: 'admin', email: 'test@test.com' });
      });

      act(() => {
        useStore.getState().setAdmin(null);
      });

      const state = useStore.getState();
      expect(state.admin).toBeNull();
      expect(state.isLoggedIn).toBe(false);
    });

    it('should set logged in state independently', () => {
      act(() => {
        useStore.getState().setLoggedIn(true);
      });

      expect(useStore.getState().isLoggedIn).toBe(true);
    });
  });

  describe('Children management', () => {
    it('should have empty children list initially', () => {
      expect(useStore.getState().children).toEqual([]);
      expect(useStore.getState().currentChild).toBeNull();
      expect(useStore.getState().currentChildId).toBeNull();
    });

    it('should set children list', () => {
      const children = [
        { id: 1, name: 'Child 1', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 },
        { id: 2, name: 'Child 2', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 },
      ];

      act(() => {
        useStore.getState().setChildren(children);
      });

      expect(useStore.getState().children).toEqual(children);
    });

    it('should auto-select when only one child exists', () => {
      const child = { id: 1, name: 'Only Child', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 };

      act(() => {
        useStore.getState().setChildren([child]);
      });

      const state = useStore.getState();
      expect(state.currentChildId).toBe(1);
      expect(state.currentChild).toEqual(child);
    });

    it('should set current child', () => {
      const child = { id: 1, name: 'Test Child', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 };

      act(() => {
        useStore.getState().setCurrentChild(child);
      });

      const state = useStore.getState();
      expect(state.currentChild).toEqual(child);
      expect(state.currentChildId).toBe(1);
    });

    it('should set current child by id', () => {
      const children = [
        { id: 1, name: 'Child 1', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 },
        { id: 2, name: 'Child 2', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 },
      ];

      act(() => {
        useStore.getState().setChildren(children);
        useStore.getState().setCurrentChildId(2);
      });

      const state = useStore.getState();
      expect(state.currentChildId).toBe(2);
      expect(state.currentChild?.name).toBe('Child 2');
    });

    it('should clear selection when child not in list', () => {
      const children = [
        { id: 1, name: 'Child 1', avatar: null, birthDate: null, booksCount: 0, devicesCount: 0, todayReadingMinutes: 0 },
      ];

      act(() => {
        useStore.getState().setChildren(children);
        useStore.getState().setCurrentChildId(1);
      });

      act(() => {
        useStore.getState().setChildren([]);
      });

      const state = useStore.getState();
      expect(state.currentChildId).toBeNull();
      expect(state.currentChild).toBeNull();
    });
  });

  describe('Devices', () => {
    it('should have empty devices list initially', () => {
      expect(useStore.getState().devices).toEqual([]);
    });

    it('should set devices list', () => {
      const devices = [
        { id: 1, deviceName: 'TV 1', childId: 1, childName: 'Child 1', lastOnlineAt: '2024-01-01', online: true },
      ];

      act(() => {
        useStore.getState().setDevices(devices);
      });

      expect(useStore.getState().devices).toEqual(devices);
    });
  });

  describe('Books', () => {
    it('should have empty books list initially', () => {
      expect(useStore.getState().books).toEqual([]);
    });

    it('should set books list', () => {
      const books = [
        { id: 1, title: 'Book 1', author: 'Author 1', format: 'epub', totalPages: 100, coverPath: null },
      ];

      act(() => {
        useStore.getState().setBooks(books);
      });

      expect(useStore.getState().books).toEqual(books);
    });
  });

  describe('Loading state', () => {
    it('should have false loading state initially', () => {
      expect(useStore.getState().loading).toBe(false);
    });

    it('should set loading state', () => {
      act(() => {
        useStore.getState().setLoading(true);
      });

      expect(useStore.getState().loading).toBe(true);
    });
  });
});
