package com.readbook.tv.ui.reader

import android.view.KeyEvent
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderMenuAutoHideTest {

    @Test
    fun `treats menu navigation keys as user activity`() {
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_DPAD_UP))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_DPAD_DOWN))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_DPAD_LEFT))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_DPAD_RIGHT))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_DPAD_CENTER))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_ENTER))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_BACK))
        assertTrue(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_MENU))
    }

    @Test
    fun `ignores unrelated hardware keys`() {
        assertFalse(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_VOLUME_UP))
        assertFalse(ReaderMenuAutoHide.shouldResetOnKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
    }

    @Test
    fun `closes menu on back key up`() {
        assertTrue(
            ReaderMenuAutoHide.shouldCloseMenu(
                keyCode = KeyEvent.KEYCODE_BACK,
                action = KeyEvent.ACTION_UP
            )
        )
        assertFalse(
            ReaderMenuAutoHide.shouldCloseMenu(
                keyCode = KeyEvent.KEYCODE_BACK,
                action = KeyEvent.ACTION_DOWN
            )
        )
        assertFalse(
            ReaderMenuAutoHide.shouldCloseMenu(
                keyCode = KeyEvent.KEYCODE_MENU,
                action = KeyEvent.ACTION_UP
            )
        )
    }

    @Test
    fun `toggles menu only on menu key down`() {
        assertTrue(
            ReaderMenuAutoHide.shouldToggleMenu(
                keyCode = KeyEvent.KEYCODE_MENU,
                action = KeyEvent.ACTION_DOWN
            )
        )
        assertFalse(
            ReaderMenuAutoHide.shouldToggleMenu(
                keyCode = KeyEvent.KEYCODE_MENU,
                action = KeyEvent.ACTION_UP
            )
        )
        assertFalse(
            ReaderMenuAutoHide.shouldToggleMenu(
                keyCode = KeyEvent.KEYCODE_DPAD_CENTER,
                action = KeyEvent.ACTION_DOWN
            )
        )
    }

    @Test
    fun `lets confirm keys fall through to focused menu controls`() {
        assertFalse(ReaderMenuAutoHide.shouldKeepInReaderLayer(KeyEvent.KEYCODE_DPAD_CENTER))
        assertFalse(ReaderMenuAutoHide.shouldKeepInReaderLayer(KeyEvent.KEYCODE_ENTER))
        assertTrue(ReaderMenuAutoHide.shouldKeepInReaderLayer(KeyEvent.KEYCODE_BACK))
        assertTrue(ReaderMenuAutoHide.shouldKeepInReaderLayer(KeyEvent.KEYCODE_MENU))
    }
}
