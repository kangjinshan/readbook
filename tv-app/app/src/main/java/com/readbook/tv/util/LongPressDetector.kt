package com.readbook.tv.util

class LongPressDetector(
    private val thresholdMs: Long = 500L
) {
    private var activeDownTimeMs: Long? = null

    fun onKeyDown(downTimeMs: Long) {
        if (activeDownTimeMs == null) {
            activeDownTimeMs = downTimeMs
        }
    }

    fun onKeyUp(eventTimeMs: Long): Boolean {
        val startTimeMs = activeDownTimeMs ?: return false
        activeDownTimeMs = null
        return eventTimeMs - startTimeMs >= thresholdMs
    }

    fun reset() {
        activeDownTimeMs = null
    }
}
