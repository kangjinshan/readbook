package com.readbook.tv.ui.reader

import android.view.KeyEvent

/**
 * 菜单可见时，这些按键都应视为“仍在操作菜单”，需要重置自动隐藏计时。
 */
object ReaderMenuAutoHide {
    fun shouldResetOnKey(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
            keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_BACK ||
            keyCode == KeyEvent.KEYCODE_MENU

    fun shouldCloseMenu(keyCode: Int, action: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_BACK && action == KeyEvent.ACTION_UP

    fun shouldToggleMenu(keyCode: Int, action: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_MENU && action == KeyEvent.ACTION_DOWN

    fun shouldKeepInReaderLayer(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_MENU
}
