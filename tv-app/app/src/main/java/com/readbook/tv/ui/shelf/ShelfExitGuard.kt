package com.readbook.tv.ui.shelf

object ShelfExitGuard {
    const val EXIT_WINDOW_MS = 2_000L

    fun shouldExit(lastBackPressedAtMs: Long, nowMs: Long, thresholdMs: Long = EXIT_WINDOW_MS): Boolean {
        if (lastBackPressedAtMs <= 0L) return false
        return nowMs - lastBackPressedAtMs <= thresholdMs
    }
}
