package com.readbook.tv.util

import android.view.KeyEvent
import android.view.View

/**
 * 遥控器事件处理器
 * 统一处理电视遥控器按键事件
 */
class RemoteControlHandler(
    private val callback: RemoteControlCallback
) : View.OnKeyListener {

    private val longPressDetector = LongPressDetector()

    // 快速翻页检测
    private var lastKeyTime = 0L
    private var consecutiveKeyPresses = 0
    private val rapidPressThreshold = 200L // 快速连续按键阈值

    override fun onKey(view: View?, keyCode: Int, event: KeyEvent?): Boolean {
        if (event == null) return false

        when (event.action) {
            KeyEvent.ACTION_DOWN -> {
                return handleKeyDown(keyCode, event)
            }
            KeyEvent.ACTION_UP -> {
                return handleKeyUp(keyCode, event)
            }
        }

        return false
    }

    private fun handleKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            // 方向键导航
            KeyEvent.KEYCODE_DPAD_UP -> {
                return callback.onNavigate(Direction.UP)
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                return callback.onNavigate(Direction.DOWN)
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                // 检测快速翻页
                val now = System.currentTimeMillis()
                if (now - lastKeyTime < rapidPressThreshold) {
                    consecutiveKeyPresses++
                } else {
                    consecutiveKeyPresses = 1
                }
                lastKeyTime = now

                return if (consecutiveKeyPresses >= 3) {
                    callback.onFastPageChange(PageDirection.PREVIOUS)
                } else {
                    callback.onNavigate(Direction.LEFT)
                }
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                // 检测快速翻页
                val now = System.currentTimeMillis()
                if (now - lastKeyTime < rapidPressThreshold) {
                    consecutiveKeyPresses++
                } else {
                    consecutiveKeyPresses = 1
                }
                lastKeyTime = now

                return if (consecutiveKeyPresses >= 3) {
                    callback.onFastPageChange(PageDirection.NEXT)
                } else {
                    callback.onNavigate(Direction.RIGHT)
                }
            }

            // 确认键
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                longPressDetector.onKeyDown(event.downTime)
                return true
            }

            // 返回键
            KeyEvent.KEYCODE_BACK -> {
                return callback.onBack()
            }

            // 菜单键
            KeyEvent.KEYCODE_MENU -> {
                return callback.onMenu()
            }

            // 媒体控制键
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                return callback.onPlayPause()
            }
            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                return callback.onNext()
            }
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                return callback.onPrevious()
            }
        }

        return false
    }

    private fun handleKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                return if (longPressDetector.onKeyUp(event.eventTime)) {
                    callback.onLongPress()
                } else {
                    callback.onConfirm()
                }
            }
        }

        return false
    }

    /**
     * 重置状态
     */
    fun reset() {
        longPressDetector.reset()
        consecutiveKeyPresses = 0
        lastKeyTime = 0L
    }

    /**
     * 遥控器回调接口
     */
    interface RemoteControlCallback {
        /**
         * 方向导航
         */
        fun onNavigate(direction: Direction): Boolean = false

        /**
         * 确认键
         */
        fun onConfirm(): Boolean = false

        /**
         * 长按确认键
         */
        fun onLongPress(): Boolean = false

        /**
         * 返回键
         */
        fun onBack(): Boolean = false

        /**
         * 菜单键
         */
        fun onMenu(): Boolean = false

        /**
         * 快速翻页
         */
        fun onFastPageChange(direction: PageDirection): Boolean = false

        /**
         * 播放/暂停
         */
        fun onPlayPause(): Boolean = false

        /**
         * 下一个
         */
        fun onNext(): Boolean = false

        /**
         * 上一个
         */
        fun onPrevious(): Boolean = false
    }
}

/**
 * 方向枚举
 */
enum class Direction {
    UP, DOWN, LEFT, RIGHT
}

/**
 * 翻页方向枚举
 */
enum class PageDirection {
    NEXT, PREVIOUS
}

/**
 * 简化的遥控器回调（仅实现需要的部分）
 */
abstract class SimpleRemoteControlCallback : RemoteControlHandler.RemoteControlCallback {
    override fun onNavigate(direction: Direction): Boolean = false
    override fun onConfirm(): Boolean = false
    override fun onLongPress(): Boolean = false
    override fun onBack(): Boolean = false
    override fun onMenu(): Boolean = false
    override fun onFastPageChange(direction: PageDirection): Boolean = false
    override fun onPlayPause(): Boolean = false
    override fun onNext(): Boolean = false
    override fun onPrevious(): Boolean = false
}
